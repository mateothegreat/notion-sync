/**
 * Notion API Client
 * 
 * Infrastructure layer for Notion API integration using the control plane
 */

import { Client } from '@notionhq/client';
import { NotionConfig, NotionPage, NotionDatabase, NotionBlock, RateLimitInfo } from '../../shared/types';
import { NotionApiError, RateLimitError, NetworkError, ErrorFactory } from '../../shared/errors';
import { NotionEvents } from '../../core/events';

export interface NotionApiClient {
  getPage(pageId: string): Promise<NotionPage>;
  getDatabase(databaseId: string): Promise<NotionDatabase>;
  queryDatabase(databaseId: string, options?: any): Promise<{ results: NotionPage[]; hasMore: boolean; nextCursor?: string }>;
  getBlocks(blockId: string): Promise<{ results: NotionBlock[]; hasMore: boolean; nextCursor?: string }>;
  getUsers(): Promise<any[]>;
  search(query: string, options?: any): Promise<any>;
  getRateLimitInfo(): RateLimitInfo | null;
}

export class NotionClient implements NotionApiClient {
  private client: Client;
  private rateLimitInfo: RateLimitInfo | null = null;

  constructor(
    private config: NotionConfig,
    private eventPublisher: (event: any) => Promise<void>,
    private circuitBreaker: any
  ) {
    this.client = new Client({
      auth: config.apiKey,
      baseURL: config.baseUrl,
      timeoutMs: config.timeout
    });
  }

  async getPage(pageId: string): Promise<NotionPage> {
    return this.executeWithProtection(
      'getPage',
      async () => {
        const startTime = Date.now();
        
        try {
          const response = await this.client.pages.retrieve({ page_id: pageId });
          const page = this.transformPage(response);
          
          const duration = Date.now() - startTime;
          await this.publishObjectFetched(pageId, 'page', JSON.stringify(response).length, duration);
          
          return page;
        } catch (error) {
          await this.handleApiError(error, 'getPage', pageId);
          throw error;
        }
      }
    );
  }

  async getDatabase(databaseId: string): Promise<NotionDatabase> {
    return this.executeWithProtection(
      'getDatabase',
      async () => {
        const startTime = Date.now();
        
        try {
          const response = await this.client.databases.retrieve({ database_id: databaseId });
          const database = this.transformDatabase(response);
          
          const duration = Date.now() - startTime;
          await this.publishObjectFetched(databaseId, 'database', JSON.stringify(response).length, duration);
          
          return database;
        } catch (error) {
          await this.handleApiError(error, 'getDatabase', databaseId);
          throw error;
        }
      }
    );
  }

  async queryDatabase(
    databaseId: string, 
    options: any = {}
  ): Promise<{ results: NotionPage[]; hasMore: boolean; nextCursor?: string }> {
    return this.executeWithProtection(
      'queryDatabase',
      async () => {
        const startTime = Date.now();
        
        try {
          const response = await this.client.databases.query({
            database_id: databaseId,
            ...options
          });
          
          const results = response.results.map(page => this.transformPage(page));
          const duration = Date.now() - startTime;
          
          // Publish events for each page
          for (const page of results) {
            await this.publishObjectFetched(page.id, 'page', JSON.stringify(page).length, duration / results.length);
          }
          
          return {
            results,
            hasMore: response.has_more,
            nextCursor: response.next_cursor || undefined
          };
        } catch (error) {
          await this.handleApiError(error, 'queryDatabase', databaseId);
          throw error;
        }
      }
    );
  }

  async getBlocks(
    blockId: string
  ): Promise<{ results: NotionBlock[]; hasMore: boolean; nextCursor?: string }> {
    return this.executeWithProtection(
      'getBlocks',
      async () => {
        const startTime = Date.now();
        
        try {
          const response = await this.client.blocks.children.list({
            block_id: blockId
          });
          
          const results = response.results.map(block => this.transformBlock(block));
          const duration = Date.now() - startTime;
          
          // Publish events for each block
          for (const block of results) {
            await this.publishObjectFetched(block.id, 'block', JSON.stringify(block).length, duration / results.length);
          }
          
          return {
            results,
            hasMore: response.has_more,
            nextCursor: response.next_cursor || undefined
          };
        } catch (error) {
          await this.handleApiError(error, 'getBlocks', blockId);
          throw error;
        }
      }
    );
  }

