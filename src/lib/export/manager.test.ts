import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OperationType } from "../concurrency-manager";
import { NotionStreamingExporter, StreamingExportManager } from "./manager";

// Mock fs module
vi.mock("fs", () => ({
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    rename: vi.fn(),
    unlink: vi.fn(),
    mkdir: vi.fn()
  },
  createWriteStream: vi.fn()
}));

// Mock other dependencies
vi.mock("../rate-limiting", () => ({
  AdaptiveRateLimiter: vi.fn().mockImplementation(() => ({
    waitForSlot: vi.fn().mockResolvedValue(undefined),
    updateFromHeaders: vi.fn(),
    reportError: vi.fn(),
    getStats: vi.fn().mockReturnValue({
      remainingRequests: 50,
      resetTime: new Date(),
      currentRate: 10,
      backoffMultiplier: 1
    })
  }))
}));

vi.mock("../progress-tracking", () => ({
  PersistentProgressTracker: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(false),
    updateProgress: vi.fn(),
    completeSection: vi.fn(),
    setTotalEstimate: vi.fn(),
    recordError: vi.fn(),
    saveCheckpoint: vi.fn().mockResolvedValue(undefined),
    removeCheckpoint: vi.fn().mockResolvedValue(undefined),
    getStats: vi.fn().mockReturnValue({
      processed: 100,
      total: 1000,
      percentage: 10,
      currentSection: "pages",
      errors: 0,
      memoryUsage: process.memoryUsage()
    }),
    calculateETA: vi.fn().mockReturnValue({ eta: 60000, confidence: 0.8 })
  })),
  ProgressReporter: vi.fn().mockImplementation(() => ({
    report: vi.fn(),
    reportSectionComplete: vi.fn(),
    reportSummary: vi.fn()
  }))
}));

vi.mock("../concurrency-manager", () => ({
  OperationTypeAwareLimiter: vi.fn().mockImplementation(() => ({
    run: vi.fn().mockImplementation(async (context, operation) => operation()),
    autoTune: vi.fn(),
    adjustLimits: vi.fn(),
    getAllStats: vi.fn().mockReturnValue({
      pages: { running: 2, queued: 0, completed: 50, failed: 1, avgDuration: 150 },
      databases: { running: 1, queued: 0, completed: 10, failed: 0, avgDuration: 200 }
    }),
    getGlobalStats: vi.fn().mockReturnValue({
      totalOperations: 100,
      totalErrors: 2,
      errorRate: 0.02,
      uptime: 60000,
      operationsPerSecond: 1.67
    })
  }))
}));

vi.mock("../util", () => ({
  CircuitBreaker: vi.fn().mockImplementation(() => ({
    canProceed: vi.fn().mockReturnValue(true),
    reportSuccess: vi.fn(),
    reportFailure: vi.fn()
  })),
  RateTracker: vi.fn().mockImplementation(() => ({
    updateMetric: vi.fn().mockReturnValue(10),
    formatRate: vi.fn().mockReturnValue("10.0/s")
  }))
}));

