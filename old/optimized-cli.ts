import { Format } from "$lib/renderers/format";
import { PersistentProgressTracker, ProgressReporter } from "../progress-tracking";
import type { OperationType } from "./concurrency-manager";
import { OperationTypeAwareLimiter } from "./concurrency-manager";
import { ETACalculator } from "./eta-calculator";
import { NotionStreamingExporter } from "./manager";
import { AdaptiveRateLimiter } from "./rate-limiting";

export interface OptimizedExportConfig {
  outputPath: string;
  format: Format[];
  maxMemoryMB?: number;
  concurrency?: number;
  checkpointInterval?: number;
  flush?: boolean;
}

/**
 * Enhanced statistics tracking for comprehensive monitoring.
 */
interface EnhancedStats {
  rateLimit: {
    currentLimit: number;
    remainingRequests: number;
    resetTime: Date;
    lastHeaderUpdate: Date | null;
    quotaUtilization: number;
    adaptiveInterval: number;
  };
  performance: {
    operationsPerSecond: number;
    avgResponseTime: number;
    errorRate: number;
    successRate: number;
  };
  itemCounts: Record<
    OperationType,
    {
      completed: number;
      failed: number;
      running: number;
      rate: number;
    }
  >;
  errors: {
    total: number;
    perMinute: number;
    recent: Array<{ timestamp: Date; type: string; message: string }>;
  };
  retries: {
    totalAttempts: number;
    successfulRetries: number;
    failedRetries: number;
    retriesPerMinute: number;
  };
  system: {
    uptime: number;
    memoryUsageMB: number;
    activeOperations: number;
  };
}

/**
 * Real-time display manager that updates console in place or outputs line-by-line.
 */
class RealTimeDisplayManager {
  private displayInterval: NodeJS.Timeout | null = null;
  private lastDisplayTime = 0;
  private startTime = Date.now();
  private isActive = false;
  private errorHistory: Array<{ timestamp: number; type: string; message: string }> = [];
  private retryHistory: Array<{ timestamp: number; successful: boolean }> = [];
  private lastStats: EnhancedStats | null = null;

  constructor(
    private rateLimiter: AdaptiveRateLimiter,
    private operationLimiter: OperationTypeAwareLimiter,
    private progressTracker: PersistentProgressTracker,
    private flushMode: boolean = false
  ) {}

  /**
   * Start the real-time display updates.
   */
  start(): void {
    if (this.isActive) return;

    this.isActive = true;
    this.startTime = Date.now();

    if (!this.flushMode) {
      // Hide cursor and clear screen only in real-time mode
      process.stdout.write("\x1b[?25l");
      process.stdout.write("\x1b[2J\x1b[H");
    }

    // Start update loop
    this.displayInterval = setInterval(() => {
      this.updateDisplay();
    }, 1000); // Update every second

    // Handle graceful shutdown
    process.on("SIGINT", () => this.stop());
    process.on("SIGTERM", () => this.stop());
  }

  /**
   * Stop the real-time display and restore console.
   */
  stop(): void {
    if (!this.isActive) return;

    this.isActive = false;

    if (this.displayInterval) {
      clearInterval(this.displayInterval);
      this.displayInterval = null;
    }

    if (!this.flushMode) {
      // Show cursor and add final newline only in real-time mode
      process.stdout.write("\x1b[?25h\n");
    }
  }

  /**
   * Record an error for tracking.
   */
  recordError(type: string, message: string): void {
    this.errorHistory.push({
      timestamp: Date.now(),
      type,
      message: message.substring(0, 100) // Truncate long messages
    });

    // Keep only last 50 errors
    if (this.errorHistory.length > 50) {
      this.errorHistory = this.errorHistory.slice(-50);
    }

    // In flush mode, immediately emit error
    if (this.flushMode) {
      const now = new Date().toLocaleTimeString();
      console.log(`❌ [${now}] Error - ${type}: ${message}`);
    }
  }

  /**
   * Record a retry attempt.
   */
  recordRetry(successful: boolean): void {
    this.retryHistory.push({
      timestamp: Date.now(),
      successful
    });

    // Keep only last 100 retries
    if (this.retryHistory.length > 100) {
      this.retryHistory = this.retryHistory.slice(-100);
    }

    // In flush mode, immediately emit retry
    if (this.flushMode && !successful) {
      const now = new Date().toLocaleTimeString();
      console.log(`🔄 [${now}] Retry attempt`);
    }
  }

