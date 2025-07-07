/**
 * Workspace Directory Organizer
 *
 * Organizes exported files in a logical directory structure
 */

import { promises as fs } from "fs";
import path from "path";
import { ExportFormat, NotionDatabase, NotionPage } from "../../../shared/types";
import { DirectoryOrganizer, FileSystemConfig } from "../types";

export class WorkspaceOrganizer implements DirectoryOrganizer {
  private config: FileSystemConfig;

  constructor(config: FileSystemConfig) {
    this.config = config;
  }

  /**
   * Get the directory path for a database
   */
  getDatabasePath(database: NotionDatabase, basePath: string): string {
    switch (this.config.organizationStrategy) {
      case "flat":
        return basePath;
      case "hierarchical":
        return this.getHierarchicalDatabasePath(database, basePath);
      case "by-type":
        return path.join(basePath, "databases");
      case "by-date":
        return this.getDateBasedPath(database.createdTime, basePath, "databases");
      default:
        return path.join(basePath, "databases");
    }
  }

  /**
   * Get the directory path for a page
   */
  getPagePath(page: NotionPage, basePath: string): string {
    switch (this.config.organizationStrategy) {
      case "flat":
        return basePath;

      case "hierarchical":
        return this.getHierarchicalPagePath(page, basePath);

      case "by-type":
        return path.join(basePath, "pages");

      case "by-date":
        return this.getDateBasedPath(page.createdTime, basePath, "pages");

      default:
        return path.join(basePath, "pages");
    }
  }

  /**
   * Get the file path for a specific item
   */
  getFilePath(item: NotionDatabase | NotionPage, basePath: string, format: ExportFormat): string {
    const directory =
      item.type === "database"
        ? this.getDatabasePath(item as NotionDatabase, basePath)
        : this.getPagePath(item as NotionPage, basePath);

    const filename = this.generateFilename(item);
    const extension = this.getExtensionForFormat(format);

    return path.join(directory, `${filename}${extension}`);
  }

  /**
   * Create the directory structure
   */
  async createDirectoryStructure(basePath: string): Promise<void> {
    // Create base directory
    await this.ensureDirectoryExists(basePath);

    // Create standard subdirectories based on organization strategy
    switch (this.config.organizationStrategy) {
      case "flat":
        // No subdirectories needed
        break;

      case "hierarchical":
        // Directories will be created as needed
        break;

      case "by-type":
        await this.createTypeBasedStructure(basePath);
        break;

      case "by-date":
        // Date directories will be created as needed
        break;
    }

    // Create metadata directory
    await this.ensureDirectoryExists(path.join(basePath, ".metadata"));

    // Create assets directory for images, files, etc.
    await this.ensureDirectoryExists(path.join(basePath, "assets"));
  }

  /**
   * Get the index file path for a directory
   */
  getIndexFilePath(directoryPath: string, format: ExportFormat): string {
    const extension = this.getExtensionForFormat(format);
    return path.join(directoryPath, `index${extension}`);
  }

  /**
   * Get assets directory path
   */
  getAssetsPath(basePath: string): string {
    return path.join(basePath, "assets");
  }

  /**
   * Get metadata directory path
   */
  getMetadataPath(basePath: string): string {
    return path.join(basePath, ".metadata");
  }

  /**
   * Get export manifest file path
   */
  getManifestPath(basePath: string): string {
    return path.join(this.getMetadataPath(basePath), "manifest.json");
  }

  /**
   * Get export log file path
   */
  getLogPath(basePath: string): string {
    return path.join(this.getMetadataPath(basePath), "export.log");
  }

  /**
   * Get hierarchical path for database
   */
  private getHierarchicalDatabasePath(database: NotionDatabase, basePath: string): string {
    const parts = ["databases"];

    // Add parent hierarchy if available
    if (database.parent) {
      if (database.parent.type === "page_id") {
        parts.push("pages", database.parent.page_id!);
      } else if (database.parent.type === "database_id") {
        parts.push("databases", database.parent.database_id!);
      }
    }

    // Add database ID
    parts.push(database.id);

    return path.join(basePath, ...parts);
  }

  /**
   * Get hierarchical path for page
   */
  private getHierarchicalPagePath(page: NotionPage, basePath: string): string {
    const parts = ["pages"];

    // Add parent hierarchy if available
    if (page.parent) {
      if (page.parent.type === "page_id") {
        parts.push("pages", page.parent.page_id!);
      } else if (page.parent.type === "database_id") {
        parts.push("databases", page.parent.database_id!);
      }
    }

    // Add page ID
    parts.push(page.id);

    return path.join(basePath, ...parts);
  }

