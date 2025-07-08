import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OperationTypeAwareLimiter, type OperationContext, type OperationType } from "./concurrency-manager";

describe("OperationTypeAwareLimiter", () => {
  let limiter: OperationTypeAwareLimiter;
  let mockDateNow = vi.spyOn(Date, "now");
  let currentTime: number;

  beforeEach(() => {
    currentTime = 1000000000;
    mockDateNow = vi.spyOn(Date, "now").mockImplementation(() => currentTime);
    limiter = new OperationTypeAwareLimiter({
      pages: 5,
      blocks: 10,
      databases: 3,
      comments: 8,
      users: 15,
      properties: 6
    });
  });

  afterEach(() => {
    mockDateNow.mockRestore();
  });

  describe("initialization", () => {
    it("should initialize with custom limits", () => {
      const limits = limiter.getCurrentLimits();

      expect(limits.pages).toBe(5);
      expect(limits.blocks).toBe(10);
      expect(limits.databases).toBe(3);
      expect(limits.comments).toBe(8);
      expect(limits.users).toBe(15);
      expect(limits.properties).toBe(6);
    });

    it("should use default limits when no custom limits provided", () => {
      const defaultLimiter = new OperationTypeAwareLimiter();
      const limits = defaultLimiter.getCurrentLimits();

      expect(limits.pages).toBe(8);
      expect(limits.blocks).toBe(20);
      expect(limits.databases).toBe(5);
      expect(limits.comments).toBe(12);
      expect(limits.users).toBe(25);
      expect(limits.properties).toBe(15);
    });
  });

  describe("run operations", () => {
    it("should execute operations with appropriate concurrency", async () => {
      const mockOperation = vi.fn().mockResolvedValue("success");
      const context: OperationContext = {
        type: "pages",
        objectId: "test-page",
        operation: "fetch",
        priority: "normal"
      };

      const result = await limiter.run(context, mockOperation);

      expect(result).toBe("success");
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it("should handle different operation types", async () => {
      const operations: Array<{ type: OperationType; expectedLimit: number }> = [
        { type: "pages", expectedLimit: 5 },
        { type: "blocks", expectedLimit: 10 },
        { type: "databases", expectedLimit: 3 },
        { type: "comments", expectedLimit: 8 },
        { type: "users", expectedLimit: 15 },
        { type: "properties", expectedLimit: 6 }
      ];

      for (const op of operations) {
        const mockOperation = vi.fn().mockResolvedValue("success");
        const context: OperationContext = {
          type: op.type,
          objectId: "test-object",
          operation: "test"
        };

        await limiter.run(context, mockOperation);

        const stats = limiter.getTypeStats(op.type);
        expect(stats).toBeDefined();
        expect(stats!.concurrencyLimit).toBe(op.expectedLimit);
      }
    });

    it("should track operation statistics", async () => {
      const mockOperation = vi.fn().mockResolvedValue("success");
      const context: OperationContext = {
        type: "pages",
        objectId: "test-page",
        operation: "fetch"
      };

      await limiter.run(context, mockOperation);

      const stats = limiter.getTypeStats("pages");
      expect(stats!.completed).toBe(1);
      expect(stats!.failed).toBe(0);
      expect(stats!.running).toBe(0);
    });

    it("should handle operation failures", async () => {
      const mockOperation = vi.fn().mockRejectedValue(new Error("Test error"));
      const context: OperationContext = {
        type: "pages",
        objectId: "test-page",
        operation: "fetch"
      };

      await expect(limiter.run(context, mockOperation)).rejects.toThrow("Test error");

      const stats = limiter.getTypeStats("pages");
      expect(stats!.failed).toBe(1);
      expect(stats!.completed).toBe(0);
    });

    it("should enforce concurrency limits", async () => {
      const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      const longRunningOperation = vi.fn().mockImplementation(() => delay(100));

      const context: OperationContext = {
        type: "databases", // Limit of 3
        objectId: "test-db",
        operation: "query"
      };

      // Start 5 operations simultaneously
      const promises = Array.from({ length: 5 }, () => limiter.run(context, longRunningOperation));

      // Check that only 3 are running initially
      await delay(10);
      const stats = limiter.getTypeStats("databases");
      expect(stats!.running).toBeLessThanOrEqual(3);

      await Promise.all(promises);
      expect(longRunningOperation).toHaveBeenCalledTimes(5);
    });
  });

  describe("header updates", () => {
    it("should update limiters from API headers", () => {
      const headers = {
        "x-ratelimit-remaining": "45",
        "x-ratelimit-limit": "100",
        "x-ratelimit-reset": String(Math.floor((currentTime + 60000) / 1000))
      };

      limiter.updateFromHeaders(headers, 250, "pages", false);

      const globalStats = limiter.getGlobalStats();
      expect(globalStats.headerUpdateFrequency).toBeCloseTo(currentTime / 1000, 0);
    });

    it("should track response times from headers", () => {
      const headers = { "x-ratelimit-remaining": "50" };

      limiter.updateFromHeaders(headers, 300, "pages", false);
      limiter.updateFromHeaders(headers, 400, "pages", false);

      // The internal statistics should be updated
      const stats = limiter.getTypeStats("pages");
      expect(stats).toBeDefined();
    });

    it("should handle errors in header updates", () => {
      const headers = { "x-ratelimit-remaining": "30" };

      limiter.updateFromHeaders(headers, 500, "pages", true);

      // Should not throw and continue functioning
      const stats = limiter.getGlobalStats();
      expect(stats).toBeDefined();
    });
  });

  describe("performance statistics", () => {
    it("should calculate global performance metrics", async () => {
      const mockOperation = vi.fn().mockResolvedValue("success");

      // Run several operations
      for (let i = 0; i < 5; i++) {
        const context: OperationContext = {
          type: "pages",
          objectId: `page-${i}`,
          operation: "fetch"
        };
        await limiter.run(context, mockOperation);
        currentTime += 100; // Advance time
      }

      const globalStats = limiter.getGlobalStats();
      expect(globalStats.totalOperations).toBe(5);
      expect(globalStats.totalErrors).toBe(0);
      expect(globalStats.errorRate).toBe(0);
      expect(globalStats.avgDuration).toBeGreaterThan(0);
      expect(globalStats.operationsPerSecond).toBeGreaterThan(0);
    });

    it("should track active operations correctly", async () => {
      const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      const longRunningOperation = vi.fn().mockImplementation(() => delay(50));

      const context: OperationContext = {
        type: "pages",
        objectId: "test-page",
        operation: "fetch"
      };

      // Start operations without waiting
      const promises = [limiter.run(context, longRunningOperation), limiter.run(context, longRunningOperation)];

      // Check active operations
      await delay(10);
      const globalStats = limiter.getGlobalStats();
      expect(globalStats.activeOperations).toBe(2);

      await Promise.all(promises);
    });

    it("should provide performance summary", async () => {
      const mockOperation = vi.fn().mockResolvedValue("success");

      const context: OperationContext = {
        type: "pages",
        objectId: "test-page",
        operation: "fetch"
      };

      await limiter.run(context, mockOperation);

      const summary = limiter.getPerformanceSummary();

      expect(summary.global).toBeDefined();
      expect(summary.byType).toBeDefined();
      expect(summary.recommendations).toBeInstanceOf(Array);
      expect(summary.byType.pages).toBeDefined();
      expect(summary.byType.pages.concurrency).toBe(5);
    });
  });

  describe("auto-tuning", () => {
    it("should reduce concurrency when error rate is high", async () => {
      const mockOperation = vi.fn().mockRejectedValue(new Error("High error rate"));

      // Generate high error rate
      for (let i = 0; i < 10; i++) {
        try {
          await limiter.run(
            {
              type: "pages",
              objectId: `page-${i}`,
              operation: "fetch"
            },
            mockOperation
          );
        } catch (error) {
          // Expected errors
        }
      }

      const initialLimits = limiter.getCurrentLimits();

      limiter.autoTune();

      const newLimits = limiter.getCurrentLimits();
      expect(newLimits.pages).toBeLessThan(initialLimits.pages);
    });

    it("should increase concurrency for high-performing operations", async () => {
      const mockOperation = vi.fn().mockResolvedValue("success");

      // Generate good performance
      for (let i = 0; i < 20; i++) {
        await limiter.run(
          {
            type: "blocks",
            objectId: `block-${i}`,
            operation: "fetch"
          },
          mockOperation
        );
        currentTime += 50; // Fast operations
      }

      const initialLimits = limiter.getCurrentLimits();

      limiter.autoTune();

      const newLimits = limiter.getCurrentLimits();
      expect(newLimits.blocks).toBeGreaterThanOrEqual(initialLimits.blocks);
    });

    it("should balance concurrency between operation types", async () => {
      const fastOperation = vi.fn().mockResolvedValue("fast");
      const slowOperation = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return "slow";
      });

      // Create performance differential
      for (let i = 0; i < 10; i++) {
        await limiter.run(
          {
            type: "users",
            objectId: `user-${i}`,
            operation: "fetch"
          },
          fastOperation
        );

        try {
          await limiter.run(
            {
              type: "databases",
              objectId: `db-${i}`,
              operation: "query"
            },
            slowOperation
          );
        } catch (error) {
          // May timeout or fail
        }
      }

      const initialLimits = limiter.getCurrentLimits();

      limiter.autoTune();

      const newLimits = limiter.getCurrentLimits();

      // Fast operations might get more concurrency, slow ones less
      expect(newLimits.users).toBeGreaterThanOrEqual(initialLimits.users);
    });
  });

  describe("adjustment methods", () => {
    it("should adjust all limits by factor", () => {
      const initialLimits = limiter.getCurrentLimits();

      limiter.adjustLimits(2.0, "scale-up");

      const newLimits = limiter.getCurrentLimits();
      expect(newLimits.pages).toBe(initialLimits.pages * 2);
      expect(newLimits.blocks).toBe(initialLimits.blocks * 2);
    });

    it("should respect minimum limits when adjusting down", () => {
      limiter.adjustLimits(0.1, "scale-down"); // Very small factor

      const limits = limiter.getCurrentLimits();
      // All limits should be at least 1
      Object.values(limits).forEach((limit) => {
        expect(limit).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe("statistics reset", () => {
    it("should reset all statistics", async () => {
      const mockOperation = vi.fn().mockResolvedValue("success");

      // Generate some activity
      await limiter.run(
        {
          type: "pages",
          objectId: "test-page",
          operation: "fetch"
        },
        mockOperation
      );

      limiter.resetStats();

      const globalStats = limiter.getGlobalStats();
      expect(globalStats.totalOperations).toBe(0);
      expect(globalStats.totalErrors).toBe(0);

      const limits = limiter.getCurrentLimits();
      expect(limits.pages).toBe(8); // Back to default
    });
  });

  describe("edge cases", () => {
    it("should handle unknown operation types gracefully", async () => {
      const mockOperation = vi.fn().mockResolvedValue("success");
      const context: OperationContext = {
        type: "unknown" as OperationType,
        objectId: "test-object",
        operation: "test"
      };

      // Should default to pages limiter
      const result = await limiter.run(context, mockOperation);
      expect(result).toBe("success");
    });

    it("should handle very short operations", async () => {
      const fastOperation = vi.fn().mockResolvedValue("instant");

      const context: OperationContext = {
        type: "users",
        objectId: "user-1",
        operation: "fetch"
      };

      const startTime = Date.now();
      await limiter.run(context, fastOperation);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(50);

      const stats = limiter.getTypeStats("users");
      expect(stats!.completed).toBe(1);
    });

    it("should handle operations with different priorities", async () => {
      const normalOperation = vi.fn().mockResolvedValue("normal");
      const highPriorityOperation = vi.fn().mockResolvedValue("high");

      const normalContext: OperationContext = {
        type: "pages",
        objectId: "normal-page",
        operation: "fetch",
        priority: "normal"
      };

      const highContext: OperationContext = {
        type: "pages",
        objectId: "high-page",
        operation: "fetch",
        priority: "high"
      };

      await Promise.all([limiter.run(normalContext, normalOperation), limiter.run(highContext, highPriorityOperation)]);

      expect(normalOperation).toHaveBeenCalled();
      expect(highPriorityOperation).toHaveBeenCalled();
    });

    it("should handle timeout scenarios", async () => {
      const timeoutOperation = vi.fn().mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 200)));

      const context: OperationContext = {
        type: "pages",
        objectId: "timeout-page",
        operation: "fetch",
        timeout: 50 // Very short timeout
      };

      await expect(limiter.run(context, timeoutOperation)).rejects.toThrow("Operation timed out");

      const stats = limiter.getTypeStats("pages");
      expect(stats!.failed).toBe(1);
    });
  });

  describe("concurrent load testing", () => {
    it("should handle high concurrent load", async () => {
      const fastOperation = vi.fn().mockResolvedValue("success");

      // Create 50 concurrent operations across different types
      const operations = [];
      const types: OperationType[] = ["pages", "blocks", "databases", "comments", "users", "properties"];

      for (let i = 0; i < 50; i++) {
        const type = types[i % types.length];
        const context: OperationContext = {
          type,
          objectId: `object-${i}`,
          operation: "fetch"
        };
        operations.push(limiter.run(context, fastOperation));
      }

      const startTime = Date.now();
      await Promise.all(operations);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(5000); // Should complete reasonably fast
      expect(fastOperation).toHaveBeenCalledTimes(50);

      const globalStats = limiter.getGlobalStats();
      expect(globalStats.totalOperations).toBe(50);
      expect(globalStats.totalErrors).toBe(0);
    });

    it("should maintain consistency under load", async () => {
      const operations = [];
      const operationCounts = { completed: 0, failed: 0 };

      // Mix of successful and failing operations
      for (let i = 0; i < 30; i++) {
        const shouldFail = i % 5 === 0; // Every 5th operation fails
        const operation = shouldFail
          ? vi.fn().mockRejectedValue(new Error("Planned failure"))
          : vi.fn().mockResolvedValue("success");

        const context: OperationContext = {
          type: "pages",
          objectId: `page-${i}`,
          operation: "fetch"
        };

        operations.push(
          limiter
            .run(context, operation)
            .then(() => operationCounts.completed++)
            .catch(() => operationCounts.failed++)
        );
      }

      await Promise.allSettled(operations);

      const stats = limiter.getTypeStats("pages");
      expect(stats!.completed).toBe(operationCounts.completed);
      expect(stats!.failed).toBe(operationCounts.failed);
      expect(stats!.completed + stats!.failed).toBe(30);
    });
  });
});
