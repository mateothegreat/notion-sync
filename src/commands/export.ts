/**
 * Export Command
 *
 * CLI command for exporting Notion content
 */
import { log } from "$lib/log";
import { promises as fs } from "fs";
import path from "path";
import { lastValueFrom } from "rxjs";
import { inspect } from "util";

import { Exporter, ExportFormat } from "$lib/exporters/exporter";
import { jsonExporterHook } from "$lib/exporters/json-exporter-hook";
import { NotionObjectType } from "$lib/notion/types";
import { ProgressService } from "../core/services/progress-service";
import { FileSystemManager } from "../infrastructure/filesystem/file-system-manager";
import { BaseCommand } from "../lib/commands/base-command";
import { createCommandFlags, loadCommandConfig, ResolvedCommandConfig } from "../lib/config/loader";
import { ControlPlane, createControlPlane } from "../lib/control-plane/control-plane";
import { ExportService } from "../lib/export/export-service";
import { NotionClient } from "../lib/notion/notion-client";
import { NotionConfig } from "../shared/types";

export default class Export extends BaseCommand<typeof Export> {
  static override flags = createCommandFlags("export");
  static override description = "Export Notion content using the new event-driven architecture";
  static override examples = [
    "<%= config.bin %> <%= command.id %> --path ./exports",
    "<%= config.bin %> <%= command.id %> --path ./exports --databases db1,db2",
    "<%= config.bin %> <%= command.id %> --path ./exports --pages page1,page2",
    "<%= config.bin %> <%= command.id %> --path ./exports --format json"
  ];

  private controlPlane?: ControlPlane;
  private exportService?: ExportService;
  private progressService?: ProgressService;
  private notionClient?: NotionClient;
  private fileSystemManager: FileSystemManager;
  private exportConfig: ResolvedCommandConfig<"export">;
  private exporters: Exporter[] = [];

  public async run(): Promise<void> {
    try {
      const { flags } = await this.parse(Export);
      this.exportConfig = (await loadCommandConfig("export", flags)).rendered;

      this.exporters = [
        jsonExporterHook(
          {
            formats: [ExportFormat.JSON],
            types: [NotionObjectType.DATABASE, NotionObjectType.PAGE]
          },
          this.exportConfig
        )
      ];

      // Parse databases and pages
      let databases: string[] = this.exportConfig.databases.map((db) => db.id);
      let pages: string[] = this.exportConfig.pages ? this.exportConfig.pages.map((p) => p.id) : [];

      // Initialize services first to have access to NotionClient
      await this.initializeServices();

      // If no specific databases or pages are specified, discover all content
      if (databases.length === 0 && pages.length === 0) {
        log.info("discovering all workspace content...");
        const discovered = await this.discover();
        databases = discovered.databases;
        pages = discovered.pages;

        log.info(`found ${databases.length} databases and ${pages.length} standalone pages`);

        if (databases.length === 0 && pages.length === 0) {
          this.error("No content found in the workspace to export");
        }
      }

      const outputPath = path.resolve(this.exportConfig.path);
      await fs.mkdir(outputPath, { recursive: true });

      this.setupProgressMonitoring();

      // Start export process.
      await this.start(this.exportConfig);

      log.success(`export completed successfully, files saved to ${outputPath}`);
    } catch (error) {
      if (this.exportConfig?.verbose) {
        log.error("Export error details", { error: inspect(error, { colors: true, compact: false }) });
      }

      if (error instanceof Error) {
        this.error(`export failed: ${error.message}`);
      } else {
        this.error("export failed with unknown error");
      }
    } finally {
      if (this.controlPlane) {
        await lastValueFrom(this.controlPlane.destroy());
      }
    }
  }