  /**
   * Update the console display in place or emit new lines.
   */
  private updateDisplay(): void {
    const stats = this.gatherStats();

    if (this.flushMode) {
      // In flush mode, only emit new logs when significant changes occur
      this.emitProgressUpdate(stats);
    } else {
      // In real-time mode, update display in place
      const display = this.formatDisplay(stats);
      // Move cursor to top and clear screen
      process.stdout.write("\x1b[H\x1b[J");
      process.stdout.write(display);
    }
  }

  /**
   * Emit selective progress updates as new lines in flush mode.
   */
  private emitProgressUpdate(stats: EnhancedStats): void {
    const now = new Date().toLocaleTimeString();

    // Progress milestones (every 100 operations)
    const totalOps = stats.performance.operationsPerSecond * (stats.system.uptime / 1000);
    const lastTotalOps = this.lastStats
      ? this.lastStats.performance.operationsPerSecond * (this.lastStats.system.uptime / 1000)
      : 0;

    if (Math.floor(totalOps / 100) > Math.floor(lastTotalOps / 100)) {
      console.log(
        `📊 [${now}] Progress: ~${Math.floor(
          totalOps
        )} operations completed (${stats.performance.operationsPerSecond.toFixed(1)} ops/s)`
      );
    }

    // Concurrency adjustments
    if (!this.lastStats || stats.rateLimit.currentLimit !== this.lastStats.rateLimit.currentLimit) {
      console.log(`🔧 [${now}] Concurrency limit adjusted: ${stats.rateLimit.currentLimit}`);
    }

    // Memory warnings
    if (stats.system.memoryUsageMB > 500) {
      // Warning at 500MB
      const lastMemory = this.lastStats?.system.memoryUsageMB || 0;
      if (Math.floor(stats.system.memoryUsageMB / 100) > Math.floor(lastMemory / 100)) {
        console.log(`💾 [${now}] Memory usage: ${stats.system.memoryUsageMB}MB`);
      }
    }

    // Performance changes
    if (
      this.lastStats &&
      Math.abs(stats.performance.operationsPerSecond - this.lastStats.performance.operationsPerSecond) > 5
    ) {
      console.log(
        `⚡ [${now}] Performance: ${stats.performance.operationsPerSecond.toFixed(1)} ops/s (${(
          stats.performance.successRate * 100
        ).toFixed(1)}% success)`
      );
    }

    this.lastStats = stats;
  }

  /**
   * Gather comprehensive statistics from all components.
   */
  private gatherStats(): EnhancedStats {
    const rateLimiterStats = this.rateLimiter.getStats();
    const operationStats = this.operationLimiter.getAllStats();
    const globalStats = this.operationLimiter.getGlobalStats();
    const progressStats = this.progressTracker.getStats();
    const memoryUsage = process.memoryUsage();

    // Calculate errors per minute
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const recentErrors = this.errorHistory.filter((e) => e.timestamp > oneMinuteAgo);
    const errorsPerMinute = recentErrors.length;

    // Calculate retries per minute
    const recentRetries = this.retryHistory.filter((r) => r.timestamp > oneMinuteAgo);
    const retriesPerMinute = recentRetries.length;
    const successfulRetries = this.retryHistory.filter((r) => r.successful).length;
    const failedRetries = this.retryHistory.length - successfulRetries;

    // Calculate quota utilization
    const quotaUtilization =
      rateLimiterStats.quotaLimit > 0 && rateLimiterStats.remainingRequests >= 0
        ? 1 - rateLimiterStats.remainingRequests / rateLimiterStats.quotaLimit
        : 0;

    return {
      rateLimit: {
        currentLimit: rateLimiterStats.recommendedConcurrency,
        remainingRequests: rateLimiterStats.remainingRequests,
        resetTime: rateLimiterStats.resetTime,
        lastHeaderUpdate: rateLimiterStats.lastAdjustmentTime,
        quotaUtilization,
        adaptiveInterval: rateLimiterStats.adaptiveInterval
      },
      performance: {
        operationsPerSecond: globalStats.operationsPerSecond,
        avgResponseTime: rateLimiterStats.avgResponseTime,
        errorRate: globalStats.errorRate,
        successRate: rateLimiterStats.successRate
      },
      itemCounts: Object.fromEntries(
        Object.entries(operationStats).map(([type, stats]) => [
          type,
          {
            completed: stats.completed,
            failed: stats.failed,
            running: stats.running,
            rate: stats.throughput
          }
        ])
      ) as Record<OperationType, any>,
      errors: {
        total: globalStats.totalErrors,
        perMinute: errorsPerMinute,
        recent: this.errorHistory.slice(-5).map((e) => ({
          timestamp: new Date(e.timestamp),
          type: e.type,
          message: e.message
        }))
      },
      retries: {
        totalAttempts: this.retryHistory.length,
        successfulRetries,
        failedRetries,
        retriesPerMinute
      },
      system: {
        uptime: now - this.startTime,
        memoryUsageMB: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        activeOperations: globalStats.activeOperations
      }
    };
  }

