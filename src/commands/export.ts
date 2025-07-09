/**
 * Export Command
 *
 * CLI command for exporting Notion content
 */
import { log } from "$util/log";

import { BaseCommand } from "$cli/base-command";
import { createCommandFlags, loadCommandConfig, ResolvedCommandConfig } from "$config/loader";
import { NotionClient } from "$notion/client";
import { Context } from "../lib/context";

export default class Export extends BaseCommand<typeof Export> {
  static override flags = createCommandFlags("export");
  static override description = "Export Notion content using the new event-driven architecture";
  static override examples = [
    "<%= config.bin %> <%= command.id %> --path ./exports",
    "<%= config.bin %> <%= command.id %> --path ./exports --databases db1,db2",
    "<%= config.bin %> <%= command.id %> --path ./exports --pages page1,page2",
    "<%= config.bin %> <%= command.id %> --path ./exports --format json"
  ];

  private client?: NotionClient;
  private command: ResolvedCommandConfig<"export">;

  public async run(): Promise<void> {
    try {
      const { flags } = await this.parse(Export);
      this.command = (await loadCommandConfig("export", flags)).rendered;

      const databases: string[] = this.command.databases.map((db) => db.id);
      const pages: string[] = this.command.pages ? this.command.pages.map((p) => p.id) : [];

      const context = new Context<"export">({
        command: this.command,
        token: this.command.token
      });
      log.debugging.inspect("context", this.command);
    } catch (error) {
      log.error(error instanceof Error ? error.message : "Unknown error");
      throw error;
    }
  }

  // /**
  //  * Discover all databases and standalone pages in the workspace.
  //  */
  // private async discover(): Promise<{ databases: string[]; pages: string[] }> {
  //   if (!this.client) {
  //     throw new Error("NotionClient not initialized");
  //   }

  //   const pages: string[] = [];
  //   const processedPageIds = new Set<string>();

  //   let hasMore = true;
  //   let nextCursor: string | undefined = undefined;

  //   const databases = await lastValueFrom(this.client.databases.search());

  //   log.debugging.inspect("databases", { databases });

  //   log.success(`discovered ${databases.length} databases`);

  //   for (const database of databases) {
  //   }

  //   // Use streaming search to find all pages
  //   const allPages = await lastValueFrom(
  //     this.client
  //       .searchAll({
  //         filter: { property: "object", value: "page" }
  //       })
  //       .pipe(toArray())
  //   );

  //   // Filter out pages that are in databases
  //   for (const page of allPages) {
  //     // Type guard to ensure we have a full page object with parent property
  //     const isFullPageResponse = (obj: NotionFilteredSearchResult<any>): obj is PageObjectResponse => {
  //       return "parent" in obj && "properties" in obj;
  //     };

  //     // Get a title for logging - handle both full and partial responses
  //     const getPageTitle = (pageObj: NotionFilteredSearchResult<any>): string => {
  //       if ("properties" in pageObj && pageObj.properties && "title" in pageObj.properties) {
  //         const titleProp = pageObj.properties.title;
  //         if (titleProp && "title" in titleProp && Array.isArray(titleProp.title) && titleProp.title.length > 0) {
  //           return titleProp.title[0]?.plain_text || pageObj.id;
  //         }
  //       }
  //       return pageObj.id;
  //     };

  //     if (isFullPageResponse(page) && page.parent?.type !== "database_id" && !processedPageIds.has(page.id)) {
  //       pages.push(page.id);
  //       processedPageIds.add(page.id);
  //       log.info(`found standalone page: ${getPageTitle(page)}`);
  //     }
  //   }

  //   return { databases: databases.map((db) => db.id), pages };
  // }

  // /**
  //  * Process pages for export with enhanced data collection using parallel processing.
  //  */
  // private async processPages(exportId: string, pageIds: string[]): Promise<void> {
  //   await this.progressService.startSection(exportId, "pages", pageIds.length);

  //   // Process pages in parallel batches
  //   const batchSize = this.exportConfig.concurrency || 5;
  //   const batches = this.createBatches(pageIds, batchSize);

