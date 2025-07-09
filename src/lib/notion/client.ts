/**
 * RxJS-based Notion API Client
 *
 * Infrastructure layer for Notion API integration using RxJS Observables
 * for reactive state management and asynchronous operations.
 *
 * Key Features:
 * - Full TypeScript support with proper Notion API types
 * - Reactive streams with RxJS Observables
 * - Comprehensive error handling with custom error types
 * - Rate limiting support with retry information
 * - Property item transformation with support for both object and list responses
 * - Caching with BehaviorSubjects for real-time updates
 * - Parallel processing capabilities
 * - Logging and debugging capabilities
 */

import { log } from "$util/log";
import { Client } from "@notionhq/client";
import { QueryDatabaseParameters, SearchParameters } from "@notionhq/client/build/src/api-endpoints";
import { BehaviorSubject, Observable, Subject, defer, forkJoin, from, merge, of, throwError } from "rxjs";
import {
  bufferCount,
  catchError,
  debounceTime,
  distinctUntilChanged,
  filter,
  map,
  retry,
  shareReplay,
  switchMap,
  takeUntil,
  tap,
  throttleTime,
  timeout
} from "rxjs/operators";
import { transformers } from "./transformers";
import {
  NotionBlock,
  NotionComment,
  NotionDatabase,
  NotionFilteredSearchResult,
  NotionPage,
  NotionProperty,
  NotionPropertyItem,
  NotionQueryResult,
  NotionSearchEvent,
  NotionSearchEventConfig,
  NotionSearchResponse,
  NotionUser,
  NotionWorkspace
} from "./types";

export interface NotionApiClient {
  // Core API methods
  getPage(pageId: string): Observable<NotionPage>;
  getDatabase(databaseId: string): Observable<NotionDatabase>;
  getDatabases(query?: string): Observable<NotionDatabase[]>;
  queryDatabase(params: QueryDatabaseParameters): Observable<NotionQueryResult<NotionPage>>;
  getBlocks(blockId: string): Observable<NotionBlock[]>;
  getUsers(): Observable<NotionUser[]>;
  search<T extends SearchParameters>(params: T): Observable<NotionSearchResponse<T>>;
  getComments(blockId: string): Observable<NotionComment[]>;
  getPropertyItem(pageId: string, propertyId: string): Observable<NotionPropertyItem>;
  getWorkspace(): Observable<NotionWorkspace>;
  getDatabaseProperties(databaseId: string): Observable<NotionProperty[]>;
  getPageProperties(pageId: string): Observable<NotionProperty[]>;
  getBlockChildren(blockId: string): Observable<NotionBlock[]>;

  // Batch operations for parallelism.
  getPages(pageIds: string[]): Observable<NotionPage[]>;
  getDatabasesById(databaseIds: string[]): Observable<NotionDatabase[]>;
  getMultipleBlocks(blockIds: string[]): Observable<NotionBlock[][]>;

  // Streaming operations.
  searchAll<T extends SearchParameters>(params: T): Observable<NotionFilteredSearchResult<T>>;
  queryDatabaseAll(params: QueryDatabaseParameters): Observable<NotionPage>;
  getAllBlocks(blockId: string): Observable<NotionBlock>;

  // Event dispatching.
  searchEvents$<T extends SearchParameters>(
    params: T,
    config?: NotionSearchEventConfig
  ): Observable<NotionSearchEvent<T>>;

  // TODO: Real-time subscriptions.
  // pageUpdates$(pageId: string): Observable<NotionPage>;
  // databaseUpdates$(databaseId: string): Observable<NotionDatabase>;
  // rateLimitUpdates$(): Observable<RateLimitInfo>;
  // Utility methods.
  // getRateLimitInfo(): RateLimitInfo | null;

  clearCache(): void;
  destroy(): void;

  // Namespaced API methods.
  readonly pages: {
    retrieve: (pageId: string) => Observable<NotionPage>;
    retrieveMany: (pageIds: string[]) => Observable<NotionPage[]>;
    properties: {
      retrieve: (pageId: string, propertyId: string) => Observable<NotionPropertyItem>;
      list: (pageId: string) => Observable<NotionProperty[]>;
    };
    blocks: {
      children: {
        list: (blockId: string) => Observable<NotionBlock[]>;
        listAll: (blockId: string) => Observable<NotionBlock>;
      };
    };
    comments: {
      list: (blockId: string) => Observable<NotionComment[]>;
    };
  };

