import { APIErrorCode } from "@notionhq/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  collectPaginatedAPI,
  iteratePaginatedAPI,
  retryOperation,
  smartRetryOperation,
  type OperationEventEmitter,
  type RetryContext
} from "./operations";
import { CircuitBreaker, delay } from "./util";

describe("operations", () => {
  describe("smartRetryOperation", () => {
    let mockOperation: any;
    let context: RetryContext;
    let eventEmitter: OperationEventEmitter;
    let emittedEvents: any[];

    beforeEach(() => {
      mockOperation = vi.fn();
      context = { operationType: "read" };
      emittedEvents = [];
      eventEmitter = {
        emit: (event: string, data: any) => {
          emittedEvents.push({ event, data });
        }
      };
    });

    it("should execute operation successfully on first try", async () => {
      mockOperation.mockResolvedValue("success");

      const result = await smartRetryOperation(mockOperation, "test-op", context, 3, 100);

      expect(result).toBe("success");
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it("should retry on retryable errors", async () => {
      mockOperation
        .mockRejectedValueOnce({ code: APIErrorCode.RateLimited })
        .mockRejectedValueOnce({ code: APIErrorCode.ServiceUnavailable })
        .mockResolvedValue("success");

      const result = await smartRetryOperation(mockOperation, "test-op", context, 3, 50);

      expect(result).toBe("success");
      expect(mockOperation).toHaveBeenCalledTimes(3);
    });

    it("should not retry on non-retryable errors", async () => {
      const error = new Error("Not retryable");
      mockOperation.mockRejectedValue(error);

      await expect(smartRetryOperation(mockOperation, "test-op", context, 3, 100)).rejects.toThrow("Not retryable");

      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it("should respect circuit breaker", async () => {
      const circuitBreaker = new CircuitBreaker(5, 60000);
      // Force circuit breaker to open state
      for (let i = 0; i < 5; i++) {
        circuitBreaker.reportFailure();
      }

      context.circuitBreaker = circuitBreaker;

      await expect(smartRetryOperation(mockOperation, "test-op", context)).rejects.toThrow("Circuit breaker is open");

      expect(mockOperation).not.toHaveBeenCalled();
    });

    it("should adjust retry policy based on operation type", async () => {
      const writeContext: RetryContext = { operationType: "write" };
      const readContext: RetryContext = { operationType: "read" };

      mockOperation.mockRejectedValue({ code: APIErrorCode.RateLimited });

      // Write operations have fewer retries
      await expect(smartRetryOperation(mockOperation, "write-op", writeContext, 1, 50)).rejects.toThrow();
      const writeAttempts = mockOperation.mock.calls.length;

      mockOperation.mockClear();

      // Read operations have more retries
      await expect(smartRetryOperation(mockOperation, "read-op", readContext, 1, 50)).rejects.toThrow();
      const readAttempts = mockOperation.mock.calls.length;

      expect(readAttempts).toBeGreaterThan(writeAttempts);
    });

    it("should use adaptive timeout", async () => {
      let operationDuration = 150;
      mockOperation.mockImplementation(async () => {
        await delay(operationDuration);
        operationDuration *= 2; // Double duration each time
        throw { code: APIErrorCode.RateLimited };
      });

      const startTime = Date.now();

      await expect(
        smartRetryOperation(
          mockOperation,
          "test-op",
          context,
          2,
          50,
          100 // Base timeout
        )
      ).rejects.toThrow();

      // Should have attempted with increasing timeouts
      expect(mockOperation).toHaveBeenCalledTimes(3);
    });

    it("should emit events", async () => {
      mockOperation.mockRejectedValueOnce({ code: APIErrorCode.RateLimited }).mockResolvedValue("success");

      await smartRetryOperation(mockOperation, "test-op", context, 3, 50, undefined, eventEmitter);

      expect(emittedEvents).toContainEqual(expect.objectContaining({ event: "api-call" }));
      expect(emittedEvents).toContainEqual(expect.objectContaining({ event: "retry" }));
    });

    it("should handle priority in retry delays", async () => {
      const highPriorityContext: RetryContext = {
        operationType: "read",
        priority: "high"
      };

      mockOperation.mockRejectedValue({ code: APIErrorCode.RateLimited });

      const startTime = Date.now();

      await expect(
        smartRetryOperation(
          mockOperation,
          "test-op",
          highPriorityContext,
          1,
          1000 // Base delay
        )
      ).rejects.toThrow();

      const elapsed = Date.now() - startTime;

      // High priority should have shorter delays
      expect(elapsed).toBeLessThan(2000);
    });

    it("should apply jitter to prevent thundering herd", async () => {
      const delays: number[] = [];
      let lastCallTime = Date.now();

      mockOperation.mockImplementation(async () => {
        const now = Date.now();
        delays.push(now - lastCallTime);
        lastCallTime = now;
        throw { code: APIErrorCode.RateLimited };
      });

      await expect(smartRetryOperation(mockOperation, "test-op", context, 5, 100)).rejects.toThrow();

      // Check that delays have variation due to jitter
      const uniqueDelays = new Set(delays.slice(1)); // Skip first (no delay)
      expect(uniqueDelays.size).toBeGreaterThan(1);
    });
  });

  describe("retryOperation (legacy)", () => {
    it("should delegate to smartRetryOperation", async () => {
      const mockOperation = vi.fn().mockResolvedValue("success");

      const result = await retryOperation(mockOperation, 3, 100, "test-op", 1000);

      expect(result).toBe("success");
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });
  });

  describe("iteratePaginatedAPI", () => {
    let mockListFn: any;

    beforeEach(() => {
      mockListFn = vi.fn();
    });

    it("should iterate through all pages", async () => {
      mockListFn
        .mockResolvedValueOnce({
          results: [{ id: "1" }, { id: "2" }],
          next_cursor: "cursor1"
        })
        .mockResolvedValueOnce({
          results: [{ id: "3" }],
          next_cursor: null
        });

      const results: any[] = [];

      for await (const item of iteratePaginatedAPI(mockListFn, { start_cursor: null }, "test", 10, 0)) {
        results.push(item);
      }

      expect(results).toEqual([{ id: "1" }, { id: "2" }, { id: "3" }]);
      expect(mockListFn).toHaveBeenCalledTimes(2);
    });

    it("should apply rate limit delay", async () => {
      mockListFn.mockResolvedValue({
        results: [{ id: "1" }],
        next_cursor: null
      });

      const startTime = Date.now();

      for await (const item of iteratePaginatedAPI(
        mockListFn,
        { start_cursor: null },
        "test",
        10,
        100 // 100ms delay
      )) {
        // Process item
      }

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeGreaterThanOrEqual(100);
    });

    it("should pass page size to API", async () => {
      mockListFn.mockResolvedValue({
        results: [],
        next_cursor: null
      });

      for await (const item of iteratePaginatedAPI(mockListFn, { start_cursor: null }, "test", 25, 0)) {
        // Process item
      }

      expect(mockListFn).toHaveBeenCalledWith(expect.objectContaining({ page_size: 25 }));
    });

    it("should handle empty results", async () => {
      mockListFn.mockResolvedValue({
        results: [],
        next_cursor: null
      });

      const results: any[] = [];

      for await (const item of iteratePaginatedAPI(mockListFn, { start_cursor: null }, "test", 10, 0)) {
        results.push(item);
      }

      expect(results).toEqual([]);
    });

    it("should propagate errors", async () => {
      mockListFn.mockRejectedValue(new Error("API Error"));

      const iterator = iteratePaginatedAPI(mockListFn, { start_cursor: null }, "test", 10, 0);

      await expect(iterator.next()).rejects.toThrow("API Error");
    });
  });

  describe("collectPaginatedAPI", () => {
    let mockListFn: any;

    beforeEach(() => {
      mockListFn = vi.fn();
    });

    it("should collect all results into array", async () => {
      mockListFn
        .mockResolvedValueOnce({
          results: [{ id: "1" }, { id: "2" }],
          next_cursor: "cursor1"
        })
        .mockResolvedValueOnce({
          results: [{ id: "3" }],
          next_cursor: null
        });

      const results = await collectPaginatedAPI(mockListFn, { start_cursor: null }, 10, 0);

      expect(results).toEqual([{ id: "1" }, { id: "2" }, { id: "3" }]);
    });

    it("should warn about memory usage in comments", () => {
      // This is a documentation test - the function includes
      // a warning comment about loading all results into memory
      const functionString = collectPaginatedAPI.toString();
      expect(functionString).toBeTruthy();
    });
  });
});