  async getUsers(): Promise<any[]> {
    return this.executeWithProtection(
      'getUsers',
      async () => {
        const startTime = Date.now();
        
        try {
          const response = await this.client.users.list({});
          const duration = Date.now() - startTime;
          
          await this.publishObjectFetched('users', 'users', JSON.stringify(response).length, duration);
          
          return response.results;
        } catch (error) {
          await this.handleApiError(error, 'getUsers', 'users');
          throw error;
        }
      }
    );
  }

  async search(query: string, options: any = {}): Promise<any> {
    return this.executeWithProtection(
      'search',
      async () => {
        const startTime = Date.now();
        
        try {
          const response = await this.client.search({
            query,
            ...options
          });
          
          const duration = Date.now() - startTime;
          await this.publishObjectFetched('search', 'search', JSON.stringify(response).length, duration);
          
          return response;
        } catch (error) {
          await this.handleApiError(error, 'search', query);
          throw error;
        }
      }
    );
  }

  getRateLimitInfo(): RateLimitInfo | null {
    return this.rateLimitInfo;
  }

  private async executeWithProtection<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    return this.circuitBreaker.execute(async () => {
      try {
        const result = await fn();
        this.updateRateLimitFromResponse();
        return result;
      } catch (error) {
        if (this.isRateLimitError(error)) {
          await this.handleRateLimitError(error);
        }
        throw this.transformError(error);
      }
    });
  }

  private transformPage(notionPage: any): NotionPage {
    return {
      id: notionPage.id,
      type: 'page' as any,
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
      type: 'database' as any,
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
      type: 'block' as any,
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
      return object.properties.title.title
        .map((text: any) => text.plain_text)
        .join('');
    }
    
    if (object.title) {
      return object.title
        .map((text: any) => text.plain_text)
        .join('');
    }
    
    return 'Untitled';
  }

  private extractDescription(object: any): string {
    if (object.description) {
      return object.description
        .map((text: any) => text.plain_text)
        .join('');
    }
    
    return '';
  }

  private isRateLimitError(error: any): boolean {
    return error.code === 'rate_limited' || error.status === 429;
  }

  private async handleRateLimitError(error: any): Promise<void> {
    const retryAfter = error.headers?.['retry-after'] ? parseInt(error.headers['retry-after']) : 60;
    
    this.rateLimitInfo = {
      remaining: 0,
      resetTime: new Date(Date.now() + retryAfter * 1000),
      retryAfter
    };

    await this.eventPublisher(
      NotionEvents.rateLimitHit(0, this.rateLimitInfo.resetTime, retryAfter)
    );

    throw new RateLimitError(
      `Rate limit exceeded. Retry after ${retryAfter} seconds`,
      retryAfter
    );
  }

  private async handleApiError(error: any, operation: string, objectId: string): Promise<void> {
    const errorInfo = {
      id: crypto.randomUUID(),
      message: error.message,
      code: error.code || 'UNKNOWN_ERROR',
      timestamp: new Date(),
      context: { operation, objectId, status: error.status }
    };

    await this.eventPublisher(
      NotionEvents.apiError(errorInfo, operation, 1)
    );
  }

  private transformError(error: any): Error {
    if (this.isRateLimitError(error)) {
      return error; // Already handled above
    }

    if (error.code === 'unauthorized') {
      return new NotionApiError('Invalid API key or insufficient permissions', error.code);
    }

    if (error.code === 'object_not_found') {
      return new NotionApiError('Object not found', error.code);
    }

    if (error.code === 'validation_error') {
      return new NotionApiError('Invalid request parameters', error.code);
    }

    if (error.code === 'conflict_error') {
      return new NotionApiError('Conflict with current state', error.code);
    }

    if (error.code === 'internal_server_error') {
      return new NotionApiError('Notion internal server error', error.code);
    }

    if (error.code === 'service_unavailable') {
      return new NotionApiError('Notion service unavailable', error.code);
    }

    // Network errors
    if (error.code === 'ECONNRESET' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
      return ErrorFactory.fromNetworkError(error);
    }

    // Default to NotionApiError
    return ErrorFactory.fromNotionError(error);
  }

  private updateRateLimitFromResponse(): void {
    // In a real implementation, you would extract rate limit info from response headers
    // For now, we'll just clear any existing rate limit info on successful requests
    if (this.rateLimitInfo && this.rateLimitInfo.resetTime < new Date()) {
      this.rateLimitInfo = null;
    }
  }

  private async publishObjectFetched(objectId: string, objectType: string, size: number, duration: number): Promise<void> {
    await this.eventPublisher(
      NotionEvents.objectFetched(objectId, objectType, size, duration)
    );
  }
}