  readonly databases: {
    retrieve: (databaseId: string) => Observable<NotionDatabase>;
    retrieveMany: (databaseIds: string[]) => Observable<NotionDatabase[]>;
    search: (query?: string) => Observable<NotionDatabase[]>;
    query: (params: QueryDatabaseParameters) => Observable<NotionQueryResult<NotionPage>>;
    queryAll: (params: QueryDatabaseParameters) => Observable<NotionPage>;
    properties: {
      list: (databaseId: string) => Observable<NotionProperty[]>;
    };
  };

  readonly blocks: {
    children: {
      list: (blockId: string) => Observable<NotionBlock[]>;
      listAll: (blockId: string) => Observable<NotionBlock>;
    };
  };

  readonly users: {
    list: () => Observable<NotionUser[]>;
    me: () => Observable<NotionUser>;
  };

  readonly workspace: {
    retrieve: () => Observable<NotionWorkspace>;
  };
}

export type NotionClientConfig = {
  apiKey: string;
  apiVersion?: string;
  baseUrl?: string;
  timeout?: number;
};

export class NotionClient implements NotionApiClient {
  private client: Client;
  // private rateLimitInfo: RateLimitInfo | null = null;
  // private rateLimitSubject = new BehaviorSubject<RateLimitInfo | null>(null);
  private destroy$ = new Subject<void>();

  // Event dispatching subjects.
  private searchEventSubjects = new Map<string, Subject<NotionSearchEvent<any>>>();

  // Cache subjects for real-time updates.
  private pageCache = new Map<string, BehaviorSubject<NotionPage | null>>();
  private databaseCache = new Map<string, BehaviorSubject<NotionDatabase | null>>();
  private blockCache = new Map<string, BehaviorSubject<NotionBlock[] | null>>();
  private userCache = new BehaviorSubject<NotionUser[] | null>(null);
  private workspaceCache = new BehaviorSubject<NotionWorkspace | null>(null);

  // Shared observables for frequently accessed data.
  private sharedUsers$: Observable<NotionUser[]>;
  private sharedWorkspace$: Observable<NotionWorkspace>;

  constructor(private config: NotionClientConfig) {
    this.client = new Client({
      auth: config.apiKey,
      baseUrl: config.baseUrl ?? "https://api.notion.com",
      timeoutMs: config.timeout ?? 30000
    });

    // Initialize shared observables.
    this.sharedUsers$ = this.createSharedUsers();
    this.sharedWorkspace$ = this.createSharedWorkspace();
  }

  // Core API methods.
  getPage(pageId: string): Observable<NotionPage> {
    return this.pages.retrieve(pageId);
  }

  getDatabase(databaseId: string): Observable<NotionDatabase> {
    return this.databases.retrieve(databaseId);
  }

  getDatabases(query?: string): Observable<NotionDatabase[]> {
    return this.databases.search(query);
  }

  queryDatabase(params: QueryDatabaseParameters): Observable<NotionQueryResult<NotionPage>> {
    return this.databases.query(params);
  }

  getBlocks(blockId: string): Observable<NotionBlock[]> {
    return this.blocks.children.list(blockId);
  }

  getUsers(): Observable<NotionUser[]> {
    return this.users.list();
  }

  search<T extends SearchParameters>(params: T): Observable<NotionSearchResponse<T>> {
    return this.execute(`search(${JSON.stringify(params)})`, () => this.client.search(params)).pipe(
      map((response) => {
        const results = response.results.map((result: any) => {
          if (result.object === "page") {
            return result as NotionFilteredSearchResult<T>;
          } else if (result.object === "database") {
            return result as NotionFilteredSearchResult<T>;
          } else {
            throw new Error(`Unsupported object type: ${result.object}`, { cause: result });
          }
        });
        return {
          results,
          hasMore: response.has_more,
          nextCursor: response.next_cursor || undefined,
          pageInfo: {
            currentPage: 1,
            pageSize: params.page_size || 10
          }
        };
      })
    );
  }

  getComments(blockId: string): Observable<NotionComment[]> {
    return this.pages.comments.list(blockId);
  }

  getPropertyItem(pageId: string, propertyId: string): Observable<NotionPropertyItem> {
    return this.pages.properties.retrieve(pageId, propertyId);
  }

  getWorkspace(): Observable<NotionWorkspace> {
    return this.workspace.retrieve();
  }

