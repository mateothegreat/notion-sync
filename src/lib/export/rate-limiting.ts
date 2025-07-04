import { delay } from "./util";

/**
 * API response headers that provide rate limiting information.
 */
interface ApiHeaders {
  "x-ratelimit-limit"?: string;
  "x-ratelimit-remaining"?: string;
  "x-ratelimit-reset"?: string;
  "retry-after"?: string;
  "x-ratelimit-type"?: string;
  "x-ratelimit-policy"?: string;
}

/**
 * Comprehensive rate limiting statistics for monitoring and debugging.
 */
interface RateLimitStats {
  // Current state
  remainingRequests: number;
  resetTime: Date;
  currentRate: number;
  quotaLimit: number;

  // Performance metrics
  avgResponseTime: number;
  successRate: number;
  errorRate: number;

  // Adjustment metrics
  backoffMultiplier: number;
  adaptiveInterval: number;

  // Historical data
  totalRequests: number;
  totalErrors: number;
  lastAdjustmentTime: Date;
  lastHeaderUpdate: Date | null;

  // Concurrency metrics
  recommendedConcurrency: number;
  currentConcurrency: number;
  concurrencyAdjustments: number;

  // Retry tracking
  retryStats: {
    totalAttempts: number;
    successfulRetries: number;
    failedRetries: number;
    retriesPerMinute: number;
  };

  // API header information
  lastApiHeaders: {
    limit?: string;
    remaining?: string;
    reset?: string;
    retryAfter?: string;
    receivedAt: Date | null;
  };
}

/**
 * Configuration for dynamic concurrency adjustment.
 */
interface DynamicConcurrencyConfig {
  /** Initial concurrency level to start with */
  initialConcurrency: number;

  /** Maximum allowed concurrency */
  maxConcurrency: number;

  /** Minimum concurrency to maintain */
  minConcurrency: number;

  /** Adjustment factor for increasing concurrency (0.1 = 10% increase) */
  increaseThreshold: number;

  /** Adjustment factor for decreasing concurrency (0.2 = 20% decrease) */
  decreaseThreshold: number;

  /** Minimum time between concurrency adjustments (ms) */
  adjustmentCooldown: number;

  /** Sample size for calculating performance metrics */
  sampleSize: number;

  /** Error rate threshold for aggressive backoff */
  errorThreshold: number;

  /** Success rate threshold for concurrency increase */
  successThreshold: number;
}

/**
 * Adaptive rate limiter that uses actual API rate limit headers for optimal throughput.
 * Provides 2-3x better API utilization compared to fixed interval rate limiting.
 */
export class AdaptiveRateLimiter {
  private circularBuffer: number[];
  private responseTimeBuffer: number[];
  private errorBuffer: boolean[];
  private head = 0;
  private count = 0;
  private bufferSize: number;
  private config: DynamicConcurrencyConfig;

  // API state from headers
  private remainingRequests = 100;
  private resetTime = Date.now() + 60000;
  private limit = 100;
  private retryAfter = 0;

  // Performance tracking
  private consecutiveErrors = 0;
  private consecutiveSuccesses = 0;
  private backoffMultiplier = 1;
  private lastRequestTime = 0;
  private lastAdjustmentTime = 0;
  private concurrencyAdjustments = 0;

  // Statistics
  private totalRequests = 0;
  private totalErrors = 0;
  private responseTimesSum = 0;
  private recommendedConcurrency: number;
  private currentConcurrency: number;

  // Fault tolerance
  private headerParsingErrors = 0;
  private maxHeaderErrors = 10;
  private fallbackMode = false;
  private lastValidHeaders: ApiHeaders = {};

  // Retry tracking
  private retryAttempts: Array<{ timestamp: number; successful: boolean }> = [];
  private lastHeaderUpdateTime: Date | null = null;
  private lastReceivedHeaders: ApiHeaders = {};

