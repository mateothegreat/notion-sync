/**
 * Notion API Client
 *
 * Infrastructure layer for Notion API integration. This client is a plain
 * wrapper around the Notion SDK and does not contain any business logic or
 * control plane components.
 *
 * Key Features:
 * - Full TypeScript support with proper Notion API types
 * - Comprehensive error handling with custom error types
 * - Rate limiting support with retry information
 * - Property item transformation with support for both object and list responses
 * - Logging and debugging capabilities
 */

import { Client } from "@notionhq/client";
import { NotionConfig, RateLimitInfo } from "src/shared/types";
import { RateLimitError } from "../../shared/errors/index";
import { log } from "../log";
import { transformers } from "./transformers";
import {
  NotionBlock,
  NotionComment,
  NotionDatabase,
  NotionPage,
  NotionProperty,
  NotionPropertyItem,
  NotionQueryResult,
  NotionUser,
  NotionWorkspace
} from "./types";

export interface NotionApiClient {
  getPage(pageId: string): Promise<NotionPage>;
  getDatabase(databaseId: string): Promise<NotionDatabase>;
  getDatabases(): Promise<NotionDatabase[]>;
  queryDatabase(databaseId: string, options?: any): Promise<NotionQueryResult<NotionPage>>;
  getBlocks(blockId: string): Promise<NotionBlock[]>;
  getUsers(): Promise<NotionUser[]>;
  search(query: string, options?: any): Promise<any>;
  getRateLimitInfo(): RateLimitInfo | null;
  getComments(blockId: string): Promise<NotionComment[]>;
  getPropertyItem(pageId: string, propertyId: string): Promise<NotionPropertyItem>;
  getWorkspace(): Promise<NotionWorkspace>;
  getDatabaseProperties(databaseId: string): Promise<NotionProperty[]>;
  getPageProperties(pageId: string): Promise<NotionProperty[]>;
  getBlockChildren(blockId: string): Promise<NotionBlock[]>;
}

export class NotionClient implements NotionApiClient {
  private client: Client;
  private rateLimitInfo: RateLimitInfo | null = null;

  constructor(private config: NotionConfig) {
    this.client = new Client({
      auth: config.apiKey,
      baseUrl: config.baseUrl ?? "https://api.notion.com",
      timeoutMs: config.timeout ?? 30000
    });
  }

  async getPage(pageId: string): Promise<NotionPage> {
    return this.execute(`pages.retrieve for ${pageId}`, () =>
      this.client.pages.retrieve({ page_id: pageId }).then((res) => transformers.page(res))
    );
  }