  /**
   * Initialize control plane and all services.
   */
  private async initializeServices(): Promise<void> {
    log.debug("initializing control plane...");

    // Create control plane.
    this.controlPlane = createControlPlane({
      enableLogging: this.exportConfig.verbose,
      enableMetrics: true,
      enableHealthCheck: true,
      autoStartComponents: true
    });

    await lastValueFrom(this.controlPlane.initialize());
    await lastValueFrom(this.controlPlane.start());

    // Create notion configuration.
    const notionConfig: NotionConfig = {
      apiKey: this.exportConfig.token,
      apiVersion: "2022-06-28",
      baseUrl: "https://api.notion.com",
      timeout: 30000,
      retryAttempts: 3
    };

    // Create circuit breaker for Notion API.
    const circuitBreaker = this.controlPlane.getCircuitBreaker("notion-api", {
      failureThreshold: 5,
      resetTimeout: 30000,
      monitoringPeriod: 60000
    });

    /**
     * Create event publisher for publishing domain events.
     * This is used to publish events to the control plane.
     */
    const eventPublisher = async (event: any) => {
      await this.controlPlane.publish("domain-events", event);
    };

    /**
     * Create notion client for fetching data from the Notion API.
     */
    this.notionClient = new NotionClient(notionConfig);

    /**
     * Create progress service.
     * This is used to track the progress of the export.
     */
    this.progressService = new ProgressService(eventPublisher);

    /**
     * Create export service.
     * This is used to export data from the various services to the output directory.
     */
    const exportRepository = this.createInMemoryExportRepository();
    this.exportService = new ExportService(exportRepository, eventPublisher);

    // /**
    //  * Create file system manager.
    //  * This handles all file writing operations with proper organization and atomic operations.
    //  */
    // const fileSystemConfig = FileSystemManager.createDefaultConfig(this.exportConfig.path);
    // this.fileSystemManager = new FileSystemManager(fileSystemConfig, eventPublisher);

    log.debug("services initialized successfully");
  }

  /**
   * Set up progress monitoring for export events.
   * This is used to track the progress of the export.
   */
  private setupProgressMonitoring(): void {
    let lastProgress = 0;

    /**
     * Subscribe to domain events so we can track the progress of the various
     * services and sections of the export.
     */
    this.controlPlane.subscribe("domain-events").subscribe({
      next: async (message) => {
        const event = message.payload as any;

        if (!event || typeof event !== "object" || !event.type) {
          return;
        }

        switch (event.type) {
          case "export.progress.updated":
            const progress = event.payload?.progress;
            if (!progress) break;

            // Only show progress updates every 10% to avoid spamming the console.
            const currentProgress = Math.floor(progress.percentage / 10) * 10;
            if (currentProgress > lastProgress) {
              log.info(
                `📊 Progress: ${currentProgress}% (${progress.processed}/${progress.total}) - ${progress.currentOperation}`
              );
              lastProgress = currentProgress;
            }

            if (progress.estimatedCompletion && progress.percentage > 10) {
              const eta = new Date(progress.estimatedCompletion);
              const now = new Date();
              const remainingMs = eta.getTime() - now.getTime();
              const remainingMin = Math.ceil(remainingMs / 60000);

              if (remainingMin > 0) {
                log.info(`⏱️  ETA: ${remainingMin} minutes`);
              }
            }
            break;

          case "export.completed":
            const duration = event.payload?.duration;
            const itemsProcessed = event.payload?.itemsProcessed;
            const errors = event.payload?.errors;

            if (duration && itemsProcessed && errors) {
              log.info(`items processed: ${itemsProcessed}`);
              log.info(`duration: ${duration / 1000}s`);
              log.info(`items/second: ${itemsProcessed / (duration / 1000)}`);

              if (errors.length > 0) {
                log.info(`errors: ${errors.length}`);
              } else {
                log.info(`no errors`);
              }
            }
            break;

          case "export.failed":
            const error = event.payload?.error;
            if (error?.message) {
              this.error(`export failed: ${error.message}`);
            }
            break;

          case "notion.rate_limit.hit":
            const retryAfter = event.payload?.retryAfter;
            if (retryAfter) {
              log.info(`rate limit hit. waiting ${retryAfter} seconds...`);
            }
            break;

          case "circuit_breaker.opened":
            const breakerName = event.payload?.name;
            if (breakerName) {
              log.info(`circuit breaker opened for ${breakerName}. requests temporarily blocked.`);
            }
            break;

          case "circuit_breaker.closed":
            const closedBreakerName = event.payload?.name;
            if (closedBreakerName) {
              log.info(`circuit breaker closed for ${closedBreakerName}. requests resumed.`);
            }
            break;

          case "progress.section.started":
            const section = event.payload?.section;
            const totalItems = event.payload?.totalItems;
            if (section && totalItems) {
              log.info(`starting section: ${section} (${totalItems} items)`);
            }
            break;

          case "progress.section.completed":
            const completedSection = event.payload?.section;
            const sectionDuration = event.payload?.duration;
            const sectionErrors = event.payload?.errors;
            log.debugging.inspect("progress.section.completed", { event });
            if (completedSection && sectionDuration) {
              if (sectionErrors && sectionErrors.length > 0) {
                log.error("Section errors", { sectionErrors });
              } else {
                log.info(`completed section: ${completedSection} in ${(sectionDuration / 1000).toFixed(1)}s`);
              }
            }
            break;

          case "notion.object.fetched":
            // Optional: log individual object fetches in verbose mode
            break;
        }
      },
      error: (err) => {
        log.error("Error in domain-events subscription", { error: err });
      }
    });
  }

