import { promises as fs } from "fs";
import { join } from "path";
import { RateTracker } from "./export/util";

/**
 * Export checkpoint data for resumable operations.
 */
export interface ExportCheckpoint {
  exportId: string;
  startTime: number;
  lastUpdateTime: number;
  lastProcessedId?: string;
  processedCount: number;
  totalEstimate: number;
  completedSections: string[];
  currentSection: string;
  outputPath: string;
  errors: ErrorRecord[];
  metadata: Record<string, any>;
}

/**
 * Error record with context for debugging.
 */
export interface ErrorRecord {
  timestamp: number;
  operation: string;
  objectId?: string;
  error: string;
  stack?: string;
  retryCount: number;
}

/**
 * Progress statistics for real-time monitoring.
 */
export interface ProgressStats {
  processed: number;
  total: number;
  percentage: number;
  currentRate: number;
  avgRate: number;
  eta: number;
  etaConfidence: number;
  currentSection: string;
  memoryUsage: NodeJS.MemoryUsage;
  errors: number;
}

/**
 * Persistent progress tracker with checkpoint support for resumable exports.
 * Provides zero restart penalty by maintaining state on disk.
 */
export class PersistentProgressTracker {
  private checkpointFile: string;
  private checkpoint: ExportCheckpoint;
  private rateTracker: RateTracker;
  private saveInterval: NodeJS.Timeout | null = null;
  private isDirty = false;
  private totalProcessed = 0;
  private sectionStartTime: Map<string, number> = new Map();
  private sectionItemCounts: Map<string, number> = new Map();

  constructor(
    exportId: string,
    outputDir: string,
    private autoSaveInterval: number = 30000 // 30 seconds
  ) {
    this.checkpointFile = join(outputDir, `.${exportId}.checkpoint.json`);
    this.rateTracker = new RateTracker(2000);

    this.checkpoint = {
      exportId,
      startTime: Date.now(),
      lastUpdateTime: Date.now(),
      processedCount: 0,
      totalEstimate: 0,
      completedSections: [],
      currentSection: "",
      outputPath: join(outputDir, `export-${exportId}`),
      errors: [],
      metadata: {}
    };
  }

  /**
   * Initialize tracker, loading checkpoint if exists.
   *
   * @returns True if resuming from checkpoint, false if new export.
   */
  async initialize(): Promise<boolean> {
    try {
      const data = await fs.readFile(this.checkpointFile, "utf8");
      this.checkpoint = JSON.parse(data);
      this.totalProcessed = this.checkpoint.processedCount;

      // Start auto-save
      this.startAutoSave();

      return true; // Resuming
    } catch {
      // No checkpoint found, create new
      await this.saveCheckpoint();
      this.startAutoSave();
      return false; // New export
    }
  }

  /**
   * Save checkpoint to disk.
   */
  async saveCheckpoint(): Promise<void> {
    if (!this.isDirty && this.checkpoint.lastUpdateTime > 0) {
      return; // No changes to save
    }

    this.checkpoint.lastUpdateTime = Date.now();

    try {
      // Write to temp file first
      const tempFile = `${this.checkpointFile}.tmp`;
      await fs.writeFile(tempFile, JSON.stringify(this.checkpoint, null, 2));

      // Atomic rename
      await fs.rename(tempFile, this.checkpointFile);

      this.isDirty = false;
    } catch (error) {
      console.error("Failed to save checkpoint:", error);
      throw error;
    }
  }