  async getDatabase(databaseId: string): Promise<NotionDatabase> {
    return this.execute(`databases.retrieve for ${databaseId}`, () =>
      this.client.databases.retrieve({ database_id: databaseId }).then((res) => transformers.database(res))
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
      return response.results.map((database) => transformers.database(database));
    });
  }

  async queryDatabase(databaseId: string, options: any = {}): Promise<NotionQueryResult<NotionPage>> {
    return this.execute(`databases.query for ${databaseId}`, async () => {
      const response = await this.client.databases.query({
        database_id: databaseId,
        ...options
      });

      return {
        results: response.results.map((page) => transformers.page(page)),
        hasMore: response.has_more,
        nextCursor: response.next_cursor || undefined
      };
    });
  }

  async getBlocks(blockId: string): Promise<NotionBlock[]> {
    return this.execute(`blocks.children.list for ${blockId}`, async () => {
      const response = await this.client.blocks.children.list({
        block_id: blockId
      });
      return response.results.map((block) => transformers.block(block));
    });
  }

  async getUsers(): Promise<NotionUser[]> {
    return this.execute("users.list", async () => {
      const response = await this.client.users.list({});
      return response.results.map((user) => transformers.user(user));
    });
  }

  async search(query: string, options: any = {}): Promise<any> {
    return this.execute(`notion-client.search(${query})`, () =>
      this.client.search({
        query,
        ...options
      })
    );
  }

  getRateLimitInfo(): RateLimitInfo | null {
    return this.rateLimitInfo;
  }

  /**
   * Get comments for a specific block or page.
   *
   * @param {string} blockId - The ID of the block or page.
   *
   * @returns {Promise<NotionComment[]>} - Array of comments.
   */
  async getComments(blockId: string): Promise<NotionComment[]> {
    return this.execute(`comments.list for ${blockId}`, async () => {
      const response = await this.client.comments.list({ block_id: blockId });
      return response.results.map((comment) => transformers.comment(comment));
    });
  }

  /**
   * Get property item value for a specific page.
   *
   * @param {string} pageId - The ID of the page.
   * @param {string} propertyId - The ID of the property.
   *
   * @returns {Promise<NotionPropertyItem>} - The property value.
   */
  async getPropertyItem(pageId: string, propertyId: string): Promise<NotionPropertyItem> {
    return this.execute(`pages.properties.retrieve for ${pageId}/${propertyId}`, async () => {
      const response = await this.client.pages.properties.retrieve({
        page_id: pageId,
        property_id: propertyId
      });
      return transformers.propertyItem(response);
    });
  }

  /**
   * Get all properties for a specific database.
   *
   * @param {string} databaseId - The ID of the database.
   *
   * @returns {Promise<NotionProperty[]>} - Array of database properties.
   */
  async getDatabaseProperties(databaseId: string): Promise<NotionProperty[]> {
    return this.execute(`databases.properties.retrieve for ${databaseId}`, async () => {
      const database = await this.getDatabase(databaseId);
      return Object.entries(database.properties).map(([name, property]) => ({
        id: property.id,
        name,
        type: property.type,
        ...property
      }));
    });
  }

  /**
   * Get all properties for a specific page.
   *
   * @param {string} pageId - The ID of the page.
   * @returns {Promise<NotionProperty[]>} - Array of page properties.
   */
  async getPageProperties(pageId: string): Promise<NotionProperty[]> {
    return this.execute(`pages.properties.retrieve for ${pageId}`, async () => {
      const page = await this.getPage(pageId);
      return Object.entries(page.properties).map(([name, property]) => ({
        id: property.id,
        name,
        type: property.type,
        ...property
      }));
    });
  }

  /**
   * Get child blocks for a specific block.
   *
   * @param {string} blockId - The ID of the parent block.
   * @returns {Promise<NotionBlock[]>} - Array of child blocks.
   */
  async getBlockChildren(blockId: string): Promise<NotionBlock[]> {
    return this.execute(`blocks.children.list for ${blockId}`, async () => {
      const response = await this.client.blocks.children.list({ block_id: blockId });
      return response.results.map((block) => transformers.block(block));
    });
  }

  /**
   * Get workspace information.
   *
   * @returns {Promise<NotionWorkspace>} - Workspace metadata.
   */
  async getWorkspace(): Promise<NotionWorkspace> {
    return this.execute("workspace.retrieve", async () => {
      const response = await this.client.users.me({});
      // Extract workspace info from user response
      // If user is a bot, use bot owner workspace, otherwise use personal workspace
      const workspaceId = "personal"; // Notion API no longer exposes workspace ID directly
      return {
        id: workspaceId,
        name: response.name || "Personal Workspace",
        owner: response.id,
        createdTime: new Date().toISOString()
      };
    });
  }

  private async execute<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    log.debug(`executing Notion API call`, operation);
    try {
      const result = await fn();
      this.updateRateLimitFromResponse(); // Placeholder for future implementation
      return result;
    } catch (error: any) {
      if (this.isRateLimitError(error)) {
        this.handleRateLimitError(error); // This will throw a RateLimitError
      }
      log.error(`Notion API call failed`, { operation, error: error.message });
      throw transformers.error(error);
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
