import { log } from "$lib/log";
import { APIErrorCode, Client, isNotionClientError } from "@notionhq/client";
import type {
  BlockObjectResponse,
  DatabaseObjectResponse,
  PageObjectResponse
} from "@notionhq/client/build/src/api-endpoints";
import { EventEmitter } from "events";
import { promises as fs } from "fs";
import path from "path";
import type { OperationEventEmitter } from "../operations";
import { collectPaginatedAPI, iteratePaginatedAPI, retry } from "../operations";
import { ExporterConfig } from "./config";
import { CircuitBreaker, ConcurrencyLimiter, ProgressTracker, RateLimiter, delay, sumReducer } from "./util";

declare global {
  interface Date {
    toISOString(): string;
  }
}

/**
 * Progress tracking interface for export operations.
 */
export interface ExportProgress {
  usersCount: number;
  databasesCount: number;
  pagesCount: number;
  blocksCount: number;
  commentsCount: number;
  currentOperation: string;
  rates: {
    pagesPerSecond: number;
    blocksPerSecond: number;
    databasesPerSecond: number;
    commentsPerSecond: number;
  };
  startTime: Date;
}

/**
 * Result of a workspace export operation
 */
export interface ExportResult {
  /**
   * Total number of users exported
   */
  usersCount: number;
  /**
   * Total number of databases exported
   */
  databasesCount: number;
  /**
   * Total number of pages exported
   */
  pagesCount: number;
  /**
   * Total number of blocks exported
   */
  blocksCount: number;
  /**
   * Total number of comments exported
   */
  commentsCount: number;
  /**
   * Total number of files referenced
   */
  filesCount: number;
  /**
   * Export start time
   */
  startTime: Date;
  /**
   * Export end time
   */
  endTime: Date;
  /**
   * Any errors encountered during export
   */
  errors: Array<{ type: string; id?: string; error: string }>;
  /**
   * Workspace metadata
   */
  workspaceInfo?: any;
}

/**
 * WorkspaceExporter exports all content from a Notion workspace.
 *
 * @example
 * ```ts
 * const exporter = new WorkspaceExporter({
 *   token: process.env.NOTION_TOKEN,
 *   outputDir: "./notion-export",
 * });
 * await exporter.export();
 * ```
 */
export class Exporter extends EventEmitter implements OperationEventEmitter {
  /**
   * The Notion client.
   */
  private client: Client;

  /**
   * The configuration for the workspace exporter.
   */
  private config: ExporterConfig;

  /**
   * The set of exported block IDs.
   */
  private exportedBlockIds = new Set<string>();

  /**
   * The set of exported page IDs.
   */
  private exportedPageIds = new Set<string>(); // Track exported pages to avoid duplicates

  /**
   * The errors encountered during the export.
   */
  private errors: Array<{ type: string; id?: string; error: string }> = [];

  /**
   * The progress of the export.
   */
  private progress: ExportProgress = {
    usersCount: 0,
    databasesCount: 0,
    pagesCount: 0,
    blocksCount: 0,
    commentsCount: 0,
    currentOperation: "Initializing",
    rates: {
      pagesPerSecond: 0,
      blocksPerSecond: 0,
      databasesPerSecond: 0,
      commentsPerSecond: 0
    },
    startTime: new Date()
  };

  /**
   * The concurrency limiter.
   */
  private concurrencyLimiter: ConcurrencyLimiter;

  /**
   * The rate limiter for API requests.
   */
  private rateLimiter: RateLimiter;

  /**
   * The circuit breaker for handling failures.
   */
  private circuitBreaker: CircuitBreaker;

  /**
   * The progress tracker for resumable exports.
   */
  private progressTracker: ProgressTracker;

  /**
   * The number of files referenced.
   */
  private filesCount = 0;

  /**
   * The file references.
   */
  private fileReferences = new Map<string, Set<string>>(); // fileUrl -> Set of pageIds

  /**
   * Creates a new workspace exporter.
   *
   * @param config - The configuration for the workspace exporter.
   */
  constructor(config: ExporterConfig) {
    super();
    this.config = new ExporterConfig(config);

    this.client = new Client({
      auth: this.config.token,
      timeoutMs: this.config.timeout
    });

    // Initialize enhanced utilities
    // Allow injected limiters or create default ones
    this.concurrencyLimiter =
      (this as any).concurrencyLimiter || new ConcurrencyLimiter(Math.min(this.config.concurrency, 5)); // Reduce default concurrency
    this.rateLimiter = (this as any).rateLimiter || new RateLimiter(30, this.config.rate); // 30 requests per minute with base interval
    this.circuitBreaker = new CircuitBreaker(10, 300000); // Open after 10 failures, reset after 5 minutes
    this.progressTracker = new ProgressTracker();
  }

