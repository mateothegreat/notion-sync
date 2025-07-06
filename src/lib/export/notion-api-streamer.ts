import { EventEmitter } from "events";
import { OperationTypeAwareLimiter } from "./concurrency-manager";
import { AdaptiveRateLimiter } from "./rate-limiting";
import { streamPaginatedAPI } from "./streaming";
// Define ExportItem type locally since streaming-export-manager doesn't exist
interface ExportItem {
  id: string;
  type: "page" | "database" | "block" | "user";
  data: any;
  timestamp: Date;
}

interface NotionApiStreamerConfig {
  startCursor?: string;
  pageSize: number;
  initialConcurrency?: {
    pages?: number;
    databases?: number;
    blocks?: number;
    comments?: number;
    users?: number;
    properties?: number;
  };
  maxConcurrency?: number;
  enableDynamicAdjustment?: boolean;
  monitoringInterval?: number;
}

interface NotionApiResponse {
  next_cursor: string | null;
  results: any[];
  headers?: Record<string, string>;
}

/**
 * Comprehensive API call statistics for monitoring and debugging.
 */
interface ApiCallStats {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  totalResponseTime: number;
  avgResponseTime: number;
  rateLimitHits: number;
  concurrencyAdjustments: number;
  lastHeaderUpdate: Date | null;
  operationBreakdown: Record<
    string,
    {
      calls: number;
      successes: number;
      failures: number;
      avgResponseTime: number;
    }
  >;
}

/**
 * Enhanced Notion API streamer with dynamic concurrency adjustment.
 *
 * Features:
 * - Starts with high initial concurrency
 * - Monitors API response headers in real-time
 * - Dynamically adjusts concurrency based on performance
 * - Comprehensive fault tolerance and error handling
 * - Detailed performance monitoring and analytics
 *
 * @example
 * ```typescript
 * const streamer = new NotionApiStreamer(notionClient, {
 *   pageSize: 100,
 *   initialConcurrency: {
 *     pages: 20,
 *     blocks: 30,
 *     databases: 10
 *   },
 *   enableDynamicAdjustment: true
 * });
 *
 * streamer.on('data', (item) => console.log('Received:', item));
 * streamer.on('performance', (stats) => console.log('Performance:', stats));
 *
 * await streamer.start();
 * ```
 */
export class NotionApiStreamer extends EventEmitter {
  private notionClient: any;
  private config: Required<NotionApiStreamerConfig>;
  private rateLimiter: AdaptiveRateLimiter;
  private operationLimiter: OperationTypeAwareLimiter;
  private isRunning: boolean = false;
  private startTime: number = 0;

  // Statistics tracking
  private stats: ApiCallStats = {
    totalCalls: 0,
    successfulCalls: 0,
    failedCalls: 0,
    totalResponseTime: 0,
    avgResponseTime: 0,
    rateLimitHits: 0,
    concurrencyAdjustments: 0,
    lastHeaderUpdate: null,
    operationBreakdown: {}
  };

  // Monitoring and reporting
  private monitoringTimer: NodeJS.Timeout | null = null;
  private lastPerformanceReport: number = 0;

