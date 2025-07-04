import type { ExportCheckpoint } from "../progress-tracking";
import { PersistentProgressTracker } from "../progress-tracking";
import { NotionApiStreamer } from "./notion-api-streamer";
import { StreamProcessor } from "./stream-processor";
import { BoundedQueue } from "./streaming";

export interface StreamingExportConfig {
  maxMemoryMB: number;
  chunkSize: number;
  concurrency: number;
  format: "json" | "markdown" | "csv";
  outputPath: string;
}

export interface ExportItem {
  id: string;
  type: "page" | "database" | "block";
  data: any;
  timestamp: Date;
}

/**
 * Manages streaming export operations with bounded memory usage.
 * Ensures constant memory consumption regardless of workspace size.
 */
export class StreamingExportManager {
  private readonly config: Required<StreamingExportConfig>;
  private readonly boundedQueue: BoundedQueue<ExportItem>;
  private readonly streamProcessor: StreamProcessor;
  private readonly progressTracker: PersistentProgressTracker;
  private isRunning: boolean = false;
  private notionClient: any; // Will be injected

  constructor(
    exportId: string,
    outputPath: string,
    maxMemoryBytes: number = 256 * 1024 * 1024, // 256MB default
    checkpointInterval: number = 30000, // 30s default
    customConcurrency?: Partial<Record<string, number>>,
    format: "json" | "markdown" | "csv" = "json"
  ) {
    this.config = {
      maxMemoryMB: maxMemoryBytes / (1024 * 1024),
      chunkSize: 1000,
      concurrency: customConcurrency?.default || 4,
      format,
      outputPath
    };

    this.boundedQueue = new BoundedQueue<ExportItem>(this.config.chunkSize * 2);
    this.streamProcessor = new StreamProcessor(this.config);
    this.progressTracker = new PersistentProgressTracker(exportId, outputPath, checkpointInterval);
  }

  /**
   * Initialize the export manager.
   * @returns True if resuming from checkpoint, false if new export
   */
  async initialize(): Promise<boolean> {
    return await this.progressTracker.initialize();
  }

  /**
   * Starts the streaming export process with resumability support.
   * @param notionClient Notion API client instance
   * @returns Promise that resolves when export completes or fails
   */
  async startExport(notionClient: any): Promise<void> {
    if (this.isRunning) {
      throw new Error("Export already in progress");
    }

    this.notionClient = notionClient;
    this.isRunning = true;

    try {
      const checkpoint = await this.loadCheckpoint();
      const startCursor = checkpoint?.lastProcessedId;

      await this.executeStreamingExport(startCursor);
      await this.progressTracker.cleanup();
    } catch (error) {
      this.progressTracker.recordError("export-failed", error instanceof Error ? error : new Error(String(error)));
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Pauses the current export operation, saving checkpoint.
   */
  pauseExport(): void {
    this.isRunning = false;
    this.streamProcessor.pause();
  }

  /**
   * Resumes a paused export operation from last checkpoint.
   */
  async resumeExport(notionClient: any): Promise<void> {
    const checkpoint = await this.loadCheckpoint();
    if (!checkpoint) {
      throw new Error("No resumable export found");
    }

    await this.startExport(notionClient);
  }

  /**
   * Finalizes the export, removing checkpoint if successful.
   */
  async finalize(): Promise<void> {
    await this.progressTracker.cleanup();
    await this.progressTracker.removeCheckpoint();
  }

  /**
   * Gets current progress information.
   */
  getProgress() {
    return {
      ...this.progressTracker.getStats(),
      memoryUsage: process.memoryUsage(),
      concurrencyStats: this.streamProcessor.getStats(),
      analytics: {
        totalApiCalls: 0, // Would be tracked by API streamer
        totalErrors: this.progressTracker.getRecentErrors().length
      }
    };
  }

  /**
   * Stream and export items with bounded memory.
   */
  async *streamExportItems<T>(
    source: AsyncIterable<T>,
    transformer: (item: T) => ExportItem,
    section: string,
    operationType: string
  ): AsyncGenerator<ExportItem, void, unknown> {
    let processedInSection = 0;

    for await (const item of source) {
      const exportItem = transformer(item);
      await this.boundedQueue.enqueue(exportItem);

      processedInSection++;
      this.progressTracker.updateProgress(section, processedInSection, exportItem.id);

      // Process from queue
      while (!this.boundedQueue.isEmpty()) {
        const queuedItem = await this.boundedQueue.dequeue();
        if (queuedItem) {
          yield queuedItem;
        }
      }
    }

    // Drain remaining items
    while (!this.boundedQueue.isEmpty()) {
      const item = await this.boundedQueue.dequeue();
      if (item) {
        yield item;
      }
    }

    this.progressTracker.completeSection(section);
  }

  private async executeStreamingExport(startCursor?: string): Promise<void> {
    const totalItems = await this.estimateWorkspaceSize();
    this.progressTracker.setTotalEstimate(totalItems);

    // Create parallel processing streams
    const [producer, consumer] = await Promise.all([this.startDataProducer(startCursor), this.startDataConsumer()]);

    await Promise.all([producer, consumer]);
  }

  private async startDataProducer(startCursor?: string): Promise<void> {
    const apiStreamer = new NotionApiStreamer(this.notionClient, {
      startCursor,
      pageSize: this.config.chunkSize
    });

    return new Promise((resolve, reject) => {
      apiStreamer.on("data", async (item: ExportItem) => {
        try {
          await this.boundedQueue.enqueue(item);
        } catch (error) {
          reject(error);
        }
      });

      apiStreamer.on("end", resolve);
      apiStreamer.on("error", reject);

      apiStreamer.start();
    });
  }

  private async startDataConsumer(): Promise<void> {
    const consumers = Array.from({ length: this.config.concurrency }, () => this.createConsumerWorker());

    await Promise.all(consumers);
  }

  private async createConsumerWorker(): Promise<void> {
    while (this.isRunning) {
      try {
        const item = await this.boundedQueue.dequeue();
        if (!item) break;

        await this.streamProcessor.processItem(item);
        this.progressTracker.updateProgress(item.type, this.progressTracker.getStats().processed + 1);
      } catch (error) {
        if (error instanceof Error && error.message === "Queue is closed") {
          break;
        }
        throw error;
      }
    }
  }

  private async loadCheckpoint(): Promise<ExportCheckpoint | null> {
    return await this.progressTracker.loadCheckpoint();
  }

  private async estimateWorkspaceSize(): Promise<number> {
    // This would be implemented to query Notion API for workspace size
    // For now, return a placeholder
    return 0;
  }
}
