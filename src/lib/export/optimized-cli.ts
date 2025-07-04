import type { OperationType } from "../concurrency-manager";
import { OperationTypeAwareLimiter } from "../concurrency-manager";
import { PersistentProgressTracker, ProgressReporter } from "../progress-tracking";
import { AdaptiveRateLimiter } from "../rate-limiting";
import { ETACalculator } from "./eta-calculator";
import { StreamingExportManager } from "./streaming-export-manager";

export interface OptimizedExportConfig {
  outputPath: string;
  format: "json" | "markdown" | "csv";
  maxMemoryMB?: number;
  concurrency?: number;
  checkpointInterval?: number;
}

/**
 * Main CLI interface that integrates all optimization components.
 */
export class OptimizedNotionExportCLI {
  private exportManager: StreamingExportManager;
  private rateLimiter: AdaptiveRateLimiter;
  private operationLimiter: OperationTypeAwareLimiter;
  private progressTracker: PersistentProgressTracker;
  private progressReporter: ProgressReporter;
  private exportId: string;

  constructor(config: OptimizedExportConfig) {
    this.exportId = `notion-export-${Date.now()}`;

    // Initialize rate limiter with Notion API constraints
    this.rateLimiter = new AdaptiveRateLimiter(100); // 100 request buffer

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

    // Initialize export manager
    this.exportManager = new StreamingExportManager(
      this.exportId,
      config.outputPath,
      (config.maxMemoryMB ?? 256) * 1024 * 1024,
      config.checkpointInterval ?? 30000,
      this.getCurrentLimits(),
      config.format
    );

    this.setupProgressReporting();
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

    try {
      const isResuming = await this.exportManager.initialize();

      if (isResuming) {
        console.log("▶️  Resuming from last checkpoint...");
        const checkpoint = this.progressTracker.getLastProcessedId();
        if (checkpoint) {
          console.log(`   Last processed: ${checkpoint}`);
        }
      }

      await this.exportManager.startExport(notionClient);
      this.progressReporter.reportSummary();
      await this.exportManager.finalize();

      console.log("✅ Export completed successfully!");
    } catch (error) {
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

  private setupProgressReporting(): void {
    // The ProgressReporter already handles periodic reporting
    // It's initialized with a 5 second interval
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
