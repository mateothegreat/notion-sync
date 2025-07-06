/**
 * File System Manager
 * 
 * Central manager for all file system operations with atomic transactions
 */

import { FileWriter, FileSystemConfig, FormatOptions, AtomicFileOperation } from './types';
import { NotionDatabase, NotionPage, NotionBlock, ExportFormat } from '../../shared/types';
import { JSONWriter } from './writers/json-writer';
import { MarkdownWriter } from './writers/markdown-writer';
import { WorkspaceOrganizer } from './organizers/workspace-organizer';
import { AtomicFileOperationManager } from './atomic-operations';
import { FileSystemEvents } from '../../core/events';

export class FileSystemManager {
  private config: FileSystemConfig;
  private writers: Map<ExportFormat, FileWriter>;
  private organizer: WorkspaceOrganizer;
  private atomicOperations: AtomicFileOperation;
  private eventPublisher?: (event: any) => Promise<void>;

  constructor(config: FileSystemConfig, eventPublisher?: (event: any) => Promise<void>) {
    this.config = config;
    this.eventPublisher = eventPublisher;
    this.organizer = new WorkspaceOrganizer(config);
    this.atomicOperations = new AtomicFileOperationManager();
    this.writers = new Map();

    this.initializeWriters();
  }

  /**
   * Initialize file writers for all supported formats
   */
  private initializeWriters(): void {
    this.writers.set(ExportFormat.JSON, new JSONWriter(this.config, this.eventPublisher));
    this.writers.set(ExportFormat.MARKDOWN, new MarkdownWriter(this.config, this.eventPublisher));
    // TODO: Add HTML and CSV writers
  }

  /**
   * Write a database to file system
   */
  async writeDatabase(database: NotionDatabase, format: ExportFormat, operationId?: string): Promise<string> {
    const writer = this.getWriter(format);
    const outputPath = this.organizer.getDatabasePath(database, this.config.baseOutputPath);
    
    // Ensure directory exists
    await this.organizer.createDirectoryStructure(outputPath);
    
    // Write database
    const result = await writer.writeDatabase(database, outputPath);
    
    if (!result.success) {
      throw result.error || new Error('Failed to write database');
    }

    // Publish event
    if (this.eventPublisher) {
      await this.eventPublisher(
        FileSystemEvents.fileCreated(result.filePath, result.fileSize, writer.getMimeType())
      );
    }

    return result.filePath;
  }

  /**
   * Write a page to file system
   */
  async writePage(page: NotionPage, format: ExportFormat, operationId?: string): Promise<string> {
    const writer = this.getWriter(format);
    const outputPath = this.organizer.getPagePath(page, this.config.baseOutputPath);
    
    // Ensure directory exists
    await this.organizer.createDirectoryStructure(outputPath);
    
    // Write page
    const result = await writer.writePage(page, outputPath);
    
    if (!result.success) {
      throw result.error || new Error('Failed to write page');
    }

    // Publish event
    if (this.eventPublisher) {
      await this.eventPublisher(
        FileSystemEvents.fileCreated(result.filePath, result.fileSize, writer.getMimeType())
      );
    }

    return result.filePath;
  }

  /**
   * Write blocks to file system
   */
  async writeBlocks(blocks: NotionBlock[], format: ExportFormat, outputPath: string, operationId?: string): Promise<string> {
    const writer = this.getWriter(format);
    
    // Ensure directory exists
    await this.organizer.createDirectoryStructure(outputPath);
    
    // Write blocks
    const result = await writer.writeBlocks(blocks, outputPath);
    
    if (!result.success) {
      throw result.error || new Error('Failed to write blocks');
    }

    // Publish event
    if (this.eventPublisher) {
      await this.eventPublisher(
        FileSystemEvents.fileCreated(result.filePath, result.fileSize, writer.getMimeType())
      );
    }

    return result.filePath;
  }

  /**
   * Begin atomic operation
   */
  async beginAtomicOperation(): Promise<string> {
    return this.atomicOperations.begin();
  }

  /**
   * Commit atomic operation
   */
  async commitAtomicOperation(operationId: string): Promise<void> {
    await this.atomicOperations.commit(operationId);
  }

  /**
   * Rollback atomic operation
   */
  async rollbackAtomicOperation(operationId: string): Promise<void> {
    await this.atomicOperations.rollback(operationId);
  }