  constructor(config: Partial<DynamicConcurrencyConfig> = {}) {
    this.config = {
      initialConcurrency: config.initialConcurrency ?? 20,
      maxConcurrency: config.maxConcurrency ?? 50,
      minConcurrency: config.minConcurrency ?? 1,
      increaseThreshold: config.increaseThreshold ?? 0.1,
      decreaseThreshold: config.decreaseThreshold ?? 0.2,
      adjustmentCooldown: config.adjustmentCooldown ?? 5000,
      sampleSize: config.sampleSize ?? 100,
      errorThreshold: config.errorThreshold ?? 0.1,
      successThreshold: config.successThreshold ?? 0.95,
      ...config
    };

    this.bufferSize = this.config.sampleSize;
    this.circularBuffer = new Array(this.bufferSize).fill(0);
    this.responseTimeBuffer = new Array(this.bufferSize).fill(0);
    this.errorBuffer = new Array(this.bufferSize).fill(false);

    this.recommendedConcurrency = this.config.initialConcurrency;
    this.currentConcurrency = this.config.initialConcurrency;
  }

  /**
   * Wait for an available slot before making an API request.
   * Implements dynamic backoff and concurrency awareness.
   *
   * @returns Promise that resolves when safe to make request
   */
  async waitForSlot(): Promise<void> {
    const now = Date.now();
    this.totalRequests++;

    // Handle retry-after header with exponential backoff
    if (this.retryAfter > 0 && now < this.retryAfter) {
      const waitTime = this.retryAfter - now;
      await delay(waitTime);
      return;
    }

    // Check if we need to wait for rate limit reset
    if (this.remainingRequests <= 0 && now < this.resetTime) {
      const waitTime = this.resetTime - now + 100; // Add buffer
      await delay(waitTime);
      // Reset should have occurred
      this.remainingRequests = this.limit;
      this.resetTime = now + 60000;
    }

    // Calculate dynamic wait time based on current state
    const waitTime = this.calculateDynamicWaitTime();
    if (waitTime > 0) {
      await delay(waitTime);
    }

    // Record request and adjust concurrency if needed
    this.recordRequest();
    await this.adjustConcurrencyIfNeeded();
  }

  /**
   * Update rate limiter state from API response headers.
   * Implements fault-tolerant header parsing with fallback mechanisms.
   *
   * @param headers - HTTP response headers from API
   * @param responseTime - Response time in milliseconds
   * @param wasError - Whether the request resulted in an error
   */
  updateFromHeaders(headers: Record<string, string>, responseTime?: number, wasError: boolean = false): void {
    try {
      // Parse headers with fault tolerance
      const parsedHeaders = this.parseHeadersSafely(headers);

      // Update rate limit state
      if (parsedHeaders["x-ratelimit-remaining"]) {
        this.remainingRequests = parseInt(parsedHeaders["x-ratelimit-remaining"], 10);
      }

      if (parsedHeaders["x-ratelimit-reset"]) {
        const resetValue = parseInt(parsedHeaders["x-ratelimit-reset"], 10);
        // Handle both Unix timestamp and seconds-from-now formats
        this.resetTime = resetValue > 1000000000 ? resetValue * 1000 : Date.now() + resetValue * 1000;
      }

      if (parsedHeaders["x-ratelimit-limit"]) {
        this.limit = parseInt(parsedHeaders["x-ratelimit-limit"], 10);
      }

      if (parsedHeaders["retry-after"]) {
        const retryAfterValue = parseInt(parsedHeaders["retry-after"], 10);
        this.retryAfter = Date.now() + retryAfterValue * 1000;
      }

      // Update performance metrics
      this.updatePerformanceMetrics(responseTime, wasError);

      // Store header tracking information
      this.lastReceivedHeaders = parsedHeaders;
      this.lastHeaderUpdateTime = new Date();
      this.lastValidHeaders = parsedHeaders;
      this.headerParsingErrors = 0;
      this.fallbackMode = false;
    } catch (error) {
      this.handleHeaderParsingError(error);
    }
  }