  /**
   * Load checkpoint from disk.
   */
  async loadCheckpoint(): Promise<ExportCheckpoint | null> {
    try {
      const data = await fs.readFile(this.checkpointFile, "utf8");
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  /**
   * Update progress for current section.
   */
  updateProgress(section: string, processedInSection: number, lastProcessedId?: string): void {
    this.checkpoint.currentSection = section;
    this.checkpoint.processedCount = this.totalProcessed + processedInSection;

    if (lastProcessedId) {
      this.checkpoint.lastProcessedId = lastProcessedId;
    }

    this.isDirty = true;

    // Track section progress
    if (!this.sectionStartTime.has(section)) {
      this.sectionStartTime.set(section, Date.now());
    }
    this.sectionItemCounts.set(section, processedInSection);
  }

  /**
   * Mark a section as completed.
   */
  completeSection(section: string): void {
    if (!this.checkpoint.completedSections.includes(section)) {
      this.checkpoint.completedSections.push(section);
      this.totalProcessed = this.checkpoint.processedCount;
      this.isDirty = true;
    }
  }

  /**
   * Set total estimate for progress calculation.
   */
  setTotalEstimate(total: number): void {
    this.checkpoint.totalEstimate = total;
    this.isDirty = true;
  }

  /**
   * Record an error with context.
   */
  recordError(operation: string, error: Error, objectId?: string, retryCount: number = 0): void {
    const errorRecord: ErrorRecord = {
      timestamp: Date.now(),
      operation,
      objectId,
      error: error.message,
      stack: error.stack,
      retryCount
    };

    this.checkpoint.errors.push(errorRecord);

    // Keep only last 100 errors to prevent unbounded growth
    if (this.checkpoint.errors.length > 100) {
      this.checkpoint.errors = this.checkpoint.errors.slice(-100);
    }

    this.isDirty = true;
  }

  /**
   * Set metadata value.
   */
  setMetadata(key: string, value: any): void {
    this.checkpoint.metadata[key] = value;
    this.isDirty = true;
  }

  /**
   * Get metadata value.
   */
  getMetadata(key: string): any {
    return this.checkpoint.metadata[key];
  }

  /**
   * Calculate ETA with confidence based on processing history.
   */
  calculateETA(): { eta: number; confidence: number } {
    const processed = this.checkpoint.processedCount;
    const total = this.checkpoint.totalEstimate;

    if (processed === 0 || total === 0) {
      return { eta: 0, confidence: 0 };
    }

    const elapsed = Date.now() - this.checkpoint.startTime;
    const avgRate = processed / (elapsed / 1000); // items per second
    const remaining = Math.max(0, total - processed);

    // Calculate ETA
    const eta = (remaining / avgRate) * 1000; // milliseconds

    // Confidence increases with more data points
    const confidence = Math.min(1, processed / Math.max(100, total * 0.1));

    return { eta, confidence };
  }

  /**
   * Get current progress statistics.
   */
  getStats(): ProgressStats {
    const processed = this.checkpoint.processedCount;
    const total = this.checkpoint.totalEstimate;
    const currentRate = this.rateTracker.updateMetric("items", processed);
    const elapsed = Date.now() - this.checkpoint.startTime;
    const avgRate = elapsed > 0 ? processed / (elapsed / 1000) : 0;
    const { eta, confidence: etaConfidence } = this.calculateETA();

    return {
      processed,
      total,
      percentage: total > 0 ? (processed / total) * 100 : 0,
      currentRate,
      avgRate,
      eta,
      etaConfidence,
      currentSection: this.checkpoint.currentSection,
      memoryUsage: process.memoryUsage(),
      errors: this.checkpoint.errors.length
    };
  }

  /**
   * Get detailed section statistics.
   */
  getSectionStats(): Map<string, { items: number; duration: number; rate: number }> {
    const stats = new Map<string, { items: number; duration: number; rate: number }>();

    for (const [section, startTime] of this.sectionStartTime) {
      const items = this.sectionItemCounts.get(section) || 0;
      const duration = this.checkpoint.completedSections.includes(section)
        ? this.checkpoint.lastUpdateTime - startTime
        : Date.now() - startTime;
      const rate = duration > 0 ? items / (duration / 1000) : 0;

      stats.set(section, { items, duration, rate });
    }

    return stats;
  }

  /**
   * Check if a section has been completed.
   */
  isSectionCompleted(section: string): boolean {
    return this.checkpoint.completedSections.includes(section);
  }

  /**
   * Get the last processed ID for resuming.
   */
  getLastProcessedId(): string | undefined {
    return this.checkpoint.lastProcessedId;
  }

  /**
   * Get recent errors for debugging.
   */
  getRecentErrors(count: number = 10): ErrorRecord[] {
    return this.checkpoint.errors.slice(-count);
  }

  /**
   * Start auto-save timer.
   */
  private startAutoSave(): void {
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
    }

    this.saveInterval = setInterval(async () => {
      if (this.isDirty) {
        await this.saveCheckpoint();
      }
    }, this.autoSaveInterval);
  }

  /**
   * Stop auto-save timer.
   */
  private stopAutoSave(): void {
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
      this.saveInterval = null;
    }
  }