  /**
   * Get date-based path
   */
  private getDateBasedPath(dateString: string, basePath: string, type: string): string {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return path.join(basePath, type, year.toString(), month, day);
  }

  /**
   * Create type-based directory structure
   */
  private async createTypeBasedStructure(basePath: string): Promise<void> {
    const directories = ["databases", "pages", "blocks", "users", "comments"];

    for (const dir of directories) {
      await this.ensureDirectoryExists(path.join(basePath, dir));
    }
  }

  /**
   * Generate filename based on naming strategy
   */
  private generateFilename(item: NotionDatabase | NotionPage): string {
    switch (this.config.namingStrategy) {
      case "id":
        return item.id;

      case "title":
        return this.sanitizeFilename(item.title || item.id);

      case "slug":
        return this.createSlug(item.title || item.id);

      case "timestamp":
        return `${Date.now()}_${this.sanitizeFilename(item.title || item.id)}`;

      default:
        return item.id;
    }
  }

  /**
   * Sanitize filename for filesystem compatibility
   */
  private sanitizeFilename(filename: string): string {
    return filename
      .replace(/[<>:"/\\|?*]/g, "_") // Replace invalid characters
      .replace(/\s+/g, "_") // Replace spaces with underscores
      .replace(/_{2,}/g, "_") // Replace multiple underscores with single
      .replace(/^_|_$/g, "") // Remove leading/trailing underscores
      .substring(0, 255); // Limit length
  }

  /**
   * Create URL-friendly slug from title
   */
  private createSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^\w\s-]/g, "") // Remove special characters
      .replace(/\s+/g, "-") // Replace spaces with hyphens
      .replace(/-{2,}/g, "-") // Replace multiple hyphens with single
      .replace(/^-|-$/g, ""); // Remove leading/trailing hyphens
  }

  /**
   * Get file extension for export format
   */
  private getExtensionForFormat(format: ExportFormat): string {
    switch (format) {
      case ExportFormat.JSON:
        return ".json";
      case ExportFormat.MARKDOWN:
        return ".md";
      case ExportFormat.HTML:
        return ".html";
      case ExportFormat.CSV:
        return ".csv";
      default:
        return ".txt";
    }
  }

  /**
   * Ensure directory exists
   */
  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.access(dirPath);
    } catch {
      await fs.mkdir(dirPath, { recursive: true });
    }
  }

  /**
   * Create export manifest
   */
  async createManifest(basePath: string, exportData: any): Promise<void> {
    const manifestPath = this.getManifestPath(basePath);
    const manifest = {
      version: "1.0.0",
      exportId: exportData.exportId,
      timestamp: new Date().toISOString(),
      configuration: exportData.configuration,
      statistics: exportData.statistics,
      structure: await this.generateStructureMap(basePath)
    };

    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  }

  /**
   * Generate structure map of exported files
   */
  async generateStructureMap(basePath: string): Promise<any> {
    const structure: any = {};

    try {
      const items = await fs.readdir(basePath, { withFileTypes: true });

      for (const item of items) {
        if (item.isDirectory()) {
          structure[item.name] = await this.generateStructureMap(path.join(basePath, item.name));
        } else {
          const stats = await fs.stat(path.join(basePath, item.name));
          structure[item.name] = {
            type: "file",
            size: stats.size,
            modified: stats.mtime.toISOString()
          };
        }
      }
    } catch (error) {
      // Return empty structure if directory can't be read
    }

    return structure;
  }

  /**
   * Create README file for the export
   */
  async createReadme(basePath: string, exportData: any): Promise<void> {
    const readmePath = path.join(basePath, "README.md");
    const readme = this.generateReadmeContent(exportData);
    await fs.writeFile(readmePath, readme);
  }

  /**
   * Generate README content
   */
  private generateReadmeContent(exportData: any): string {
    return `# Notion Export

This directory contains an export from Notion created on ${new Date().toISOString()}.

## Export Information

- **Export ID**: ${exportData.exportId}
- **Format**: ${exportData.configuration.format}
- **Created**: ${new Date().toISOString()}
- **Total Items**: ${exportData.statistics?.totalItems || "Unknown"}

## Directory Structure

- \`databases/\` - Exported databases
- \`pages/\` - Exported pages
- \`assets/\` - Images, files, and other media
- \`.metadata/\` - Export metadata and logs

## Files

- \`manifest.json\` - Export manifest with detailed information
- \`export.log\` - Export process log
- \`README.md\` - This file

## Usage

The exported files are organized according to the selected organization strategy. Each file contains the original Notion content converted to the specified format.

For more information about the export process, see the manifest.json file in the .metadata directory.
`;
  }
}
