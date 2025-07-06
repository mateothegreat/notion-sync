import { log } from "$lib/log";
import { Client } from "@notionhq/client";
import { EventEmitter } from "events";
import { promises as fs } from "fs";
import path from "path";
import type { OperationEventEmitter } from "../operations";
import { ExporterConfig } from "./config";
import { WorkspaceMetadataExporter } from "./workspace-metadata-exporter";

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
export class NewExporter extends EventEmitter implements OperationEventEmitter {
  /**
   * The Notion client.
   */
  private client: Client;

  /**
   * The configuration for the workspace exporter.
   */
  private config: ExporterConfig;

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

    try {
      // Create output directory structure.
      await this.createOutputDirectoryStructure();

      // Export workspace metadata.
      const workspaceMetadataExporter = new WorkspaceMetadataExporter(this.config, this);
      const workspaceInfo = await workspaceMetadataExporter.export();

      const endTime = new Date();

      return {
        usersCount: 0,
        databasesCount: 0,
        pagesCount: 0,
        blocksCount: 0,
        commentsCount: 0,
        filesCount: 0,
        startTime,
        endTime,
        errors: this.errors,
        workspaceInfo
      };
    } catch (error) {
      this.handleError("export", undefined, error);
      throw error;
    }
  }

  /**
   * Create the output directory structure.
   *
   * @returns A promise that resolves when the output directory structure is created.
   */
  private async createOutputDirectoryStructure(): Promise<void> {
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
}