  /**
   * Start the export process.
   */
  private async start(configuration: ResolvedCommandConfig<"export">): Promise<void> {
    // @mark export->start

    if (!this.exportService || !this.progressService) {
      throw new Error("Services not initialized");
    }

    const exporter = await this.exportService.create(configuration);

    await this.progressService.startTracking(exporter.id);

    log.success("starting export...");

    await this.exportService.startExport(exporter.id);

    await this.exportWorkspaceMetadata(exporter.id, configuration.path);
    await this.exportUsers(exporter.id, configuration.path);

    const { databases, pages } = await this.discover();

    await this.processDatabases(
      exporter.id,
      this.exporters.filter((e) => e.config.types.includes(NotionObjectType.DATABASE)),
      databases
    );
    await this.processPages(exporter.id, pages);

    // if (configuration.databases?.length > 0) {
    //   await this.processDatabases(
    //     exporter.id,
    //     this.exporters.filter((e) => e.config.types.includes(NotionObjectType.DATABASE)),
    //     configuration.databases.map((db) => db.id)
    //   );
    // }

    // if (configuration.pages?.length > 0) {
    //   await this.processPages(
    //     exporter.id,
    //     configuration.pages.map((p) => p.id)
    //   );
    // }

    await this.exportService.completeExport(exporter.id, configuration.path);

    log.success(`export ${exporter.id} completed successfully`);
    log.success(`all files were saved to ${configuration.path}`);

    this.progressService.stopTracking(exporter.id);
  }

  /**
   * Discover all databases and standalone pages in the workspace.
   */
  private async discover(): Promise<{ databases: string[]; pages: string[] }> {
    if (!this.notionClient) {
      throw new Error("NotionClient not initialized");
    }

    const databases: string[] = [];
    const pages: string[] = [];
    const processedPageIds = new Set<string>();

    try {
      // Discover all databases
      log.info("searching for databases...");
      const allDatabases = await this.notionClient.getDatabases();

      for (const database of allDatabases) {
        databases.push(database.id);
        log.info(`found database: ${database.title || database.id}`);
      }

      // Discover all pages (including those not in databases)
      log.info("searching for standalone pages...");

      // Use search API to find all pages
      let hasMore = true;
      let nextCursor: string | undefined = undefined;

      while (hasMore) {
        const searchResult = await this.notionClient.search("", {
          filter: {
            property: "object",
            value: "page"
          },
          start_cursor: nextCursor,
          page_size: 100
        });

        for (const page of searchResult.results || []) {
          // Only add pages that are not already in our databases
          // Pages in databases will be exported when we process the databases
          if (page.parent?.type !== "database_id" && !processedPageIds.has(page.id)) {
            pages.push(page.id);
            processedPageIds.add(page.id);
            log.info(`found standalone page: ${page.title || page.id}`);
          }
        }

        hasMore = searchResult.has_more || false;
        nextCursor = searchResult.next_cursor || undefined;
      }
    } catch (error) {
      log.error("failed to discover all content, falling back to configured items");
      if (this.exportConfig.verbose) {
        log.trace("content discovery error", { error });
      }
    }

    return { databases, pages };
  }

