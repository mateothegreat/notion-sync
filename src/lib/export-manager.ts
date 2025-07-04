import { Client } from "@notionhq/client";
import { createWriteStream, promises as fs, WriteStream } from "fs";
import { join } from "path";
import { AdaptiveRateLimiter, OperationTypeAwareLimiter } from "./export/rate-limiting";
import { streamPaginatedAPI, StreamProcessor } from "./export/streaming";
import { CircuitBreaker } from "./export/util";
import { RetryContext, smartRetryOperation } from "./operations";
import { PersistentProgressTracker, ProgressReporter } from "./progress-tracking";

/**
 * Configuration for export operations.
 */
export interface ExportConfig {
  outputDir: string;
  archived: boolean;
  concurrency: number;
  depth: number;
  comments: boolean;
  rate: number;
  size: number;
  retries: number;
  properties: boolean;
  timeout: number;
  memoryLimit?: number;
  checkpointInterval?: number;
}

/**
 * Operation types for concurrency management.
 */
export type OperationType = "pages" | "blocks" | "databases" | "comments" | "users";

/**
 * High-performance export manager with all performance optimizations.
 * Handles streaming, rate limiting, progress tracking, and error recovery.
 */
export class NotionExportManager {
  private client: Client;
  private config: ExportConfig;
  private rateLimiter: AdaptiveRateLimiter;
  private concurrencyLimiter: OperationTypeAwareLimiter;
  private progressTracker: PersistentProgressTracker;
  private progressReporter: ProgressReporter;
  private circuitBreaker: CircuitBreaker;
  private outputStreams: Map<string, WriteStream> = new Map();
  private exportId: string;
  private isShuttingDown = false;

  constructor(notionToken: string, config: ExportConfig, exportId?: string) {
    this.client = new Client({ auth: notionToken });
    this.config = config;
    this.exportId = exportId || `export-${Date.now()}`;

    // Initialize components
    this.rateLimiter = new AdaptiveRateLimiter();
    this.concurrencyLimiter = new OperationTypeAwareLimiter({
      pages: Math.floor(config.concurrency / 2),
      blocks: config.concurrency,
      databases: Math.floor(config.concurrency / 3),
      comments: Math.floor(config.concurrency * 0.7),
      users: config.concurrency
    });

    this.progressTracker = new PersistentProgressTracker(this.exportId, config.outputDir, config.checkpointInterval);

    this.progressReporter = new ProgressReporter(this.progressTracker);
    this.circuitBreaker = new CircuitBreaker(5, 60000);

    // Setup graceful shutdown
    this.setupGracefulShutdown();
  }

  /**
   * Initialize the export manager.
   *
   * @returns True if resuming from checkpoint, false if new export.
   */
  async initialize(): Promise<boolean> {
    // Ensure output directory exists
    await fs.mkdir(this.config.outputDir, { recursive: true });

    // Initialize progress tracker
    const isResuming = await this.progressTracker.initialize();

    if (isResuming) {
      console.log(`📁 Resuming export: ${this.exportId}`);
      console.log(`   Previous progress: ${this.progressTracker.getStats().processed} items`);
    } else {
      console.log(`🚀 Starting new export: ${this.exportId}`);
    }

    return isResuming;
  }

  /**
   * Export entire workspace with all optimizations.
   */
  async exportWorkspace(): Promise<void> {
    try {
      // Count total items for progress tracking
      if (!this.progressTracker.getMetadata("totalEstimated")) {
        await this.estimateTotalItems();
      }

      // Export sections in order
      const sections = [
        { name: "pages", fn: () => this.exportPages() },
        { name: "databases", fn: () => this.exportDatabases() },
        { name: "users", fn: () => this.exportUsers() }
      ];

      for (const section of sections) {
        if (!this.progressTracker.isSectionCompleted(section.name)) {
          console.log(`\n📋 Exporting ${section.name}...`);
          await section.fn();
          this.progressTracker.completeSection(section.name);
          this.progressReporter.reportSectionComplete(section.name);
        }
      }

      // Finalize export
      await this.finalize();
    } catch (error) {
      console.error("\n❌ Export failed:", error);
      throw error;
    }
  }