  /**
   * Updates the progress of the export.
   *
   * @param update - The update to apply to the progress.
   */
  private updateProgress(update: Partial<ExportProgress>) {
    this.progress = { ...this.progress, ...update };
    this.emit("progress", this.progress);
  }

  /**
   * Export the entire workspace
   *
   * @returns Export result with statistics.
   */
  async export(): Promise<ExportResult> {
    const startTime = new Date();
    let progressSaveInterval: NodeJS.Timeout | null = null;

    try {
      // Create output directory structure.
      await this.createOutputStructure();

      // Try to load previous progress
      const resumed = await this.loadProgress();
      if (resumed) {
        this.emit("resumed", this.progress);
      }

      // Set up periodic progress saving (every 5 seconds).
      progressSaveInterval = setInterval(() => {
        this.saveProgress();
      }, 5000);

      // Export workspace metadata.
      const workspaceInfo = await this.exportWorkspaceMetadata();

      // Execute exports in parallel where possible.
      const [usersCount, databasesResult] = await Promise.all([
        // Export users.
        this.exportUsers(),
        // Export databases and their pages.
        this.exportDatabases()
      ]);

      // Export standalone pages (depends on databases being exported first to avoid duplicates).
      const standalonePagesCount = await this.exportStandalonePages();

      // Export comments if enabled.
      let commentsCount = 0;
      if (this.config.comments) {
        commentsCount = await this.exportComments();
      }

      // Export file references.
      await this.exportFileReferences();

      // Generate export manifest.
      await this.generateExportManifest({
        startTime,
        usersCount,
        databasesCount: databasesResult.databasesCount,
        pagesCount: databasesResult.pagesCount + standalonePagesCount,
        blocksCount: this.exportedBlockIds.size,
        commentsCount,
        filesCount: this.filesCount,
        workspaceInfo
      });

      // Clean up progress file on successful completion
      try {
        await fs.unlink(path.join(this.config.output, "export-progress.json"));
      } catch (error) {
        // Ignore error if file doesn't exist
      }

      const endTime = new Date();

      return {
        usersCount,
        databasesCount: databasesResult.databasesCount,
        pagesCount: databasesResult.pagesCount + standalonePagesCount,
        blocksCount: this.exportedBlockIds.size,
        commentsCount,
        filesCount: this.filesCount,
        startTime,
        endTime,
        errors: this.errors,
        workspaceInfo
      };
    } catch (error) {
      // Save progress on error
      await this.saveProgress();
      this.handleError("export", undefined, error);
      throw error;
    } finally {
      // Clear progress save interval
      if (progressSaveInterval) {
        clearInterval(progressSaveInterval);
      }
    }
  }

  /**
   * Create the output directory structure.
   *
   * @returns A promise that resolves when the output directory structure is created.
   */
  private async createOutputStructure(): Promise<void> {
    const dirs = [
      this.config.output,
      path.join(this.config.output, "users"),
      path.join(this.config.output, "databases"),
      path.join(this.config.output, "pages"),
      path.join(this.config.output, "properties"),
      path.join(this.config.output, "blocks"),
      path.join(this.config.output, "comments"),
      path.join(this.config.output, "metadata"),
      path.join(this.config.output, "files")
    ];

    await Promise.all(dirs.map((dir) => fs.mkdir(dir, { recursive: true })));

    log.info("Created output directory structure", { dirs });
  }