  getDatabaseProperties(databaseId: string): Observable<NotionProperty[]> {
    return this.databases.properties.list(databaseId);
  }

  getPageProperties(pageId: string): Observable<NotionProperty[]> {
    return this.pages.properties.list(pageId);
  }

  getBlockChildren(blockId: string): Observable<NotionBlock[]> {
    return this.blocks.children.list(blockId);
  }

  // Batch operations for parallelism.
  getPages(pageIds: string[]): Observable<NotionPage[]> {
    return this.pages.retrieveMany(pageIds);
  }

  getDatabasesById(databaseIds: string[]): Observable<NotionDatabase[]> {
    return this.databases.retrieveMany(databaseIds);
  }

  getMultipleBlocks(blockIds: string[]): Observable<NotionBlock[][]> {
    return forkJoin(blockIds.map((blockId) => this.getBlocks(blockId)));
  }

  // Streaming operations.
  searchAll<T extends SearchParameters>(params: T): Observable<NotionFilteredSearchResult<T>> {
    return this.createPaginatedStream(
      (cursor?: string) => this.search({ ...params, start_cursor: cursor }),
      (response) => response.results,
      (response) => response.hasMore,
      (response) => response.nextCursor
    );
  }

  queryDatabaseAll(params: QueryDatabaseParameters): Observable<NotionPage> {
    return this.databases.queryAll(params);
  }

  getAllBlocks(blockId: string): Observable<NotionBlock> {
    return this.blocks.children.listAll(blockId);
  }

  // Event dispatching.
  searchEvents$<T extends SearchParameters>(
    params: T,
    config: NotionSearchEventConfig = {}
  ): Observable<NotionSearchEvent<T>> {
    const searchKey = JSON.stringify(params);

    if (!this.searchEventSubjects.has(searchKey)) {
      const subject = new Subject<NotionSearchEvent<T>>();
      this.searchEventSubjects.set(searchKey, subject);

      // Start the search operation in the background.
      this.executeSearchWithEvents(params, config, subject);
    }

    const eventStream = this.searchEventSubjects.get(searchKey)!.asObservable();

    // Apply throttling if configured.
    if (config.throttleMs) {
      return eventStream.pipe(throttleTime(config.throttleMs), takeUntil(this.destroy$));
    }

    // Apply batching if configured.
    if (config.batchSize) {
      return eventStream.pipe(
        filter((event) => event.type === "result"), // Only batch result events
        bufferCount(config.batchSize),
        map((events) => {
          const batchedData: NotionFilteredSearchResult<T>[] = [];
          events.forEach((event) => {
            if (Array.isArray(event.data)) {
              batchedData.push(...(event.data as NotionFilteredSearchResult<T>[]));
            } else {
              batchedData.push(event.data as NotionFilteredSearchResult<T>);
            }
          });

          return {
            type: "result" as const,
            data: batchedData,
            metadata: {
              pageNumber: events[events.length - 1]?.metadata.pageNumber || 1,
              totalResults: batchedData.length,
              hasMore: events[events.length - 1]?.metadata.hasMore || false,
              cursor: events[events.length - 1]?.metadata.cursor,
              timestamp: new Date()
            }
          };
        }),
        takeUntil(this.destroy$)
      );
    }

    return eventStream.pipe(takeUntil(this.destroy$));
  }