  /**
   * Process pages for export with enhanced data collection.
   */
  private async processPages(exportId: string, pageIds: string[]): Promise<void> {
    if (!this.notionClient || !this.progressService) return;

    await this.progressService.startSection(exportId, "pages", pageIds.length);

    for (const pageId of pageIds) {
      try {
        const page = await this.notionClient.getPage(pageId);

        // Write page to output
        for (const exporter of this.exporters.filter((e) => e.config.types.includes(NotionObjectType.PAGE))) {
          await exporter.write(page);
        }

        // Export comments if enabled
        // if (this.exportConfig["include-comments"]) {
        //   try {
        //     const comments = await this.notionClient.getComments(pageId);
        //     if (comments.length > 0) {
        //       await this.fileSystemManager.writeRawData(
        //         comments,
        //         path.join(this.exportConfig.path, "comments", `${pageId}-comments.json`)
        //       );
        //       log.info(`  💬 Exported ${comments.length} comments for page ${page.title || pageId}`);
        //     }
        //   } catch (error) {
        //     log.info(
        //       `  ⚠️  Failed to export comments for page ${pageId}: ${
        //         error instanceof Error ? error.message : "Unknown error"
        //       }`
        //     );
        //   }
        // }

        // // Export properties if enabled
        // if (this.exportConfig["include-properties"]) {
        //   try {
        //     const properties = await this.notionClient.getPageProperties(pageId);
        //     if (properties.length > 0) {
        //       await this.fileSystemManager.writeRawData(
        //         properties,
        //         path.join(this.exportConfig.path, "properties", `${pageId}-properties.json`)
        //       );
        //       log.info(`  🏷️  Exported ${properties.length} properties for page ${page.title || pageId}`);
        //     }
        //   } catch (error) {
        //     log.info(
        //       `  ⚠️  Failed to export properties for page ${pageId}: ${
        //         error instanceof Error ? error.message : "Unknown error"
        //       }`
        //     );
        //   }
        // }

        // // Export block children if enabled
        // if (this.exportConfig["include-blocks"]) {
        //   try {
        //     const blocks = await this.exportAllBlocks(pageId);
        //     if (blocks.length > 0) {
        //       await this.fileSystemManager.writeRawData(
        //         blocks,
        //         path.join(this.exportConfig.path, "blocks", `${pageId}-blocks.json`)
        //       );
        //       log.info(`  📝 Exported ${blocks.length} blocks for page ${page.title || pageId}`);
        //     }
        //   } catch (error) {
        //     log.info(
        //       `  ⚠️  Failed to export blocks for page ${pageId}: ${
        //         error instanceof Error ? error.message : "Unknown error"
        //       }`
        //     );
        //   }
        // }

        await this.progressService.updateSectionProgress(exportId, "pages", 1);
      } catch (error) {
        const errorInfo = {
          id: crypto.randomUUID(),
          message: error instanceof Error ? error.message : "Unknown error",
          code: "PAGE_FETCH_ERROR",
          timestamp: new Date(),
          context: { pageId }
        };

        await this.progressService.addError(exportId, "pages", errorInfo);
      }
    }

    await this.progressService.completeSection(exportId, "pages");
  }