  /**
   * Export all pages with streaming and concurrency control.
   */
  private async exportPages(): Promise<void> {
    const section = "pages";
    const outputFile = join(this.config.outputDir, `${section}.jsonl`);
    const stream = this.getOutputStream(outputFile);

    let processedInSection = 0;
    const lastProcessedId = this.progressTracker.getLastProcessedId();
    let resumeMode = !!lastProcessedId;

    // Create page iterator with streaming
    const pages = streamPaginatedAPI(
      (args) => this.makeApiCall(() => this.client.search(args), section),
      {
        filter: { property: "object", value: "page" },
        archived: this.config.archived,
        page_size: this.config.size
      },
      section,
      this.config.size,
      0, // Rate limiting handled separately
      this.config.memoryLimit
    );

    // Process pages with concurrency control
    const processor = new StreamProcessor<any, any>(
      this.config.memoryLimit || 1000,
      this.concurrencyLimiter["limiters"].get(section)?.["maxConcurrent"] || 5
    );

    for await (const processedPage of processor.process(pages, async (page) => {
      // Skip until we reach the resume point
      if (resumeMode) {
        if (page.id === lastProcessedId) {
          resumeMode = false;
        }
        return null;
      }

      // Process page with all its blocks
      return this.concurrencyLimiter.run(
        section,
        async () => {
          const enrichedPage = await this.enrichPage(page);

          // Write to stream
          stream.write(JSON.stringify(enrichedPage) + "\n");

          processedInSection++;
          this.progressTracker.updateProgress(section, processedInSection, page.id);
          this.progressReporter.report();

          return enrichedPage;
        },
        this.config.timeout
      );
    })) {
      // Results are already written to stream
      if (this.isShuttingDown) {
        break;
      }
    }
  }

  /**
   * Export all databases.
   */
  private async exportDatabases(): Promise<void> {
    const section = "databases";
    const outputFile = join(this.config.outputDir, `${section}.jsonl`);
    const stream = this.getOutputStream(outputFile);

    let processedInSection = 0;

    const databases = streamPaginatedAPI(
      (args) => this.makeApiCall(() => this.client.search(args), section),
      {
        filter: { property: "object", value: "database" },
        archived: this.config.archived,
        page_size: this.config.size
      },
      section,
      this.config.size,
      0,
      this.config.memoryLimit
    );

    for await (const database of databases) {
      if (this.isShuttingDown) break;

      await this.concurrencyLimiter.run(
        section,
        async () => {
          const enrichedDatabase = await this.enrichDatabase(database);
          stream.write(JSON.stringify(enrichedDatabase) + "\n");

          processedInSection++;
          this.progressTracker.updateProgress(section, processedInSection, database.id);
          this.progressReporter.report();
        },
        this.config.timeout
      );
    }
  }

  /**
   * Export all users.
   */
  private async exportUsers(): Promise<void> {
    const section = "users";
    const outputFile = join(this.config.outputDir, `${section}.jsonl`);
    const stream = this.getOutputStream(outputFile);

    let processedInSection = 0;

    const users = streamPaginatedAPI(
      (args) => this.makeApiCall(() => this.client.users.list(args), section),
      { page_size: this.config.size },
      section,
      this.config.size,
      0,
      this.config.memoryLimit
    );

    for await (const user of users) {
      if (this.isShuttingDown) break;

      stream.write(JSON.stringify(user) + "\n");

      processedInSection++;
      this.progressTracker.updateProgress(section, processedInSection, user.id);
      this.progressReporter.report();
    }
  }

  /**
   * Enrich page with blocks and comments.
   */
  private async enrichPage(page: any): Promise<any> {
    const enriched = { ...page };

    // Get page blocks
    if (this.config.depth > 0) {
      enriched.blocks = await this.getPageBlocks(page.id);
    }

    // Get page comments
    if (this.config.comments) {
      enriched.comments = await this.getPageComments(page.id);
    }

    return enriched;
  }

  /**
   * Enrich database with its pages.
   */
  private async enrichDatabase(database: any): Promise<any> {
    const enriched = { ...database };

    // Get database pages
    const pages: any[] = [];
    const databasePages = streamPaginatedAPI(
      (args) =>
        this.makeApiCall(
          () =>
            this.client.databases.query({
              database_id: database.id,
              ...args
            }),
          "databases"
        ),
      { page_size: this.config.size },
      "database_pages",
      this.config.size,
      0,
      this.config.memoryLimit
    );

    for await (const page of databasePages) {
      pages.push(page);
    }

    enriched.pages = pages;
    return enriched;
  }

