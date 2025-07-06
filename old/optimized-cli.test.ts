import { beforeEach, describe, expect, it, vi } from "vitest";
import { OperationTypeAwareLimiter } from "./concurrency-manager";
import { OptimizedNotionExportCLI, createOptimizedExportCLI } from "./optimized-cli";
import { AdaptiveRateLimiter } from "./rate-limiting";

// Mock the progress tracker to avoid file system operations
vi.mock("../progress-tracking", () => ({
  PersistentProgressTracker: class MockProgressTracker {
    constructor() {}
    getStats() {
      return {
        processed: 150,
        total: 1000,
        percentage: 15,
        currentSection: "pages",
        avgRate: 5.2,
        errors: 3,
        eta: 60000,
        memoryUsage: process.memoryUsage()
      };
    }
    getLastProcessedId() {
      return "test-page-123";
    }
    loadCheckpoint() {
      return Promise.resolve(null);
    }
    initialize() {
      return Promise.resolve(false);
    }
  },
  ProgressReporter: class MockProgressReporter {
    constructor() {}
    reportSummary() {}
  }
}));

// Mock the streaming export manager
vi.mock("./streaming-export-manager", () => ({
  StreamingExportManager: class MockStreamingExportManager {
    constructor() {}
    initialize() {
      return Promise.resolve(false);
    }
    startExport() {
      return Promise.resolve();
    }
    finalize() {
      return Promise.resolve();
    }
    pauseExport() {}
    resumeExport() {
      return Promise.resolve();
    }
  }
}));

describe("OptimizedNotionExportCLI", () => {
  let cli: OptimizedNotionExportCLI;
  let mockStdout: vi.SpyInstance;

  beforeEach(() => {
    // Mock stdout to capture display output
    mockStdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    cli = createOptimizedExportCLI({
      outputPath: "./test-output",
      format: "json",
      concurrency: 8
    });
  });

  afterEach(() => {
    mockStdout.mockRestore();
  });

  describe("Real-time Display", () => {
    it("should create CLI with all components initialized", () => {
      expect(cli).toBeDefined();
      expect(typeof cli.getStatus).toBe("function");
      expect(typeof cli.showMetrics).toBe("function");
      expect(typeof cli.autoTune).toBe("function");
    });

    it("should provide comprehensive status information", () => {
      const status = cli.getStatus();

      expect(status).toHaveProperty("progress");
      expect(status).toHaveProperty("status");
      expect(status).toHaveProperty("speed");
      expect(status).toHaveProperty("operationCounts");
      expect(status).toHaveProperty("memoryUsage");
      expect(status).toHaveProperty("errors");

      expect(typeof status.progress).toBe("number");
      expect(status.progress).toBeGreaterThanOrEqual(0);
      expect(status.progress).toBeLessThanOrEqual(1);
    });

    it("should have operation context for tracking", () => {
      const context = cli.getOperationContext();

      expect(context).toHaveProperty("rateLimiter");
      expect(context.rateLimiter).toHaveProperty("recordRetryAttempt");
      expect(context.rateLimiter).toHaveProperty("updateFromHeaders");

      expect(typeof context.rateLimiter.recordRetryAttempt).toBe("function");
      expect(typeof context.rateLimiter.updateFromHeaders).toBe("function");
    });

    it("should track retry attempts correctly", () => {
      const context = cli.getOperationContext();

      // Test recording retry attempts
      expect(() => {
        context.rateLimiter.recordRetryAttempt(true);
        context.rateLimiter.recordRetryAttempt(false);
      }).not.toThrow();
    });

    it("should handle header updates correctly", () => {
      const context = cli.getOperationContext();

      // Test header updates
      expect(() => {
        context.rateLimiter.updateFromHeaders(
          {
            "x-ratelimit-remaining": "45",
            "x-ratelimit-limit": "100",
            "x-ratelimit-reset": String(Math.floor((Date.now() + 60000) / 1000))
          },
          250,
          false
        );
      }).not.toThrow();
    });

    it("should record errors from failed header updates", () => {
      const context = cli.getOperationContext();

      // Test error recording from failed API calls
      expect(() => {
        context.rateLimiter.updateFromHeaders(
          {
            status: "429"
          },
          1000,
          true
        );
      }).not.toThrow();
    });
  });

  describe("Auto-tuning", () => {
    it("should perform auto-tuning without errors", () => {
      expect(() => {
        cli.autoTune();
      }).not.toThrow();
    });
  });

  describe("Metrics Display", () => {
    it("should show metrics without errors", () => {
      expect(() => {
        cli.showMetrics();
      }).not.toThrow();
    });
  });

  describe("Export Lifecycle", () => {
    it("should handle pause operation", () => {
      expect(() => {
        cli.pauseExport();
      }).not.toThrow();
    });

    it("should start export with mock client", async () => {
      const mockClient = {
        users: { me: vi.fn().mockResolvedValue({ id: "test-user" }) },
        search: vi.fn().mockResolvedValue({ results: [], next_cursor: null }),
        databases: { query: vi.fn().mockResolvedValue({ results: [], next_cursor: null }) },
        blocks: { children: { list: vi.fn().mockResolvedValue({ results: [], next_cursor: null }) } },
        comments: { list: vi.fn().mockResolvedValue({ results: [], next_cursor: null }) }
      };

      await expect(cli.startExport(mockClient)).resolves.not.toThrow();
    });
  });
});

