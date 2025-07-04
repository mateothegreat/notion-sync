/**
 * Operation types with different performance characteristics and API rate limits.
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
  startTime?: number;
  retryCount?: number;
  headers?: Record<string, string>;
}

/**
 * Comprehensive statistics for monitoring operation performance.
 */
export interface OperationStats {
  running: number;
  queued: number;
  completed: number;
  failed: number;
  avgDuration: number;
  avgResponseTime: number;
  successRate: number;
  errorRate: number;
  throughput: number;
  lastExecuted?: Date;
  lastAdjustment?: Date;
  concurrencyLimit: number;
  recommendedConcurrency: number;
  performanceScore: number;
}

/**
 * Configuration for dynamic concurrency adjustment per operation type.
 */
interface ConcurrencyAdjustmentConfig {
  /** Minimum concurrency level */
  minConcurrency: number;

  /** Maximum concurrency level */
  maxConcurrency: number;

  /** Initial concurrency level */
  initialConcurrency: number;

  /** Performance threshold for increasing concurrency */
  performanceThreshold: number;

  /** Error rate threshold for decreasing concurrency */
  errorThreshold: number;

  /** Adjustment cooldown period in milliseconds */
  adjustmentCooldown: number;

  /** Sample size for performance calculations */
  sampleSize: number;
}

/**
 * Enhanced concurrency limiter with dynamic adjustment and comprehensive monitoring.
 */
class DynamicConcurrencyLimiter {
  private running = 0;
  private queue: Array<{
    resolve: () => void;
    priority: "high" | "normal" | "low";
    enqueueTime: number;
  }> = [];

  private stats: OperationStats = {
    running: 0,
    queued: 0,
    completed: 0,
    failed: 0,
    avgDuration: 0,
    avgResponseTime: 0,
    successRate: 1,
    errorRate: 0,
    throughput: 0,
    concurrencyLimit: 0,
    recommendedConcurrency: 0,
    performanceScore: 1
  };

  // Performance tracking
  private durations: number[] = [];
  private responseTimes: number[] = [];
  private errorHistory: boolean[] = [];
  private throughputHistory: number[] = [];
  private lastAdjustmentTime = 0;
  private adjustmentConfig: ConcurrencyAdjustmentConfig;

  // Dynamic adjustment
  private currentLimit: number;
  private recommendedLimit: number;
  private performanceScore = 1;

  constructor(initialLimit: number, adjustmentConfig: Partial<ConcurrencyAdjustmentConfig> = {}) {
    this.currentLimit = initialLimit;
    this.recommendedLimit = initialLimit;

    this.adjustmentConfig = {
      minConcurrency: adjustmentConfig.minConcurrency ?? 1,
      maxConcurrency: adjustmentConfig.maxConcurrency ?? initialLimit * 3,
      initialConcurrency: adjustmentConfig.initialConcurrency ?? initialLimit,
      performanceThreshold: adjustmentConfig.performanceThreshold ?? 0.8,
      errorThreshold: adjustmentConfig.errorThreshold ?? 0.1,
      adjustmentCooldown: adjustmentConfig.adjustmentCooldown ?? 10000,
      sampleSize: adjustmentConfig.sampleSize ?? 50
    };

    this.stats.concurrencyLimit = this.currentLimit;
    this.stats.recommendedConcurrency = this.recommendedLimit;
  }

  /**
   * Run an operation with dynamic concurrency control and comprehensive monitoring.
   *
   * @param context - Operation context with metadata
   * @param operation - The operation to execute
   * @returns Promise that resolves with operation result
   */
  async run<T>(context: OperationContext, operation: () => Promise<T>): Promise<T> {
    const startTime = Date.now();
    context.startTime = startTime;

    // Wait for available slot with priority queue
    while (this.running >= this.currentLimit) {
      this.stats.queued++;
      await new Promise<void>((resolve) => {
        this.queue.push({
          resolve,
          priority: context.priority || "normal",
          enqueueTime: Date.now()
        });
      });
      this.stats.queued = Math.max(0, this.stats.queued - 1);
    }

    this.running++;
    this.stats.running = this.running;

    try {
      // Execute operation with timeout if specified
      let result: T;

      if (context.timeout) {
        result = await Promise.race([
          operation(),
          new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Operation timed out")), context.timeout))
        ]);
      } else {
        result = await operation();
      }

      // Record successful execution
      const duration = Date.now() - startTime;
      this.recordSuccess(duration, context);

      return result;
    } catch (error) {
      // Record failed execution
      const duration = Date.now() - startTime;
      this.recordFailure(duration, context, error);
      throw error;
    } finally {
      this.running--;
      this.stats.running = this.running;

      // Process next queued operation (priority-based)
      this.processNextInQueue();

      // Check if concurrency adjustment is needed
      await this.checkConcurrencyAdjustment();
    }
  }