  /**
   * Format the statistics into a comprehensive display.
   */
  private formatDisplay(stats: EnhancedStats): string {
    const lines: string[] = [];

    // Header
    lines.push("🚀 Notion Export - Real-time Dashboard");
    lines.push("═".repeat(80));
    lines.push("");

    // Rate Limiting Section
    lines.push("📊 Rate Limiting & API Status");
    lines.push("─".repeat(40));
    lines.push(`   Concurrency Limit: ${stats.rateLimit.currentLimit}`);
    lines.push(`   API Quota Remaining: ${stats.rateLimit.remainingRequests}`);
    lines.push(`   Quota Utilization: ${(stats.rateLimit.quotaUtilization * 100).toFixed(1)}%`);
    lines.push(`   Rate Reset Time: ${stats.rateLimit.resetTime.toLocaleTimeString()}`);
    lines.push(`   Adaptive Interval: ${stats.rateLimit.adaptiveInterval}ms`);
    if (stats.rateLimit.lastHeaderUpdate) {
      const secondsAgo = Math.floor((Date.now() - stats.rateLimit.lastHeaderUpdate.getTime()) / 1000);
      lines.push(`   Last Header Update: ${secondsAgo}s ago`);
    }
    lines.push("");

    // Performance Section
    lines.push("⚡ Performance Metrics");
    lines.push("─".repeat(40));
    lines.push(`   Operations/sec: ${stats.performance.operationsPerSecond.toFixed(2)}`);
    lines.push(`   Avg Response Time: ${stats.performance.avgResponseTime.toFixed(0)}ms`);
    lines.push(`   Success Rate: ${(stats.performance.successRate * 100).toFixed(1)}%`);
    lines.push(`   Error Rate: ${(stats.performance.errorRate * 100).toFixed(2)}%`);
    lines.push("");

    // Item Counts Section
    lines.push("📦 Content Processing");
    lines.push("─".repeat(40));
    const operationTypes: OperationType[] = ["pages", "blocks", "databases", "comments", "users", "properties"];

    for (const type of operationTypes) {
      const typeStats = stats.itemCounts[type];
      if (typeStats && (typeStats.completed > 0 || typeStats.running > 0)) {
        const total = typeStats.completed + typeStats.failed;
        const rateDisplay = typeStats.rate > 0 ? ` (${typeStats.rate.toFixed(1)}/s)` : "";
        lines.push(
          `   ${type.charAt(0).toUpperCase() + type.slice(1)}: ${total} completed, ${
            typeStats.running
          } active${rateDisplay}`
        );
        if (typeStats.failed > 0) {
          lines.push(`     └─ Failures: ${typeStats.failed}`);
        }
      }
    }
    lines.push("");

    // Errors Section
    lines.push("❌ Error Tracking");
    lines.push("─".repeat(40));
    lines.push(`   Total Errors: ${stats.errors.total}`);
    lines.push(`   Errors/minute: ${stats.errors.perMinute}`);
    if (stats.errors.recent.length > 0) {
      lines.push("   Recent errors:");
      stats.errors.recent.forEach((error) => {
        const timeAgo = Math.floor((Date.now() - error.timestamp.getTime()) / 1000);
        lines.push(`     └─ [${timeAgo}s ago] ${error.type}: ${error.message}`);
      });
    }
    lines.push("");

    // Retries Section
    lines.push("🔄 Retry Statistics");
    lines.push("─".repeat(40));
    lines.push(`   Total Retry Attempts: ${stats.retries.totalAttempts}`);
    lines.push(`   Successful Retries: ${stats.retries.successfulRetries}`);
    lines.push(`   Failed Retries: ${stats.retries.failedRetries}`);
    lines.push(`   Retries/minute: ${stats.retries.retriesPerMinute}`);
    if (stats.retries.totalAttempts > 0) {
      const retrySuccessRate = ((stats.retries.successfulRetries / stats.retries.totalAttempts) * 100).toFixed(1);
      lines.push(`   Retry Success Rate: ${retrySuccessRate}%`);
    }
    lines.push("");

    // System Section
    lines.push("💻 System Status");
    lines.push("─".repeat(40));
    const uptimeMinutes = Math.floor(stats.system.uptime / 60000);
    const uptimeSeconds = Math.floor((stats.system.uptime % 60000) / 1000);
    lines.push(`   Uptime: ${uptimeMinutes}m ${uptimeSeconds}s`);
    lines.push(`   Memory Usage: ${stats.system.memoryUsageMB}MB`);
    lines.push(`   Active Operations: ${stats.system.activeOperations}`);
    lines.push("");

    // Footer with timestamp
    lines.push("─".repeat(80));
    lines.push(`Last updated: ${new Date().toLocaleTimeString()}`);

    return lines.join("\n");
  }
}

