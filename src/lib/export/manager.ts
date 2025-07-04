import { createWriteStream, WriteStream } from "fs";
import { join } from "path";
import { smartRetryOperation, type OperationEventEmitter, type RetryContext } from "../operations";
import { PersistentProgressTracker, ProgressReporter } from "../progress-tracking";
import { OperationTypeAwareLimiter, type OperationType } from "./concurrency-manager";
import { AdaptiveRateLimiter } from "./rate-limiting";
import { CircuitBreaker, RateTracker } from "./util";

interface ExportCheckpoint {
  exportId: string;
  startTime: number;
  lastProcessedId?: string;
  processedCount: number;
  totalEstimate: number;
  completedSections: string[];
  currentSection: string;
  outputPath: string;
}

/**
 * Enhanced operation metrics with detailed context.
 */
interface OperationMetrics {
  operation: string;
  operationType: OperationType;
  startTime: number;
  itemsProcessed: number;
  errorsCount: number;
  avgResponseTime: number;
  successRate: number;
  lastApiHeaders?: Record<string, string>;
}

/**
 * Error record with enhanced context for debugging.
 */
interface ErrorRecord {
  timestamp: number;
  operation: string;
  operationType: OperationType;
  objectId?: string;
  error: string;
  stack?: string;
  retryCount: number;
  apiHeaders?: Record<string, string>;
}

/**
 * Analytics for export performance monitoring.
 */
interface ExportAnalytics {
  totalApiCalls: number;
  totalErrors: number;
  avgResponseTime: number;
  dataTransferred: number;
  memoryPeakUsage: number;
  rateLimitHits: number;
  circuitBreakerTrips: number;
}

/**
 * Streaming export manager that handles large Notion workspace exports
 * with bounded memory usage, resumable progress, and intelligent performance optimization.
 */
export class StreamingExportManager implements OperationEventEmitter {
  private checkpointFile: string;
  private outputStream: WriteStream | null = null;
  private currentCheckpoint: ExportCheckpoint;
  private metrics: Map<string, OperationMetrics> = new Map();
  private errorRecords: ErrorRecord[] = [];
  private memoryBounds: number;
  private checkpointInterval: number;

  // Enhanced components
  private rateLimiter: AdaptiveRateLimiter;
  private concurrencyManager: OperationTypeAwareLimiter;
  private circuitBreaker: CircuitBreaker;
  private progressTracker: PersistentProgressTracker;
  private progressReporter: ProgressReporter;
  private rateTracker: RateTracker;
  private analytics: ExportAnalytics;

  constructor(
    private exportId: string,
    private outputDir: string,
    memoryBounds: number = 50 * 1024 * 1024, // 50MB default
    checkpointInterval: number = 30000, // 30s
    customConcurrencyLimits?: Partial<Record<OperationType, number>>
  ) {
    this.checkpointFile = join(outputDir, `${exportId}.checkpoint.json`);
    this.memoryBounds = memoryBounds;
    this.checkpointInterval = checkpointInterval;

    // Initialize enhanced components
    this.rateLimiter = new AdaptiveRateLimiter();
    this.concurrencyManager = new OperationTypeAwareLimiter(customConcurrencyLimits);
    this.circuitBreaker = new CircuitBreaker(5, 60000);
    this.progressTracker = new PersistentProgressTracker(exportId, outputDir);
    this.progressReporter = new ProgressReporter(this.progressTracker);
    this.rateTracker = new RateTracker();

    this.currentCheckpoint = {
      exportId,
      startTime: Date.now(),
      processedCount: 0,
      totalEstimate: 0,
      completedSections: [],
      currentSection: "",
      outputPath: join(outputDir, `${exportId}.json`)
    };

    this.analytics = {
      totalApiCalls: 0,
      totalErrors: 0,
      avgResponseTime: 0,
      dataTransferred: 0,
      memoryPeakUsage: 0,
      rateLimitHits: 0,
      circuitBreakerTrips: 0
    };
  }