  /**
   * Export workspace metadata.
   *
   * @returns A promise that resolves when the workspace metadata is exported.
   */
  private async exportWorkspaceMetadata(): Promise<any> {
    this.updateProgress({ currentOperation: "Exporting workspace metadata" });

    // Check circuit breaker
    if (!this.circuitBreaker.canProceed()) {
      this.emit("debug", "Circuit breaker is open, skipping workspace metadata export");
      this.emit("circuit-breaker", { state: "open", operation: "workspace metadata" });
      return null;
    }

    try {
      // Apply rate limiting
      const waitTime = await this.rateLimiter.getWaitTime();
      if (waitTime > 0) {
        this.emit("rate-limit", { waitTime });
      }
      await this.rateLimiter.waitForSlot();

      // Get authenticated user info as proxy for workspace info.
      const startTime = Date.now();
      const userInfo = await retry({
        fn: () => this.client.users.me({}),
        operation: "workspace metadata",
        context: {
          op: "read",
          priority: "normal"
        },
        maxRetries: this.config.retries,
        baseDelay: this.config.rate,
        timeout: this.config.timeout,
        emitter: this
      });

      // Track API response time
      const responseTime = Date.now() - startTime;
      if ((this as any).rateLimiter && typeof (this as any).rateLimiter.updateFromHeaders === "function") {
        (this as any).rateLimiter.updateFromHeaders({}, responseTime, false);
      }

      const workspaceInfo = {
        exportDate: new Date().toISOString(),
        exportVersion: "1.0.0",
        user: userInfo,
        settings: {
          includeArchived: this.config.archived,
          includeComments: this.config.comments,
          maxDepth: this.config.depth
        }
      };

      await fs.writeFile(
        path.join(this.config.output, "metadata", "workspace-info.json"),
        JSON.stringify(workspaceInfo, null, 2)
      );

      this.rateLimiter.reportSuccess();
      this.circuitBreaker.reportSuccess();
      return workspaceInfo;
    } catch (error) {
      this.rateLimiter.reportError();
      this.circuitBreaker.reportFailure();
      if (this.circuitBreaker.getState() === "open") {
        this.emit("circuit-breaker", { state: "open", operation: "workspace metadata" });
      }
      this.handleError("workspace-metadata", undefined, error);
      return null;
    }
  }

  /**
   * Export all users in the workspace.
   *
   * @returns A promise that resolves when the users are exported.
   */
  private async exportUsers(): Promise<number> {
    this.updateProgress({ currentOperation: "Exporting users" });
    try {
      const users = await retry({
        fn: () =>
          collectPaginatedAPI(this.client.users.list.bind(this.client.users), {}, this.config.size, this.config.rate),
        operation: "export users",
        context: {
          op: "read",
          priority: "normal"
        },
        maxRetries: this.config.retries,
        baseDelay: this.config.rate,
        timeout: this.config.timeout,
        emitter: this
      });

      await fs.writeFile(path.join(this.config.output, "users", "all-users.json"), JSON.stringify(users, null, 2));

      // Save individual user files in parallel.
      await Promise.all(
        users
          .filter((user) => user.object === "user")
          .map((user) =>
            this.concurrencyLimiter.run(async () => {
              await fs.writeFile(
                path.join(this.config.output, "users", `${user.id}.json`),
                JSON.stringify(user, null, 2)
              );
            }, this.config.timeout)
          )
      );

      this.updateProgress({ usersCount: users.length });
      return users.length;
    } catch (error) {
      this.handleError("users", undefined, error);
      return 0;
    }
  }