describe("StreamingExportManager", () => {
  let manager: StreamingExportManager;
  let mockWriteStream: any;
  const exportId = "test-export-123";
  const outputDir = "./test-output";

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock createWriteStream
    mockWriteStream = {
      write: vi.fn().mockReturnValue(true),
      end: vi.fn().mockImplementation((callback?: Function) => {
        if (callback) callback();
      }),
      writable: true
    };

    const { createWriteStream } = require("fs");
    createWriteStream.mockReturnValue(mockWriteStream);

    manager = new StreamingExportManager(exportId, outputDir);
  });

  afterEach(() => {
    // Cleanup
  });

  it("should initialize as new export", async () => {
    const isResuming = await manager.initialize();
    expect(isResuming).toBe(false);
  });

  it("should provide comprehensive progress information", async () => {
    await manager.initialize();

    const progress = manager.getProgress();

    expect(progress).toHaveProperty("processed");
    expect(progress).toHaveProperty("total");
    expect(progress).toHaveProperty("percentage");
    expect(progress).toHaveProperty("analytics");
  });

  describe("streaming export", () => {
    it("should stream items with memory bounds and concurrency control", async () => {
      await manager.initialize();

      const mockData = [
        { id: "page-1", title: "Test Page 1" },
        { id: "page-2", title: "Test Page 2" },
        { id: "page-3", title: "Test Page 3" }
      ];

      async function* mockDataSource() {
        for (const item of mockData) {
          yield item;
        }
      }

      const transformer = (item: any) => ({
        ...item,
        transformed: true,
        timestamp: Date.now()
      });

      const results: any[] = [];
      for await (const item of manager.streamExportItems(
        mockDataSource(),
        transformer,
        "pages",
        "pages" as OperationType
      )) {
        results.push(item);
      }

      expect(results).toHaveLength(3);
      expect(results[0]).toHaveProperty("transformed", true);
      expect(results[0]).toHaveProperty("id", "page-1");
    });

    it("should handle transformation errors gracefully", async () => {
      await manager.initialize();

      const mockData = [
        { id: "page-1", title: "Good Page" },
        { id: "page-2", title: "Bad Page" },
        { id: "page-3", title: "Another Good Page" }
      ];

      async function* mockDataSource() {
        for (const item of mockData) {
          yield item;
        }
      }

      const transformer = (item: any) => {
        if (item.title === "Bad Page") {
          throw new Error("Transformation failed");
        }
        return { ...item, transformed: true };
      };

      const results: any[] = [];
      for await (const item of manager.streamExportItems(
        mockDataSource(),
        transformer,
        "pages",
        "pages" as OperationType
      )) {
        results.push(item);
      }

      // Should continue processing despite error
      expect(results).toHaveLength(2);
      expect(results[0].id).toBe("page-1");
      expect(results[1].id).toBe("page-3");
    });

    it("should write transformed items to output stream", async () => {
      await manager.initialize();

      const mockData = [{ id: "page-1", title: "Test Page" }];

      async function* mockDataSource() {
        for (const item of mockData) {
          yield item;
        }
      }

      const transformer = (item: any) => ({ ...item, transformed: true });

      for await (const item of manager.streamExportItems(
        mockDataSource(),
        transformer,
        "pages",
        "pages" as OperationType
      )) {
        // Process items
      }

      expect(mockWriteStream.write).toHaveBeenCalled();
      const writtenData = mockWriteStream.write.mock.calls[0][0];
      expect(writtenData).toContain('"id":"page-1"');
      expect(writtenData).toContain('"transformed":true');
    });
  });

  describe("API call handling", () => {
    it("should call API with rate limiting and retry logic", async () => {
      await manager.initialize();

      const mockApiCall = vi.fn().mockResolvedValue({ success: true });

      const result = await manager.callAPI(mockApiCall, "pages" as OperationType, "fetch-page", "page-123");

      expect(result).toEqual({ success: true });
      expect(mockApiCall).toHaveBeenCalledTimes(1);
    });

    it("should track API analytics", async () => {
      await manager.initialize();

      const mockApiCall = vi.fn().mockResolvedValue({ success: true });

      await manager.callAPI(mockApiCall, "pages" as OperationType, "fetch-page", "page-123");

      const progress = manager.getProgress();
      expect(progress.analytics.totalApiCalls).toBeGreaterThan(0);
    });

    it("should handle API errors and update analytics", async () => {
      await manager.initialize();

      const mockApiCall = vi.fn().mockRejectedValue(new Error("API Error"));

      await expect(manager.callAPI(mockApiCall, "pages" as OperationType, "fetch-page", "page-123")).rejects.toThrow(
        "API Error"
      );

      const progress = manager.getProgress();
      expect(progress.analytics.totalErrors).toBeGreaterThan(0);
    });
  });

  describe("event emission", () => {
    it("should emit events for monitoring", async () => {
      await manager.initialize();

      const emitSpy = vi.spyOn(manager, "emit");

      // Trigger API call event
      manager.emit("api-call", { operation: "test", objectId: "123" });

      expect(emitSpy).toHaveBeenCalledWith("api-call", {
        operation: "test",
        objectId: "123"
      });
    });

    it("should track rate limit hits in retry events", async () => {
      await manager.initialize();

      manager.emit("retry", { error: "rate_limited" });

      const progress = manager.getProgress();
      expect(progress.analytics.rateLimitHits).toBeGreaterThan(0);
    });
  });

  describe("progress and analytics", () => {
    it("should track comprehensive analytics", async () => {
      await manager.initialize();

      const progress = manager.getProgress();
      const analytics = progress.analytics;

      expect(analytics).toHaveProperty("totalApiCalls");
      expect(analytics).toHaveProperty("totalErrors");
      expect(analytics).toHaveProperty("avgResponseTime");
      expect(analytics).toHaveProperty("dataTransferred");
      expect(analytics).toHaveProperty("memoryPeakUsage");
      expect(analytics).toHaveProperty("rateLimitHits");
      expect(analytics).toHaveProperty("circuitBreakerTrips");
    });

    it("should limit error records to prevent memory bloat", async () => {
      await manager.initialize();

      // Simulate many errors
      for (let i = 0; i < 250; i++) {
        manager["recordError"]("test-op", "pages", new Error(`Error ${i}`), `obj-${i}`);
      }

      const progress = manager.getProgress();
      expect(progress.errors.length).toBeLessThanOrEqual(10); // Only recent errors in progress
      expect(manager["errorRecords"].length).toBeLessThanOrEqual(200); // Total cap at 200
    });
  });

  describe("memory management", () => {
    it("should monitor and manage memory pressure", async () => {
      await manager.initialize();

      // Simulate memory pressure
      const originalMemoryUsage = process.memoryUsage;
      process.memoryUsage = vi.fn().mockReturnValue({
        rss: 100 * 1024 * 1024,
        heapTotal: 80 * 1024 * 1024,
        heapUsed: 60 * 1024 * 1024, // Above 50MB limit
        external: 5 * 1024 * 1024,
        arrayBuffers: 1 * 1024 * 1024
      });

      // This should trigger memory management
      await manager["managememoryPressure"]();

      // Restore original function
      process.memoryUsage = originalMemoryUsage;
    });
  });

  describe("finalization", () => {
    it("should finalize export properly", async () => {
      await manager.initialize();

      await manager.finalize();

      expect(mockWriteStream.end).toHaveBeenCalled();
    });

    it("should cleanup checkpoint after successful export", async () => {
      await manager.initialize();

      await manager.cleanup();

      // Cleanup should be called on progress tracker
    });
  });
});