  /**
   * Initialize or resume an export operation.
   *
   * @returns True if resuming from checkpoint, false if new export.
   */
  async initialize(): Promise<boolean> {
    const isResuming = await this.progressTracker.initialize();

    if (isResuming) {
      console.log(`📁 Resuming export from checkpoint (${this.progressTracker.getStats().processed} items processed)`);
    } else {
      console.log(`🚀 Starting new export: ${this.exportId}`);
    }

    // Start progress reporting
    this.startProgressReporting();

    return isResuming;
  }

  /**
   * Stream items to output with memory bounds enforcement and intelligent concurrency.
   */
  async *streamExportItems<T>(
    dataSource: AsyncIterable<T>,
    transformer: (item: T) => any,
    sectionName: string,
    operationType: OperationType
  ): AsyncGenerator<any, void, unknown> {
    this.currentCheckpoint.currentSection = sectionName;
    this.progressTracker.updateProgress(sectionName, 0);

    let itemCount = 0;
    let lastCheckpointTime = Date.now();

    if (!this.outputStream) {
      this.outputStream = createWriteStream(this.currentCheckpoint.outputPath, {
        flags: "a", // Append mode for resumable exports
        encoding: "utf8"
      });
    }

    const sectionMetrics: OperationMetrics = {
      operation: sectionName,
      operationType,
      startTime: Date.now(),
      itemsProcessed: 0,
      errorsCount: 0,
      avgResponseTime: 0,
      successRate: 1.0
    };

    try {
      for await (const item of dataSource) {
        const startTime = Date.now();

        try {
          // Use concurrency manager for processing
          const transformedItem = await this.concurrencyManager.run(
            {
              type: operationType,
              objectId: (item as any)?.id || `${sectionName}-${itemCount}`,
              operation: `transform-${sectionName}`,
              timeout: 30000
            },
            async () => transformer(item)
          );

          // Stream to output immediately (bounded memory)
          if (this.outputStream && this.outputStream.writable) {
            const serialized = JSON.stringify(transformedItem) + "\n";
            this.outputStream.write(serialized);
            this.analytics.dataTransferred += serialized.length;
          }

          // Update metrics
          const processingTime = Date.now() - startTime;
          sectionMetrics.itemsProcessed++;
          sectionMetrics.avgResponseTime =
            (sectionMetrics.avgResponseTime * (sectionMetrics.itemsProcessed - 1) + processingTime) /
            sectionMetrics.itemsProcessed;

          // Yield for progress tracking
          yield transformedItem;

          itemCount++;
          this.progressTracker.updateProgress(sectionName, itemCount, (item as any)?.id);

          // Periodic checkpoint saving and optimization
          if (Date.now() - lastCheckpointTime > this.checkpointInterval) {
            await this.progressTracker.saveCheckpoint();
            lastCheckpointTime = Date.now();

            // Auto-tune concurrency based on performance
            this.concurrencyManager.autoTune();

            // Memory pressure management
            await this.managememoryPressure();
          }
        } catch (error) {
          sectionMetrics.errorsCount++;
          this.recordError(sectionName, operationType, error as Error, (item as any)?.id);
          console.error(`Error processing item in ${sectionName}:`, error);
          // Continue processing other items
        }
      }

      // Update success rate
      sectionMetrics.successRate =
        sectionMetrics.itemsProcessed > 0
          ? (sectionMetrics.itemsProcessed - sectionMetrics.errorsCount) / sectionMetrics.itemsProcessed
          : 1.0;

      // Mark section as completed
      this.progressTracker.completeSection(sectionName);
      this.progressReporter.reportSectionComplete(sectionName);
      this.metrics.set(sectionName, sectionMetrics);
    } finally {
      await this.progressTracker.saveCheckpoint();
    }
  }

  /**
   * Enhanced API call with smart retry and rate limiting.
   */
  async callAPI<T>(
    apiCall: () => Promise<T>,
    operationType: OperationType,
    operationName: string,
    objectId?: string
  ): Promise<T> {
    // Wait for rate limit slot
    await this.rateLimiter.waitForSlot();

    const context: RetryContext = {
      operationType: operationType === "pages" || operationType === "databases" ? "read" : "read",
      circuitBreaker: this.circuitBreaker,
      objectId,
      priority: "normal"
    };

    this.analytics.totalApiCalls++;

    try {
      const result = await smartRetryOperation(apiCall, operationName, context, undefined, undefined, 30000, this);

      return result;
    } catch (error) {
      this.analytics.totalErrors++;
      throw error;
    }
  }