  /**
   * Export all databases and their pages with parallel processing.
   *
   * @returns A promise that resolves when the databases are exported.
   */
  private async exportDatabases(): Promise<{
    databasesCount: number;
    pagesCount: number;
  }> {
    this.updateProgress({ currentOperation: "Searching for databases" });
    let databasesCount = 0;
    let pagesCount = 0;

    try {
      const databases: DatabaseObjectResponse[] = [];

      // Search for databases with improved pagination.
      for await (const db of iteratePaginatedAPI(
        this.client.search.bind(this.client),
        {
          filter: { value: "database", property: "object" }
        },
        "databases search",
        this.config.size,
        this.config.rate
      )) {
        log.debug("Found database", { db });
        if (this.isFullDatabase(db)) {
          databases.push(db);
          this.emit("debug", `Found database: ${db.id}`);
        }
      }

      this.emit("debug", `Processing ${databases.length} databases...`);

      // Update progress to show we're now processing databases
      this.updateProgress({
        currentOperation: `Processing ${databases.length} databases`,
        databasesCount: databases.length
      });

      // Process databases in smaller batches.
      const batchSize = Math.min(3, this.config.concurrency);
      for (let i = 0; i < databases.length; i += batchSize) {
        const batch = databases.slice(i, i + batchSize);

        // Update progress to show which database we're processing
        this.updateProgress({
          currentOperation: `Exporting database ${i + 1}-${Math.min(i + batchSize, databases.length)} of ${
            databases.length
          }`
        });

        const results = await Promise.all(
          batch.map(async (database) => {
            if (!this.config.archived && database.archived) {
              return { dbCount: 0, pageCount: 0 };
            }

            try {
              // Use injected concurrency limiter if available and supports OperationTypeAwareLimiter interface
              if ((this.concurrencyLimiter as any).run && typeof (this.concurrencyLimiter as any).run === "function") {
                return await (this.concurrencyLimiter as any).run(
                  {
                    type: "databases",
                    objectId: database.id,
                    operation: "export-database"
                  },
                  async () => {
                    await delay(this.config.rate);

                    // Save database metadata.
                    await fs.writeFile(
                      path.join(this.config.output, "databases", `${database.id}.json`),
                      JSON.stringify(database, null, 2)
                    );

                    // Export pages with retry.
                    const dbPages = await retry({
                      fn: () => this.exportDatabasePages(database.id),
                      operation: `database ${database.id} pages`,
                      context: {
                        op: "read",
                        priority: "normal"
                      },
                      maxRetries: this.config.retries,
                      baseDelay: this.config.rate,
                      timeout: this.config.timeout * 2,
                      emitter: this
                    });

                    return { dbCount: 1, pageCount: dbPages };
                  }
                );
              } else {
                // Fallback to original concurrency limiter
                return await this.concurrencyLimiter.run(async () => {
                  await delay(this.config.rate);

                  // Save database metadata.
                  await fs.writeFile(
                    path.join(this.config.output, "databases", `${database.id}.json`),
                    JSON.stringify(database, null, 2)
                  );

                  // Export pages with retry.
                  const dbPages = await retry({
                    fn: () => this.exportDatabasePages(database.id),
                    operation: `database ${database.id} pages`,
                    context: {
                      op: "read",
                      priority: "normal"
                    },
                    maxRetries: this.config.retries,
                    baseDelay: this.config.rate,
                    timeout: this.config.timeout * 2,
                    emitter: this
                  });

                  return { dbCount: 1, pageCount: dbPages };
                }, this.config.timeout);
              }
            } catch (error) {
              this.handleError("database", database.id, error);
              return { dbCount: 0, pageCount: 0 };
            }
          })
        );

        // Update counts after each batch
        for (const result of results) {
          databasesCount += result.dbCount;
          pagesCount += result.pageCount;
        }

        this.updateProgress({ databasesCount, pagesCount });

        // Add delay between batches.
        await delay(this.config.rate * 2);
      }

      // Update progress to show databases are complete
      this.updateProgress({
        currentOperation: "Databases export completed",
        databasesCount,
        pagesCount
      });

      return { databasesCount, pagesCount };
    } catch (error) {
      this.handleError("databases", undefined, error);
      return { databasesCount, pagesCount };
    }
  }

  /**
   * Export all pages from a specific database with parallel processing.
   *
   * @param databaseId - The ID of the database to export pages from.
   *
   * @returns The number of pages exported.
   */
  private async exportDatabasePages(databaseId: string): Promise<number> {
    let count = 0;
    let hasMore = true;
    let cursor: string | undefined;
    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 3;

    // Update progress to show we're exporting pages from this database
    this.updateProgress({
      currentOperation: `Exporting pages from database ${databaseId.substring(0, 8)}...`
    });

    // Check circuit breaker
    if (!this.circuitBreaker.canProceed()) {
      this.emit("debug", `Circuit breaker is open, skipping database ${databaseId}`);
      return 0;
    }

    try {
      while (hasMore) {
        // Apply rate limiting
        await this.rateLimiter.waitForSlot();

        try {
          // Query pages with pagination
          const queryResult = await retry({
            fn: () =>
              this.client.databases.query({
                database_id: databaseId,
                page_size: Math.min(this.config.size, 25), // Limit page size to reduce timeout risk
                start_cursor: cursor
              }),
            operation: `database ${databaseId} pages query`,
            context: {
              op: "read",
              priority: "normal"
            },
            maxRetries: this.config.retries,
            baseDelay: this.config.rate,
            timeout: this.config.timeout * 2, // Double timeout for database queries
            emitter: this
          });

          // Reset consecutive errors on success
          consecutiveErrors = 0;
          this.rateLimiter.reportSuccess();
          this.circuitBreaker.reportSuccess();

          // Process pages in small batches
          const batchSize = Math.min(3, this.config.concurrency);
          for (let i = 0; i < queryResult.results.length; i += batchSize) {
            const batch = queryResult.results.slice(i, i + batchSize);

            const results = await Promise.all(
              batch.map(
                (page) =>
                  this.concurrencyLimiter.run(async () => {
                    if (this.isFullPage(page)) {
                      if (!this.config.archived && page.archived) {
                        return 0;
                      }

                      if (this.exportedPageIds.has(page.id)) {
                        return 0;
                      }

                      await this.exportPage(page);
                      return 1;
                    }
                    return 0;
                  }, this.config.timeout * 2) // Double timeout for page export
              )
            );

            count += results.reduce(sumReducer, 0);

            // Add delay between batches
            await delay(this.config.rate);
          }

          hasMore = queryResult.has_more;
          cursor = queryResult.next_cursor ?? undefined;

          // Save progress for potential resume
          this.progressTracker.set(`database_${databaseId}_cursor`, cursor);
          this.progressTracker.set(`database_${databaseId}_count`, count);

          // Add delay between queries
          await delay(this.config.rate * 2);
        } catch (error) {
          consecutiveErrors++;
          this.rateLimiter.reportError();
          this.circuitBreaker.reportFailure();

          if (consecutiveErrors >= maxConsecutiveErrors) {
            this.emit("debug", `Too many consecutive errors for database ${databaseId}, stopping`);
            this.handleError("database-pages", databaseId, error);
            break;
          }

          this.emit(
            "debug",
            `Error querying database ${databaseId}, attempt ${consecutiveErrors}/${maxConsecutiveErrors}`
          );

          // Wait longer before retry
          await delay(this.config.rate * Math.pow(2, consecutiveErrors));
        }
      }

      return count;
    } catch (error) {
      this.handleError("database-pages", databaseId, error);
      return count;
    }
  }

