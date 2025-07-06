/**
 * File System Types and Interfaces
 * 
 * Core types for the file system implementation
 */

import { NotionBlock, NotionDatabase, NotionPage, ExportFormat } from "../../shared/types";

/**
 * Base interface for all file writers
 */
export interface FileWriter {
  /**
   * Write a Notion database to file
   */
  writeDatabase(database: NotionDatabase, outputPath: string): Promise<FileWriteResult>;

  /**
   * Write a Notion page to file
   */
  writePage(page: NotionPage, outputPath: string): Promise<FileWriteResult>;

  /**
   * Write Notion blocks to file
   */
  writeBlocks(blocks: NotionBlock[], outputPath: string): Promise<FileWriteResult>;

  /**
   * Write raw data to file (for custom formats)
   */
  writeRawData(data: any, outputPath: string): Promise<FileWriteResult>;

  /**
   * Get the file extension for this writer
   */
  getFileExtension(): string;

  /**
   * Get the MIME type for this writer
   */
  getMimeType(): string;

  /**
   * Validate that the data can be written by this writer
   */
  validateData(data: any): ValidationResult;
}

/**
 * Result of a file write operation
 */
export interface FileWriteResult {
  success: boolean;
  filePath: string;
  fileSize: number;
  checksum?: string;
  metadata?: FileMetadata;
  error?: Error;
  duration: number;
}

/**
 * File metadata information
 */
export interface FileMetadata {
  createdAt: Date;
  modifiedAt: Date;
  mimeType: string;
  encoding: string;
  compressed: boolean;
  originalSize?: number;
  compressionRatio?: number;
}

/**
 * Validation result for data
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Directory organization strategy
 */
export interface DirectoryOrganizer {
  /**
   * Get the directory path for a database
   */
  getDatabasePath(database: NotionDatabase, basePath: string): string;

  /**
   * Get the directory path for a page
   */
  getPagePath(page: NotionPage, basePath: string): string;

  /**
   * Get the file path for a specific item
   */
  getFilePath(item: NotionDatabase | NotionPage, basePath: string, format: ExportFormat): string;

  /**
   * Create the directory structure
   */
  createDirectoryStructure(basePath: string): Promise<void>;

  /**
   * Get the index file path for a directory
   */
  getIndexFilePath(directoryPath: string, format: ExportFormat): string;
}

/**
 * Atomic file operation interface
 */
export interface AtomicFileOperation {
  /**
   * Begin a new atomic operation
   */
  begin(): Promise<string>; // Returns operation ID

  /**
   * Add a file operation to the transaction
   */
  addOperation(operationId: string, operation: FileOperation): Promise<void>;

  /**
   * Commit all operations in the transaction
   */
  commit(operationId: string): Promise<void>;

  /**
   * Rollback all operations in the transaction
   */
  rollback(operationId: string): Promise<void>;

  /**
   * Check if an operation is in progress
   */
  isOperationInProgress(operationId: string): boolean;

  /**
   * Clean up old operations
   */
  cleanup(maxAge?: number): Promise<void>;
}

/**
 * Individual file operation
 */
export interface FileOperation {
  type: 'create' | 'update' | 'delete' | 'move';
  sourcePath?: string;
  targetPath: string;
  data?: Buffer | string;
  backup?: boolean;
}

/**
 * File system configuration
 */
export interface FileSystemConfig {
  baseOutputPath: string;
  maxFileSize: number;
  enableCompression: boolean;
  compressionLevel: number;
  enableAtomicOperations: boolean;
  enableBackup: boolean;
  namingStrategy: 'id' | 'title' | 'slug' | 'timestamp';
  organizationStrategy: 'flat' | 'hierarchical' | 'by-type' | 'by-date';
  encoding: 'utf8' | 'utf16le' | 'ascii';
  enableChecksums: boolean;
}

/**
 * Export format specific options
 */
export interface FormatOptions {
  json?: JsonFormatOptions;
  markdown?: MarkdownFormatOptions;
  html?: HtmlFormatOptions;
  csv?: CsvFormatOptions;
}

export interface JsonFormatOptions {
  pretty: boolean;
  includeMetadata: boolean;
  includeBlocks: boolean;
  includeProperties: boolean;
  dateFormat: 'iso' | 'timestamp' | 'human';
}

export interface MarkdownFormatOptions {
  includeMetadata: boolean;
  includeFrontmatter: boolean;
  frontmatterFormat: 'yaml' | 'json' | 'toml';
  headingStyle: 'atx' | 'setext';
  codeBlockStyle: 'fenced' | 'indented';
  linkStyle: 'inline' | 'reference';
  imageHandling: 'embed' | 'link' | 'download';
}

export interface HtmlFormatOptions {
  includeCSS: boolean;
  cssFramework: 'none' | 'bootstrap' | 'tailwind' | 'custom';
  customCSS?: string;
  includeJavaScript: boolean;
  templatePath?: string;
  minify: boolean;
}

export interface CsvFormatOptions {
  delimiter: ',' | ';' | '\t' | '|';
  quote: '"' | "'" | '`';
  escape: '\\' | '"';
  includeHeaders: boolean;
  flattenObjects: boolean;
  arrayDelimiter: '|' | ';' | ',';
}