  /**
   * Event emitter implementation for operation events.
   */
  emit(event: string, data: any): void {
    switch (event) {
      case "api-call":
        // Track API call metrics
        break;
      case "retry":
        if (data.error?.includes("rate_limited")) {
          this.analytics.rateLimitHits++;
        }
        break;
    }
  }

  /**
   * Record an error with enhanced context.
   */
  private recordError(
    operation: string,
    operationType: OperationType,
    error: Error,
    objectId?: string,
    retryCount: number = 0,
    apiHeaders?: Record<string, string>
  ): void {
    const errorRecord: ErrorRecord = {
      timestamp: Date.now(),
      operation,
      operationType,
      objectId,
      error: error.message,
      stack: error.stack,
      retryCount,
      apiHeaders
    };

    this.errorRecords.push(errorRecord);
    this.progressTracker.recordError(operation, error, objectId, retryCount);

    // Keep only last 200 errors to prevent unbounded growth
    if (this.errorRecords.length > 200) {
      this.errorRecords = this.errorRecords.slice(-200);
    }
  }

  /**
   * Manage memory pressure with intelligent strategies.
   */
  private async managememoryPressure(): Promise<void> {
    const memUsage = process.memoryUsage();
    this.analytics.memoryPeakUsage = Math.max(this.analytics.memoryPeakUsage, memUsage.heapUsed);

    if (memUsage.heapUsed > this.memoryBounds) {
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      // If still over limit, add backpressure
      const newMemUsage = process.memoryUsage();
      if (newMemUsage.heapUsed > this.memoryBounds) {
        // Reduce concurrency temporarily
        this.concurrencyManager.adjustLimits(0.7);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  }

  /**
   * Start progress reporting with periodic updates.
   */
  private startProgressReporting(): void {
    const reportInterval = setInterval(() => {
      this.progressReporter.report();

      // Log performance metrics periodically
      const globalStats = this.concurrencyManager.getGlobalStats();
      const rateLimiterStats = this.rateLimiter.getStats();

      if (globalStats.totalOperations % 100 === 0 && globalStats.totalOperations > 0) {
        console.log(
          `📊 Performance: ${globalStats.operationsPerSecond.toFixed(1)} ops/s, ` +
            `${(globalStats.errorRate * 100).toFixed(1)}% errors, ` +
            `${rateLimiterStats.remainingRequests} API calls remaining`
        );
      }
    }, 5000);

    // Cleanup on process exit
    process.on("exit", () => clearInterval(reportInterval));
    process.on("SIGINT", () => clearInterval(reportInterval));
  }

  /**
   * Get comprehensive progress and performance statistics.
   */
  getProgress(): {
    processed: number;
    total: number;
    percentage: number;
    eta: { eta: number; confidence: number };
    currentSection: string;
    memoryUsage: NodeJS.MemoryUsage;
    metrics: OperationMetrics[];
    concurrencyStats: Record<OperationType, any>;
    analytics: ExportAnalytics;
    errors: ErrorRecord[];
  } {
    const progressStats = this.progressTracker.getStats();
    const etaData = this.progressTracker.calculateETA();

    return {
      processed: progressStats.processed,
      total: progressStats.total,
      percentage: progressStats.percentage,
      eta: etaData,
      currentSection: progressStats.currentSection,
      memoryUsage: process.memoryUsage(),
      metrics: Array.from(this.metrics.values()),
      concurrencyStats: this.concurrencyManager.getAllStats(),
      analytics: this.analytics,
      errors: this.errorRecords.slice(-10) // Last 10 errors
    };
  }

  /**
   * Complete the export and cleanup.
   */
  async finalize(): Promise<void> {
    if (this.outputStream) {
      await new Promise<void>((resolve, reject) => {
        this.outputStream!.end((error?: Error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }

    // Save final checkpoint
    await this.progressTracker.saveCheckpoint();

    // Report final summary
    this.progressReporter.reportSummary();

    // Log final analytics
    this.logFinalAnalytics();

    console.log(`✅ Export completed: ${this.progressTracker.getStats().processed} items processed`);
  }

  /**
   * Log comprehensive final analytics.
   */
  private logFinalAnalytics(): void {
    const globalStats = this.concurrencyManager.getGlobalStats();
    const memMB = this.analytics.memoryPeakUsage / 1024 / 1024;
    const dataMB = this.analytics.dataTransferred / 1024 / 1024;

    console.log("\n📈 Export Analytics:");
    console.log("═".repeat(50));
    console.log(`API Calls: ${this.analytics.totalApiCalls.toLocaleString()}`);
    console.log(`Average Speed: ${globalStats.operationsPerSecond.toFixed(1)} ops/s`);
    console.log(`Error Rate: ${(globalStats.errorRate * 100).toFixed(2)}%`);
    console.log(`Data Exported: ${dataMB.toFixed(1)}MB`);
    console.log(`Peak Memory: ${memMB.toFixed(1)}MB`);
    console.log(`Rate Limit Hits: ${this.analytics.rateLimitHits}`);

    // Show concurrency statistics
    const concurrencyStats = this.concurrencyManager.getAllStats();
    console.log("\n🔧 Concurrency Performance:");
    for (const [type, stats] of Object.entries(concurrencyStats)) {
      console.log(`  ${type}: ${stats.completed} completed, ${stats.avgDuration.toFixed(0)}ms avg`);
    }
  }

  /**
   * Cleanup checkpoint file after successful export.
   */
  async cleanup(): Promise<void> {
    await this.progressTracker.removeCheckpoint();
  }
}

/**
 * Enhanced Notion streaming exporter with intelligent performance optimization.
 */
export class NotionStreamingExporter {
  private streamingManager: StreamingExportManager;

  constructor(exportId: string, outputDir: string, customConcurrencyLimits?: Partial<Record<OperationType, number>>) {
    this.streamingManager = new StreamingExportManager(
      exportId,
      outputDir,
      undefined,
      undefined,
      customConcurrencyLimits
    );
  }

  async exportWorkspace(notionClient: any): Promise<void> {
    const isResuming = await this.streamingManager.initialize();

    try {
      // Set total estimate for better progress tracking
      const estimate = await this.estimateWorkspaceSize(notionClient);
      this.streamingManager["progressTracker"].setTotalEstimate(estimate);

      // Export pages with intelligent pagination
      const pages = this.iteratePages(notionClient);
      for await (const page of this.streamingManager.streamExportItems(
        pages,
        this.transformPage.bind(this),
        "pages",
        "pages"
      )) {
        // Progress automatically tracked by streaming manager
      }

      // Export databases
      const databases = this.iterateDatabases(notionClient);
      for await (const database of this.streamingManager.streamExportItems(
        databases,
        this.transformDatabase.bind(this),
        "databases",
        "databases"
      )) {
        // Progress automatically tracked
      }

      await this.streamingManager.finalize();
      await this.streamingManager.cleanup();
    } catch (error) {
      console.error("Export failed:", error);
      // Checkpoint is preserved for retry
      throw error;
    }
  }

  /**
   * Estimate workspace size for better progress tracking.
   */
  private async estimateWorkspaceSize(client: any): Promise<number> {
    try {
      // Quick estimate - this could be enhanced with sampling
      return 1000; // Placeholder - implement actual estimation
    } catch (error) {
      console.warn("Could not estimate workspace size, using default");
      return 1000;
    }
  }

  private async *iteratePages(client: any): AsyncIterable<any> {
    // Implementation for iterating Notion pages with streaming
    // This would use the streamPaginatedAPI function
  }

  private async *iterateDatabases(client: any): AsyncIterable<any> {
    // Implementation for iterating Notion databases
  }

  private transformPage(page: any): any {
    // Transform Notion page to export format
    return {
      id: page.id,
      title: page.properties?.title?.title?.[0]?.plain_text || "Untitled",
      created_time: page.created_time,
      last_edited_time: page.last_edited_time
      // ... other transformations
    };
  }

  private transformDatabase(database: any): any {
    // Transform Notion database to export format
    return {
      id: database.id,
      title: database.title?.[0]?.plain_text || "Untitled Database"
      // ... other transformations
    };
  }
}