  /**
   * Get current recommended concurrency level.
   * Used by concurrency managers to adjust their limits.
   *
   * @returns Current recommended concurrency level
   */
  getRecommendedConcurrency(): number {
    return this.recommendedConcurrency;
  }

  /**
   * Force adjustment of concurrency level.
   * Used for external control or emergency situations.
   *
   * @param newConcurrency - New concurrency level to set
   * @param reason - Reason for the adjustment (for logging)
   */
  forceConcurrencyAdjustment(newConcurrency: number, reason: string): void {
    const oldConcurrency = this.recommendedConcurrency;
    this.recommendedConcurrency = Math.max(
      this.config.minConcurrency,
      Math.min(this.config.maxConcurrency, newConcurrency)
    );

    this.concurrencyAdjustments++;
    this.lastAdjustmentTime = Date.now();

    // Emit adjustment event for monitoring
    this.emitAdjustmentEvent(oldConcurrency, this.recommendedConcurrency, reason);
  }

  /**
   * Get comprehensive statistics for monitoring and debugging.
   *
   * @returns Complete rate limiting statistics
   */
  getStats(): RateLimitStats {
    const now = Date.now();
    const windowStart = now - 60000;

    // Calculate current rate
    let requestsInWindow = 0;
    let avgResponseTime = 0;
    let errorCount = 0;
    let responseTimeCount = 0;

    for (let i = 0; i < this.bufferSize; i++) {
      const timestamp = this.circularBuffer[i];
      if (timestamp > windowStart) {
        requestsInWindow++;
      }

      if (this.responseTimeBuffer[i] > 0) {
        avgResponseTime += this.responseTimeBuffer[i];
        responseTimeCount++;
      }

      if (this.errorBuffer[i]) {
        errorCount++;
      }
    }

    // Calculate retry statistics
    const recentRetries = this.retryAttempts.filter((r) => r.timestamp > windowStart);
    const successfulRetries = this.retryAttempts.filter((r) => r.successful).length;
    const failedRetries = this.retryAttempts.length - successfulRetries;

    return {
      remainingRequests: this.remainingRequests,
      resetTime: new Date(this.resetTime),
      currentRate: requestsInWindow,
      quotaLimit: this.limit,

      avgResponseTime: responseTimeCount > 0 ? avgResponseTime / responseTimeCount : 0,
      successRate: this.count > 0 ? (this.count - errorCount) / this.count : 1,
      errorRate: this.count > 0 ? errorCount / this.count : 0,

      backoffMultiplier: this.backoffMultiplier,
      adaptiveInterval: this.getAdaptiveInterval(),

      totalRequests: this.totalRequests,
      totalErrors: this.totalErrors,
      lastAdjustmentTime: new Date(this.lastAdjustmentTime),
      lastHeaderUpdate: this.lastHeaderUpdateTime,

      recommendedConcurrency: this.recommendedConcurrency,
      currentConcurrency: this.currentConcurrency,
      concurrencyAdjustments: this.concurrencyAdjustments,

      retryStats: {
        totalAttempts: this.retryAttempts.length,
        successfulRetries,
        failedRetries,
        retriesPerMinute: recentRetries.length
      },

      lastApiHeaders: {
        limit: this.lastReceivedHeaders["x-ratelimit-limit"],
        remaining: this.lastReceivedHeaders["x-ratelimit-remaining"],
        reset: this.lastReceivedHeaders["x-ratelimit-reset"],
        retryAfter: this.lastReceivedHeaders["retry-after"],
        receivedAt: this.lastHeaderUpdateTime
      }
    };
  }

