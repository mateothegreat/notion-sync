/**
 * Operation types with different performance characteristics.
 */
export type OperationType = "pages" | "blocks" | "databases" | "comments" | "users" | "properties";

/**
 * Operation context for enhanced monitoring and debugging.
 */
export interface OperationContext {
  type: OperationType;
  objectId: string;
  operation: string;
  priority?: "high" | "normal" | "low";
  timeout?: number;
}

/**
 * Statistics for monitoring operation performance.
 */
export interface OperationStats {
  running: number;
  queued: number;
  completed: number;
  failed: number;
  avgDuration: number;
  lastExecuted?: Date;
}

/**
 * Enhanced concurrency limiter with timeouts and statistics.
 */
class EnhancedConcurrencyLimiter {
  private running = 0;
  private queue: Array<() => void> = [];
  private stats: OperationStats = {
    running: 0,
    queued: 0,
    completed: 0,
    failed: 0,
    avgDuration: 0
  };
  private durations: number[] = [];

  constructor(private maxConcurrent: number) {}

  /**
   * Run an operation with concurrency control.
   *
   * @param fn - The operation to run.
   * @param timeout - Optional timeout for the operation.
   *
   * @returns The result of the operation.
   */
  async run<T>(fn: () => Promise<T>, timeout?: number): Promise<T> {
    // Wait for available slot
    while (this.running >= this.maxConcurrent) {
      this.stats.queued++;
      await new Promise<void>((resolve) =>
        this.queue.push(() => {
          this.stats.queued = Math.max(0, this.stats.queued - 1);
          resolve();
        })
      );
    }

    this.running++;
    this.stats.running = this.running;
    const startTime = Date.now();

    try {
      let result: T;

      if (timeout) {
        // Run with timeout
        result = await Promise.race([
          fn(),
          new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Operation timed out")), timeout))
        ]);
      } else {
        result = await fn();
      }

      // Update success statistics
      const duration = Date.now() - startTime;
      this.updateDurationStats(duration);
      this.stats.completed++;
      this.stats.lastExecuted = new Date();

      return result;
    } catch (error) {
      // Update failure statistics
      const duration = Date.now() - startTime;
      this.updateDurationStats(duration);
      this.stats.failed++;
      throw error;
    } finally {
      this.running--;
      this.stats.running = this.running;

      // Process next in queue
      const next = this.queue.shift();
      if (next) next();
    }
  }

  /**
   * Update duration statistics.
   *
   * @param duration - The duration to add.
   */
  private updateDurationStats(duration: number): void {
    this.durations.push(duration);

    // Keep only last 100 durations for rolling average
    if (this.durations.length > 100) {
      this.durations.shift();
    }

    // Calculate average duration
    this.stats.avgDuration = this.durations.reduce((sum, d) => sum + d, 0) / this.durations.length;
  }

  /**
   * Get current statistics.
   *
   * @returns Current operation statistics.
   */
  getStats(): OperationStats {
    return { ...this.stats };
  }

  /**
   * Get current concurrency limit.
   *
   * @returns The maximum concurrent operations.
   */
  getLimit(): number {
    return this.maxConcurrent;
  }

  /**
   * Update concurrency limit dynamically.
   *
   * @param newLimit - The new concurrency limit.
   */
  setLimit(newLimit: number): void {
    this.maxConcurrent = newLimit;
  }
}

/**
 * Operation-type-aware concurrency manager with intelligent resource allocation.
 * Provides better performance by adjusting concurrency limits based on operation characteristics.
 */
export class OperationTypeAwareLimiter {
  private limiters: Map<OperationType, EnhancedConcurrencyLimiter>;
  private globalStats = {
    totalOperations: 0,
    totalErrors: 0,
    startTime: Date.now()
  };

  /**
   * Default concurrency limits based on operation characteristics.
   */
  private defaultLimits: Record<OperationType, number> = {
    pages: 5, // Heavier operations - page content can be large
    blocks: 15, // Lighter operations - individual blocks are smaller
    databases: 3, // Complex operations - database queries can be intensive
    comments: 10, // Medium operations - comments are usually small
    users: 20, // Very light operations - user info is minimal
    properties: 12 // Medium-light operations - property info is moderate
  };