  //   for (const batch of batches) {
  //     try {
  //       // Fetch all pages in batch in parallel
  //       const pages = await lastValueFrom(this.client.getPages(batch));

  //       // Process each page
  //       for (const page of pages) {
  //         for (const exporter of this.exporters.filter((e) => e.config.types.includes(NotionObjectType.PAGE))) {
  //           await exporter.write(page);
  //         }
  //       }

  //       await this.progressService.updateSectionProgress(exportId, "pages", batch.length);
  //     } catch (error) {
  //       for (const pageId of batch) {
  //         const errorInfo = {
  //           id: crypto.randomUUID(),
  //           message: error instanceof Error ? error.message : "Unknown error",
  //           code: "PAGE_FETCH_ERROR",
  //           timestamp: new Date(),
  //           context: { pageId }
  //         };

  //         await this.progressService.addError(exportId, "pages", errorInfo);
  //       }
  //     }
  //   }

  //   await this.progressService.completeSection(exportId, "pages");
  // }

  // /**
  //  * Export all blocks for a page using streaming, including nested blocks.
  //  */
  // private async exportAllBlocks(blockId: string): Promise<any[]> {
  //   if (!this.client) return [];

  //   try {
  //     const allBlocks = await lastValueFrom(this.client.getAllBlocks(blockId).pipe(toArray()));

  //     return allBlocks;
  //   } catch (error) {
  //     log.info(
  //       `  ⚠️  Failed to get blocks for ${blockId}: ${error instanceof Error ? error.message : "Unknown error"}`
  //     );
  //     return [];
  //   }
  // }

  // /**
  //  * Process databases for export with enhanced data collection using parallel processing.
  //  */
  // private async processDatabases(exportId: string, exporters: ExporterPlugin[], ids: string[]): Promise<void> {
  //   if (!this.client || !this.progressService) return;

  //   await this.progressService.startSection(exportId, "databases", ids.length);

  //   // Process databases in parallel batches.
  //   const batchSize = this.exportConfig.concurrency || 5;
  //   const batches = this.createBatches(ids, batchSize);

  //   for (const batch of batches) {
  //     try {
  //       // Fetch all databases in batch in parallel.
  //       const databases = await lastValueFrom(this.client.getDatabasesById(batch));

  //       // Process each database.
  //       for (const database of databases) {
  //         log.debugging.inspect("processDatabases", { databaseId: database.id, name: database.title });

  //         // Export database metadata.
  //         for (const exporter of exporters) {
  //           await exporter.write(database);
  //         }

  //         // Export all pages in the database using streaming.
  //         try {
  //           const databasePages = await lastValueFrom(
  //             this.client.queryDatabaseAll({ database_id: database.id }).pipe(toArray())
  //           );

  //           log.info(`📄 Processing ${databasePages.length} pages from database: ${database.title || database.id}`);

  //           // Process pages in parallel batches.
  //           const pageBatches = this.createBatches(databasePages, batchSize);
  //           for (const pageBatch of pageBatches) {
  //             for (const page of pageBatch) {
  //               for (const exporter of exporters.filter((e) => e.config.types.includes(NotionObjectType.PAGE))) {
  //                 await exporter.write(page);
  //               }
  //             }
  //           }
  //         } catch (pageError) {
  //           log.info(
  //             `⚠️ Failed to query pages from database ${database.id}: ${
  //               pageError instanceof Error ? pageError.message : "Unknown error"
  //             }`
  //           );
  //         }
  //       }

  //       this.progressService.updateSectionProgress(exportId, "databases", batch.length);
  //     } catch (error) {
  //       for (const databaseId of batch) {
  //         const errorInfo = {
  //           id: crypto.randomUUID(),
  //           message: error instanceof Error ? error.message : "Unknown error",
  //           code: "DATABASE_FETCH_ERROR",
  //           timestamp: new Date(),
  //           context: { databaseId }
  //         };

  //         this.progressService.addError(exportId, "databases", errorInfo);
  //       }
  //     }
  //   }

  //   this.progressService.completeSection(exportId, "databases");
  // }
}