describe("Real-time Display Integration", () => {
  let rateLimiter: AdaptiveRateLimiter;
  let operationLimiter: OperationTypeAwareLimiter;

  beforeEach(() => {
    rateLimiter = new AdaptiveRateLimiter();
    operationLimiter = new OperationTypeAwareLimiter();
  });

  it("should track comprehensive statistics", () => {
    // Simulate some activity
    rateLimiter.updateFromHeaders(
      {
        "x-ratelimit-remaining": "75",
        "x-ratelimit-limit": "100",
        "x-ratelimit-reset": String(Math.floor((Date.now() + 60000) / 1000))
      },
      200,
      false
    );

    rateLimiter.recordRetryAttempt(true);
    rateLimiter.recordRetryAttempt(false);

    const stats = rateLimiter.getStats();

    expect(stats).toHaveProperty("quotaLimit");
    expect(stats).toHaveProperty("remainingRequests");
    expect(stats).toHaveProperty("retryStats");
    expect(stats).toHaveProperty("lastApiHeaders");

    expect(stats.quotaLimit).toBe(100);
    expect(stats.remainingRequests).toBe(75);
    expect(stats.retryStats.totalAttempts).toBe(2);
    expect(stats.retryStats.successfulRetries).toBe(1);
    expect(stats.retryStats.failedRetries).toBe(1);
  });

  it("should calculate quota utilization correctly", () => {
    rateLimiter.updateFromHeaders({
      "x-ratelimit-remaining": "25",
      "x-ratelimit-limit": "100"
    });

    const stats = rateLimiter.getStats();
    const utilizationExpected = 1 - 25 / 100; // 75% utilization

    expect(stats.remainingRequests).toBe(25);
    expect(stats.quotaLimit).toBe(100);

    // The CLI calculates utilization as 1 - (remaining / limit)
    const calculatedUtilization = 1 - stats.remainingRequests / stats.quotaLimit;
    expect(calculatedUtilization).toBeCloseTo(utilizationExpected);
  });

  it("should handle zero remaining requests correctly", () => {
    rateLimiter.updateFromHeaders({
      "x-ratelimit-remaining": "0",
      "x-ratelimit-limit": "100"
    });

    const stats = rateLimiter.getStats();
    expect(stats.remainingRequests).toBe(0);
    expect(stats.quotaLimit).toBe(100);
  });

  it("should track per-operation type statistics", async () => {
    // Run some operations
    await operationLimiter.run(
      {
        type: "pages",
        objectId: "test-page-1",
        operation: "fetch"
      },
      async () => "success"
    );

    await operationLimiter.run(
      {
        type: "blocks",
        objectId: "test-block-1",
        operation: "fetch"
      },
      async () => "success"
    );

    const stats = operationLimiter.getAllStats();

    expect(stats.pages).toBeDefined();
    expect(stats.blocks).toBeDefined();
    expect(stats.pages.completed).toBe(1);
    expect(stats.blocks.completed).toBe(1);
  });
});