  /**
   * Export all blocks for a page, including nested blocks.
   */
  private async exportAllBlocks(blockId: string): Promise<any[]> {
    if (!this.notionClient) return [];

    const allBlocks: any[] = [];
    let hasMore = true;
    let nextCursor: string | undefined = undefined;

    while (hasMore) {
      try {
        const blocksResult = await this.notionClient.getBlocks(blockId);

        for (const block of blocksResult.results) {
          allBlocks.push(block);

          // Recursively export child blocks if they exist
          if (block.hasChildren) {
            const childBlocks = await this.exportAllBlocks(block.id);
            allBlocks.push(...childBlocks);
          }
        }

        hasMore = blocksResult.hasMore;
        nextCursor = blocksResult.nextCursor;
      } catch (error) {
        log.info(
          `  ⚠️  Failed to get blocks for ${blockId}: ${error instanceof Error ? error.message : "Unknown error"}`
        );
        break;
      }
    }

    return allBlocks;
  }

  /**
   * Process databases for export with enhanced data collection.
   */
  private async processDatabases(exportId: string, exporters: Exporter[], ids: string[]): Promise<void> {
    if (!this.notionClient || !this.progressService) return;

    await this.progressService.startSection(exportId, "databases", ids.length);

    for (const databaseId of ids) {
      try {
        // 1. First export the database metadata
        const database = await this.notionClient.getDatabase(databaseId);
        log.debugging.inspect("processDatabases", { databaseId, name: database.title });
        for (const exporter of exporters) {
          await exporter.write(database);
        }

        // 2. Export database properties if enabled
        // if (this.exportConfig["include-properties"]) {
        //   try {
        //     const properties = await this.notionClient.getDatabaseProperties(databaseId);
        //     if (properties.length > 0) {
        //       await this.fileSystemManager.writeRawData(
        //         properties,
        //         path.join(this.exportConfig.path, "properties", `${databaseId}-properties.json`)
        //       );
        //       log.info(`  🏷️  Exported ${properties.length} properties for database ${database.title || databaseId}`);
        //     }
        //   } catch (error) {
        //     log.info(
        //       `  ⚠️  Failed to export properties for database ${databaseId}: ${
        //         error instanceof Error ? error.message : "Unknown error"
        //       }`
        //     );
        //   }
        // }

        // // 3. Then export all pages in the database
        // let hasMore = true;
        // let nextCursor: string | undefined = undefined;
        // let pageCount = 0;
        // const databasePageIds: string[] = [];

        // while (hasMore) {
        //   try {
        //     const queryResult = await this.notionClient.queryDatabase(databaseId, {
        //       start_cursor: nextCursor,
        //       page_size: 100 // Process in batches of 100
        //     });

        //     // Export each page
        //     for (const page of queryResult.results) {
        //       // await this.writeToOutput(page, NotionObjectType.PAGE);
        //       for (const exporter of exporters) {
        //         await exporter.write(page);
        //       }
        //       databasePageIds.push(page.id);
        //       pageCount++;
        //     }

        //     hasMore = queryResult.hasMore;
        //     nextCursor = queryResult.nextCursor;

        //     if (queryResult.results.length > 0) {
        //       log.info(
        //         `📄 Exported ${queryResult.results.length} pages from database: ${database.title || databaseId}`
        //       );
        //     }
        //   } catch (pageError) {
        //     log.info(
        //       `⚠️ Failed to query pages from database ${databaseId}: ${
        //         pageError instanceof Error ? pageError.message : "Unknown error"
        //       }`
        //     );
        //     break;
        //   }
        // }

        // // 4. Export additional data for all pages in the database
        // if (databasePageIds.length > 0) {
        //   log.info(
        //     `📊 Processing additional data for ${databasePageIds.length} pages in database ${
        //       database.title || databaseId
        //     }`
        //   );

        //   // Process pages to get their comments, properties, and blocks
        //   for (const pageId of databasePageIds) {
        //     await this.exportPageAdditionalData(pageId);
        //   }
        // }

        log.info(`database ${database.title || databaseId}: exported metadata + nnnnn pages`);
        await this.progressService.updateSectionProgress(exportId, "databases", 1);
      } catch (error) {
        const errorInfo = {
          id: crypto.randomUUID(),
          message: error instanceof Error ? error.message : "Unknown error",
          code: "DATABASE_FETCH_ERROR",
          timestamp: new Date(),
          context: { databaseId }
        };

        await this.progressService.addError(exportId, "databases", errorInfo);
      }
    }

    await this.progressService.completeSection(exportId, "databases");
  }

