import { delay } from "./util";

/**
 * Streaming pagination with bounded memory for large data exports.
 * Prevents OOM crashes by processing items in chunks and yielding control.
 */
export async function* streamPaginatedAPI<T extends { next_cursor: string | null; results: any[] }>(
  listFn: (args: any) => Promise<T>,
  firstPageArgs: any,
  operationName: string,
  pageSize: number,
  rateLimitDelay: number,
  maxMemoryItems: number = 1000
): AsyncGenerator<T["results"][0], void, unknown> {
  let nextCursor: string | undefined = firstPageArgs.start_cursor;
  let totalYielded = 0;
  let pageCount = 0;

  do {
    try {
      const args = {
        ...firstPageArgs,
        start_cursor: nextCursor,
        page_size: Math.min(pageSize, maxMemoryItems)
      };

      // Wait before making request
      await delay(rateLimitDelay);

      const response = await listFn(args);
      pageCount++;

      // Stream results immediately to avoid memory accumulation
      for (const result of response.results) {
        yield result;
        totalYielded++;

        // Allow GC to run periodically
        if (totalYielded % maxMemoryItems === 0) {
          await delay(0); // Yield to event loop

          // Force GC if available (requires --expose-gc flag)
          if (global.gc) {
            global.gc();
          }
        }
      }

      nextCursor = response.next_cursor ?? undefined;
    } catch (error) {
      throw error;
    }
  } while (nextCursor);
}

/**
 * Memory-bounded queue for processing items with backpressure.
 */
export class BoundedQueue<T> {
  private items: T[] = [];
  private maxSize: number;
  private waitingConsumers: Array<(value: T | undefined) => void> = [];
  private waitingProducers: Array<() => void> = [];
  private closed = false;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  /**
   * Add an item to the queue. Waits if queue is full.
   */
  async enqueue(item: T): Promise<void> {
    if (this.closed) {
      throw new Error("Queue is closed");
    }

    // If queue is full, wait
    while (this.items.length >= this.maxSize && !this.closed) {
      await new Promise<void>((resolve) => {
        this.waitingProducers.push(resolve);
      });
    }

    if (this.closed) {
      throw new Error("Queue is closed");
    }

    this.items.push(item);

    // Notify waiting consumer if any
    const consumer = this.waitingConsumers.shift();
    if (consumer) {
      consumer(this.items.shift());
    }
  }

  /**
   * Remove and return an item from the queue. Waits if queue is empty.
   */
  async dequeue(): Promise<T | undefined> {
    // If items available, return immediately
    if (this.items.length > 0) {
      const item = this.items.shift();

      // Notify waiting producer if any
      const producer = this.waitingProducers.shift();
      if (producer) {
        producer();
      }

      return item;
    }

    // If closed and empty, return undefined
    if (this.closed) {
      return undefined;
    }

    // Wait for item
    return new Promise<T | undefined>((resolve) => {
      this.waitingConsumers.push(resolve);
    });
  }

  /**
   * Close the queue. No more items can be added.
   */
  close(): void {
    this.closed = true;

    // Resolve all waiting consumers with undefined
    for (const consumer of this.waitingConsumers) {
      consumer(undefined);
    }
    this.waitingConsumers = [];

    // Reject all waiting producers
    for (const producer of this.waitingProducers) {
      producer();
    }
    this.waitingProducers = [];
  }

  /**
   * Get current queue size.
   */
  size(): number {
    return this.items.length;
  }

  /**
   * Check if queue is empty.
   */
  isEmpty(): boolean {
    return this.items.length === 0;
  }

  /**
   * Check if queue is full.
   */
  isFull(): boolean {
    return this.items.length >= this.maxSize;
  }
}

/**
 * Stream processor that handles items with bounded memory and concurrency.
 */
export class StreamProcessor<T, R> {
  private queue: BoundedQueue<T>;
  private concurrency: number;
  private activeProcessors = 0;
  private errors: Error[] = [];

  constructor(queueSize: number = 1000, concurrency: number = 10) {
    this.queue = new BoundedQueue<T>(queueSize);
    this.concurrency = concurrency;
  }

  /**
   * Process items from an async iterable with bounded memory.
   */
  async *process(source: AsyncIterable<T>, processor: (item: T) => Promise<R>): AsyncGenerator<R, void, unknown> {
    // Start producer
    const producerPromise = this.produce(source);

    // Start consumers
    const consumers: Promise<void>[] = [];
    const results = new BoundedQueue<R>(this.concurrency * 2);

    for (let i = 0; i < this.concurrency; i++) {
      consumers.push(this.consume(processor, results));
    }

    // Yield results as they become available
    try {
      while (true) {
        const result = await results.dequeue();
        if (result === undefined) {
          break;
        }
        yield result;
      }
    } finally {
      // Ensure cleanup
      this.queue.close();
      await Promise.all([producerPromise, ...consumers]);
    }

    // Throw any errors that occurred
    if (this.errors.length > 0) {
      throw new AggregateError(this.errors, "Processing errors occurred");
    }
  }

  private async produce(source: AsyncIterable<T>): Promise<void> {
    try {
      for await (const item of source) {
        await this.queue.enqueue(item);
      }
    } catch (error) {
      this.errors.push(error as Error);
    } finally {
      this.queue.close();
    }
  }

  private async consume(processor: (item: T) => Promise<R>, results: BoundedQueue<R>): Promise<void> {
    try {
      while (true) {
        const item = await this.queue.dequeue();
        if (item === undefined) {
          break;
        }

        this.activeProcessors++;
        try {
          const result = await processor(item);
          await results.enqueue(result);
        } catch (error) {
          this.errors.push(error as Error);
        } finally {
          this.activeProcessors--;
        }
      }
    } finally {
      // If this is the last consumer, close results
      if (--this.concurrency === 0) {
        results.close();
      }
    }
  }

  /**
   * Get current processing statistics.
   */
  getStats(): {
    queueSize: number;
    activeProcessors: number;
    errors: number;
  } {
    return {
      queueSize: this.queue.size(),
      activeProcessors: this.activeProcessors,
      errors: this.errors.length
    };
  }
}
