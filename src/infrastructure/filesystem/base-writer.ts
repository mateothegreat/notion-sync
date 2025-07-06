/**
 * Base File Writer Implementation
 * 
 * Abstract base class providing common functionality for all file writers
 */

import { promises as fs } from 'fs';
import { createHash } from 'crypto';
import path from 'path';
import { FileWriter, FileWriteResult, FileMetadata, ValidationResult, FileSystemConfig } from './types';
import { NotionBlock, NotionDatabase, NotionPage } from '../../shared/types';
import { FileSystemEvents } from '../../core/events';

export abstract class BaseFileWriter implements FileWriter {
  protected config: FileSystemConfig;
  protected eventPublisher?: (event: any) => Promise<void>;

  constructor(config: FileSystemConfig, eventPublisher?: (event: any) => Promise<void>) {
    this.config = config;
    this.eventPublisher = eventPublisher;
  }

  /**
   * Abstract methods that must be implemented by concrete writers
   */
  abstract writeDatabase(database: NotionDatabase, outputPath: string): Promise<FileWriteResult>;
  abstract writePage(page: NotionPage, outputPath: string): Promise<FileWriteResult>;
  abstract writeBlocks(blocks: NotionBlock[], outputPath: string): Promise<FileWriteResult>;
  abstract getFileExtension(): string;
  abstract getMimeType(): string;
  abstract formatData(data: any): string | Buffer;

  /**
   * Write raw data to file with common functionality
   */
  async writeRawData(data: any, outputPath: string): Promise<FileWriteResult> {
    const startTime = Date.now();
    
    try {
      // Validate data
      const validation = this.validateData(data);
      if (!validation.valid) {
        throw new Error(`Data validation failed: ${validation.errors.join(', ')}`);
      }

      // Format data according to the specific writer
      const formattedData = this.formatData(data);
      
      // Ensure directory exists
      await this.ensureDirectoryExists(path.dirname(outputPath));
      
      // Create backup if enabled
      if (this.config.enableBackup && await this.fileExists(outputPath)) {
        await this.createBackup(outputPath);
      }

      // Write file atomically if enabled
      const finalPath = this.config.enableAtomicOperations 
        ? await this.writeAtomically(formattedData, outputPath)
        : await this.writeDirectly(formattedData, outputPath);

      // Get file stats
      const stats = await fs.stat(finalPath);
      const fileSize = stats.size;

      // Calculate checksum if enabled
      let checksum: string | undefined;
      if (this.config.enableChecksums) {
        checksum = await this.calculateChecksum(finalPath);
      }

      // Create metadata
      const metadata: FileMetadata = {
        createdAt: stats.birthtime,
        modifiedAt: stats.mtime,
        mimeType: this.getMimeType(),
        encoding: this.config.encoding,
        compressed: false // Will be updated if compression is applied
      };

      const duration = Date.now() - startTime;

      // Publish file created event
      if (this.eventPublisher) {
        await this.eventPublisher(
          FileSystemEvents.fileCreated(finalPath, fileSize, this.getMimeType())
        );
      }

      return {
        success: true,
        filePath: finalPath,
        fileSize,
        checksum,
        metadata,
        duration
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      
      return {
        success: false,
        filePath: outputPath,
        fileSize: 0,
        error: error as Error,
        duration
      };
    }
  }

  /**
   * Validate data - can be overridden by specific writers
   */
  validateData(data: any): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (data === null || data === undefined) {
      errors.push('Data cannot be null or undefined');
    }

    if (typeof data === 'object' && Object.keys(data).length === 0) {
      warnings.push('Data object is empty');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Ensure directory exists
   */
  protected async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.access(dirPath);
    } catch {
      await fs.mkdir(dirPath, { recursive: true });
      
      // Publish directory created event
      if (this.eventPublisher) {
        await this.eventPublisher(
          FileSystemEvents.directoryCreated(dirPath)
        );
      }
    }
  }

  /**
   * Check if file exists
   */
  protected async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create backup of existing file
   */
  protected async createBackup(filePath: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${filePath}.backup.${timestamp}`;
    
    await fs.copyFile(filePath, backupPath);
    return backupPath;
  }

  /**
   * Write file atomically using temporary file
   */
  protected async writeAtomically(data: string | Buffer, outputPath: string): Promise<string> {
    const tempPath = `${outputPath}.tmp.${Date.now()}`;
    
    try {
      // Write to temporary file
      await fs.writeFile(tempPath, data, { encoding: this.config.encoding });
      
      // Atomic move to final location
      await fs.rename(tempPath, outputPath);
      
      return outputPath;
    } catch (error) {
      // Clean up temporary file if it exists
      try {
        await fs.unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
  }

  /**
   * Write file directly
   */
  protected async writeDirectly(data: string | Buffer, outputPath: string): Promise<string> {
    await fs.writeFile(outputPath, data, { encoding: this.config.encoding });
    return outputPath;
  }

  /**
   * Calculate file checksum
   */
  protected async calculateChecksum(filePath: string): Promise<string> {
    const data = await fs.readFile(filePath);
    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * Sanitize filename for filesystem compatibility
   */
  protected sanitizeFilename(filename: string): string {
    return filename
      .replace(/[<>:"/\\|?*]/g, '_') // Replace invalid characters
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .replace(/_{2,}/g, '_') // Replace multiple underscores with single
      .replace(/^_|_$/g, '') // Remove leading/trailing underscores
      .substring(0, 255); // Limit length
  }

  /**
   * Generate filename based on naming strategy
   */
  protected generateFilename(item: NotionDatabase | NotionPage): string {
    switch (this.config.namingStrategy) {
      case 'id':
        return item.id;
      
      case 'title':
        return this.sanitizeFilename(item.title || item.id);
      
      case 'slug':
        return this.createSlug(item.title || item.id);
      
      case 'timestamp':
        return `${Date.now()}_${this.sanitizeFilename(item.title || item.id)}`;
      
      default:
        return item.id;
    }
  }

  /**
   * Create URL-friendly slug from title
   */
  protected createSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^\w\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-{2,}/g, '-') // Replace multiple hyphens with single
      .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
  }

  /**
   * Get full file path with extension
   */
  protected getFullFilePath(basePath: string, filename: string): string {
    const extension = this.getFileExtension();
    const fullFilename = filename.endsWith(extension) ? filename : `${filename}${extension}`;
    return path.join(basePath, fullFilename);
  }

  /**
   * Format date according to configuration
   */
  protected formatDate(date: Date | string, format: 'iso' | 'timestamp' | 'human' = 'iso'): string {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    
    switch (format) {
      case 'iso':
        return dateObj.toISOString();
      
      case 'timestamp':
        return dateObj.getTime().toString();
      
      case 'human':
        return dateObj.toLocaleString();
      
      default:
        return dateObj.toISOString();
    }
  }

  /**
   * Extract text content from rich text objects
   */
  protected extractTextContent(richText: any[]): string {
    if (!Array.isArray(richText)) {
      return '';
    }

    return richText
      .map(item => item.plain_text || item.text?.content || '')
      .join('');
  }

  /**
   * Flatten nested objects for formats that don't support nesting
   */
  protected flattenObject(obj: any, prefix: string = '', delimiter: string = '.'): Record<string, any> {
    const flattened: Record<string, any> = {};

    for (const [key, value] of Object.entries(obj)) {
      const newKey = prefix ? `${prefix}${delimiter}${key}` : key;

      if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        Object.assign(flattened, this.flattenObject(value, newKey, delimiter));
      } else {
        flattened[newKey] = value;
      }
    }

    return flattened;
  }
}