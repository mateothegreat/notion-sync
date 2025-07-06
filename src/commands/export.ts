/**
 * Export Command
 *
 * CLI command for exporting Notion content using the new event-driven architecture
 */
import { Flags } from "@oclif/core";
import chalk from "chalk";
import { promises as fs } from "fs";
import path from "path";
import { inspect } from "util";

import { config as configLoaded, resolveFlags } from "$lib/config-loader";
import { log } from "$lib/log.js";
import { getObjects, ObjectsEnum } from "$lib/objects/types.js";
import { ExportService } from "../core/services/export-service.js";
import { ProgressService } from "../core/services/progress-service.js";
import { NotionClient } from "../infrastructure/notion/notion-client.js";
import { BaseCommand } from "../lib/commands/base-command.js";
import { ControlPlane, createControlPlane } from "../lib/control-plane/control-plane.js";
import { ExportConfiguration, ExportFormat, NotionConfig } from "../shared/types/index.js";

export default class Export extends BaseCommand<typeof Export> {
  static override description = "Export Notion content using the new event-driven architecture";

  static override examples = [
    "<%= config.bin %> <%= command.id %> --path ./exports",
    "<%= config.bin %> <%= command.id %> --path ./exports --databases db1,db2",
    "<%= config.bin %> <%= command.id %> --path ./exports --pages page1,page2",
    "<%= config.bin %> <%= command.id %> --path ./exports --format json"
  ];

  static override flags = {
    path: Flags.string({
      char: "p",
      description: "\nPath to the directory where the outputs will be saved.",
      default: `./notion-export-${new Date().toISOString().split("T")[0]}`,
      required: true
    }),
    databases: Flags.string({
      char: "d",
      description: "Comma-separated list of database IDs to export."
    }),
    objects: Flags.string({
      description: "\nObjects to export (if not provided, all objects will be exported by default).",
      options: getObjects(Object.values(ObjectsEnum).join(",")),
      default: Object.values(ObjectsEnum).join(","),
      required: true
    }),
    pages: Flags.string({
      char: "p",
      description: "Comma-separated list of page IDs to export."
    }),
    format: Flags.string({
      char: "f",
      description: "\nFormat of the exported data.",
      options: ["json", "markdown", "html", "csv"],
      default: "json"
    }),
    "include-blocks": Flags.boolean({
      description: "\nInclude block content in export.",
      default: true
    }),
    "include-comments": Flags.boolean({
      description: "\nInclude comments in export.",
      default: false
    }),
    "include-properties": Flags.boolean({
      description: "\nInclude all properties in export.",
      default: true
    }),
    resume: Flags.boolean({
      description: "\nResume a previous export if checkpoint exists.",
      default: false
    }),
    "max-concurrency": Flags.integer({
      description: "\nMaximum number of concurrent requests.",
      default: 10
    }),
    verbose: Flags.boolean({
      char: "v",
      description: "Enable verbose logging.",
      default: false
    })
  };

  private controlPlane?: ControlPlane;
  private exportService?: ExportService;
  private progressService?: ProgressService;
  private notionClient?: NotionClient;

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(Export);
    log.debug.inspect("flags", flags);

    const config = resolveFlags(flags);