  /**
   * Export standalone pages with parallel processing
   *
   * @returns The number of pages exported.
   */
  private async exportStandalonePages(): Promise<number> {
    this.updateProgress({ currentOperation: "Exporting standalone pages" });
    const pages: PageObjectResponse[] = [];

    try {
      for await (const page of iteratePaginatedAPI(
        this.client.search.bind(this.client),
        { filter: { value: "page", property: "object" } },
        "standalone pages",
        this.config.size,
        this.config.rate
      )) {
        if (this.isFullPage(page)) {
          if (!this.config.archived && page.archived) {
            continue;
          }

          // Check if it's not a database page
          if (!("database_id" in page.parent)) {
            pages.push(page);
          }
        }
      }

      // Process pages in parallel
      await Promise.all(
        pages.map((page) =>
          this.concurrencyLimiter.run(async () => {
            await this.exportPage(page);
          }, this.config.timeout)
        )
      );

      this.updateProgress({
        pagesCount: this.progress.pagesCount + pages.length
      });
      return pages.length;
    } catch (error) {
      this.handleError("standalone-pages", undefined, error);
      return 0;
    }
  }

  /**
   * Export a single page and all its blocks
   *
   * @param page - The page to export.
   *
   * @returns A promise that resolves when the page is exported.
   */
  private async exportPage(page: PageObjectResponse): Promise<void> {
    // Mark as exported immediately to avoid duplicates
    this.exportedPageIds.add(page.id);

    await this.rateLimitDelay();

    try {
      // Track operation with OperationTypeAwareLimiter if available
      if ((this as any).concurrencyLimiter && typeof (this as any).concurrencyLimiter.run === "function") {
        await (this as any).concurrencyLimiter.run(
          {
            type: "pages",
            objectId: page.id,
            operation: "export-page"
          },
          async () => {
            // Save page metadata
            await fs.writeFile(
              path.join(this.config.output, "pages", `${page.id}.json`),
              JSON.stringify(page, null, 2)
            );

            // Export page properties separately if enabled
            if (this.config.properties) {
              await this.exportPageProperties(page);
            }

            // Export blocks with timeout
            await retry({
              fn: () => this.exportBlocks(page.id, 0),
              operation: `blocks for page ${page.id}`,
              context: {
                op: "read",
                priority: "normal"
              },
              maxRetries: this.config.retries,
              baseDelay: this.config.rate,
              timeout: this.config.timeout * 2, // Double timeout for blocks
              emitter: this
            });
          }
        );
      } else {
        // Fallback to original flow
        // Save page metadata
        await fs.writeFile(path.join(this.config.output, "pages", `${page.id}.json`), JSON.stringify(page, null, 2));

        // Export page properties separately if enabled
        if (this.config.properties) {
          await this.exportPageProperties(page);
        }

        // Export blocks with timeout
        await retry({
          fn: () => this.exportBlocks(page.id, 0),
          operation: `blocks for page ${page.id}`,
          context: {
            op: "read",
            priority: "normal"
          },
          maxRetries: this.config.retries,
          baseDelay: this.config.rate,
          timeout: this.config.timeout * 2 // Double timeout for blocks
        });
      }
    } catch (error) {
      this.handleError("page", page.id, error);
    }
  }

