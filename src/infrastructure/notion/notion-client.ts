/**
 * Notion API Client
 *
 * Infrastructure layer for Notion API integration. This client is a plain
 * wrapper around the Notion SDK and does not contain any business logic or
 * control plane components.
 */

import { Client } from "@notionhq/client";
import { log } from "../../lib/log";
import { ErrorFactory, NotionApiError, RateLimitError } from "../../shared/errors/index";
import {
  NotionBlock,
  NotionConfig,
  NotionDatabase,
  NotionObjectType,
  NotionPage,
  RateLimitInfo
} from "../../shared/types/index";

export interface NotionApiClient {
  getPage(pageId: string): Promise<NotionPage>;
  getDatabase(databaseId: string): Promise<NotionDatabase>;
  getDatabases(): Promise<NotionDatabase[]>;
  queryDatabase(
    databaseId: string,
    options?: any
  ): Promise<{ results: NotionPage[]; hasMore: boolean; nextCursor?: string }>;
  getBlocks(blockId: string): Promise<{ results: NotionBlock[]; hasMore: boolean; nextCursor?: string }>;
  getUsers(): Promise<any[]>;
  search(query: string, options?: any): Promise<any>;
  getRateLimitInfo(): RateLimitInfo | null;
}

export class NotionClient implements NotionApiClient {
  private client: Client;
  private rateLimitInfo: RateLimitInfo | null = null;

  constructor(private config: NotionConfig) {
    this.client = new Client({
      auth: config.apiKey,
      baseUrl: config.baseUrl,
      timeoutMs: config.timeout
    });
  }

  async getPage(pageId: string): Promise<NotionPage> {
    return this.execute(`pages.retrieve for ${pageId}`, () =>
      this.client.pages.retrieve({ page_id: pageId }).then((res) => this.transformPage(res))
    );
  }

  async getDatabase(databaseId: string): Promise<NotionDatabase> {
    return this.execute(`databases.retrieve for ${databaseId}`, () =>
      this.client.databases.retrieve({ database_id: databaseId }).then((res) => this.transformDatabase(res))
    );
  }

  /**
   * Get all databases.
   *
   * @returns {Promise<NotionDatabase[]>} - All matching databases.
   */
  async getDatabases(query?: string): Promise<NotionDatabase[]> {
    return this.execute(`databases.list`, async () => {
      const response = await this.client.search({
        query,
        filter: {
          property: "object",
          value: "database"
        }
      });
      return response.results.map((database) => this.transformDatabase(database));
    });
  }

  async queryDatabase(
    databaseId: string,
    options: any = {}
  ): Promise<{ results: NotionPage[]; hasMore: boolean; nextCursor?: string }> {
    return this.execute(`databases.query for ${databaseId}`, async () => {
      const response = await this.client.databases.query({
        database_id: databaseId,
        ...options
      });

      return {
        results: response.results.map((page) => this.transformPage(page)),
        hasMore: response.has_more,
        nextCursor: response.next_cursor || undefined
      };
    });
  }

  async getBlocks(blockId: string): Promise<{ results: NotionBlock[]; hasMore: boolean; nextCursor?: string }> {
    return this.execute(`blocks.children.list for ${blockId}`, async () => {
      const response = await this.client.blocks.children.list({
        block_id: blockId
      });

      return {
        results: response.results.map((block) => this.transformBlock(block)),
        hasMore: response.has_more,
        nextCursor: response.next_cursor || undefined
      };
    });
  }

  async getUsers(): Promise<any[]> {
    return this.execute("users.list", async () => {
      const response = await this.client.users.list({});
      return response.results;
    });
  }

  async search(query: string, options: any = {}): Promise<any> {
    return this.execute(`search for "${query}"`, () =>
      this.client.search({
        query,
        ...options
      })
    );
  }

  getRateLimitInfo(): RateLimitInfo | null {
    return this.rateLimitInfo;
  }