  /**
   * Update performance metrics from API response headers.
   *
   * @param headers - HTTP response headers
   * @param responseTime - Response time in milliseconds
   * @param wasError - Whether the request was an error
   */
  updateFromHeaders(headers: Record<string, string>, responseTime?: number, wasError = false): void {
    if (responseTime !== undefined) {
      this.recordResponseTime(responseTime);
    }

    // Parse rate limit headers to inform concurrency decisions
    const remaining = headers["x-ratelimit-remaining"];
    const limit = headers["x-ratelimit-limit"];

    if (remaining && limit) {
      const remainingCount = parseInt(remaining, 10);
      const totalLimit = parseInt(limit, 10);
      const utilizationRate = 1 - remainingCount / totalLimit;

      // Adjust recommended concurrency based on API utilization
      this.adjustBasedOnApiUtilization(utilizationRate);
    }
  }

  /**
   * Get current statistics for monitoring.
   *
   * @returns Current operation statistics
   */
  getStats(): OperationStats {
    this.updateDerivedStats();
    return { ...this.stats };
  }

  /**
   * Force adjustment of concurrency limit.
   *
   * @param newLimit - New concurrency limit
   * @param reason - Reason for adjustment
   */
  forceAdjustment(newLimit: number, reason: string): void {
    const oldLimit = this.currentLimit;
    this.currentLimit = Math.floor(
      Math.max(this.adjustmentConfig.minConcurrency, Math.min(this.adjustmentConfig.maxConcurrency, newLimit))
    );

    this.stats.concurrencyLimit = this.currentLimit;
    this.stats.lastAdjustment = new Date();
    this.lastAdjustmentTime = Date.now();

    console.log(`🔧 Concurrency limit forced: ${oldLimit} → ${this.currentLimit} (${reason})`);
  }

  /**
   * Get current concurrency limit.
   *
   * @returns Current concurrency limit
   */
  getLimit(): number {
    return this.currentLimit;
  }

  /**
   * Set new concurrency limit.
   *
   * @param newLimit - New concurrency limit
   */
  setLimit(newLimit: number): void {
    this.currentLimit = Math.max(
      this.adjustmentConfig.minConcurrency,
      Math.min(this.adjustmentConfig.maxConcurrency, newLimit)
    );
    this.stats.concurrencyLimit = this.currentLimit;
  }

  /**
   * Record successful operation execution.
   *
   * @param duration - Operation duration in milliseconds
   * @param context - Operation context
   */
  private recordSuccess(duration: number, context: OperationContext): void {
    this.durations.push(duration);
    this.errorHistory.push(false);
    this.maintainBufferSize();

    this.stats.completed++;
    this.stats.lastExecuted = new Date();
    this.updatePerformanceScore();
  }

  /**
   * Record failed operation execution.
   *
   * @param duration - Operation duration in milliseconds
   * @param context - Operation context
   * @param error - Error that occurred
   */
  private recordFailure(duration: number, context: OperationContext, error: unknown): void {
    this.durations.push(duration);
    this.errorHistory.push(true);
    this.maintainBufferSize();

    this.stats.failed++;
    this.stats.lastExecuted = new Date();
    this.updatePerformanceScore();
  }

  /**
   * Record response time for performance tracking.
   *
   * @param responseTime - Response time in milliseconds
   */
  private recordResponseTime(responseTime: number): void {
    this.responseTimes.push(responseTime);
    if (this.responseTimes.length > this.adjustmentConfig.sampleSize) {
      this.responseTimes.shift();
    }
  }

  /**
   * Process the next operation in the priority queue.
   */
  private processNextInQueue(): void {
    if (this.queue.length === 0) return;

    // Sort by priority (high > normal > low) and then by enqueue time
    this.queue.sort((a, b) => {
      const priorityOrder = { high: 3, normal: 2, low: 1 };
      const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];

      if (priorityDiff !== 0) return priorityDiff;
      return a.enqueueTime - b.enqueueTime;
    });