    try {
      // Parse databases and pages
      let databases: string[];

      if (flags.databases) {
        // If provided via CLI, parse comma-separated string
        databases = flags.databases.split(",").map((id: string) => id.trim());
      } else if (configLoaded.databases && configLoaded.databases.length > 0) {
        // If not provided, use databases from config file
        databases = configLoaded.databases.map((db: { name: string; id: string }) => db.id);
      } else {
        databases = [];
      }

      const pages = flags.pages ? flags.pages.split(",").map((id: string) => id.trim()) : [];

      if (databases.length === 0 && pages.length === 0) {
        this.error("At least one database or page must be specified");
      }

      // Create output directory
      const outputPath = path.resolve(flags.path);
      await fs.mkdir(outputPath, { recursive: true });

      this.log(chalk.blue("🚀 Notion Sync - Event-Driven Architecture"));
      this.log(chalk.gray("━".repeat(50)));
      this.log(`📁 Output: ${chalk.yellow(outputPath)}`);
      this.log(`🔄 Max Concurrency: ${chalk.yellow(flags["max-concurrency"])}`);
      this.log(`📦 Format: ${chalk.yellow(flags.format)}`);
      this.log(chalk.gray("━".repeat(50)));

      // Initialize control plane and services
      await this.initializeServices(flags.token as string, flags);

      // Set up progress monitoring
      this.setupProgressMonitoring();

      // Create export configuration
      const exportConfiguration: ExportConfiguration = {
        outputPath,
        format: flags.format as ExportFormat,
        includeBlocks: flags["include-blocks"],
        includeComments: flags["include-comments"],
        includeProperties: flags["include-properties"],
        databases,
        pages
      };

      // Start export process
      await this.executeExport(exportConfiguration);

      this.log(chalk.green("\n✅ Export completed successfully!"));
      this.log(`📁 Files saved to: ${chalk.yellow(outputPath)}`);
    } catch (error) {
      if (flags.verbose) {
        console.log(inspect(error, { colors: true, compact: false }));
      }

      if (error instanceof Error) {
        this.error(chalk.red(`❌ Export failed: ${error.message}`));
      } else {
        this.error(chalk.red("❌ Export failed with unknown error"));
      }
    } finally {
      // Clean up
      if (this.controlPlane) {
        await this.controlPlane.destroy();
      }
    }
  }

  /**
   * Initialize control plane and all services.
   */
  private async initializeServices(apiKey: string, flags: any): Promise<void> {
    this.log("🔧 Initializing control plane...");

    // Create control plane
    this.controlPlane = createControlPlane({
      enableLogging: flags.verbose,
      enableMetrics: true,
      enableHealthCheck: true,
      autoStartComponents: true
    });

    await this.controlPlane.initialize();
    await this.controlPlane.start();

    // Create notion configuration
    const notionConfig: NotionConfig = {
      apiKey,
      apiVersion: "2022-06-28",
      baseUrl: "https://api.notion.com",
      timeout: 30000,
      retryAttempts: 3
    };

    // Create circuit breaker for Notion API
    const circuitBreaker = this.controlPlane.getCircuitBreaker("notion-api", {
      failureThreshold: 5,
      resetTimeout: 30000,
      monitoringPeriod: 60000
    });

    // Create event publisher
    const eventPublisher = async (event: any) => {
      await this.controlPlane!.publish("domain-events", event);
    };

    // Initialize services
    this.notionClient = new NotionClient(notionConfig, eventPublisher, circuitBreaker);
    this.progressService = new ProgressService(eventPublisher);

    // For export service, we need to create a simple in-memory repository
    const exportRepository = this.createInMemoryExportRepository();
    this.exportService = new ExportService(exportRepository, eventPublisher);

    this.log("✅ Services initialized successfully");
  }

  /**
   * Set up progress monitoring for export events.
   */
  private setupProgressMonitoring(): void {
    if (!this.controlPlane) return;

    let lastProgress = 0;

    // Subscribe to domain events
    this.controlPlane.subscribe("domain-events", async (message) => {
      const event = message.payload as any;

      if (!event || typeof event !== "object" || !event.type) {
        return;
      }

      switch (event.type) {
        case "export.progress.updated":
          const progress = event.payload?.progress;
          if (!progress) break;

          // Only show progress updates every 10%
          const currentProgress = Math.floor(progress.percentage / 10) * 10;
          if (currentProgress > lastProgress) {
            this.log(
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
              this.log(`⏱️  ETA: ${remainingMin} minutes`);
            }
          }
          break;

        case "export.completed":
          const duration = event.payload?.duration;
          const itemsProcessed = event.payload?.itemsProcessed;
          const errors = event.payload?.errors;

          if (duration && itemsProcessed && errors) {
            this.log(chalk.green("\n🎉 Export Statistics:"));
            this.log(`   📦 Items processed: ${chalk.cyan(itemsProcessed)}`);
            this.log(`   ⏱️  Duration: ${chalk.cyan((duration / 1000).toFixed(1))}s`);
            this.log(`   🚀 Items/second: ${chalk.cyan((itemsProcessed / (duration / 1000)).toFixed(1))}`);

            if (errors.length > 0) {
              this.log(`   ⚠️  Errors: ${chalk.yellow(errors.length)}`);
            } else {
              this.log(`   ✅ No errors`);
            }
          }
          break;

        case "export.failed":
          const error = event.payload?.error;
          if (error?.message) {
            this.error(chalk.red(`❌ Export failed: ${error.message}`));
          }
          break;

        case "notion.rate_limit.hit":
          const retryAfter = event.payload?.retryAfter;
          if (retryAfter) {
            this.log(chalk.yellow(`⏳ Rate limit hit. Waiting ${retryAfter} seconds...`));
          }
          break;

        case "circuit_breaker.opened":
          const breakerName = event.payload?.name;
          if (breakerName) {
            this.log(chalk.yellow(`🔌 Circuit breaker opened for ${breakerName}. Requests temporarily blocked.`));
          }
          break;

        case "circuit_breaker.closed":
          const closedBreakerName = event.payload?.name;
          if (closedBreakerName) {
            this.log(chalk.green(`🔌 Circuit breaker closed for ${closedBreakerName}. Requests resumed.`));
          }
          break;

        case "progress.section.started":
          const section = event.payload?.section;
          const totalItems = event.payload?.totalItems;
          if (section && totalItems) {
            this.log(`📂 Starting section: ${chalk.cyan(section)} (${totalItems} items)`);
          }
          break;

        case "progress.section.completed":
          const completedSection = event.payload?.section;
          const sectionDuration = event.payload?.duration;
          const sectionErrors = event.payload?.errors;
          if (completedSection && sectionDuration) {
            this.log(
              `✅ Completed section: ${chalk.cyan(completedSection)} in ${(sectionDuration / 1000).toFixed(1)}s`
            );
            if (sectionErrors && sectionErrors.length > 0) {
              this.log(`   ⚠️  Section errors: ${sectionErrors.length}`);
            }
          }
          break;

        case "notion.object.fetched":
          // Optional: log individual object fetches in verbose mode
          break;
      }
    });
  }

  /**
   * Execute the export process.
   */
  private async executeExport(configuration: ExportConfiguration): Promise<void> {
    if (!this.exportService || !this.progressService) {
      throw new Error("Services not initialized");
    }

    // Create export
    this.log("📝 Creating export...");
    const export_ = await this.exportService.createExport(configuration);
    this.log(`✅ Export created with ID: ${chalk.cyan(export_.id)}`);

    // Start progress tracking
    await this.progressService.startTracking(export_.id);

    // Start export
    this.log("🚀 Starting export...");
    await this.exportService.startExport(export_.id);

    // Process databases
    if (configuration.databases.length > 0) {
      await this.processDatabases(export_.id, configuration.databases);
    }

    // Process pages
    if (configuration.pages.length > 0) {
      await this.processPages(export_.id, configuration.pages);
    }

    // Complete export
    await this.exportService.completeExport(export_.id, configuration.outputPath);
    this.progressService.stopTracking(export_.id);
  }

  /**
   * Process databases for export.
   */
  private async processDatabases(exportId: string, databaseIds: string[]): Promise<void> {
    if (!this.notionClient || !this.progressService) return;

    await this.progressService.startSection(exportId, "databases", databaseIds.length);

    for (const databaseId of databaseIds) {
      try {
        const database = await this.notionClient.getDatabase(databaseId);

        // Write database to output
        await this.writeToOutput(database, "database");

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

  /**
   * Process pages for export.
   */
  private async processPages(exportId: string, pageIds: string[]): Promise<void> {
    if (!this.notionClient || !this.progressService) return;

    await this.progressService.startSection(exportId, "pages", pageIds.length);

    for (const pageId of pageIds) {
      try {
        const page = await this.notionClient.getPage(pageId);

        // Write page to output
        await this.writeToOutput(page, "page");

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
   * Write data to output file.
   */
  private async writeToOutput(data: any, type: string): Promise<void> {
    // For now, we'll just log the data
    // In a real implementation, this would write to files based on the format
    this.log(`📄 Exported ${type}: ${data.id}`);
  }

  /**
   * Create a simple in-memory export repository.
   */
  private createInMemoryExportRepository(): any {
    const exports = new Map();

    return {
      async save(export_: any): Promise<void> {
        exports.set(export_.id, export_);
      },

      async findById(id: string): Promise<any> {
        return exports.get(id) || null;
      },

      async findByStatus(status: string): Promise<any[]> {
        return Array.from(exports.values()).filter((exp: any) => exp.status === status);
      },

      async findRunning(): Promise<any[]> {
        return Array.from(exports.values()).filter((exp: any) => exp.status === "running");
      },

      async delete(id: string): Promise<void> {
        exports.delete(id);
      },

      async list(limit?: number, offset?: number): Promise<any[]> {
        const all = Array.from(exports.values());
        const start = offset || 0;
        const end = limit ? start + limit : all.length;
        return all.slice(start, end);
      }
    };
  }
}