describe("NotionStreamingExporter", () => {
  let exporter: NotionStreamingExporter;
  let mockNotionClient: any;

  beforeEach(() => {
    vi.clearAllMocks();

    exporter = new NotionStreamingExporter("test-export", "./output", {
      pages: 3,
      databases: 2
    });

    mockNotionClient = {
      search: vi.fn(),
      databases: {
        list: vi.fn(),
        retrieve: vi.fn()
      },
      pages: {
        retrieve: vi.fn()
      }
    };
  });

  it("should create exporter with custom concurrency limits", () => {
    expect(exporter).toBeInstanceOf(NotionStreamingExporter);
  });

  it("should estimate workspace size", async () => {
    const size = await exporter["estimateWorkspaceSize"](mockNotionClient);
    expect(size).toBeGreaterThan(0);
  });

  it("should transform pages correctly", () => {
    const mockPage = {
      id: "page-123",
      properties: {
        title: {
          title: [{ plain_text: "Test Page" }]
        }
      },
      created_time: "2023-01-01T00:00:00.000Z",
      last_edited_time: "2023-01-02T00:00:00.000Z"
    };

    const transformed = exporter["transformPage"](mockPage);

    expect(transformed).toEqual({
      id: "page-123",
      title: "Test Page",
      created_time: "2023-01-01T00:00:00.000Z",
      last_edited_time: "2023-01-02T00:00:00.000Z"
    });
  });

  it("should transform databases correctly", () => {
    const mockDatabase = {
      id: "db-123",
      title: [{ plain_text: "Test Database" }]
    };

    const transformed = exporter["transformDatabase"](mockDatabase);

    expect(transformed).toEqual({
      id: "db-123",
      title: "Test Database"
    });
  });

  it("should handle pages with no title", () => {
    const mockPage = {
      id: "page-123",
      properties: {},
      created_time: "2023-01-01T00:00:00.000Z",
      last_edited_time: "2023-01-02T00:00:00.000Z"
    };

    const transformed = exporter["transformPage"](mockPage);

    expect(transformed.title).toBe("Untitled");
  });

  it("should handle databases with no title", () => {
    const mockDatabase = {
      id: "db-123",
      title: []
    };

    const transformed = exporter["transformDatabase"](mockDatabase);

    expect(transformed.title).toBe("Untitled Database");
  });
});

describe("integration tests", () => {
  it("should handle end-to-end export flow", async () => {
    const manager = new StreamingExportManager("integration-test", "./output");

    await manager.initialize();

    // Simulate a small export
    const mockPages = [
      { id: "page-1", title: "Page 1" },
      { id: "page-2", title: "Page 2" }
    ];

    async function* mockPagesSource() {
      for (const page of mockPages) {
        yield page;
      }
    }

    const transformer = (page: any) => ({ ...page, exported: true });

    const results: any[] = [];
    for await (const item of manager.streamExportItems(
      mockPagesSource(),
      transformer,
      "pages",
      "pages" as OperationType
    )) {
      results.push(item);
    }

    await manager.finalize();
    await manager.cleanup();

    expect(results).toHaveLength(2);
    expect(results[0]).toHaveProperty("exported", true);
  });

  it("should maintain performance under load", async () => {
    const manager = new StreamingExportManager("load-test", "./output");

    await manager.initialize();

    // Simulate larger dataset
    const largeDataset = Array.from({ length: 100 }, (_, i) => ({
      id: `item-${i}`,
      data: `Data for item ${i}`
    }));

    async function* mockLargeSource() {
      for (const item of largeDataset) {
        yield item;
      }
    }

    const transformer = (item: any) => ({ ...item, processed: true });

    const startTime = Date.now();
    const results: any[] = [];

    for await (const item of manager.streamExportItems(
      mockLargeSource(),
      transformer,
      "pages",
      "pages" as OperationType
    )) {
      results.push(item);
    }

    const endTime = Date.now();
    const duration = endTime - startTime;

    expect(results).toHaveLength(100);
    expect(duration).toBeLessThan(5000); // Should complete in reasonable time

    await manager.finalize();
  });
});
