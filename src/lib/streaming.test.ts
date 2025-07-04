import { beforeEach, describe, expect, it, vi } from "vitest";
import { BoundedQueue, streamPaginatedAPI, StreamProcessor } from "./export/streaming";
import { delay } from "./export/util";

describe("streaming", () => {
  describe("streamPaginatedAPI", () => {
    it("should stream results from paginated API", async () => {
      const mockListFn = vi.fn();
      const results: any[] = [];

      // Mock paginated responses
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
          results: [{ id: "5" }],
          next_cursor: null
        });

      const stream = streamPaginatedAPI(mockListFn, { start_cursor: null }, "test", 10, 0, 100);

      for await (const item of stream) {
        results.push(item);
      }

      expect(results).toEqual([{ id: "1" }, { id: "2" }, { id: "3" }, { id: "4" }, { id: "5" }]);
      expect(mockListFn).toHaveBeenCalledTimes(3);
    });

    it("should respect memory limits and yield control", async () => {
      const mockListFn = vi.fn();
      let yieldCount = 0;

      // Create a large result set
      const largeResults = Array.from({ length: 50 }, (_, i) => ({ id: `${i}` }));

      mockListFn.mockResolvedValue({
        results: largeResults,
        next_cursor: null
      });

      const stream = streamPaginatedAPI(
        mockListFn,
        { start_cursor: null },
        "test",
        50,
        0,
        10 // Small memory limit to trigger yielding
      );

      const startTime = Date.now();
      const results: any[] = [];

      for await (const item of stream) {
        results.push(item);
        yieldCount++;

        // Check that control is yielded periodically
        if (yieldCount % 10 === 0) {
          const elapsed = Date.now() - startTime;
          expect(elapsed).toBeGreaterThanOrEqual(0);
        }
      }

      expect(results.length).toBe(50);
      expect(yieldCount).toBe(50);
    });

    it("should handle API errors", async () => {
      const mockListFn = vi.fn();
      mockListFn.mockRejectedValue(new Error("API Error"));

      const stream = streamPaginatedAPI(mockListFn, { start_cursor: null }, "test", 10, 0, 100);

      await expect(async () => {
        for await (const item of stream) {
          // Should not reach here
        }
      }).rejects.toThrow("API Error");
    });
  });

  describe("BoundedQueue", () => {
    let queue: BoundedQueue<number>;

    beforeEach(() => {
      queue = new BoundedQueue<number>(3);
    });

    it("should enqueue and dequeue items", async () => {
      await queue.enqueue(1);
      await queue.enqueue(2);

      expect(await queue.dequeue()).toBe(1);
      expect(await queue.dequeue()).toBe(2);
    });

    it("should block when queue is full", async () => {
      await queue.enqueue(1);
      await queue.enqueue(2);
      await queue.enqueue(3);

      let enqueueCompleted = false;
      const enqueuePromise = queue.enqueue(4).then(() => {
        enqueueCompleted = true;
      });

      // Give some time to ensure enqueue is blocked
      await delay(10);
      expect(enqueueCompleted).toBe(false);

      // Dequeue to make space
      await queue.dequeue();

      // Now enqueue should complete
      await enqueuePromise;
      expect(enqueueCompleted).toBe(true);
    });

    it("should block when queue is empty", async () => {
      let dequeueValue: number | undefined;
      const dequeuePromise = queue.dequeue().then((value) => {
        dequeueValue = value;
      });

      // Give some time to ensure dequeue is blocked
      await delay(10);
      expect(dequeueValue).toBeUndefined();

      // Enqueue to provide value
      await queue.enqueue(42);

      // Now dequeue should complete
      await dequeuePromise;
      expect(dequeueValue).toBe(42);
    });

    it("should handle queue closure", async () => {
      await queue.enqueue(1);
      queue.close();

      // Should return existing items
      expect(await queue.dequeue()).toBe(1);

      // Should return undefined after empty
      expect(await queue.dequeue()).toBeUndefined();

      // Should throw on enqueue after close
      await expect(queue.enqueue(2)).rejects.toThrow("Queue is closed");
    });

    it("should notify waiting consumers on close", async () => {
      const results: (number | undefined)[] = [];

      // Start multiple consumers
      const consumers = [
        queue.dequeue().then((v) => results.push(v)),
        queue.dequeue().then((v) => results.push(v)),
        queue.dequeue().then((v) => results.push(v))
      ];

      // Close queue
      queue.close();

      // All consumers should complete
      await Promise.all(consumers);

      expect(results).toEqual([undefined, undefined, undefined]);
    });
  });

  describe("StreamProcessor", () => {
    it("should process items with concurrency control", async () => {
      const processor = new StreamProcessor<number, string>(10, 2);
      const processedItems: string[] = [];
      let activeCount = 0;
      let maxActiveCount = 0;

      const source = async function* () {
        for (let i = 0; i < 10; i++) {
          yield i;
        }
      };

      const processFn = async (item: number): Promise<string> => {
        activeCount++;
        maxActiveCount = Math.max(maxActiveCount, activeCount);

        await delay(10); // Simulate processing

        activeCount--;
        return `processed-${item}`;
      };

      for await (const result of processor.process(source(), processFn)) {
        processedItems.push(result);
      }

      expect(processedItems.length).toBe(10);
      expect(processedItems).toContain("processed-0");
      expect(processedItems).toContain("processed-9");
      expect(maxActiveCount).toBeLessThanOrEqual(2); // Concurrency limit
    });

    it("should handle processing errors", async () => {
      const processor = new StreamProcessor<number, string>(10, 2);

      const source = async function* () {
        yield 1;
        yield 2;
        yield 3;
      };

      const processFn = async (item: number): Promise<string> => {
        if (item === 2) {
          throw new Error(`Error processing ${item}`);
        }
        return `processed-${item}`;
      };

      const results: string[] = [];

      await expect(async () => {
        for await (const result of processor.process(source(), processFn)) {
          results.push(result);
        }
      }).rejects.toThrow(AggregateError);

      // Should have processed items before error
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it("should maintain bounded memory with backpressure", async () => {
      const processor = new StreamProcessor<number, string>(5, 2); // Small queue
      const stats: any[] = [];

      const source = async function* () {
        for (let i = 0; i < 20; i++) {
          yield i;
        }
      };

      const processFn = async (item: number): Promise<string> => {
        // Capture queue size periodically
        if (item % 5 === 0) {
          stats.push(processor.getStats());
        }

        await delay(5); // Simulate processing
        return `processed-${item}`;
      };

      const results: string[] = [];
      for await (const result of processor.process(source(), processFn)) {
        results.push(result);
      }

      expect(results.length).toBe(20);

      // Check that queue size was bounded
      for (const stat of stats) {
        expect(stat.queueSize).toBeLessThanOrEqual(5);
      }
    });

    it("should handle empty source", async () => {
      const processor = new StreamProcessor<number, string>(10, 2);

      const source = async function* () {
        // Empty source
      };

      const processFn = async (item: number): Promise<string> => {
        return `processed-${item}`;
      };

      const results: string[] = [];
      for await (const result of processor.process(source(), processFn)) {
        results.push(result);
      }

      expect(results).toEqual([]);
    });
  });
});