/**
 * Main CLI interface that integrates all optimization components.
 */
export class OptimizedNotionExportCLI {
  private exportManager: NotionStreamingExporter;
  private rateLimiter: AdaptiveRateLimiter;
  private operationLimiter: OperationTypeAwareLimiter;
  private progressTracker: PersistentProgressTracker;
  private progressReporter: ProgressReporter;
  private displayManager: RealTimeDisplayManager;
  private exportId: string;

  constructor(config: OptimizedExportConfig) {
    this.exportId = `notion-export-${Date.now()}`;

    // Initialize rate limiter with Notion API constraints
    this.rateLimiter = new AdaptiveRateLimiter();

    // Initialize operation-aware limiter
    this.operationLimiter = new OperationTypeAwareLimiter({
      pages: config.concurrency ?? 5,
      databases: Math.max(1, Math.floor((config.concurrency ?? 5) * 0.6)),
      blocks: Math.min(15, (config.concurrency ?? 5) * 3),
      comments: config.concurrency ?? 10,
      users: 20,
      properties: 12
    });

    // Initialize progress tracker
    this.progressTracker = new PersistentProgressTracker(
      this.exportId,
      config.outputPath,
      config.checkpointInterval ?? 30000
    );

    // Initialize progress reporter
    this.progressReporter = new ProgressReporter(this.progressTracker, 5000);

    // Initialize real-time display manager with flush mode
    this.displayManager = new RealTimeDisplayManager(
      this.rateLimiter,
      this.operationLimiter,
      this.progressTracker,
      config.flush ?? false
    );

    // Initialize export manager
    this.exportManager = new NotionStreamingExporter(this.exportId, config.outputPath, this.getCurrentLimits());

    this.setupEventHandlers();
  }

  /**
   * Starts a new export operation.
   *
   * @param notionClient - Notion API client instance
   *
   * @returns A promise that resolves when the export is complete.
   */
  async startExport(notionClient: any): Promise<void> {
    console.log("🚀 Starting optimized Notion export...");

    // Start real-time display
    this.displayManager.start();

    try {
      const isResuming = await this.exportManager.initialize();

      if (isResuming) {
        const checkpoint = this.progressTracker.getLastProcessedId();
        if (checkpoint) {
          console.log(`   Resuming from: ${checkpoint}`);
        }
      }

      await this.exportManager.startExport(notionClient);
      this.progressReporter.reportSummary();
      await this.exportManager.finalize();

      // Stop display and show completion
      this.displayManager.stop();
      console.log("✅ Export completed successfully!");
    } catch (error) {
      this.displayManager.stop();
      console.error("❌ Export failed:", error);
      console.log("💾 Progress has been saved and can be resumed");
      throw error;
    }
  }

  /**
   * Resumes a previously interrupted export by passing it an id
   * and loading the last checkpoint.
   *
   * @param exportId - The ID of the export to resume.
   *
   * @param notionClient - Notion API client instance.
   */
  async resumeExport(notionClient: any): Promise<void> {
    const checkpoint = await this.progressTracker.loadCheckpoint();
    if (!checkpoint) {
      throw new Error("No resumable export found");
    }

    console.log("▶️  Resuming export from last checkpoint...");
    console.log(`   Export ID: ${checkpoint.exportId}`);
    console.log(`   Processed: ${checkpoint.processedCount} items`);

    if (checkpoint.lastProcessedId) {
      console.log(`   Last item: ${checkpoint.lastProcessedId}`);
    }

    await this.exportManager.resumeExport(notionClient);
  }

  /**
   * Pauses the current export operation.
   */
  pauseExport(): void {
    console.log("⏸️  Pausing export...");
    this.exportManager.pauseExport();
    this.displayManager.stop();
    console.log("💾 Progress saved. Use resume command to continue.");
  }