  // /**
  //  * Export additional data for a page (comments, properties, blocks).
  //  */
  // private async exportPageAdditionalData(pageId: string): Promise<void> {
  //   if (!this.notionClient) return;

  //   // Export comments if enabled
  //   if (this.exportConfig["include-comments"]) {
  //     try {
  //       const comments = await this.notionClient.getComments(pageId);
  //       if (comments.length > 0) {
  //         await this.fileSystemManager.writeRawData(
  //           comments,
  //           path.join(this.exportConfig.path, "comments", `${pageId}-comments.json`)
  //         );
  //       }
  //     } catch (error) {
  //       // Silently continue - already logged in main method
  //     }
  //   }

  //   // Export properties if enabled
  //   if (this.exportConfig["include-properties"]) {
  //     try {
  //       const properties = await this.notionClient.getPageProperties(pageId);
  //       if (properties.length > 0) {
  //         await this.fileSystemManager.writeRawData(
  //           properties,
  //           path.join(this.exportConfig.path, "properties", `${pageId}-properties.json`)
  //         );
  //       }
  //     } catch (error) {
  //       // Silently continue - already logged in main method
  //     }
  //   }

  //   // Export blocks if enabled
  //   if (this.exportConfig["include-blocks"]) {
  //     try {
  //       const blocks = await this.exportAllBlocks(pageId);
  //       if (blocks.length > 0) {
  //         await this.fileSystemManager.writeRawData(
  //           blocks,
  //           path.join(this.exportConfig.path, "blocks", `${pageId}-blocks.json`)
  //         );
  //       }
  //     } catch (error) {
  //       // Silently continue - already logged in main method
  //     }
  //   }
  // }

  /**
   * Create a simple in-memory export repository.
   */
  private createInMemoryExportRepository(): any {
    const exports = new Map();

    return {
      save(export_: any): void {
        exports.set(export_.id, export_);
      },

      findById(id: string): any {
        return exports.get(id) || null;
      },

      findByStatus(status: string): any[] {
        return Array.from(exports.values()).filter((exp: any) => exp.status === status);
      },

      findRunning(): any[] {
        return Array.from(exports.values()).filter((exp: any) => exp.status === "running");
      },

      delete(id: string): void {
        exports.delete(id);
      },

      list(limit?: number, offset?: number): any[] {
        const all = Array.from(exports.values());
        const start = offset || 0;
        const end = limit ? start + limit : all.length;
        return all.slice(start, end);
      }
    };
  }

  private handleExportError(exportId: string, objectType: string, objectId: string | undefined, error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`error exporting ${objectType}${objectId ? ` (ID: ${objectId})` : ""}: ${errorMessage}`);
    // Here you would also update the export progress and record the error in the export entity
    // For now, we just log it.
  }

  private async exportWorkspaceMetadata(exportId: string, outputPath: string): Promise<void> {
    try {
      const workspace = await this.notionClient.getWorkspace();
      // await this.fileSystemManager.writeRawData(workspace, path.join(outputPath, "workspace.json"));
    } catch (error) {
      this.handleExportError(exportId, "workspace", undefined, error);
    }
  }

  private async exportUsers(exportId: string, outputPath: string): Promise<void> {
    try {
      const users = await this.notionClient.getUsers();
      // await this.fileSystemManager.writeRawData(users, path.join(outputPath, "users.json"));
    } catch (error) {
      this.handleExportError(exportId, "users", undefined, error);
    }
  }
}