  /**
   * Write multiple items atomically
   */
  async writeAtomically(items: Array<{
    type: 'database' | 'page' | 'blocks';
    data: NotionDatabase | NotionPage | NotionBlock[];
    format: ExportFormat;
    outputPath?: string;
  }>): Promise<string[]> {
    const operationId = await this.beginAtomicOperation();
    const filePaths: string[] = [];

    try {
      for (const item of items) {
        let filePath: string;

        switch (item.type) {
          case 'database':
            filePath = await this.writeDatabase(item.data as NotionDatabase, item.format, operationId);
            break;
          
          case 'page':
            filePath = await this.writePage(item.data as NotionPage, item.format, operationId);
            break;
          
          case 'blocks':
            if (!item.outputPath) {
              throw new Error('Output path required for blocks');
            }
            filePath = await this.writeBlocks(item.data as NotionBlock[], item.format, item.outputPath, operationId);
            break;
          
          default:
            throw new Error(`Unknown item type: ${item.type}`);
        }

        filePaths.push(filePath);
      }

      await this.commitAtomicOperation(operationId);
      return filePaths;

    } catch (error) {
      await this.rollbackAtomicOperation(operationId);
      throw error;
    }
  }

  /**
   * Create export manifest
   */
  async createManifest(exportData: any): Promise<void> {
    await this.organizer.createManifest(this.config.baseOutputPath, exportData);
  }

  /**
   * Create README file
   */
  async createReadme(exportData: any): Promise<void> {
    await this.organizer.createReadme(this.config.baseOutputPath, exportData);
  }

  /**
   * Get export statistics
   */
  async getExportStatistics(): Promise<any> {
    const structure = await this.organizer.generateStructureMap(this.config.baseOutputPath);
    
    return {
      totalFiles: this.countFiles(structure),
      totalSize: this.calculateTotalSize(structure),
      structure
    };
  }

  /**
   * Clean up temporary files and old operations
   */
  async cleanup(): Promise<void> {
    await this.atomicOperations.cleanup();
  }

  /**
   * Get writer for format
   */
  private getWriter(format: ExportFormat): FileWriter {
    const writer = this.writers.get(format);
    if (!writer) {
      throw new Error(`No writer available for format: ${format}`);
    }
    return writer;
  }

  /**
   * Count files in structure
   */
  private countFiles(structure: any): number {
    let count = 0;
    
    for (const [key, value] of Object.entries(structure)) {
      if (typeof value === 'object' && value !== null) {
        if ((value as any).type === 'file') {
          count++;
        } else {
          count += this.countFiles(value);
        }
      }
    }
    
    return count;
  }

  /**
   * Calculate total size of files
   */
  private calculateTotalSize(structure: any): number {
    let size = 0;
    
    for (const [key, value] of Object.entries(structure)) {
      if (typeof value === 'object' && value !== null) {
        if ((value as any).type === 'file') {
          size += (value as any).size || 0;
        } else {
          size += this.calculateTotalSize(value);
        }
      }
    }
    
    return size;
  }

  /**
   * Validate configuration
   */
  static validateConfig(config: FileSystemConfig): string[] {
    const errors: string[] = [];

    if (!config.baseOutputPath) {
      errors.push('baseOutputPath is required');
    }

    if (config.maxFileSize <= 0) {
      errors.push('maxFileSize must be positive');
    }

    if (config.compressionLevel < 1 || config.compressionLevel > 9) {
      errors.push('compressionLevel must be between 1 and 9');
    }

    if (!['id', 'title', 'slug', 'timestamp'].includes(config.namingStrategy)) {
      errors.push('Invalid naming strategy');
    }

    if (!['flat', 'hierarchical', 'by-type', 'by-date'].includes(config.organizationStrategy)) {
      errors.push('Invalid organization strategy');
    }

    if (!['utf8', 'utf16le', 'ascii'].includes(config.encoding)) {
      errors.push('Invalid encoding');
    }

    return errors;
  }

  /**
   * Create default configuration
   */
  static createDefaultConfig(baseOutputPath: string): FileSystemConfig {
    return {
      baseOutputPath,
      maxFileSize: 100 * 1024 * 1024, // 100MB
      enableCompression: false,
      compressionLevel: 6,
      enableAtomicOperations: true,
      enableBackup: true,
      namingStrategy: 'title',
      organizationStrategy: 'by-type',
      encoding: 'utf8',
      enableChecksums: true
    };
  }
}