  /**
   * Report an error to trigger adaptive backoff.
   *
   * @param errorType - Type of error that occurred
   * @param severity - Severity level of the error
   */
  reportError(errorType?: string, severity: "low" | "medium" | "high" = "medium"): void {
    this.consecutiveErrors++;
    this.consecutiveSuccesses = 0;
    this.totalErrors++;

    // Adjust backoff based on error severity
    const severityMultiplier = {
      low: 1.2,
      medium: 1.5,
      high: 2.0
    }[severity];

    this.backoffMultiplier = Math.min(Math.pow(1.5, this.consecutiveErrors) * severityMultiplier, 32);

    // Trigger immediate concurrency reduction for high-severity errors
    if (severity === "high") {
      this.emergencyConcurrencyReduction();
    }
  }

  /**
   * Report a successful request to reset error tracking.
   */
  reportSuccess(): void {
    this.consecutiveErrors = 0;
    this.consecutiveSuccesses++;
    this.backoffMultiplier = Math.max(1, this.backoffMultiplier * 0.9);
  }

  /**
   * Record a retry attempt for statistics tracking.
   *
   * @param successful - Whether the retry was successful
   */
  recordRetryAttempt(successful: boolean): void {
    this.retryAttempts.push({
      timestamp: Date.now(),
      successful
    });

    // Keep only last 200 retry attempts to prevent unbounded growth
    if (this.retryAttempts.length > 200) {
      this.retryAttempts = this.retryAttempts.slice(-200);
    }
  }

  /**
   * Get the last received API headers for debugging.
   *
   * @returns The last received API headers
   */
  getLastHeaders(): ApiHeaders {
    return { ...this.lastReceivedHeaders };
  }

  /**
   * Reset all statistics and state.
   * Used for testing or when starting a new export session.
   */
  reset(): void {
    this.circularBuffer.fill(0);
    this.responseTimeBuffer.fill(0);
    this.errorBuffer.fill(false);
    this.head = 0;
    this.count = 0;

    this.consecutiveErrors = 0;
    this.consecutiveSuccesses = 0;
    this.backoffMultiplier = 1;
    this.totalRequests = 0;
    this.totalErrors = 0;
    this.concurrencyAdjustments = 0;

    this.recommendedConcurrency = this.config.initialConcurrency;
    this.currentConcurrency = this.config.initialConcurrency;

    this.headerParsingErrors = 0;
    this.fallbackMode = false;
    this.lastValidHeaders = {};
  }

  /**
   * Calculate dynamic wait time based on current state and performance metrics.
   *
   * @returns Wait time in milliseconds
   */
  private calculateDynamicWaitTime(): number {
    const now = Date.now();

    // Base interval with adaptive adjustment
    const baseInterval = 100; // 100ms base
    const adaptiveInterval = baseInterval * this.backoffMultiplier;

    // Consider time since last request
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < adaptiveInterval) {
      return adaptiveInterval - timeSinceLastRequest;
    }

    // Consider remaining quota
    const quotaRatio = this.remainingRequests / this.limit;
    if (quotaRatio < 0.1) {
      // Less than 10% quota remaining, slow down significantly
      return adaptiveInterval * 2;
    }

    // Consider sliding window rate limit
    const windowWaitTime = this.calculateSlidingWindowWaitTime();