  /**
   * Gets current export status and progress.
   */
  getStatus(): {
    progress: number;
    status: string;
    eta?: string;
    speed?: number;
    operationCounts: Map<OperationType, { active: number; limit: number }>;
    memoryUsage: NodeJS.MemoryUsage;
    errors: number;
  } {
    const state = this.progressTracker.getStats();
    const operationStatus = this.operationLimiter.getAllStats();
    const etaCalculator = new ETACalculator();

    return {
      progress: state.percentage / 100,
      status: state.currentSection || "idle",
      eta: state.eta > 0 ? etaCalculator.formatETA(state.eta) : undefined,
      speed: state.avgRate,
      operationCounts: new Map(Object.entries(operationStatus)) as any,
      memoryUsage: state.memoryUsage,
      errors: state.errors
    };
  }

  /**
   * Auto-tune performance based on current metrics.
   */
  autoTune(): void {
    const globalStats = this.operationLimiter.getGlobalStats();

    console.log(`\n🔧 Auto-tuning performance...`);
    console.log(`   Error rate: ${(globalStats.errorRate * 100).toFixed(1)}%`);
    console.log(`   Operations/sec: ${globalStats.operationsPerSecond.toFixed(1)}`);

    this.operationLimiter.autoTune();

    const newLimits = this.operationLimiter.getCurrentLimits();
    console.log(`   New concurrency limits:`, newLimits);
  }

  /**
   * Displays current performance metrics.
   */
  showMetrics(): void {
    const status = this.getStatus();
    const globalStats = this.operationLimiter.getGlobalStats();
    const rateStats = this.rateLimiter.getStats();

    console.log(`\n📊 Export Metrics:`);
    console.log(`   Progress: ${(status.progress * 100).toFixed(1)}%`);
    console.log(`   Speed: ${status.speed?.toFixed(1) || 0} items/sec`);
    console.log(`   Memory: ${(status.memoryUsage.heapUsed / 1024 / 1024).toFixed(1)}MB`);
    console.log(`   Errors: ${status.errors}`);
    console.log(`\n   API Rate:`);
    console.log(`   - Current: ${rateStats.currentRate}/min`);
    console.log(`   - Remaining: ${rateStats.remainingRequests}`);
    console.log(`   - Reset: ${rateStats.resetTime.toLocaleTimeString()}`);
    console.log(`\n   Operations:`);
    console.log(`   - Total: ${globalStats.totalOperations}`);
    console.log(`   - Error rate: ${(globalStats.errorRate * 100).toFixed(2)}%`);
    console.log(`   - Throughput: ${globalStats.operationsPerSecond.toFixed(1)}/sec`);
  }

  private setupEventHandlers(): void {
    // Set up event handlers to track errors and retries
    process.on("uncaughtException", (error) => {
      this.displayManager.recordError("uncaught", error.message);
    });

    // Set up periodic sync between rate limiter and display manager for retry data
    setInterval(() => {
      const rateLimiterStats = this.rateLimiter.getStats();

      // The display manager gets retry data directly from rate limiter stats now
      // No need to manually sync since both systems maintain their own history
    }, 2000); // Check every 2 seconds

    // Create integrated operation context for error and retry tracking
    this.setupOperationContext();
  }

  /**
   * Set up operation context with integrated error and retry tracking.
   */
  private setupOperationContext(): void {
    // This context can be passed to operations to ensure they report to our tracking systems
    const operationContext = {
      rateLimiter: {
        recordRetryAttempt: (successful: boolean) => {
          this.rateLimiter.recordRetryAttempt(successful);
          this.displayManager.recordRetry(successful);
        },
        updateFromHeaders: (headers: Record<string, string>, responseTime?: number, wasError?: boolean) => {
          this.rateLimiter.updateFromHeaders(headers, responseTime, wasError);
          if (wasError) {
            this.displayManager.recordError("api", `HTTP error: ${headers["status"] || "unknown"}`);
          }
        }
      }
    };

    // Store this context for use in operations
    (this as any)._operationContext = operationContext;
  }

  /**
   * Get the operation context for integrated tracking.
   */
  getOperationContext() {
    return (this as any)._operationContext || {};
  }

  private getCurrentLimits(): Record<string, number> {
    const limits = this.operationLimiter.getCurrentLimits();
    return {
      default: 4,
      ...limits
    };
  }
}

/**
 * Factory function to create and configure the CLI.
 */
export function createOptimizedExportCLI(config: OptimizedExportConfig): OptimizedNotionExportCLI {
  return new OptimizedNotionExportCLI(config);
}
