/**
 * WorkspaceExporter - Handles the actual execution of workspace exports.
 *
 * This class bridges the domain-driven Export entity with the actual
 * export execution, maintaining event-driven architecture while
 * incorporating the directory creation and metadata export functionality.
 */

import { Client } from "@notionhq/client";
import { EventEmitter } from "events";
import { promises as fs } from "fs";
import path from "path";
import { Export } from "../../core/domain/export";
import { FileSystemEvents } from "../../core/events";
import { ProgressService } from "../../core/services/progress-service";
import { log } from "../log";
import { OperationEventEmitter, retry } from "../operations";
import { ExporterConfig } from "./config";

declare global {
  interface Date {
    toISOString(): string;
  }
}

/**
 * Result of a workspace export operation.
 */
export interface WorkspaceExportResult {
  /**
   * Total number of users exported.
   */
  usersCount: number;
  /**
   * Total number of databases exported.
   */
  databasesCount: number;
  /**
   * Total number of pages exported.
   */
  pagesCount: number;
  /**
   * Total number of blocks exported.
   */
  blocksCount: number;
  /**
   * Total number of comments exported.
   */
  commentsCount: number;
  /**
   * Total number of files referenced.
   */
  filesCount: number;
  /**
   * Export start time.
   */
  startTime: Date;
  /**
   * Export end time.
   */
  endTime: Date;
  /**
   * Any errors encountered during export.
   */
  errors: Array<{ type: string; id?: string; error: string }>;
  /**
   * Workspace metadata.
   */
  workspaceInfo?: any;
}

/**
 * WorkspaceExporter executes the actual export operations.
 *
 * This class is responsible for:
 * - Creating directory structures
 * - Coordinating export operations
 * - Emitting progress events
 * - Collecting export statistics
 */
export class WorkspaceExporter extends EventEmitter implements OperationEventEmitter {
  private client: Client;
  private config: ExporterConfig;
  private progressService: ProgressService;
  private eventPublisher: (event: any) => Promise<void>;
  private errors: Array<{ type: string; id?: string; error: string }> = [];

  /**
   * Creates a new WorkspaceExporter.
   *
   * Arguments:
   * - config: Export configuration
   * - progressService: Service for tracking progress
   * - eventPublisher: Function to publish domain events
   *
   * Returns:
   * - A new WorkspaceExporter instance
   */
  constructor(config: ExporterConfig, progressService: ProgressService, eventPublisher: (event: any) => Promise<void>) {
    super();
    this.config = config;
    this.progressService = progressService;
    this.eventPublisher = eventPublisher;

    this.client = new Client({
      auth: this.config.token,
      timeoutMs: this.config.timeout
    });
  }

  /**
   * Execute the export for a given Export entity.
   *
   * Arguments:
   * - export_: The Export entity to execute
   *
   * Returns:
   * - The result of the export operation
   */
  async execute(export_: Export): Promise<WorkspaceExportResult> {
    const startTime = new Date();
    log.info("Starting workspace export", { exportId: export_.id });

    try {
      // Create output directory structure
      await this.createOutputDirectoryStructure(export_.configuration.outputPath);

      // Start progress tracking
      await this.progressService.startTracking(export_.id);

      // Export workspace metadata
      const workspaceInfo = await this.exportWorkspaceMetadata(export_);

      // TODO: Add actual export logic for databases, pages, blocks, etc.
      // This would be implemented by integrating with NotionClient and FileSystemManager

      const endTime = new Date();

      const result: WorkspaceExportResult = {
        usersCount: 0,
        databasesCount: export_.configuration.databases.length,
        pagesCount: export_.configuration.pages.length,
        blocksCount: 0,
        commentsCount: 0,
        filesCount: 0,
        startTime,
        endTime,
        errors: this.errors,
        workspaceInfo
      };

      log.success(`Exported workspace ${export_.id}`, { result });
      return result;
    } catch (error) {
      log.error(`Failed to export workspace ${export_.id}`, { error });
      this.handleError("export", export_.id, error);
      throw error;
    }
  }

  /**
   * Create the output directory structure.
   *
   * Arguments:
   * - outputPath: The base output path
   *
   * Returns:
   * - Promise that resolves when directories are created
   */
  private async createOutputDirectoryStructure(outputPath: string): Promise<void> {
    const dirs = [
      outputPath,
      path.join(outputPath, "users"),
      path.join(outputPath, "databases"),
      path.join(outputPath, "pages"),
      path.join(outputPath, "properties"),
      path.join(outputPath, "blocks"),
      path.join(outputPath, "comments"),
      path.join(outputPath, "metadata"),
      path.join(outputPath, "files")
    ];

    log.debug("Creating directory structure", { dirs });

    await Promise.all(
      dirs.map(async (dir) => {
        await fs.mkdir(dir, { recursive: true });
        await this.eventPublisher(FileSystemEvents.directoryCreated(dir));
      })
    );

    log.success("Created output directory structure", { dirs });
  }

  /**
   * Export workspace metadata.
   *
   * Arguments:
   * - export_: The Export entity
   *
   * Returns:
   * - The workspace information
   */
  private async exportWorkspaceMetadata(export_: Export): Promise<any> {
    try {
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

      const filePath = path.join(this.config.output, "metadata", "workspace-info.json");

      await fs.writeFile(filePath, JSON.stringify(workspaceInfo, null, 2));

      log.success("Exported workspace metadata", { exportId: export_.id, filePath });

      return workspaceInfo;
    } catch (error) {
      this.handleError("workspace metadata", export_.id, error);
      return null;
    }
  }

  /**
   * Handle and log errors.
   *
   * Arguments:
   * - type: The type of operation that failed
   * - id: The ID of the resource being processed
   * - error: The error that occurred
   *
   * Returns:
   * - void
   */
  private handleError(type: string, id: string | undefined, error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    this.errors.push({ type, id, error: errorMessage });

    log.error(`Failed to export ${type}${id ? ` (${id})` : ""}`, { error: errorMessage });
  }
}