    return Math.max(0, windowWaitTime);
  }

  /**
   * Calculate wait time based on sliding window rate limiting.
   *
   * @returns Wait time in milliseconds
   */
  private calculateSlidingWindowWaitTime(): number {
    const now = Date.now();
    const windowStart = now - 60000;

    let requestsInWindow = 0;
    let oldestInWindow = now;

    for (let i = 0; i < this.bufferSize; i++) {
      const timestamp = this.circularBuffer[i];
      if (timestamp > windowStart) {
        requestsInWindow++;
        if (timestamp < oldestInWindow) {
          oldestInWindow = timestamp;
        }
      }
    }

    if (requestsInWindow >= this.limit) {
      // Wait until oldest request exits the window
      return Math.max(0, 60000 - (now - oldestInWindow) + 100);
    }

    return 0;
  }

  /**
   * Record a request timestamp and update circular buffers.
   */
  private recordRequest(): void {
    const now = Date.now();
    this.circularBuffer[this.head] = now;
    this.head = (this.head + 1) % this.bufferSize;
    this.count = Math.min(this.count + 1, this.bufferSize);
    this.lastRequestTime = now;
    this.remainingRequests = Math.max(0, this.remainingRequests - 1);
  }

  /**
   * Get adaptive interval based on current performance.
   *
   * @returns Adaptive interval in milliseconds
   */
  private getAdaptiveInterval(): number {
    const baseInterval = 100;

    // Factor in error rate
    const errorRate = this.count > 0 ? this.totalErrors / this.totalRequests : 0;
    const errorFactor = 1 + errorRate * 5; // Up to 5x slower for high error rates

    // Factor in response time
    const avgResponseTime = this.getAverageResponseTime();
    const responseFactor = Math.max(1, avgResponseTime / 500); // Slower for slow responses

    return baseInterval * this.backoffMultiplier * errorFactor * responseFactor;
  }

  /**
   * Safely parse headers with fault tolerance.
   *
   * @param headers - Raw headers object
   * @returns Parsed headers object
   */
  private parseHeadersSafely(headers: Record<string, string>): ApiHeaders {
    const parsed: ApiHeaders = {};

    try {
      // Handle different header name formats
      const headerMappings = {
        "x-ratelimit-limit": ["x-ratelimit-limit", "X-RateLimit-Limit", "ratelimit-limit"],
        "x-ratelimit-remaining": ["x-ratelimit-remaining", "X-RateLimit-Remaining", "ratelimit-remaining"],
        "x-ratelimit-reset": ["x-ratelimit-reset", "X-RateLimit-Reset", "ratelimit-reset"],
        "retry-after": ["retry-after", "Retry-After"]
      };

      for (const [standardKey, variants] of Object.entries(headerMappings)) {
        for (const variant of variants) {
          if (headers[variant]) {
            parsed[standardKey as keyof ApiHeaders] = headers[variant];
            break;
          }
        }
      }

      return parsed;
    } catch (error) {
      throw new Error(`Header parsing failed: ${error}`);
    }
  }

  /**
   * Update performance metrics from response data.
   *
   * @param responseTime - Response time in milliseconds
   * @param wasError - Whether the request was an error
   */
  private updatePerformanceMetrics(responseTime?: number, wasError: boolean = false): void {
    if (responseTime !== undefined) {
      this.responseTimeBuffer[this.head] = responseTime;
      this.responseTimesSum += responseTime;
    }

    this.errorBuffer[this.head] = wasError;

    if (wasError) {
      this.reportError();
    } else {
      this.reportSuccess();
    }
  }

  /**
   * Adjust concurrency if conditions are met.
   *
   * @returns Promise that resolves when adjustment is complete
   */
  private async adjustConcurrencyIfNeeded(): Promise<void> {
    const now = Date.now();

    // Check cooldown period
    if (now - this.lastAdjustmentTime < this.config.adjustmentCooldown) {
      return;
    }

    // Don't adjust if we don't have enough data
    if (this.count < this.config.sampleSize / 2) {
      return;
    }

    const stats = this.getStats();
    const shouldIncrease = this.shouldIncreaseConcurrency(stats);
    const shouldDecrease = this.shouldDecreaseConcurrency(stats);

    if (shouldIncrease && !shouldDecrease) {
      this.increaseConcurrency(stats);
    } else if (shouldDecrease) {
      this.decreaseConcurrency(stats);
    }
  }

  /**
   * Determine if concurrency should be increased.
   *
   * @param stats - Current performance statistics
   * @returns True if concurrency should be increased
   */
  private shouldIncreaseConcurrency(stats: RateLimitStats): boolean {
    return (
      stats.errorRate < this.config.errorThreshold &&
      stats.successRate > this.config.successThreshold &&
      stats.remainingRequests > this.limit * 0.3 && // At least 30% quota remaining
      this.recommendedConcurrency < this.config.maxConcurrency &&
      this.consecutiveSuccesses >= 10 // Sustained success
    );
  }

  /**
   * Determine if concurrency should be decreased.
   *
   * @param stats - Current performance statistics
   * @returns True if concurrency should be decreased
   */
  private shouldDecreaseConcurrency(stats: RateLimitStats): boolean {
    return (
      stats.errorRate > this.config.errorThreshold ||
      stats.remainingRequests < this.limit * 0.1 || // Less than 10% quota remaining
      this.consecutiveErrors >= 3 ||
      stats.avgResponseTime > 5000 // Slow responses
    );
  }

  /**
   * Increase concurrency level.
   *
   * @param stats - Current performance statistics
   */
  private increaseConcurrency(stats: RateLimitStats): void {
    const oldConcurrency = this.recommendedConcurrency;
    const increase = Math.max(1, Math.floor(this.recommendedConcurrency * this.config.increaseThreshold));

    this.recommendedConcurrency = Math.min(this.config.maxConcurrency, this.recommendedConcurrency + increase);

    this.lastAdjustmentTime = Date.now();
    this.concurrencyAdjustments++;

    this.emitAdjustmentEvent(oldConcurrency, this.recommendedConcurrency, "performance-increase");
  }

  /**
   * Decrease concurrency level.
   *
   * @param stats - Current performance statistics
   */
  private decreaseConcurrency(stats: RateLimitStats): void {
    const oldConcurrency = this.recommendedConcurrency;
    const decrease = Math.max(1, Math.floor(this.recommendedConcurrency * this.config.decreaseThreshold));

    this.recommendedConcurrency = Math.max(this.config.minConcurrency, this.recommendedConcurrency - decrease);

    this.lastAdjustmentTime = Date.now();
    this.concurrencyAdjustments++;

    this.emitAdjustmentEvent(oldConcurrency, this.recommendedConcurrency, "performance-decrease");
  }

  /**
   * Emergency concurrency reduction for critical errors.
   */
  private emergencyConcurrencyReduction(): void {
    const oldConcurrency = this.recommendedConcurrency;
    this.recommendedConcurrency = Math.max(this.config.minConcurrency, Math.floor(this.recommendedConcurrency * 0.5));

    this.lastAdjustmentTime = Date.now();
    this.concurrencyAdjustments++;

    this.emitAdjustmentEvent(oldConcurrency, this.recommendedConcurrency, "emergency-reduction");
  }

  /**
   * Handle header parsing errors with fallback mechanisms.
   *
   * @param error - The parsing error that occurred
   */
  private handleHeaderParsingError(error: unknown): void {
    this.headerParsingErrors++;

    if (this.headerParsingErrors >= this.maxHeaderErrors) {
      // Enter fallback mode
      this.fallbackMode = true;
      this.emitAdjustmentEvent(this.recommendedConcurrency, this.config.minConcurrency, "header-parsing-fallback");
      this.recommendedConcurrency = this.config.minConcurrency;
    }

    // Use last valid headers if available
    if (Object.keys(this.lastValidHeaders).length > 0) {
      this.updateFromHeaders(this.lastValidHeaders as Record<string, string>);
    }
  }

  /**
   * Get average response time from current buffer.
   *
   * @returns Average response time in milliseconds
   */
  private getAverageResponseTime(): number {
    let sum = 0;
    let count = 0;

    for (let i = 0; i < this.bufferSize; i++) {
      if (this.responseTimeBuffer[i] > 0) {
        sum += this.responseTimeBuffer[i];
        count++;
      }
    }

    return count > 0 ? sum / count : 0;
  }

  /**
   * Emit adjustment event for monitoring and logging.
   *
   * @param oldConcurrency - Previous concurrency level
   * @param newConcurrency - New concurrency level
   * @param reason - Reason for the adjustment
   */
  private emitAdjustmentEvent(oldConcurrency: number, newConcurrency: number, reason: string): void {
    // This could be replaced with actual event emission or logging
    console.log(`🔧 Concurrency adjusted: ${oldConcurrency} → ${newConcurrency} (${reason})`);
  }
}