  constructor(notionClient: any, config: NotionApiStreamerConfig) {
    super();
    this.notionClient = notionClient;

    // Set up configuration with intelligent defaults
    this.config = {
      startCursor: config.startCursor,
      pageSize: config.pageSize,
      initialConcurrency: {
        pages: config.initialConcurrency?.pages ?? 20, // Start high for main content
        databases: config.initialConcurrency?.databases ?? 12, // Moderate for complex queries
        blocks: config.initialConcurrency?.blocks ?? 35, // Very high for lightweight ops
        comments: config.initialConcurrency?.comments ?? 15, // Good throughput
        users: config.initialConcurrency?.users ?? 40, // Highest for simplest ops
        properties: config.initialConcurrency?.properties ?? 25, // High throughput
        ...config.initialConcurrency
      },
      maxConcurrency: config.maxConcurrency ?? 100,
      enableDynamicAdjustment: config.enableDynamicAdjustment ?? true,
      monitoringInterval: config.monitoringInterval ?? 5000, // 5 seconds
      ...config
    };

    // Initialize adaptive rate limiter with high initial capacity
    this.rateLimiter = new AdaptiveRateLimiter({
      initialConcurrency: Math.max(...Object.values(this.config.initialConcurrency)),
      maxConcurrency: this.config.maxConcurrency,
      minConcurrency: 3,
      increaseThreshold: 0.15, // 15% increase when performing well
      decreaseThreshold: 0.25, // 25% decrease when issues detected
      adjustmentCooldown: 8000, // 8 seconds between adjustments
      sampleSize: 75, // Larger sample for better stability
      errorThreshold: 0.08, // 8% error threshold
      successThreshold: 0.92 // 92% success threshold
    });

    // Initialize operation-aware limiter with configured initial values
    this.operationLimiter = new OperationTypeAwareLimiter(this.config.initialConcurrency);

    // Set up event listeners for monitoring
    this.setupMonitoring();
  }

  /**
   * Start streaming data from Notion API with comprehensive monitoring.
   *
   * @returns Promise that resolves when streaming is complete
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error("Streamer is already running");
    }

    this.isRunning = true;
    this.startTime = Date.now();

    // Start performance monitoring
    this.startMonitoring();

    // Emit initial status
    this.emit("start", {
      initialConcurrency: this.config.initialConcurrency,
      maxConcurrency: this.config.maxConcurrency,
      dynamicAdjustment: this.config.enableDynamicAdjustment
    });

    try {
      // Execute streaming operations in coordinated fashion
      await Promise.all([
        this.streamPages(),
        this.streamDatabases(),
        this.streamUsers() // Add users streaming for completeness
      ]);

      this.emit("end", this.getComprehensiveStats());
    } catch (error) {
      this.emit("error", error);
      throw error;
    } finally {
      this.stop();
    }
  }

  /**
   * Stop streaming and cleanup resources.
   */
  stop(): void {
    this.isRunning = false;

    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = null;
    }