  /**
   * Export page properties in a more structured format
   *
   * @param page - The page to export.
   *
   * @returns A promise that resolves when the page properties are exported.
   */
  private async exportPageProperties(page: PageObjectResponse): Promise<void> {
    try {
      const properties: Record<string, any> = {};

      // Extract and format properties
      for (const [key, value] of Object.entries(page.properties)) {
        properties[key] = this.formatProperty(value, page.id); // Pass page ID
      }

      await fs.writeFile(
        path.join(this.config.output, "properties", `${page.id}.json`),
        JSON.stringify(
          {
            pageId: page.id,
            properties,
            extractedAt: new Date().toISOString()
          },
          null,
          2
        )
      );
    } catch (error) {
      this.handleError("properties", page.id, error);
    }
  }

  /**
   * Format a property value for better readability
   *
   * @param property - The property to format.
   * @param pageId - The ID of the page the property belongs to.
   *
   * @returns The formatted property value.
   */
  private formatProperty(property: any, pageId: string): any {
    if (!property) return null;

    try {
      switch (property.type) {
        case "title":
        case "rich_text":
          return property[property.type]?.map((text: any) => text.plain_text).join("") || "";
        case "number":
          return property.number;
        case "select":
          return property.select?.name || null;
        case "multi_select":
          return property.multi_select?.map((option: any) => option.name) || [];
        case "date":
          return property.date;
        case "checkbox":
          return property.checkbox;
        case "url":
          return property.url;
        case "email":
          return property.email;
        case "phone_number":
          return property.phone_number;
        case "files":
          return (
            property.files?.map((file: any) => {
              if (file.name) {
                this.trackFileReference(file.name, pageId); // Use correct page ID
              }
              return {
                name: file.name,
                url: file.file?.url || file.external?.url,
                type: file.type
              };
            }) || []
          );
        default:
          return property;
      }
    } catch (error) {
      this.emit("debug", `Error formatting property ${property.type}: ${error}`);
      return null;
    }
  }

  /**
   * Track file references for later export
   */
  private trackFileReference(fileUrl: string, pageId: string): void {
    if (!this.fileReferences.has(fileUrl)) {
      this.fileReferences.set(fileUrl, new Set());
    }
    this.fileReferences.get(fileUrl)!.add(pageId);
    this.filesCount++;
  }

  /**
   * Export file references mapping
   */
  private async exportFileReferences(): Promise<void> {
    this.updateProgress({ currentOperation: "Exporting file references" });

    const fileMapping: Record<string, string[]> = {};

    for (const [fileUrl, pageIds] of this.fileReferences) {
      fileMapping[fileUrl] = Array.from(pageIds);
    }

    await fs.writeFile(
      path.join(this.config.output, "files", "file-references.json"),
      JSON.stringify(
        {
          totalFiles: this.filesCount,
          fileMapping,
          note: "File URLs may expire. Consider downloading files separately if long-term storage is needed."
        },
        null,
        2
      )
    );
  }

  /**
   * Generate export manifest with summary information.
   */
  private async generateExportManifest(stats: {
    startTime: Date;
    usersCount: number;
    databasesCount: number;
    pagesCount: number;
    blocksCount: number;
    commentsCount: number;
    filesCount: number;
    workspaceInfo: any;
  }): Promise<void> {
    this.updateProgress({ currentOperation: "Generating export manifest" });

    const manifest = {
      exportInfo: {
        version: "1.0.0",
        exportedAt: new Date().toISOString(),
        duration: `${(new Date().getTime() - stats.startTime.getTime()) / 1000}s`,
        exporterVersion: "workspace-exporter-v1"
      },
      statistics: {
        users: stats.usersCount,
        databases: stats.databasesCount,
        pages: stats.pagesCount,
        blocks: stats.blocksCount,
        comments: stats.commentsCount,
        files: stats.filesCount
      },
      configuration: {
        includeArchived: this.config.archived,
        includeComments: this.config.comments,
        maxDepth: this.config.depth,
        exportPageProperties: this.config.properties
      },
      errors: this.errors,
      workspaceInfo: stats.workspaceInfo
    };

    await fs.writeFile(path.join(this.config.output, "export-manifest.json"), JSON.stringify(manifest, null, 2));

    // Also create a human-readable README
    const readme = `# Notion Workspace Export

## Export Information
- **Exported at**: ${manifest.exportInfo.exportedAt}
- **Duration**: ${manifest.exportInfo.duration}
- **Version**: ${manifest.exportInfo.version}

## Statistics
- **Users**: ${stats.usersCount}
- **Databases**: ${stats.databasesCount}
- **Pages**: ${stats.pagesCount}
- **Blocks**: ${stats.blocksCount}
- **Comments**: ${stats.commentsCount}
- **Files**: ${stats.filesCount}

## Directory Structure
- \`/users\` - User information.
- \`/databases\` - Database schemas.
- \`/pages\` - Page metadata.
- \`/properties\` - Extracted page properties.
- \`/blocks\` - Block content.
- \`/comments\` - Page comments.
- \`/metadata\` - Workspace metadata.
- \`/files\` - File references.

## Notes
- File URLs in the export may expire. Download files separately for long-term storage.
- The export includes ${this.config.archived ? "archived" : "only non-archived"} content.
- Comments are ${this.config.comments ? "included" : "not included"}.
- Maximum block depth: ${this.config.depth}

## Errors
${
  this.errors.length > 0
    ? this.errors.map((e) => `- ${e.type} ${e.id ? `(${e.id})` : ""}: ${e.error}`).join("\n")
    : "No errors encountered during export."
}
`;

    await fs.writeFile(path.join(this.config.output, "README.md"), readme);
  }