  private async execute<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    log.debug(`Executing Notion API call`, { operation });
    try {
      const result = await fn();
      this.updateRateLimitFromResponse(); // Placeholder for future implementation
      return result;
    } catch (error: any) {
      if (this.isRateLimitError(error)) {
        this.handleRateLimitError(error); // This will throw a RateLimitError
      }
      log.error(`Notion API call failed`, { operation, error: error.message });
      throw this.transformError(error);
    }
  }

  private isRateLimitError(error: any): boolean {
    return error?.code === "rate_limited" || error?.status === 429;
  }

  private handleRateLimitError(error: any): void {
    const retryAfter = error.headers?.["retry-after"] ? parseInt(error.headers["retry-after"], 10) : 60;

    this.rateLimitInfo = {
      remaining: 0,
      resetTime: new Date(Date.now() + retryAfter * 1000),
      retryAfter
    };

    throw new RateLimitError(`Rate limit exceeded. Retry after ${retryAfter} seconds.`, retryAfter);
  }

  private transformError(error: any): Error {
    if (this.isRateLimitError(error)) {
      // It should be caught and thrown as RateLimitError before this
      return new RateLimitError("Rate limit exceeded.", 60);
    }

    // Using optional chaining and providing default values to handle cases where error properties are not defined
    const code = error?.code || "UNKNOWN_ERROR";
    switch (code) {
      case "unauthorized":
        return new NotionApiError("Invalid API key or insufficient permissions.", code);
      case "object_not_found":
        return new NotionApiError("Object not found.", code);
      case "validation_error":
        return new NotionApiError("Invalid request parameters.", code);
      case "conflict_error":
        return new NotionApiError("Conflict with current state.", code);
      case "internal_server_error":
        return new NotionApiError("Notion internal server error.", code);
      case "service_unavailable":
        return new NotionApiError("Notion service unavailable.", code);
      case "ECONNRESET":
      case "ENOTFOUND":
      case "ETIMEDOUT":
        return ErrorFactory.fromNetworkError(error);
      default:
        return ErrorFactory.fromNotionError(error);
    }
  }

  private transformPage(notionPage: any): NotionPage {
    return {
      id: notionPage.id,
      type: NotionObjectType.PAGE,
      title: this.extractTitle(notionPage),
      properties: notionPage.properties || {},
      parent: notionPage.parent,
      url: notionPage.url,
      archived: notionPage.archived || false,
      createdTime: notionPage.created_time,
      lastEditedTime: notionPage.last_edited_time,
      createdBy: notionPage.created_by,
      lastEditedBy: notionPage.last_edited_by
    };
  }

  private transformDatabase(notionDatabase: any): NotionDatabase {
    return {
      id: notionDatabase.id,
      type: NotionObjectType.DATABASE,
      title: this.extractTitle(notionDatabase),
      description: this.extractDescription(notionDatabase),
      properties: notionDatabase.properties || {},
      parent: notionDatabase.parent,
      url: notionDatabase.url,
      archived: notionDatabase.archived || false,
      createdTime: notionDatabase.created_time,
      lastEditedTime: notionDatabase.last_edited_time,
      createdBy: notionDatabase.created_by,
      lastEditedBy: notionDatabase.last_edited_by
    };
  }

  private transformBlock(notionBlock: any): NotionBlock {
    return {
      id: notionBlock.id,
      type: NotionObjectType.BLOCK,
      blockType: notionBlock.type,
      hasChildren: notionBlock.has_children || false,
      archived: notionBlock.archived || false,
      content: notionBlock[notionBlock.type] || {},
      createdTime: notionBlock.created_time,
      lastEditedTime: notionBlock.last_edited_time,
      createdBy: notionBlock.created_by,
      lastEditedBy: notionBlock.last_edited_by
    };
  }

  private extractTitle(object: any): string {
    if (object.properties?.title?.title) {
      return object.properties.title.title.map((text: any) => text.plain_text).join("");
    }
    if (object.title && Array.isArray(object.title)) {
      return object.title.map((text: any) => text.plain_text).join("");
    }
    return "Untitled";
  }

  private extractDescription(object: any): string {
    if (object.description && Array.isArray(object.description)) {
      return object.description.map((text: any) => text.plain_text).join("");
    }
    return "";
  }

  private updateRateLimitFromResponse(): void {
    // This is a placeholder. In a real implementation, you would extract
    // rate limit information from the response headers of the Notion API.
    // For now, we'll just clear any existing rate limit info on successful requests
    // if the reset time has passed.
    if (this.rateLimitInfo && this.rateLimitInfo.resetTime < new Date()) {
      this.rateLimitInfo = null;
    }
  }
}