  /**
   * Executes a search operation with event dispatching.
   *
   * @param params - The search parameters.
   * @param config - Event dispatching configuration.
   * @param subject - The subject to emit events to.
   */
  private executeSearchWithEvents<T extends SearchParameters>(
    params: T,
    config: NotionSearchEventConfig,
    subject: Subject<NotionSearchEvent<T>>
  ): void {
    let pageNumber = 1;
    let totalResults = 0;
    let cursor: string | undefined;

    const fetchNextPage = () => {
      const searchParams = { ...params, start_cursor: cursor };

      this.search(searchParams)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (response) => {
            // Emit individual result events.
            response.results.forEach((result) => {
              subject.next({
                type: "result",
                data: result,
                metadata: {
                  pageNumber,
                  totalResults: ++totalResults,
                  hasMore: response.hasMore,
                  cursor: response.nextCursor,
                  timestamp: new Date()
                }
              });
            });

            // Emit page complete event.
            subject.next({
              type: "page_complete",
              data: response.results,
              metadata: {
                pageNumber,
                totalResults,
                hasMore: response.hasMore,
                cursor: response.nextCursor,
                timestamp: new Date()
              }
            });

            // Continue pagination if there are more results.
            if (response.hasMore && response.nextCursor) {
              cursor = response.nextCursor;
              pageNumber++;
              fetchNextPage();
            } else {
              // Emit search complete event.
              subject.next({
                type: "search_complete",
                data: [],
                metadata: {
                  pageNumber,
                  totalResults,
                  hasMore: false,
                  cursor: undefined,
                  timestamp: new Date()
                }
              });
              subject.complete();
            }
          },
          error: (error) => {
            subject.next({
              type: "error",
              data: error,
              metadata: {
                pageNumber,
                totalResults,
                hasMore: false,
                cursor,
                timestamp: new Date()
              }
            });
            subject.error(error);
          }
        });
    };

    fetchNextPage();
  }

  // Real-time subscriptions.
  pageUpdates$(pageId: string): Observable<NotionPage> {
    if (!this.pageCache.has(pageId)) {
      this.pageCache.set(pageId, new BehaviorSubject<NotionPage | null>(null));
      // Load initial data.
      this.getPage(pageId).subscribe((page) => {
        this.pageCache.get(pageId)?.next(page);
      });
    }

    return this.pageCache
      .get(pageId)!
      .asObservable()
      .pipe(
        filter((page): page is NotionPage => page !== null),
        distinctUntilChanged(),
        takeUntil(this.destroy$)
      );
  }

  databaseUpdates$(databaseId: string): Observable<NotionDatabase> {
    if (!this.databaseCache.has(databaseId)) {
      this.databaseCache.set(databaseId, new BehaviorSubject<NotionDatabase | null>(null));
      // Load initial data.
      this.getDatabase(databaseId).subscribe((database) => {
        this.databaseCache.get(databaseId)?.next(database);
      });
    }

    return this.databaseCache
      .get(databaseId)!
      .asObservable()
      .pipe(
        filter((database): database is NotionDatabase => database !== null),
        distinctUntilChanged(),
        takeUntil(this.destroy$)
      );
  }

  // rateLimitUpdates$(): Observable<RateLimitInfo> {
  //   return this.rateLimitSubject.asObservable().pipe(
  //     filter((info): info is RateLimitInfo => info !== null),
  //     distinctUntilChanged(),
  //     takeUntil(this.destroy$)
  //   );
  // }

  // // Utility methods.
  // getRateLimitInfo(): RateLimitInfo | null {
  //   return this.rateLimitInfo;
  // }

  clearCache(): void {
    this.pageCache.forEach((subject) => subject.next(null));
    this.databaseCache.forEach((subject) => subject.next(null));
    this.blockCache.forEach((subject) => subject.next(null));
    this.userCache.next(null);
    this.workspaceCache.next(null);
  }

  //
  destroy(): void {
    this.destroy$.next();
    this.destroy$.complete();

    // Complete all cache subjects.
    this.pageCache.forEach((subject) => subject.complete());
    this.pageCache.clear();

    this.databaseCache.forEach((subject) => subject.complete());
    this.databaseCache.clear();

    this.blockCache.forEach((subject) => subject.complete());
    this.blockCache.clear();

    // Complete all search event subjects.
    this.searchEventSubjects.forEach((subject) => subject.complete());
    this.searchEventSubjects.clear();

    this.userCache.complete();
    this.workspaceCache.complete();
    // this.rateLimitSubject.complete();
  }

  // Namespaced API methods.
  readonly pages = {
    retrieve: (pageId: string): Observable<NotionPage> => {
      return this.execute(`pages.retrieve(${pageId})`, () =>
        this.client.pages.retrieve({ page_id: pageId }).then((res) => transformers.page(res))
      ).pipe(
        tap((page) => {
          // Update cache.
          if (this.pageCache.has(pageId)) {
            this.pageCache.get(pageId)!.next(page);
          }
        })
      );
    },

    retrieveMany: (pageIds: string[]): Observable<NotionPage[]> => {
      return forkJoin(pageIds.map((pageId) => this.pages.retrieve(pageId)));
    },

    properties: {
      retrieve: (pageId: string, propertyId: string): Observable<NotionPropertyItem> => {
        return this.execute(`pages.properties.retrieve(${pageId}, ${propertyId})`, () =>
          this.client.pages.properties
            .retrieve({ page_id: pageId, property_id: propertyId })
            .then((res) => transformers.propertyItem(res))
        );
      },

      list: (pageId: string): Observable<NotionProperty[]> => {
        return this.pages.retrieve(pageId).pipe(
          map((page) => {
            if (!page.properties) return [];
            return Object.entries(page.properties).map(([name, property]: [string, any]) => ({
              id: property.id,
              name,
              type: property.type,
              ...property
            }));
          })
        );
      }
    },

    blocks: {
      children: {
        list: (blockId: string): Observable<NotionBlock[]> => {
          return this.blocks.children.list(blockId);
        },

        listAll: (blockId: string): Observable<NotionBlock> => {
          return this.blocks.children.listAll(blockId);
        }
      }
    },

    comments: {
      list: (blockId: string): Observable<NotionComment[]> => {
        return this.execute(`comments.list(${blockId})`, () =>
          this.client.comments
            .list({ block_id: blockId })
            .then((res) => res.results.map((comment) => transformers.comment(comment)))
        );
      }
    }
  };

  readonly databases = {
    retrieve: (databaseId: string): Observable<NotionDatabase> => {
      return this.execute(`databases.retrieve(${databaseId})`, () =>
        this.client.databases.retrieve({ database_id: databaseId }).then((res) => transformers.database(res))
      ).pipe(
        tap((database) => {
          // Update cache.
          if (this.databaseCache.has(databaseId)) {
            this.databaseCache.get(databaseId)!.next(database);
          }
        })
      );
    },

    retrieveMany: (databaseIds: string[]): Observable<NotionDatabase[]> => {
      return forkJoin(databaseIds.map((databaseId) => this.databases.retrieve(databaseId)));
    },

    search: (query?: string): Observable<NotionDatabase[]> => {
      return this.execute(`databases.search(${query})`, () =>
        this.client
          .search({
            query,
            filter: { property: "object", value: "database" }
          })
          .then((res) => res.results.map((result) => transformers.database(result)))
      );
    },

    query: (params: QueryDatabaseParameters): Observable<NotionQueryResult<NotionPage>> => {
      return this.execute(`databases.query(${params.database_id})`, () =>
        this.client.databases.query(params).then((res) => ({
          results: res.results.map((page) => transformers.page(page)),
          hasMore: res.has_more,
          nextCursor: res.next_cursor || undefined
        }))
      );
    },

    queryAll: (params: QueryDatabaseParameters): Observable<NotionPage> => {
      return this.createPaginatedStream(
        (cursor?: string) => this.databases.query({ ...params, start_cursor: cursor }),
        (response) => response.results,
        (response) => response.hasMore,
        (response) => response.nextCursor
      );
    },

    properties: {
      list: (databaseId: string): Observable<NotionProperty[]> => {
        return this.databases.retrieve(databaseId).pipe(
          map((database) =>
            Object.entries(database.properties).map(([name, property]: [string, any]) => ({
              id: property.id,
              name,
              type: property.type,
              ...property
            }))
          )
        );
      }
    }
  };

  readonly blocks = {
    children: {
      list: (blockId: string): Observable<NotionBlock[]> => {
        return this.execute(`blocks.children.list(${blockId})`, () =>
          this.client.blocks.children
            .list({ block_id: blockId })
            .then((res) => res.results.map((block) => transformers.block(block)))
        ).pipe(
          tap((blocks) => {
            // Update cache.
            if (this.blockCache.has(blockId)) {
              this.blockCache.get(blockId)!.next(blocks);
            }
          })
        );
      },

      listAll: (blockId: string): Observable<NotionBlock> => {
        return this.createPaginatedStream(
          (cursor?: string) =>
            this.execute(`blocks.children.list(${blockId}, ${cursor})`, () =>
              this.client.blocks.children
                .list({
                  block_id: blockId,
                  start_cursor: cursor || undefined
                })
                .then((res) => ({
                  results: res.results.map((block) => transformers.block(block)),
                  hasMore: res.has_more,
                  nextCursor: res.next_cursor || undefined
                }))
            ),
          (response) => response.results,
          (response) => response.hasMore,
          (response) => response.nextCursor
        );
      }
    }
  };

  readonly users = {
    list: (): Observable<NotionUser[]> => {
      return this.sharedUsers$;
    },

    me: (): Observable<NotionUser> => {
      return this.execute(`users.me()`, () => this.client.users.me({}).then((res) => transformers.user(res)));
    }
  };

  readonly workspace = {
    retrieve: (): Observable<NotionWorkspace> => {
      return this.sharedWorkspace$;
    }
  };

  // Private helper methods.
  private createSharedUsers(): Observable<NotionUser[]> {
    return this.execute(`users.list()`, () =>
      this.client.users.list({}).then((res) => res.results.map((user) => transformers.user(user)))
    ).pipe(
      tap((users) => this.userCache.next(users)),
      shareReplay(1),
      takeUntil(this.destroy$)
    );
  }

  private createSharedWorkspace(): Observable<NotionWorkspace> {
    return this.execute(`workspace.retrieve()`, () =>
      this.client.users.me({}).then((res) => ({
        id: "personal",
        name: res.name || "Personal Workspace",
        owner: res.id,
        createdTime: new Date().toString()
      }))
    ).pipe(
      tap((workspace) => this.workspaceCache.next(workspace)),
      shareReplay(1),
      takeUntil(this.destroy$)
    );
  }

  private createPaginatedStream<T, R>(
    fetcher: (cursor?: string) => Observable<{ results: R[]; hasMore: boolean; nextCursor?: string }>,
    resultExtractor: (response: { results: R[]; hasMore: boolean; nextCursor?: string }) => R[],
    hasMoreExtractor: (response: { results: R[]; hasMore: boolean; nextCursor?: string }) => boolean,
    nextCursorExtractor: (response: { results: R[]; hasMore: boolean; nextCursor?: string }) => string | undefined
  ): Observable<R> {
    return defer(() => {
      let cursor: string | undefined;

      const fetchNext = (): Observable<R> => {
        return fetcher(cursor).pipe(
          switchMap((response) => {
            const results = resultExtractor(response);
            const hasMore = hasMoreExtractor(response);
            cursor = nextCursorExtractor(response);

            if (hasMore && cursor) {
              return merge(from(results), fetchNext());
            } else {
              return from(results);
            }
          })
        );
      };

      return fetchNext();
    });
  }

  private execute<T>(operation: string, fn: () => Promise<T>): Observable<T> {
    log.debug(`Executing Notion API call: ${operation}`);

    return defer(fn).pipe(
      timeout(this.config.timeout || 30000),
      retry({
        // count: this.config.retryAttempts || 3,
        delay: (error, retryCount) => {
          if (this.isRateLimitError(error)) {
            const retryAfter = this.extractRetryAfter(error);
            log.debug(`Rate limit hit, retrying after ${retryAfter}s (attempt ${retryCount})`);
            return of(null).pipe(debounceTime(retryAfter * 1000));
          }

          // Exponential backoff for other errors.
          const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 10000);
          log.debug(`Retrying ${operation} after ${delay}ms (attempt ${retryCount})`);
          return of(null).pipe(debounceTime(delay));
        }
      }),
      // tap(() => this.updateRateLimitFromResponse()),
      catchError((error: any) => {
        if (this.isRateLimitError(error)) {
          // return this.handleRateLimitError(error);
        }

        log.error(`Notion API call failed: ${operation}`, { error: error.message });
        return throwError(() => transformers.error(error));
      }),
      takeUntil(this.destroy$)
    );
  }

  private isRateLimitError(error: any): boolean {
    return error?.code === "rate_limited" || error?.status === 429;
  }

  private extractRetryAfter(error: any): number {
    return error.headers?.["retry-after"] ? parseInt(error.headers["retry-after"], 10) : 60;
  }

  // private handleRateLimitError(error: any): Observable<never> {
  //   const retryAfter = this.extractRetryAfter(error);

  //   // this.rateLimitInfo = {
  //   //   remaining: 0,
  //   //   resetTime: new Date(Date.now() + retryAfter * 1000),
  //   //   retryAfter
  //   // };

  //   // this.rateLimitSubject.next(this.rateLimitInfo);

  //   // const rateLimitError = new RateLimitError(`Rate limit exceeded. Retry after ${retryAfter} seconds.`, retryAfter);

  //   // return throwError(() => rateLimitError);
  // }

  // private updateRateLimitFromResponse(): void {
  //   // Clear rate limit info on successful requests if reset time has passed
  // //   if (this.rateLimitInfo && this.rateLimitInfo.resetTime < new Date()) {
  // //     this.rateLimitInfo = null;
  // //     this.rateLimitSubject.next(null);
  // //   }
  // // }
}