  /**
   * Recursively export blocks with better error handling.
   *
   * @param blockId - The ID of the block to export.
   * @param depth - The depth of the block to export.
   *
   * @returns A promise that resolves when the blocks are exported.
   */
  private async exportBlocks(blockId: string, depth: number): Promise<void> {
    if (depth >= this.config.depth || this.exportedBlockIds.has(blockId)) {
      return;
    }

    this.exportedBlockIds.add(blockId);

    // Update progress with current operation every 100 blocks
    if (this.exportedBlockIds.size % 100 === 0) {
      this.updateProgress({
        currentOperation: `Exporting blocks (${this.exportedBlockIds.size} processed)`,
        blocksCount: this.exportedBlockIds.size
      });
    } else {
      this.updateProgress({ blocksCount: this.exportedBlockIds.size });
    }

    await this.rateLimitDelay();

    try {
      const blocks = await retry({
        fn: () =>
          collectPaginatedAPI(
            this.client.blocks.children.list.bind(this.client.blocks.children),
            { block_id: blockId },
            this.config.size,
            this.config.rate
          ),
        operation: `exporting child blocks for block id ${blockId}`,
        context: {
          op: "read",
          priority: "normal"
        },
        maxRetries: this.config.retries,
        baseDelay: this.config.rate,
        timeout: this.config.timeout,
        emitter: this
      });

      // Save blocks for this parent.
      await fs.writeFile(
        path.join(this.config.output, "blocks", `${blockId}-children.json`),
        JSON.stringify(blocks, null, 2)
      );

      // Process child blocks in smaller batches.
      const childBlocks = blocks.filter((block: any) => this.isFullBlock(block) && block.has_children);
      const batchSize = Math.min(5, this.config.concurrency);

      for (let i = 0; i < childBlocks.length; i += batchSize) {
        const batch = childBlocks.slice(i, i + batchSize);
        console.log(`Exporting ${batch.length} child blocks of ${blockId} at depth ${depth}`);
        await Promise.all(
          batch.map((block: any) =>
            this.concurrencyLimiter.run(async () => {
              // This is where nested blocks are exported recursively.
              await this.exportBlocks(block.id, depth + 1);
            }, this.config.timeout)
          )
        );
      }
    } catch (error) {
      this.handleError("blocks", blockId, error);
    }
  }

  /**
   * Export comments from all pages with parallel processing
   *
   * @returns The number of comments exported.
   */
  private async exportComments(): Promise<number> {
    this.updateProgress({ currentOperation: "Exporting comments" });
    let totalCount = 0;

    try {
      const pageFiles = await fs.readdir(path.join(this.config.output, "pages"));

      const pageIds = pageFiles.filter((file) => file.endsWith(".json")).map((file) => file.replace(".json", ""));

      // Process comments in smaller batches
      const batchSize = Math.min(10, this.config.concurrency);

      for (let i = 0; i < pageIds.length; i += batchSize) {
        const batch = pageIds.slice(i, i + batchSize);

        const results = await Promise.all(
          batch.map((pageId) =>
            this.concurrencyLimiter.run(async () => {
              try {
                await this.rateLimitDelay();

                const comments = await retry({
                  fn: () =>
                    collectPaginatedAPI(
                      this.client.comments.list.bind(this.client.comments),
                      { block_id: pageId },
                      this.config.size,
                      this.config.rate
                    ),
                  operation: `comments for ${pageId}`,
                  context: {
                    op: "read",
                    priority: "normal"
                  },
                  maxRetries: 1, // Only retry once for comments
                  baseDelay: this.config.rate,
                  timeout: this.config.timeout,
                  emitter: this
                });

                if (comments.length && comments.length > 0) {
                  await fs.writeFile(
                    path.join(this.config.output, "comments", `${pageId}-comments.json`),
                    JSON.stringify(comments, null, 2)
                  );
                  return comments.length || 0;
                }
                return 0;
              } catch (error) {
                // Comments might not be available for all pages
                if (!this.isNotFoundError(error)) {
                  this.handleError("comments", pageId, error);
                }
                return 0;
              }
            }, this.config.timeout)
          )
        );

        totalCount += results.reduce(sumReducer, 0);
      }
    } catch (error) {
      this.handleError("comments", undefined, error);
    }

    this.updateProgress({ commentsCount: totalCount });
    return totalCount;
  }

