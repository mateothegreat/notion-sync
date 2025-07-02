import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdaptiveRateLimiter, OperationTypeAwareLimiter, parallelPaginatedFetch } from "./rate-limiting";
import { delay } from "./util";

describe("rate-limiting", () => {
  describe("AdaptiveRateLimiter", () => {
    let rateLimiter: AdaptiveRateLimiter;

    beforeEach(() => {
      rateLimiter = new AdaptiveRateLimiter(100);
    });

    it("should allow requests when under rate limit", async () => {
      const startTime = Date.now();

      // Make a few requests
      for (let i = 0; i < 5; i++) {
        await rateLimiter.waitForSlot();
      }

      const elapsed = Date.now() - startTime;

      // Should complete quickly when under limit
      expect(elapsed).toBeLessThan(1000);
    });

    it("should use burst capacity when available", async () => {
      // Update headers to show high remaining capacity
      rateLimiter.updateFromHeaders({
        "x-ratelimit-remaining": "50",
        "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 60),
        "x-ratelimit-limit": "60"
      });

      const startTime = Date.now();

      // Should allow burst of requests
      for (let i = 0; i < 10; i++) {
        await rateLimiter.waitForSlot();
      }

      const elapsed = Date.now() - startTime;

      // Should complete very quickly with burst capacity
      expect(elapsed).toBeLessThan(200);
    });

    it("should wait when rate limit is exhausted", async () => {
      // Exhaust rate limit
      rateLimiter.updateFromHeaders({
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 1), // Reset in 1 second
        "x-ratelimit-limit": "60"
      });

      const startTime = Date.now();
      await rateLimiter.waitForSlot();
      const elapsed = Date.now() - startTime;

      // Should wait until reset time
      expect(elapsed).toBeGreaterThanOrEqual(900);
      expect(elapsed).toBeLessThan(1500);
    });

    it("should update state from API headers", () => {
      const headers = {
        "x-ratelimit-remaining": "42",
        "x-ratelimit-reset": "1234567890",
        "x-ratelimit-limit": "100"
      };

      rateLimiter.updateFromHeaders(headers);

      const stats = rateLimiter.getStats();
      expect(stats.remainingRequests).toBe(42);
      expect(stats.resetTime.getTime()).toBe(1234567890000);
    });

    it("should increase backoff on errors", async () => {
      const timings: number[] = [];

      // First request - normal timing
      let start = Date.now();
      await rateLimiter.waitForSlot();
      timings.push(Date.now() - start);

      // Report error
      rateLimiter.reportError();

      // Second request - should have longer wait
      start = Date.now();
      await rateLimiter.waitForSlot();
      timings.push(Date.now() - start);

      // Report another error
      rateLimiter.reportError();

      // Third request - should have even longer wait
      start = Date.now();
      await rateLimiter.waitForSlot();
      timings.push(Date.now() - start);

      // Each subsequent wait should be longer
      expect(timings[1]).toBeGreaterThan(timings[0]);
      expect(timings[2]).toBeGreaterThan(timings[1]);
    });

    it("should reset error state on successful response", async () => {
      // Report errors to increase backoff
      rateLimiter.reportError();
      rateLimiter.reportError();

      const stats1 = rateLimiter.getStats();
      expect(stats1.backoffMultiplier).toBeGreaterThan(1);

      // Update from headers (simulating successful response)
      rateLimiter.updateFromHeaders({
        "x-ratelimit-remaining": "50",
        "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 60),
        "x-ratelimit-limit": "60"
      });

      const stats2 = rateLimiter.getStats();
      expect(stats2.backoffMultiplier).toBe(1);
    });

    it("should maintain sliding window of requests", async () => {
      const stats1 = rateLimiter.getStats();
      const initialRate = stats1.currentRate;

      // Make several requests
      for (let i = 0; i < 10; i++) {
        await rateLimiter.waitForSlot();
        await delay(10);
      }

      const stats2 = rateLimiter.getStats();
      expect(stats2.currentRate).toBeGreaterThan(initialRate);
      expect(stats2.currentRate).toBeLessThanOrEqual(60); // Within rate limit
    });
  });

  describe("OperationTypeAwareLimiter", () => {
    let limiter: OperationTypeAwareLimiter;

    beforeEach(() => {
      limiter = new OperationTypeAwareLimiter({
        pages: 2,
        blocks: 5,
        databases: 1
      });
    });

    it("should enforce different concurrency limits per operation type", async () => {
      const activeOps = {
        pages: 0,
        blocks: 0,
        databases: 0
      };

      const maxActiveOps = {
        pages: 0,
        blocks: 0,
        databases: 0
      };

      // Create operations for each type
      const createOperation = (type: keyof typeof activeOps) => async () => {
        activeOps[type]++;
        maxActiveOps[type] = Math.max(maxActiveOps[type], activeOps[type]);
        await delay(50);
        activeOps[type]--;
      };

      // Launch multiple operations concurrently
      const promises: Promise<void>[] = [];

      // 5 page operations
      for (let i = 0; i < 5; i++) {
        promises.push(limiter.run("pages", createOperation("pages")));
      }

      // 10 block operations
      for (let i = 0; i < 10; i++) {
        promises.push(limiter.run("blocks", createOperation("blocks")));
      }

      // 3 database operations
      for (let i = 0; i < 3; i++) {
        promises.push(limiter.run("databases", createOperation("databases")));
      }

      await Promise.all(promises);

      // Check that limits were respected
      expect(maxActiveOps.pages).toBeLessThanOrEqual(2);
      expect(maxActiveOps.blocks).toBeLessThanOrEqual(5);
      expect(maxActiveOps.databases).toBeLessThanOrEqual(1);
    });

    it("should handle unknown operation types", async () => {
      let executed = false;

      await limiter.run("unknown", async () => {
        executed = true;
      });

      expect(executed).toBe(true);
    });

    it("should respect timeout", async () => {
      const operation = async () => {
        await delay(1000);
        return "completed";
      };

      await expect(limiter.run("pages", operation, 100)).rejects.toThrow("Operation timed out");
    });

    it("should provide statistics", async () => {
      const operations: Promise<void>[] = [];

      // Start some operations
      for (let i = 0; i < 3; i++) {
        operations.push(
          limiter.run("pages", async () => {
            await delay(50);
          })
        );
      }

      // Check stats while operations are running
      await delay(10);
      const stats = limiter.getStats();

      expect(stats.pages).toBeDefined();
      expect(stats.pages.running).toBeGreaterThan(0);

      await Promise.all(operations);
    });
  });

  describe("parallelPaginatedFetch", () => {
    it("should fetch pages in parallel", async () => {
      const mockListFn = vi.fn();
      const rateLimiter = new AdaptiveRateLimiter();

      // Mock responses
      mockListFn
        .mockResolvedValueOnce({
          results: [{ id: "1" }, { id: "2" }],
          next_cursor: "cursor1"
        })
        .mockResolvedValueOnce({
          results: [{ id: "3" }, { id: "4" }],
          next_cursor: "cursor2"
        })
        .mockResolvedValueOnce({
          results: [{ id: "5" }, { id: "6" }],
          next_cursor: null
        });

      const results = await parallelPaginatedFetch(
        mockListFn,
        { start_cursor: null },
        2, // Allow 2 parallel fetches
        rateLimiter
      );

      expect(results).toHaveLength(6);
      expect(mockListFn).toHaveBeenCalledTimes(3);
    });

    it("should respect rate limits during parallel fetching", async () => {
      const mockListFn = vi.fn();
      const rateLimiter = new AdaptiveRateLimiter();

      // Simulate rate limiting
      let waitSlotCalled = 0;
      const originalWaitForSlot = rateLimiter.waitForSlot.bind(rateLimiter);
      rateLimiter.waitForSlot = vi.fn(async () => {
        waitSlotCalled++;
        return originalWaitForSlot();
      });

      mockListFn.mockImplementation(async () => {
        await delay(10);
        return {
          results: [{ id: Math.random() }],
          next_cursor: waitSlotCalled < 5 ? "cursor" : null
        };
      });

      const results = await parallelPaginatedFetch(mockListFn, { start_cursor: null }, 3, rateLimiter);

      expect(rateLimiter.waitForSlot).toHaveBeenCalled();
      expect(results.length).toBeGreaterThan(0);
    });

    it("should handle errors in parallel fetches", async () => {
      const mockListFn = vi.fn();
      const rateLimiter = new AdaptiveRateLimiter();

      mockListFn
        .mockResolvedValueOnce({
          results: [{ id: "1" }],
          next_cursor: "cursor1"
        })
        .mockRejectedValueOnce(new Error("API Error"));

      await expect(parallelPaginatedFetch(mockListFn, { start_cursor: null }, 2, rateLimiter)).rejects.toThrow(
        "API Error"
      );
    });

    it("should handle empty results", async () => {
      const mockListFn = vi.fn();
      const rateLimiter = new AdaptiveRateLimiter();

      mockListFn.mockResolvedValue({
        results: [],
        next_cursor: null
      });

      const results = await parallelPaginatedFetch(mockListFn, { start_cursor: null }, 2, rateLimiter);

      expect(results).toEqual([]);
      expect(mockListFn).toHaveBeenCalledTimes(1);
    });
  });
});