  /**
   * Cleanup and save final state.
   */
  async cleanup(): Promise<void> {
    this.stopAutoSave();
    await this.saveCheckpoint();
  }

  /**
   * Remove checkpoint file after successful export.
   */
  async removeCheckpoint(): Promise<void> {
    try {
      await fs.unlink(this.checkpointFile);
    } catch {
      // File might not exist
    }
  }
}

/**
 * Real-time progress reporter with formatted output.
 */
export class ProgressReporter {
  private lastReportTime = 0;
  private reportInterval: number;

  constructor(private tracker: PersistentProgressTracker, reportInterval: number = 5000) {
    this.reportInterval = reportInterval;
  }

  /**
   * Report progress if enough time has passed.
   */
  report(force: boolean = false): void {
    const now = Date.now();

    if (!force && now - this.lastReportTime < this.reportInterval) {
      return;
    }

    this.lastReportTime = now;
    const stats = this.tracker.getStats();

    // Format progress bar
    const barLength = 30;
    const filledLength = Math.round((stats.percentage / 100) * barLength);
    const bar = "█".repeat(filledLength) + "░".repeat(barLength - filledLength);

    console.log(`\n📊 Export Progress: [${bar}] ${stats.percentage.toFixed(1)}%`);
    console.log(`   Processed: ${stats.processed.toLocaleString()} / ${stats.total.toLocaleString()}`);
    console.log(
      `   Rate: ${RateTracker.formatRate(stats.currentRate)} (avg: ${RateTracker.formatRate(stats.avgRate)})`
    );

    if (stats.etaConfidence > 0.3) {
      const etaMinutes = Math.round(stats.eta / 60000);
      const etaHours = Math.floor(etaMinutes / 60);
      const etaRemainingMinutes = etaMinutes % 60;

      if (etaHours > 0) {
        console.log(
          `   ETA: ${etaHours}h ${etaRemainingMinutes}m (${Math.round(stats.etaConfidence * 100)}% confidence)`
        );
      } else {
        console.log(`   ETA: ${etaMinutes}m (${Math.round(stats.etaConfidence * 100)}% confidence)`);
      }
    }

    console.log(`   Section: ${stats.currentSection}`);

    const memMB = stats.memoryUsage.heapUsed / 1024 / 1024;
    console.log(`   Memory: ${memMB.toFixed(1)}MB`);

    if (stats.errors > 0) {
      console.log(`   ⚠️  Errors: ${stats.errors}`);
    }
  }

  /**
   * Report section completion.
   */
  reportSectionComplete(section: string): void {
    const sectionStats = this.tracker.getSectionStats();
    const stats = sectionStats.get(section);

    if (stats) {
      const durationMinutes = Math.round(stats.duration / 60000);
      console.log(`\n✅ Completed: ${section}`);
      console.log(`   Items: ${stats.items.toLocaleString()}`);
      console.log(`   Duration: ${durationMinutes}m`);
      console.log(`   Rate: ${RateTracker.formatRate(stats.rate)}`);
    }
  }

  /**
   * Report final summary.
   */
  reportSummary(): void {
    const stats = this.tracker.getStats();
    const sectionStats = this.tracker.getSectionStats();
    const totalDuration = Date.now() - this.tracker["checkpoint"].startTime;
    const durationMinutes = Math.round(totalDuration / 60000);

    console.log("\n🎉 Export Complete!");
    console.log("═".repeat(50));
    console.log(`Total Items: ${stats.processed.toLocaleString()}`);
    console.log(`Duration: ${durationMinutes}m`);
    console.log(`Average Rate: ${RateTracker.formatRate(stats.avgRate)}`);

    if (stats.errors > 0) {
      console.log(`\n⚠️  Errors: ${stats.errors}`);
      const recentErrors = this.tracker.getRecentErrors(5);
      for (const error of recentErrors) {
        console.log(`   - ${error.operation}: ${error.error}`);
      }
    }

    console.log("\n📊 Section Breakdown:");
    for (const [section, sectionStat] of sectionStats) {
      const minutes = Math.round(sectionStat.duration / 60000);
      console.log(
        `   ${section}: ${sectionStat.items.toLocaleString()} items in ${minutes}m (${RateTracker.formatRate(
          sectionStat.rate
        )})`
      );
    }
  }
}