    const next = this.queue.shift();
    if (next) {
      next.resolve();
    }
  }

  /**
   * Maintain buffer sizes for performance tracking.
   */
  private maintainBufferSize(): void {
    const maxSize = this.adjustmentConfig.sampleSize;

    if (this.durations.length > maxSize) {
      this.durations.shift();
    }

    if (this.errorHistory.length > maxSize) {
      this.errorHistory.shift();
    }

    if (this.throughputHistory.length > maxSize) {
      this.throughputHistory.shift();
    }
  }

  /**
   * Update derived statistics.
   */
  private updateDerivedStats(): void {
    const totalOperations = this.durations.length;

    if (totalOperations > 0) {
      // Calculate average duration
      this.stats.avgDuration = this.durations.reduce((sum, d) => sum + d, 0) / totalOperations;

      // Calculate average response time
      if (this.responseTimes.length > 0) {
        this.stats.avgResponseTime = this.responseTimes.reduce((sum, rt) => sum + rt, 0) / this.responseTimes.length;
      }

      // Calculate error rate
      const errorCount = this.errorHistory.filter(Boolean).length;
      this.stats.errorRate = errorCount / totalOperations;
      this.stats.successRate = 1 - this.stats.errorRate;

      // Calculate throughput (operations per second)
      const now = Date.now();
      const recentOperations = this.durations.filter((_, index) => {
        const operationTime = now - (this.durations.length - index - 1) * 1000;
        return operationTime > now - 60000; // Last minute
      });

      this.stats.throughput = recentOperations.length / 60; // ops per second
    }

    this.stats.performanceScore = this.performanceScore;
    this.stats.recommendedConcurrency = this.recommendedLimit;
  }

  /**
   * Update performance score based on current metrics.
   */
  private updatePerformanceScore(): void {
    const errorRate = this.stats.errorRate;
    const avgDuration = this.stats.avgDuration;
    const avgResponseTime = this.stats.avgResponseTime;

    // Calculate performance score (0-1, higher is better)
    const errorPenalty = Math.max(0, 1 - errorRate * 5); // Heavy penalty for errors
    const durationScore = Math.max(0, 1 - avgDuration / 10000); // Penalty for long durations
    const responseTimeScore = Math.max(0, 1 - avgResponseTime / 5000); // Penalty for slow responses

    this.performanceScore = errorPenalty * 0.5 + durationScore * 0.25 + responseTimeScore * 0.25;
    this.stats.performanceScore = this.performanceScore;
  }

  /**
   * Check if concurrency adjustment is needed.
   */
  private async checkConcurrencyAdjustment(): Promise<void> {
    const now = Date.now();

    // Check cooldown period
    if (now - this.lastAdjustmentTime < this.adjustmentConfig.adjustmentCooldown) {
      return;
    }

    // Need sufficient data for adjustment
    if (this.durations.length < this.adjustmentConfig.sampleSize / 2) {
      return;
    }

    const shouldIncrease = this.shouldIncreaseConcurrency();
    const shouldDecrease = this.shouldDecreaseConcurrency();

    if (shouldIncrease && !shouldDecrease) {
      this.increaseConcurrency();
    } else if (shouldDecrease) {
      this.decreaseConcurrency();
    }
  }

  /**
   * Determine if concurrency should be increased.
   */
  private shouldIncreaseConcurrency(): boolean {
    return (
      this.performanceScore >= this.adjustmentConfig.performanceThreshold &&
      this.stats.errorRate < this.adjustmentConfig.errorThreshold / 2 &&
      this.currentLimit < this.adjustmentConfig.maxConcurrency &&
      this.stats.throughput > 0 &&
      this.running >= this.currentLimit * 0.8 // High utilization
    );
  }

  /**
   * Determine if concurrency should be decreased.
   */
  private shouldDecreaseConcurrency(): boolean {
    return (
      this.stats.errorRate > this.adjustmentConfig.errorThreshold ||
      this.performanceScore < this.adjustmentConfig.performanceThreshold * 0.7 ||
      this.stats.avgResponseTime > 5000 // Very slow responses
    );
  }

  /**
   * Increase concurrency level.
   */
  private increaseConcurrency(): void {
    const oldLimit = this.currentLimit;
    const increase = Math.max(1, Math.floor(this.currentLimit * 0.2)); // 20% increase

    this.currentLimit = Math.min(this.adjustmentConfig.maxConcurrency, this.currentLimit + increase);

    this.stats.concurrencyLimit = this.currentLimit;
    this.stats.lastAdjustment = new Date();
    this.lastAdjustmentTime = Date.now();

    console.log(`📈 Concurrency increased: ${oldLimit} → ${this.currentLimit} (performance-based)`);
  }

  /**
   * Decrease concurrency level.
   */
  private decreaseConcurrency(): void {
    const oldLimit = this.currentLimit;
    const decrease = Math.max(1, Math.floor(this.currentLimit * 0.3)); // 30% decrease

    this.currentLimit = Math.max(this.adjustmentConfig.minConcurrency, this.currentLimit - decrease);

    this.stats.concurrencyLimit = this.currentLimit;
    this.stats.lastAdjustment = new Date();
    this.lastAdjustmentTime = Date.now();

    console.log(`📉 Concurrency decreased: ${oldLimit} → ${this.currentLimit} (performance-based)`);
  }

  /**
   * Adjust concurrency based on API utilization rate.
   *
   * @param utilizationRate - Current API utilization rate (0-1)
   */
  private adjustBasedOnApiUtilization(utilizationRate: number): void {
    // If API utilization is high, consider reducing concurrency
    if (utilizationRate > 0.8) {
      this.recommendedLimit = Math.max(this.adjustmentConfig.minConcurrency, Math.floor(this.currentLimit * 0.8));
    } else if (utilizationRate < 0.3) {
      // If API utilization is low, consider increasing concurrency
      this.recommendedLimit = Math.min(this.adjustmentConfig.maxConcurrency, Math.floor(this.currentLimit * 1.2));
    }
  }
}

