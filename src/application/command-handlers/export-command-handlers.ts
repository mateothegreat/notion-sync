/**
 * Export Command Handlers
 *
 * Handles export-related commands in the CQRS architecture
 */

import { ProgressService } from "../../core/services/progress-service";
import { FileSystemManager } from "../../infrastructure/filesystem/file-system-manager";
import { NotionClient } from "../../infrastructure/notion/notion-client";
import { CommandHandler } from "../../lib/control-plane/types";
import { ExportService } from "../../lib/export/export-service";
import { ExportConfiguration, ExportFormat } from "../../shared/types/index";

/**
 * Command payload for creating an export.
 */
export interface CreateExportCommand {
  configuration: ExportConfiguration;
  userId?: string;
}

/**
 * Command payload for starting an export.
 */
export interface StartExportCommand {
  exportId: string;
}

/**
 * Command payload for processing databases.
 */
export interface ProcessDatabasesCommand {
  exportId: string;
  databaseIds: string[];
}

/**
 * Command payload for processing pages.
 */
export interface ProcessPagesCommand {
  exportId: string;
  pageIds: string[];
}

/**
 * Command payload for completing an export.
 */
export interface CompleteExportCommand {
  exportId: string;
  outputPath: string;
}

/**
 * Command payload for failing an export.
 */
export interface FailExportCommand {
  exportId: string;
  error: any;
}

const getExportFormat = async (exportId: string): Promise<ExportFormat> => {
  // Mock implementation - in real app this would come from export config
  return ExportFormat.JSON;
};

/**
 * Creates a command handler for creating new exports
 */
export const createExportCommandHandler = (
  exportService: ExportService,
  progressService: ProgressService
): CommandHandler => {
  return async (command: any) => {
    // Handle command logic
  };
};

/**
 * Creates a command handler for starting exports
 */
export const startExportCommandHandler = (
  exportService: ExportService,
  progressService: ProgressService
): CommandHandler => {
  return async (command: any) => {
    const { exportId } = command.payload;

    try {
      await exportService.startExport(exportId);
      console.log(`Export started: ${exportId}`);
    } catch (error) {
      console.error("Failed to start export:", error);
      throw error;
    }
  };
};

/**
 * Creates a command handler for processing databases
 */
export const processDatabasesCommandHandler = (
  exportService: ExportService,
  progressService: ProgressService,
  fileSystemManager: FileSystemManager,
  notionClient: NotionClient
): CommandHandler => {
  return async (command: any) => {
    const { exportId, databaseIds } = command.payload;

    try {
      // Start database processing section
      await progressService.startSection(exportId, "databases", databaseIds.length);

      for (const databaseId of databaseIds) {
        try {
          // Fetch database from Notion
          const database = await notionClient.getDatabase(databaseId);

          // Get export format
          const format = await getExportFormat(exportId);

          // Write database to filesystem
          await fileSystemManager.writeDatabase(database, format);

          // Update progress
          await progressService.updateSectionProgress(exportId, "databases", 1);

          console.log(`Database processed: ${databaseId}`);
        } catch (error) {
          console.error(`Failed to process database ${databaseId}:`, error);
          await progressService.addError(exportId, "databases", {
            id: crypto.randomUUID(),
            message: error instanceof Error ? error.message : String(error),
            timestamp: new Date(),
            context: { databaseId }
          });
        }
      }

      // Complete section
      await progressService.completeSection(exportId, "databases");

      // Check if export is complete
      const progress = progressService.getProgress(exportId);
      const sections = progressService.getAllSections(exportId);
      const databaseSection = sections.find((s) => s.name === "databases");

      if (databaseSection?.endTime) {
        const pagesSection = sections.find((s) => s.name === "pages");
        const pagesComplete = !pagesSection || pagesSection.endTime;

        if (pagesComplete) {
          // All sections complete - trigger completion
          // This would typically dispatch a CompleteExportCommand
          console.log(`Export ${exportId} ready for completion`);
        }
      }
    } catch (error) {
      console.error("Failed to process databases:", error);
      throw error;
    }
  };
};

/**
 * Creates a command handler for processing pages
 */
export const processPagesCommandHandler = (
  exportService: ExportService,
  progressService: ProgressService,
  fileSystemManager: FileSystemManager,
  notionClient: NotionClient
): CommandHandler => {
  return async (command: any) => {
    const { exportId, pageIds } = command.payload;

    try {
      // Start pages processing section
      await progressService.startSection(exportId, "pages", pageIds.length);

      for (const pageId of pageIds) {
        try {
          // Fetch page from Notion
          const page = await notionClient.getPage(pageId);

          // Get export format
          const format = await getExportFormat(exportId);

          // Write page to filesystem
          await fileSystemManager.writePage(page, format);

          // Update progress
          await progressService.updateSectionProgress(exportId, "pages", 1);

          console.log(`Page processed: ${pageId}`);
        } catch (error) {
          console.error(`Failed to process page ${pageId}:`, error);
          await progressService.addError(exportId, "pages", {
            id: crypto.randomUUID(),
            message: error instanceof Error ? error.message : String(error),
            timestamp: new Date(),
            context: { pageId }
          });
        }
      }

      // Complete section
      await progressService.completeSection(exportId, "pages");

      console.log(`Pages processing completed for export: ${exportId}`);
    } catch (error) {
      console.error("Failed to process pages:", error);
      throw error;
    }
  };
};

/**
 * Creates a command handler for completing exports
 */
export const completeExportCommandHandler = (
  exportService: ExportService,
  progressService: ProgressService
): CommandHandler => {
  return async (command: any) => {
    const { exportId, outputPath } = command.payload;

    try {
      // Get export statistics
      const stats = progressService.getStatistics(exportId);

      // Complete the export
      await exportService.completeExport(exportId, outputPath);

      // Stop progress tracking
      progressService.stopTracking(exportId);

      console.log(`Export completed: ${exportId}`);
      console.log(`Output path: ${outputPath}`);
      console.log(`Statistics:`, stats);
    } catch (error) {
      console.error("Failed to complete export:", error);
      throw error;
    }
  };
};

/**
 * Creates a command handler for handling export failures
 */
export const failExportCommandHandler = (
  exportService: ExportService,
  progressService: ProgressService
): CommandHandler => {
  return async (command: any) => {
    const { exportId, error: exportError } = command.payload;

    try {
      // Fail the export
      await exportService.failExport(exportId, exportError);

      // Stop progress tracking
      progressService.stopTracking(exportId);

      console.log(`Export failed: ${exportId}`);
      console.error("Export error:", exportError);
    } catch (error) {
      console.error("Failed to handle export failure:", error);
      throw error;
    }
  };
};