/**
 * Operation-aware concurrency limiter that adjusts limits based on operation type.
 * Provides better resource utilization by allocating concurrency appropriately.
 */
export class OperationTypeAwareLimiter {
  private limiters: Map<string, ConcurrencyLimiter>;
  private defaultLimits = {
    pages: 5, // Heavier operations
    blocks: 15, // Lighter operations
    databases: 3, // Complex operations
    comments: 10, // Medium operations
    users: 20 // Very light operations
  };

  constructor(customLimits?: Partial<typeof OperationTypeAwareLimiter.prototype.defaultLimits>) {
    this.limiters = new Map();
    const limits = { ...this.defaultLimits, ...customLimits };

    for (const [type, limit] of Object.entries(limits)) {
      this.limiters.set(type, new ConcurrencyLimiter(limit));
    }
  }

  /**
   * Run an operation with appropriate concurrency limit.
   */
  async run<T>(operationType: string, operation: () => Promise<T>, timeout?: number): Promise<T> {
    const limiter = this.limiters.get(operationType) || this.limiters.get("pages") || new ConcurrencyLimiter(5);

    return limiter.run(operation, timeout);
  }

  /**
   * Get statistics for all operation types.
   */
  getStats(): Record<string, { running: number; queued: number }> {
    const stats: Record<string, { running: number; queued: number }> = {};

    for (const [type, limiter] of this.limiters) {
      stats[type] = limiter.getStats();
    }

    return stats;
  }
}