/**
 * Operation-type-aware concurrency manager with intelligent resource allocation.
 * Integrates with adaptive rate limiting and provides comprehensive monitoring.
 */
export class OperationTypeAwareLimiter {
  private limiters: Map<OperationType, DynamicConcurrencyLimiter>;
  private globalStats = {
    totalOperations: 0,
    totalErrors: 0,
    totalDuration: 0,
    startTime: Date.now(),
    lastHeaderUpdate: 0
  };

  /**
   * Default concurrency limits based on operation characteristics.
   */
  private defaultLimits: Record<OperationType, number> = {
    pages: 8, // Start high for pages - they're the main content
    blocks: 20, // Start very high for blocks - they're lightweight
    databases: 5, // Moderate for databases - they can be complex
    comments: 12, // Good throughput for comments
    users: 25, // Very high for users - they're very lightweight
    properties: 15 // Good throughput for properties
  };

  constructor(customLimits?: Partial<Record<OperationType, number>>) {
    const limits = { ...this.defaultLimits, ...customLimits };
    this.limiters = new Map();

    for (const [type, limit] of Object.entries(limits) as [OperationType, number][]) {
      this.limiters.set(
        type,
        new DynamicConcurrencyLimiter(limit, {
          initialConcurrency: limit,
          maxConcurrency: limit * 4, // Allow up to 4x growth
          minConcurrency: 1,
          performanceThreshold: 0.8,
          errorThreshold: 0.1,
          adjustmentCooldown: 15000, // 15 seconds between adjustments
          sampleSize: 30
        })
      );
    }
  }

  /**
   * Run an operation with appropriate concurrency limit and monitoring.
   *
   * @param context - Operation context with type and metadata
   * @param operation - The operation to execute
   * @returns Promise that resolves with operation result
   */
  async run<T>(context: OperationContext, operation: () => Promise<T>): Promise<T> {
    const limiter = this.limiters.get(context.type) || this.limiters.get("pages")!;

    this.globalStats.totalOperations++;
    const startTime = Date.now();

    try {
      const result = await limiter.run(context, operation);

      // Update global statistics
      this.globalStats.totalDuration += Date.now() - startTime;

      return result;
    } catch (error) {
      this.globalStats.totalErrors++;
      throw error;
    }
  }