    // Emit final performance summary
    this.emit("stop", this.getComprehensiveStats());
  }

  /**
   * Get comprehensive performance and operational statistics.
   *
   * @returns Complete statistics object
   */
  getStats(): {
    api: ApiCallStats;
    rateLimiter: ReturnType<AdaptiveRateLimiter["getStats"]>;
    concurrency: ReturnType<OperationTypeAwareLimiter["getPerformanceSummary"]>;
    runtime: {
      uptime: number;
      isRunning: boolean;
      throughput: number;
    };
  } {
    const uptime = Date.now() - this.startTime;
    const throughput = this.stats.totalCalls / (uptime / 1000);

    return {
      api: { ...this.stats },
      rateLimiter: this.rateLimiter.getStats(),
      concurrency: this.operationLimiter.getPerformanceSummary(),
      runtime: {
        uptime,
        isRunning: this.isRunning,
        throughput
      }
    };
  }

  /**
   * Force adjustment of concurrency levels for emergency situations.
   *
   * @param adjustmentFactor - Factor to adjust by (0.5 = halve, 2.0 = double)
   * @param reason - Reason for the adjustment
   */
  emergencyAdjustment(adjustmentFactor: number, reason: string): void {
    this.operationLimiter.adjustLimits(adjustmentFactor, `emergency-${reason}`);
    this.rateLimiter.forceConcurrencyAdjustment(
      Math.floor(this.rateLimiter.getRecommendedConcurrency() * adjustmentFactor),
      `emergency-${reason}`
    );

    this.stats.concurrencyAdjustments++;
    this.emit("emergency-adjustment", { adjustmentFactor, reason });
  }

  /**
   * Stream pages with enhanced monitoring and error handling.
   */
  private async streamPages(): Promise<void> {
    const operationName = "pages";
    this.initializeOperationStats(operationName);

    const listFn = async (args: any): Promise<NotionApiResponse> => {
      return this.executeApiCall(
        operationName,
        () =>
          this.notionClient.search({
            ...args,
            filter: { property: "object", value: "page" }
          }),
        { objectId: "search-pages", operation: "list" }
      );
    };

    const stream = streamPaginatedAPI(
      listFn,
      { start_cursor: this.config.startCursor },
      "pages",
      this.config.pageSize,
      0, // Rate limiting handled by AdaptiveRateLimiter
      1500 // Higher memory limit for better performance
    );

    for await (const page of stream) {
      if (!this.isRunning) break;

      try {
        // Get blocks for this page
        const blocks = await this.getBlocksForPage(page.id);

        const exportItem: ExportItem = {
          id: page.id,
          type: "page",
          data: {
            ...page,
            blocks
          },
          timestamp: new Date()
        };

        this.emit("data", exportItem);
        this.updateOperationStats(operationName, true);
      } catch (error) {
        this.updateOperationStats(operationName, false);
        this.emit("debug", `Error processing page ${page.id}: ${error}`);
        // Continue processing other pages
      }
    }
  }

  /**
   * Stream databases with performance optimization.
   */
  private async streamDatabases(): Promise<void> {
    const operationName = "databases";
    this.initializeOperationStats(operationName);

    const listFn = async (args: any): Promise<NotionApiResponse> => {
      return this.executeApiCall(
        operationName,
        () =>
          this.notionClient.search({
            ...args,
            filter: { property: "object", value: "database" }
          }),
        { objectId: "search-databases", operation: "list" }
      );
    };

    const stream = streamPaginatedAPI(listFn, { start_cursor: undefined }, "databases", this.config.pageSize, 0, 1000);

    for await (const database of stream) {
      if (!this.isRunning) break;

      try {
        const exportItem: ExportItem = {
          id: database.id,
          type: "database",
          data: database,
          timestamp: new Date()
        };

        this.emit("data", exportItem);
        this.updateOperationStats(operationName, true);
      } catch (error) {
        this.updateOperationStats(operationName, false);
        this.emit("debug", `Error processing database ${database.id}: ${error}`);
      }
    }
  }

  /**
   * Stream users for workspace completeness.
   */
  private async streamUsers(): Promise<void> {
    const operationName = "users";
    this.initializeOperationStats(operationName);

    try {
      const users = await this.executeApiCall(operationName, () => this.notionClient.users.list({}), {
        objectId: "users-list",
        operation: "list"
      });

      for (const user of (users as any).results || []) {
        if (!this.isRunning) break;

        const exportItem: ExportItem = {
          id: user.id,
          type: "user" as any, // Extend type if needed
          data: user,
          timestamp: new Date()
        };

        this.emit("data", exportItem);
      }

      this.updateOperationStats(operationName, true);
    } catch (error) {
      this.updateOperationStats(operationName, false);
      this.emit("debug", `Error streaming users: ${error}`);
    }
  }

  /**
   * Get blocks for a page with enhanced error handling and performance tracking.
   *
   * @param pageId - ID of the page to get blocks for
   * @returns Array of blocks
   */
  private async getBlocksForPage(pageId: string): Promise<any[]> {
    const operationName = "blocks";

    const listFn = async (args: any): Promise<NotionApiResponse> => {
      return this.executeApiCall(
        operationName,
        () =>
          this.notionClient.blocks.children.list({
            block_id: pageId,
            ...args
          }),
        { objectId: pageId, operation: "children" }
      );
    };

    const stream = streamPaginatedAPI(
      listFn,
      { start_cursor: undefined },
      `blocks-${pageId}`,
      Math.min(this.config.pageSize, 100), // Notion limits blocks to 100 per request
      0,
      750 // Optimized memory limit for blocks
    );

    const blocks: any[] = [];
    for await (const block of stream) {
      if (!this.isRunning) break;
      blocks.push(block);
    }

    return blocks;
  }

  /**
   * Execute an API call with comprehensive monitoring and error handling.
   *
   * @param operationType - Type of operation being performed
   * @param apiCall - Function that makes the API call
   * @param context - Additional context for the operation
   * @returns API response
   */
  private async executeApiCall<T>(
    operationType: string,
    apiCall: () => Promise<T>,
    context: { objectId: string; operation: string }
  ): Promise<T> {
    const startTime = Date.now();
    this.stats.totalCalls++;

    try {
      // Use both rate limiter and operation limiter
      await this.rateLimiter.waitForSlot();

      const result = await this.operationLimiter.run(
        {
          type: operationType as any,
          objectId: context.objectId,
          operation: context.operation,
          priority: "normal",
          timeout: 30000
        },
        apiCall
      );

      // Record successful call
      const responseTime = Date.now() - startTime;
      this.recordSuccessfulCall(operationType, responseTime, result);

      return result;
    } catch (error) {
      // Record failed call
      const responseTime = Date.now() - startTime;
      this.recordFailedCall(operationType, responseTime, error);
      throw error;
    }
  }

  /**
   * Record a successful API call with performance metrics.
   */
  private recordSuccessfulCall(operationType: string, responseTime: number, result: any): void {
    this.stats.successfulCalls++;
    this.stats.totalResponseTime += responseTime;
    this.stats.avgResponseTime = this.stats.totalResponseTime / this.stats.totalCalls;

    // Extract headers if available
    const headers = this.extractHeaders(result);
    if (headers) {
      this.updateFromHeaders(headers, responseTime, operationType, false);
    }

    // Report success to limiters
    this.rateLimiter.reportSuccess();
  }

  /**
   * Record a failed API call with error analysis.
   */
  private recordFailedCall(operationType: string, responseTime: number, error: any): void {
    this.stats.failedCalls++;
    this.stats.totalResponseTime += responseTime;
    this.stats.avgResponseTime = this.stats.totalResponseTime / this.stats.totalCalls;

    // Analyze error severity
    const severity = this.analyzeErrorSeverity(error);

    // Report error to limiters
    this.rateLimiter.reportError(error?.code || "unknown", severity);

    // Check for rate limiting
    if (error?.code === "rate_limited" || error?.status === 429) {
      this.stats.rateLimitHits++;

      // Extract retry-after if available
      const retryAfter = error?.headers?.["retry-after"];
      if (retryAfter) {
        this.emit("rate-limit", { retryAfter: parseInt(retryAfter, 10) });
      }
    }
  }

  /**
   * Update from headers with operation context.
   */
  private updateFromHeaders(
    headers: Record<string, string>,
    responseTime: number,
    operationType: string,
    wasError: boolean
  ): void {
    this.stats.lastHeaderUpdate = new Date();

    // Update both limiters
    this.rateLimiter.updateFromHeaders(headers, responseTime, wasError);
    this.operationLimiter.updateFromHeaders(headers, responseTime, operationType as any, wasError);

    // Emit header update event for monitoring
    this.emit("headers-updated", {
      operationType,
      headers: this.sanitizeHeaders(headers),
      responseTime,
      wasError
    });
  }

  /**
   * Extract headers from API response.
   */
  private extractHeaders(result: any): Record<string, string> | null {
    // Handle different response formats
    if (result && typeof result === "object") {
      if (result.headers) return result.headers;
      if (result.response?.headers) return result.response.headers;
      if (result._headers) return result._headers;
    }
    return null;
  }

  /**
   * Analyze error severity for appropriate response.
   */
  private analyzeErrorSeverity(error: any): "low" | "medium" | "high" {
    if (!error) return "low";

    // High severity errors that require immediate response
    if (error.code === "rate_limited" || error.status === 429) return "high";
    if (error.code === "unauthorized" || error.status === 401) return "high";
    if (error.code === "forbidden" || error.status === 403) return "high";

    // Medium severity errors
    if (error.code === "object_not_found" || error.status === 404) return "medium";
    if (error.code === "validation_error" || error.status === 400) return "medium";

    // Network and timeout errors
    if (error.code === "ECONNRESET" || error.code === "ETIMEDOUT") return "medium";
    if (error.message?.includes("timeout")) return "medium";

    return "low";
  }

  /**
   * Initialize operation statistics tracking.
   */
  private initializeOperationStats(operationType: string): void {
    if (!this.stats.operationBreakdown[operationType]) {
      this.stats.operationBreakdown[operationType] = {
        calls: 0,
        successes: 0,
        failures: 0,
        avgResponseTime: 0
      };
    }
  }

  /**
   * Update operation-specific statistics.
   */
  private updateOperationStats(operationType: string, success: boolean): void {
    const stats = this.stats.operationBreakdown[operationType];
    if (stats) {
      stats.calls++;
      if (success) {
        stats.successes++;
      } else {
        stats.failures++;
      }
    }
  }

  /**
   * Set up monitoring and event handling.
   */
  private setupMonitoring(): void {
    // Auto-tune concurrency if enabled
    if (this.config.enableDynamicAdjustment) {
      setInterval(() => {
        if (this.isRunning) {
          this.operationLimiter.autoTune();
        }
      }, 15000); // Every 15 seconds
    }
  }

  /**
   * Start performance monitoring and reporting.
   */
  private startMonitoring(): void {
    this.monitoringTimer = setInterval(() => {
      if (this.isRunning) {
        const now = Date.now();

        // Report performance every interval
        if (now - this.lastPerformanceReport >= this.config.monitoringInterval) {
          this.lastPerformanceReport = now;
          this.emit("performance", this.getComprehensiveStats());
        }
      }
    }, 1000); // Check every second
  }

  /**
   * Get comprehensive statistics for reporting.
   */
  private getComprehensiveStats() {
    const stats = this.getStats();
    const recommendations = this.generateRecommendations(stats);

    return {
      ...stats,
      recommendations,
      timestamp: new Date()
    };
  }

  /**
   * Generate performance recommendations based on current statistics.
   */
  private generateRecommendations(stats: ReturnType<typeof this.getStats>): string[] {
    const recommendations: string[] = [];

    // Error rate analysis
    const errorRate = stats.api.failedCalls / stats.api.totalCalls;
    if (errorRate > 0.1) {
      recommendations.push(`High error rate (${(errorRate * 100).toFixed(1)}%) - consider reducing concurrency`);
    }

    // Response time analysis
    if (stats.api.avgResponseTime > 3000) {
      recommendations.push(
        `Slow average response time (${stats.api.avgResponseTime.toFixed(0)}ms) - API may be overloaded`
      );
    }

    // Rate limiting analysis
    if (stats.api.rateLimitHits > 5) {
      recommendations.push(
        `Multiple rate limit hits (${stats.api.rateLimitHits}) - consider reducing request frequency`
      );
    }

    // Concurrency analysis
    if (stats.concurrency.global.operationsPerSecond < 5) {
      recommendations.push("Low throughput - consider increasing concurrency if error rate is acceptable");
    }

    // Header update frequency
    if (stats.concurrency.global.headerUpdateFrequency > 10) {
      recommendations.push("Headers not being updated frequently - check API integration");
    }

    return recommendations;
  }

  /**
   * Sanitize headers for safe emission (remove sensitive data).
   */
  private sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
    const sanitized: Record<string, string> = {};
    const allowedHeaders = [
      "x-ratelimit-limit",
      "x-ratelimit-remaining",
      "x-ratelimit-reset",
      "retry-after",
      "content-type",
      "date"
    ];

    for (const key of allowedHeaders) {
      if (headers[key]) {
        sanitized[key] = headers[key];
      }
    }

    return sanitized;
  }
}