  /**
   * Type guard for full page objects
   *
   * @param page - The page to check.
   *
   * @returns True if the page is full, false otherwise.
   */
  private isFullPage(page: any): page is PageObjectResponse {
    return page.object === "page" && "created_time" in page;
  }

  /**
   * Type guard for full database objects
   *
   * @param database - The database to check.
   *
   * @returns True if the database is full, false otherwise.
   */
  private isFullDatabase(database: any): database is DatabaseObjectResponse {
    return database.object === "database" && "created_time" in database;
  }

  /**
   * Type guard for full block objects
   *
   * @param block - The block to check.
   *
   * @returns True if the block is full, false otherwise.
   */
  private isFullBlock(block: any): block is BlockObjectResponse {
    return block.object === "block" && "created_time" in block;
  }

  /**
   * Check if error is a not found error
   *
   * @param error - The error to check.
   *
   * @returns True if the error is a not found error, false otherwise.
   */
  private isNotFoundError(error: unknown): boolean {
    return isNotionClientError(error) && error.code === APIErrorCode.ObjectNotFound;
  }

  /**
   * Handle and log errors.
   *
   * @param type - The type of error.
   * @param id - The ID of the error.
   * @param error - The error to handle.
   */
  private handleError(type: string, id: string | undefined, error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    this.errors.push({ type, id, error: errorMessage });
    this.emit("debug", `Error exporting ${type}${id ? ` (${id})` : ""}: ${errorMessage}`);
  }

  /**
   * Save progress to a file for resumability.
   *
   * @returns A promise that resolves when progress is saved.
   */
  private async saveProgress(): Promise<void> {
    try {
      const progressData = {
        ...this.progressTracker.toJSON(),
        exportedBlockIds: Array.from(this.exportedBlockIds),
        exportedPageIds: Array.from(this.exportedPageIds),
        progress: this.progress,
        errors: this.errors,
        timestamp: new Date().toISOString()
      };

      await fs.writeFile(path.join(this.config.output, "export-progress.json"), JSON.stringify(progressData, null, 2));
    } catch (error) {
      this.emit("debug", `Failed to save progress: ${error}`);
    }
  }

  /**
   * Load progress from a file for resuming.
   *
   * @returns A promise that resolves when progress is loaded.
   */
  private async loadProgress(): Promise<boolean> {
    try {
      const progressFile = path.join(this.config.output, "export-progress.json");
      const exists = await fs
        .access(progressFile)
        .then(() => true)
        .catch(() => false);

      if (!exists) {
        return false;
      }

      const data = await fs.readFile(progressFile, "utf-8");
      const progressData = JSON.parse(data);

      // Restore progress
      this.progressTracker.fromJSON(progressData);
      this.exportedBlockIds = new Set(progressData.exportedBlockIds || []);
      this.exportedPageIds = new Set(progressData.exportedPageIds || []);
      this.progress = progressData.progress || this.progress;
      this.errors = progressData.errors || [];

      this.emit("debug", `Resuming from previous export (${progressData.timestamp})`);
      this.emit("debug", `Already exported: ${this.exportedPageIds.size} pages, ${this.exportedBlockIds.size} blocks`);

      return true;
    } catch (error) {
      this.emit("debug", `Failed to load progress: ${error}`);
      return false;
    }
  }

  /**
   * Rate limiting delay.
   *
   * @returns A promise that resolves when the rate limiting delay is applied.
   */
  private async rateLimitDelay(): Promise<void> {
    // Use injected rate limiter if available
    if ((this as any).rateLimiter && typeof (this as any).rateLimiter.waitForSlot === "function") {
      await (this as any).rateLimiter.waitForSlot();
    } else {
      await this.rateLimiter.waitForSlot();
    }
  }
}