  /**
   * Update all limiters with API response headers.
   *
   * @param headers - HTTP response headers
   * @param responseTime - Response time in milliseconds
   * @param operationType - Type of operation that generated the response
   * @param wasError - Whether the request was an error
   */
  updateFromHeaders(
    headers: Record<string, string>,
    responseTime?: number,
    operationType?: OperationType,
    wasError = false
  ): void {
    this.globalStats.lastHeaderUpdate = Date.now();

    // Update the specific limiter if operation type is known
    if (operationType) {
      const limiter = this.limiters.get(operationType);
      if (limiter) {
        limiter.updateFromHeaders(headers, responseTime, wasError);
      }
    }

    // Also update all limiters with rate limit information
    // This helps coordinate global rate limiting
    for (const limiter of this.limiters.values()) {
      limiter.updateFromHeaders(headers, responseTime, wasError);
    }
  }

  /**
   * Get statistics for a specific operation type.
   *
   * @param type - The operation type
   * @returns Statistics for the operation type
   */
  getTypeStats(type: OperationType): OperationStats | undefined {
    return this.limiters.get(type)?.getStats();
  }

  /**
   * Get statistics for all operation types.
   *
   * @returns Statistics for all operation types
   */
  getAllStats(): Record<OperationType, OperationStats> {
    const stats: Partial<Record<OperationType, OperationStats>> = {};

    for (const [type, limiter] of this.limiters) {
      stats[type] = limiter.getStats();
    }

    return stats as Record<OperationType, OperationStats>;
  }

  /**
   * Get comprehensive global performance statistics.
   *
   * @returns Global performance metrics
   */
  getGlobalStats(): {
    totalOperations: number;
    totalErrors: number;
    errorRate: number;
    avgDuration: number;
    uptime: number;
    operationsPerSecond: number;
    totalConcurrency: number;
    activeOperations: number;
    headerUpdateFrequency: number;
  } {
    const uptime = Date.now() - this.globalStats.startTime;
    const operationsPerSecond = this.globalStats.totalOperations / (uptime / 1000);
    const errorRate =
      this.globalStats.totalOperations > 0 ? this.globalStats.totalErrors / this.globalStats.totalOperations : 0;
    const avgDuration =
      this.globalStats.totalOperations > 0 ? this.globalStats.totalDuration / this.globalStats.totalOperations : 0;

    // Calculate total concurrency and active operations
    let totalConcurrency = 0;
    let activeOperations = 0;

    for (const limiter of this.limiters.values()) {
      const stats = limiter.getStats();
      totalConcurrency += stats.concurrencyLimit;
      activeOperations += stats.running;
    }

    const headerUpdateFrequency =
      this.globalStats.lastHeaderUpdate > 0 ? (Date.now() - this.globalStats.lastHeaderUpdate) / 1000 : 0;

    return {
      totalOperations: this.globalStats.totalOperations,
      totalErrors: this.globalStats.totalErrors,
      errorRate,
      avgDuration,
      uptime,
      operationsPerSecond,
      totalConcurrency,
      activeOperations,
      headerUpdateFrequency
    };
  }

  /**
   * Adjust concurrency limits dynamically based on performance.
   *
   * @param adjustmentFactor - Factor to adjust limits (0.5 = halve, 2.0 = double)
   * @param reason - Reason for adjustment
   */
  adjustLimits(adjustmentFactor: number, reason: string = "manual"): void {
    for (const [type, limiter] of this.limiters) {
      const currentLimit = limiter.getLimit();
      const newLimit = Math.max(1, Math.round(currentLimit * adjustmentFactor));
      limiter.forceAdjustment(newLimit, `${reason}-${type}`);
    }
  }

  /**
   * Auto-tune concurrency limits based on global performance metrics.
   * This method analyzes cross-operation performance and adjusts accordingly.
   */
  autoTune(): void {
    const globalStats = this.getGlobalStats();
    const allStats = this.getAllStats();

    // If global error rate is high, reduce all concurrency
    if (globalStats.errorRate > 0.15) {
      this.adjustLimits(0.7, "high-error-rate");
      return;
    }

    // If global performance is good, selectively increase high-performing operations
    if (globalStats.errorRate < 0.05 && globalStats.operationsPerSecond > 10) {
      for (const [type, stats] of Object.entries(allStats)) {
        if (stats.performanceScore > 0.8 && stats.errorRate < 0.02) {
          const limiter = this.limiters.get(type as OperationType);
          if (limiter) {
            const currentLimit = limiter.getLimit();
            const newLimit = Math.min(currentLimit * 1.5, currentLimit + 5);
            limiter.forceAdjustment(newLimit, "auto-tune-performance");
          }
        }
      }
    }

    // Balance concurrency based on relative performance
    this.balanceConcurrency();
  }