  constructor(customLimits?: Partial<Record<OperationType, number>>) {
    const limits = { ...this.defaultLimits, ...customLimits };
    this.limiters = new Map();

    for (const [type, limit] of Object.entries(limits) as [OperationType, number][]) {
      this.limiters.set(type, new EnhancedConcurrencyLimiter(limit));
    }
  }

  /**
   * Run an operation with appropriate concurrency limit based on type.
   *
   * @param context - Operation context with type and metadata.
   * @param operation - The operation to execute.
   *
   * @returns The result of the operation.
   */
  async run<T>(context: OperationContext, operation: () => Promise<T>): Promise<T> {
    const limiter = this.limiters.get(context.type) || this.limiters.get("pages")!;

    this.globalStats.totalOperations++;

    try {
      return await limiter.run(operation, context.timeout);
    } catch (error) {
      this.globalStats.totalErrors++;
      throw error;
    }
  }

  /**
   * Get statistics for a specific operation type.
   *
   * @param type - The operation type.
   *
   * @returns Statistics for the operation type.
   */
  getTypeStats(type: OperationType): OperationStats | undefined {
    return this.limiters.get(type)?.getStats();
  }

  /**
   * Get statistics for all operation types.
   *
   * @returns Statistics for all operation types.
   */
  getAllStats(): Record<OperationType, OperationStats> {
    const stats: Partial<Record<OperationType, OperationStats>> = {};

    for (const [type, limiter] of this.limiters) {
      stats[type] = limiter.getStats();
    }

    return stats as Record<OperationType, OperationStats>;
  }

  /**
   * Get global performance statistics.
   *
   * @returns Global performance metrics.
   */
  getGlobalStats(): {
    totalOperations: number;
    totalErrors: number;
    errorRate: number;
    uptime: number;
    operationsPerSecond: number;
  } {
    const uptime = Date.now() - this.globalStats.startTime;
    const operationsPerSecond = this.globalStats.totalOperations / (uptime / 1000);
    const errorRate =
      this.globalStats.totalOperations > 0 ? this.globalStats.totalErrors / this.globalStats.totalOperations : 0;

    return {
      totalOperations: this.globalStats.totalOperations,
      totalErrors: this.globalStats.totalErrors,
      errorRate,
      uptime,
      operationsPerSecond
    };
  }

  /**
   * Adjust concurrency limits dynamically based on performance.
   * This can be called periodically to optimize performance.
   *
   * @param adjustmentFactor - Factor to adjust limits (0.5 = halve, 2.0 = double).
   */
  adjustLimits(adjustmentFactor: number): void {
    for (const [type, limiter] of this.limiters) {
      const currentLimit = limiter.getLimit();
      const newLimit = Math.max(1, Math.round(currentLimit * adjustmentFactor));
      limiter.setLimit(newLimit);
    }
  }

  /**
   * Auto-tune concurrency limits based on error rates and performance.
   * Call this periodically during long-running operations.
   */
  autoTune(): void {
    const globalStats = this.getGlobalStats();

    // If error rate is too high, reduce concurrency
    if (globalStats.errorRate > 0.1) {
      // More than 10% errors
      this.adjustLimits(0.8); // Reduce by 20%
      return;
    }

    // If error rate is very low and performance is good, increase concurrency
    if (globalStats.errorRate < 0.02 && globalStats.operationsPerSecond > 10) {
      // Less than 2% errors
      this.adjustLimits(1.1); // Increase by 10%
    }
  }

  /**
   * Reset all statistics.
   */
  resetStats(): void {
    this.globalStats = {
      totalOperations: 0,
      totalErrors: 0,
      startTime: Date.now()
    };
  }

  /**
   * Get current concurrency limits for all operation types.
   *
   * @returns Current limits for all operation types.
   */
  getCurrentLimits(): Record<OperationType, number> {
    const limits: Partial<Record<OperationType, number>> = {};

    for (const [type, limiter] of this.limiters) {
      limits[type] = limiter.getLimit();
    }

    return limits as Record<OperationType, number>;
  }
}