  /**
   * Get all blocks for a page.
   */
  private async getPageBlocks(pageId: string, depth: number = 0): Promise<any[]> {
    if (depth >= this.config.depth) {
      return [];
    }

    const blocks: any[] = [];

    const pageBlocks = streamPaginatedAPI(
      (args) => this.makeApiCall(() => this.client.blocks.children.list({ block_id: pageId, ...args }), "blocks"),
      { page_size: this.config.size },
      "blocks",
      this.config.size,
      0,
      this.config.memoryLimit
    );

    for await (const block of pageBlocks) {
      // Create enriched block as any to allow adding children property
      const enrichedBlock: any = { ...block };

      // Recursively get child blocks
      if ("type" in block && block.has_children) {
        enrichedBlock.children = await this.getPageBlocks(block.id, depth + 1);
      }

      blocks.push(enrichedBlock);
    }

    return blocks;
  }

  /**
   * Get all comments for a page.
   */
  private async getPageComments(pageId: string): Promise<any[]> {
    const comments: any[] = [];

    const pageComments = streamPaginatedAPI(
      (args) => this.makeApiCall(() => this.client.comments.list({ block_id: pageId, ...args }), "comments"),
      { page_size: this.config.size },
      "comments",
      this.config.size,
      0,
      this.config.memoryLimit
    );

    for await (const comment of pageComments) {
      comments.push(comment);
    }

    return comments;
  }

  /**
   * Make API call with rate limiting and retry logic.
   */
  private async makeApiCall<T>(operation: () => Promise<T>, operationType: string): Promise<T> {
    await this.rateLimiter.waitForSlot();

    const context: RetryContext = {
      op: "read",
      circuitBreaker: this.circuitBreaker
    };

    try {
      const result = await smartRetryOperation(
        operation,
        operationType,
        context,
        this.config.retries,
        this.config.rate,
        this.config.timeout
      );

      // Update rate limiter from response headers if available
      if ((result as any).headers) {
        this.rateLimiter.updateFromHeaders((result as any).headers);
      }

      return result;
    } catch (error) {
      this.progressTracker.recordError(operationType, error as Error);
      this.rateLimiter.reportError();
      throw error;
    }
  }

  /**
   * Estimate total items for progress tracking.
   */
  private async estimateTotalItems(): Promise<void> {
    console.log("📊 Estimating total items...");

    let totalEstimate = 0;

    // Estimate pages
    const pageResult = await this.makeApiCall(
      () =>
        this.client.search({
          filter: { property: "object", value: "page" },
          page_size: 1
        }),
      "estimate"
    );

    // Estimate databases
    const dbResult = await this.makeApiCall(
      () =>
        this.client.search({
          filter: { property: "object", value: "database" },
          page_size: 1
        }),
      "estimate"
    );

    // Estimate users
    const userResult = await this.makeApiCall(() => this.client.users.list({ page_size: 1 }), "estimate");

    // Make rough estimates based on first page
    // This is a heuristic - actual counts may vary
    totalEstimate =
      (pageResult as any).results.length * 1000 +
      (dbResult as any).results.length * 100 +
      (userResult as any).results.length * 50;

    this.progressTracker.setTotalEstimate(Math.max(totalEstimate, 100));
    this.progressTracker.setMetadata("totalEstimated", true);
  }

  /**
   * Get or create output stream.
   */
  private getOutputStream(path: string): WriteStream {
    if (!this.outputStreams.has(path)) {
      const stream = createWriteStream(path, {
        flags: "a", // Append mode for resumability
        encoding: "utf8"
      });
      this.outputStreams.set(path, stream);
    }
    return this.outputStreams.get(path)!;
  }

  /**
   * Setup graceful shutdown handlers.
   */
  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      if (this.isShuttingDown) return;

      console.log(`\n📛 Received ${signal}, saving progress...`);
      this.isShuttingDown = true;

      await this.cleanup();
      process.exit(0);
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  }

  /**
   * Cleanup resources.
   */
  private async cleanup(): Promise<void> {
    // Close all output streams
    for (const [path, stream] of this.outputStreams) {
      await new Promise<void>((resolve, reject) => {
        stream.end((error?: Error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
    this.outputStreams.clear();

    // Save final progress
    await this.progressTracker.cleanup();
  }

  /**
   * Finalize export.
   */
  private async finalize(): Promise<void> {
    await this.cleanup();
    this.progressReporter.reportSummary();

    // Remove checkpoint on successful completion
    await this.progressTracker.removeCheckpoint();

    console.log(`\n✅ Export saved to: ${this.config.outputDir}`);
  }

  /**
   * Get export statistics.
   */
  getStats() {
    return {
      progress: this.progressTracker.getStats(),
      rateLimiter: this.rateLimiter.getStats(),
      concurrency: this.concurrencyLimiter.getStats(),
      circuitBreaker: this.circuitBreaker.getState()
    };
  }
}