  /**
   * Balance concurrency between different operation types based on their performance.
   */
  private balanceConcurrency(): void {
    const allStats = this.getAllStats();
    const performanceScores = Object.entries(allStats).map(([type, stats]) => ({
      type: type as OperationType,
      score: stats.performanceScore,
      throughput: stats.throughput,
      errorRate: stats.errorRate
    }));

    // Sort by performance score
    performanceScores.sort((a, b) => b.score - a.score);

    // Redistribute concurrency from poor performers to good performers
    const totalConcurrency = performanceScores.reduce((sum, item) => {
      const stats = allStats[item.type];
      return sum + stats.concurrencyLimit;
    }, 0);

    for (let i = 0; i < performanceScores.length; i++) {
      const item = performanceScores[i];
      const limiter = this.limiters.get(item.type);

      if (limiter) {
        const currentLimit = limiter.getLimit();
        let newLimit = currentLimit;

        // Top performers get more concurrency
        if (i < performanceScores.length / 2 && item.score > 0.7) {
          newLimit = Math.min(currentLimit * 1.2, currentLimit + 3);
        }
        // Poor performers get less concurrency
        else if (i >= performanceScores.length / 2 && item.score < 0.5) {
          newLimit = Math.max(currentLimit * 0.8, 1);
        }

        if (newLimit !== currentLimit) {
          limiter.forceAdjustment(newLimit, "balance-concurrency");
        }
      }
    }
  }

  /**
   * Reset all statistics and return to initial state.
   */
  resetStats(): void {
    this.globalStats = {
      totalOperations: 0,
      totalErrors: 0,
      totalDuration: 0,
      startTime: Date.now(),
      lastHeaderUpdate: 0
    };

    // Reset each limiter
    for (const [type, limiter] of this.limiters) {
      const initialLimit = this.defaultLimits[type];
      limiter.setLimit(initialLimit);
    }
  }

  /**
   * Get current concurrency limits for all operation types.
   *
   * @returns Current limits for all operation types
   */
  getCurrentLimits(): Record<OperationType, number> {
    const limits: Partial<Record<OperationType, number>> = {};

    for (const [type, limiter] of this.limiters) {
      limits[type] = limiter.getLimit();
    }

    return limits as Record<OperationType, number>;
  }

  /**
   * Get performance summary for monitoring dashboards.
   *
   * @returns Comprehensive performance summary
   */
  getPerformanceSummary(): {
    global: ReturnType<OperationTypeAwareLimiter["getGlobalStats"]>;
    byType: Record<
      OperationType,
      {
        concurrency: number;
        performance: number;
        throughput: number;
        errorRate: number;
        avgDuration: number;
      }
    >;
    recommendations: string[];
  } {
    const global = this.getGlobalStats();
    const allStats = this.getAllStats();

    type PerformanceSummaryType = {
      concurrency: number;
      performance: number;
      throughput: number;
      errorRate: number;
      avgDuration: number;
    };

    const byType: Record<OperationType, PerformanceSummaryType> = {} as Record<OperationType, PerformanceSummaryType>;
    const recommendations: string[] = [];

    // Build per-type summary
    for (const [type, stats] of Object.entries(allStats)) {
      byType[type as OperationType] = {
        concurrency: stats.concurrencyLimit,
        performance: stats.performanceScore,
        throughput: stats.throughput,
        errorRate: stats.errorRate,
        avgDuration: stats.avgDuration
      };
    }

    // Generate recommendations
    if (global.errorRate > 0.1) {
      recommendations.push("Consider reducing concurrency due to high error rate");
    }

    if (global.operationsPerSecond < 5) {
      recommendations.push("Consider increasing concurrency for better throughput");
    }

    if (global.headerUpdateFrequency > 10) {
      recommendations.push("API headers not being updated frequently - check integration");
    }

    return {
      global,
      byType,
      recommendations
    };
  }
}