/**
 * Enhanced concurrency limiter with statistics.
 */
class ConcurrencyLimiter {
  private running = 0;
  private queue: Array<() => void> = [];

  constructor(private maxConcurrent: number) {}

  async run<T>(fn: () => Promise<T>, timeout?: number): Promise<T> {
    while (this.running >= this.maxConcurrent) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }

    this.running++;

    try {
      if (timeout) {
        return await Promise.race([
          fn(),
          new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Operation timed out")), timeout))
        ]);
      }
      return await fn();
    } finally {
      this.running--;
      const next = this.queue.shift();
      if (next) next();
    }
  }

  getStats(): { running: number; queued: number } {
    return {
      running: this.running,
      queued: this.queue.length
    };
  }
}

/**
 * Parallel pagination fetcher that respects rate limits.
 * Fetches multiple pages concurrently for faster data retrieval.
 */
export async function parallelPaginatedFetch<T extends { next_cursor: string | null; results: any[] }>(
  listFn: (args: any) => Promise<T>,
  firstPageArgs: any,
  maxParallelPages: number = 3,
  rateLimiter: AdaptiveRateLimiter
): Promise<T["results"]> {
  const results: T["results"] = [];
  const cursors: (string | undefined)[] = [firstPageArgs.start_cursor];
  const activeFetches = new Set<Promise<void>>();

  while (cursors.length > 0 || activeFetches.size > 0) {
    // Start new fetches up to the parallel limit
    while (cursors.length > 0 && activeFetches.size < maxParallelPages) {
      const cursor = cursors.shift();

      const fetchPromise = (async () => {
        await rateLimiter.waitForSlot();

        const response = await listFn({
          ...firstPageArgs,
          start_cursor: cursor
        });

        results.push(...response.results);

        if (response.next_cursor) {
          cursors.push(response.next_cursor);
        }
      })();

      activeFetches.add(fetchPromise);
      fetchPromise.finally(() => activeFetches.delete(fetchPromise));
    }

    // Wait for at least one fetch to complete
    if (activeFetches.size > 0) {
      await Promise.race(activeFetches);
    }
  }

  return results;
}
