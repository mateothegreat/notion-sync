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
import { PropertyItemListResponse, PropertyItemObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import { NotionConfig, RateLimitInfo } from "src/shared/types";
import { ErrorFactory, NotionApiError, RateLimitError } from "../../shared/errors/index";
import { log } from "../log";
import {
  NotionBlock,
  NotionComment,
  NotionDatabase,
  NotionObjectType,
  NotionPage,
  NotionProperty,
  NotionPropertyItem,
  NotionUser,
  NotionWorkspace,
  PropertyItemType
} from "./types";

export interface NotionApiClient {
  getPage(pageId: string): Promise<NotionPage>;
  getDatabase(databaseId: string): Promise<NotionDatabase>;
  getDatabases(): Promise<NotionDatabase[]>;
  queryDatabase(
    databaseId: string,
    options?: any
  ): Promise<{ results: NotionPage[]; hasMore: boolean; nextCursor?: string }>;
  getBlocks(blockId: string): Promise<{ results: NotionBlock[]; hasMore: boolean; nextCursor?: string }>;
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

  async getUsers(): Promise<NotionUser[]> {
    return this.execute("users.list", async () => {
      const response = await this.client.users.list({});
      return response.results.map((user) => this.transformUser(user));
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
      return response.results.map((comment) => this.transformComment(comment));
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
      return this.transformPropertyItem(response);
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
      return response.results.map((block) => this.transformBlock(block));
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

    log.error("Notion API error", { error });

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

  /**
   * Transform a Notion property item response into our internal format.
   *
   * @param {PropertyItemObjectResponse | PropertyItemListResponse} response - The response from Notion API.
   * @returns {NotionPropertyItem} - The transformed property item.
   */
  public transformPropertyItem(response: PropertyItemObjectResponse | PropertyItemListResponse): NotionPropertyItem {
    // Check if response is a list response by looking for the 'results' property
    if ("results" in response && Array.isArray(response.results)) {
      // This is a PropertyItemListResponse
      return {
        id: response.results[0]?.id || response.property_item?.id || "",
        type: response.type as PropertyItemType,
        object: "list",
        results: response.results || [],
        has_more: response.has_more,
        next_cursor: response.next_cursor,
        property_item: response.property_item
          ? {
              id: response.property_item.id,
              type: response.property_item.type as PropertyItemType,
              ...response.property_item
            }
          : undefined
      };
    } else {
      // This is a PropertyItemObjectResponse
      const objectResponse = response as PropertyItemObjectResponse;
      return {
        id: objectResponse.id,
        type: objectResponse.type as PropertyItemType,
        object: "property_item",
        property_item: {
          id: objectResponse.id,
          type: objectResponse.type as PropertyItemType,
          ...objectResponse
        }
      };
    }
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

  private transformUser(notionUser: any): NotionUser {
    return {
      id: notionUser.id,
      type: notionUser.type || "person",
      name: notionUser.name || "",
      avatarUrl: notionUser.avatar_url || "",
      email: notionUser.email
    };
  }

  private transformComment(notionComment: any): NotionComment {
    return {
      id: notionComment.id,
      type: NotionObjectType.COMMENT,
      parent: notionComment.parent,
      rich_text: notionComment.rich_text,
      createdTime: notionComment.created_time,
      lastEditedTime: notionComment.last_edited_time,
      createdBy: notionComment.created_by,
      lastEditedBy: notionComment.last_edited_by
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
