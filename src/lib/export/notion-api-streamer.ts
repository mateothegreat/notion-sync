import { EventEmitter } from "events";
import { OperationTypeAwareLimiter } from "./concurrency-manager";
import { AdaptiveRateLimiter } from "./rate-limiting";
import { streamPaginatedAPI } from "./streaming";
import type { ExportItem } from "./streaming-export-manager";

interface NotionApiStreamerConfig {
  startCursor?: string;
  pageSize: number;
}

interface NotionApiResponse {
  next_cursor: string | null;
  results: any[];
  headers?: Record<string, string>;
}

/**
 * Streams data from Notion API with rate limiting and memory management.
 */
export class NotionApiStreamer extends EventEmitter {
  private notionClient: any;
  private config: NotionApiStreamerConfig;
  private rateLimiter: AdaptiveRateLimiter;
  private operationLimiter: OperationTypeAwareLimiter;
  private apiCallCount: number = 0;
  private isRunning: boolean = false;

  constructor(notionClient: any, config: NotionApiStreamerConfig) {
    super();
    this.notionClient = notionClient;
    this.config = config;

    // Initialize rate limiter with Notion's constraints
    this.rateLimiter = new AdaptiveRateLimiter(100);

    // Initialize operation limiter
    this.operationLimiter = new OperationTypeAwareLimiter({
      pages: 5,
      databases: 3,
      blocks: 15,
      comments: 10,
      users: 20,
      properties: 12
    });
  }

  /**
   * Start streaming data from Notion API.
   */
  async start(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;

    try {
      // Stream pages
      await this.streamPages();

      // Stream databases
      await this.streamDatabases();

      this.emit("end");
    } catch (error) {
      this.emit("error", error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Stop streaming.
   */
  stop(): void {
    this.isRunning = false;
  }

  /**
   * Get API call statistics.
   */
  getStats() {
    return {
      apiCallCount: this.apiCallCount,
      rateLimiterStats: this.rateLimiter.getStats(),
      operationStats: this.operationLimiter.getAllStats()
    };
  }

  private async streamPages(): Promise<void> {
    const listFn = async (args: any): Promise<NotionApiResponse> => {
      await this.rateLimiter.waitForSlot();
      this.apiCallCount++;

      const response = await this.operationLimiter.run({ type: "pages", objectId: "search", operation: "list" }, () =>
        this.notionClient.search({
          ...args,
          filter: { property: "object", value: "page" }
        })
      );

      // Update rate limiter from headers if available
      if (response && typeof response === "object" && "headers" in response) {
        this.rateLimiter.updateFromHeaders(response.headers as Record<string, string>);
      }

      return response as NotionApiResponse;
    };

    const stream = streamPaginatedAPI(
      listFn,
      { start_cursor: this.config.startCursor },
      "pages",
      this.config.pageSize,
      0, // Rate limiting handled by AdaptiveRateLimiter
      1000 // Max memory items
    );

    for await (const page of stream) {
      if (!this.isRunning) break;

      // Get blocks for this page first
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
    }
  }

  private async streamDatabases(): Promise<void> {
    const listFn = async (args: any): Promise<NotionApiResponse> => {
      await this.rateLimiter.waitForSlot();
      this.apiCallCount++;

      const response = await this.operationLimiter.run(
        { type: "databases", objectId: "search", operation: "list" },
        () =>
          this.notionClient.search({
            ...args,
            filter: { property: "object", value: "database" }
          })
      );

      if (response && typeof response === "object" && "headers" in response) {
        this.rateLimiter.updateFromHeaders(response.headers as Record<string, string>);
      }

      return response as NotionApiResponse;
    };

    const stream = streamPaginatedAPI(listFn, { start_cursor: undefined }, "databases", this.config.pageSize, 0, 1000);

    for await (const database of stream) {
      if (!this.isRunning) break;

      const exportItem: ExportItem = {
        id: database.id,
        type: "database",
        data: database,
        timestamp: new Date()
      };

      this.emit("data", exportItem);
    }
  }

  private async getBlocksForPage(pageId: string): Promise<any[]> {
    const listFn = async (args: any): Promise<NotionApiResponse> => {
      await this.rateLimiter.waitForSlot();
      this.apiCallCount++;

      const response = await this.operationLimiter.run(
        { type: "blocks", objectId: pageId, operation: "children" },
        () =>
          this.notionClient.blocks.children.list({
            block_id: pageId,
            ...args
          })
      );

      if (response && typeof response === "object" && "headers" in response) {
        this.rateLimiter.updateFromHeaders(response.headers as Record<string, string>);
      }

      return response as NotionApiResponse;
    };

    const stream = streamPaginatedAPI(
      listFn,
      { start_cursor: undefined },
      `blocks-${pageId}`,
      Math.min(this.config.pageSize, 100), // Notion limits blocks to 100 per request
      0,
      500 // Lower memory limit for blocks
    );

    const blocks: any[] = [];
    for await (const block of stream) {
      if (!this.isRunning) break;
      blocks.push(block);
    }

    return blocks;
  }
}
