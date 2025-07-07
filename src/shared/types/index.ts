/**
 * Shared Types
 *
 * Core types used throughout the application
 */

import { config } from "$lib/config-loader";

// Base types
export interface Entity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ValueObject {
  equals(other: ValueObject): boolean;
}

export interface DomainEvent {
  id: string;
  type: string;
  aggregateId: string;
  aggregateType: string;
  version: number;
  timestamp: Date;
  payload: Record<string, any>;
  metadata?: Record<string, any>;
}

// Command/Query patterns
export interface Command {
  id: string;
  type: string;
  payload: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface Query {
  id: string;
  type: string;
  parameters: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface CommandResult<T = any> {
  success: boolean;
  data?: T;
  error?: Error;
  events?: DomainEvent[];
}

export interface QueryResult<T = any> {
  success: boolean;
  data?: T;
  error?: Error;
  metadata?: Record<string, any>;
}

// Progress tracking
export interface ProgressInfo {
  processed: number;
  total: number;
  percentage: number;
  currentOperation: string;
  estimatedCompletion?: Date;
  errors: ErrorInfo[];
}

export interface ErrorInfo {
  id: string;
  message: string;
  code?: string;
  timestamp: Date;
  context?: Record<string, any>;
  stack?: string;
}

// Export types
export interface ExportConfiguration {
  outputPath: string;
  format: ExportFormat;
  includeBlocks: typeof config.includeBlocks;
  includeComments: typeof config.includeComments;
  includeProperties: typeof config.includeProperties;
  databases: typeof config.databases;
  pages: string[];
  filters?: ExportFilters;
}

export interface ExportFilters {
  dateRange?: {
    start: Date;
    end: Date;
  };
  properties?: string[];
  tags?: string[];
}

export enum ExportFormat {
  JSON = "json",
  MARKDOWN = "markdown",
  HTML = "html",
  CSV = "csv"
}

export enum ExportStatus {
  PENDING = "pending",
  RUNNING = "running",
  COMPLETED = "completed",
  FAILED = "failed",
  CANCELLED = "cancelled"
}

// Notion types
export interface NotionObject {
  id: string;
  type: NotionObjectType;
  createdTime: string;
  lastEditedTime: string;
  createdBy: NotionUser;
  lastEditedBy: NotionUser;
}

export enum NotionObjectType {
  PAGE = "page",
  DATABASE = "database",
  BLOCK = "block",
  USER = "user",
  COMMENT = "comment",
  PROPERTY = "property",
  WORKSPACE = "workspace"
}

export interface NotionUser {
  id: string;
  type: "person" | "bot";
  name?: string;
  avatarUrl?: string;
  email?: string;
}

export interface NotionPage extends NotionObject {
  type: NotionObjectType.PAGE;
  title: string;
  properties: Record<string, any>;
  parent: NotionParent;
  url: string;
  archived: boolean;
}

export interface NotionDatabase extends NotionObject {
  type: NotionObjectType.DATABASE;
  title: string;
  description: string;
  properties: Record<string, NotionProperty>;
  parent: NotionParent;
  url: string;
  archived: boolean;
}

export interface NotionBlock extends NotionObject {
  type: NotionObjectType.BLOCK;
  blockType: string;
  hasChildren: boolean;
  archived: boolean;
  content: Record<string, any>;
}

export interface NotionParent {
  type: "database_id" | "page_id" | "workspace";
  database_id?: string;
  page_id?: string;
}

export interface NotionProperty {
  id: string;
  name: string;
  type: string;
  config: Record<string, any>;
}

// Rate limiting
export interface RateLimitInfo {
  remaining: number;
  resetTime: Date;
  retryAfter?: number;
}

export interface ConcurrencyLimits {
  pages: number;
  blocks: number;
  databases: number;
  comments: number;
  users: number;
  properties: number;
}

// Circuit breaker
export enum CircuitBreakerState {
  CLOSED = "closed",
  OPEN = "open",
  HALF_OPEN = "half_open"
}

export interface CircuitBreakerStats {
  state: CircuitBreakerState;
  failureCount: number;
  successCount: number;
  lastFailureTime?: Date;
  nextAttemptTime?: Date;
}

// Configuration
export interface ApplicationConfig {
  notion: NotionConfig;
  export: ExportConfig;
  performance: PerformanceConfig;
  logging: LoggingConfig;
}

export interface NotionConfig {
  apiKey: string;
  apiVersion?: string;
  baseUrl?: string;
  timeout?: number;
  retryAttempts?: number;
}

export interface ExportConfig {
  defaultOutputPath: string;
  defaultFormat: ExportFormat;
  maxConcurrency: number;
  chunkSize: number;
  enableResume: boolean;
}

export interface PerformanceConfig {
  rateLimits: ConcurrencyLimits;
  circuitBreaker: {
    failureThreshold: number;
    resetTimeout: number;
    monitoringPeriod: number;
  };
  caching: {
    enabled: boolean;
    ttl: number;
    maxSize: number;
  };
}

export interface LoggingConfig {
  level: "debug" | "info" | "warn" | "error";
  format: "json" | "text";
  outputs: ("console" | "file")[];
  filePath?: string;
}

// File System Configuration
export interface FileSystemConfig {
  baseOutputPath: string;
  maxFileSize: number;
  enableCompression: boolean;
  compressionLevel: number;
  enableAtomicOperations: boolean;
  enableBackup: boolean;
  namingStrategy: "id" | "title" | "slug" | "timestamp";
  organizationStrategy: "flat" | "hierarchical" | "by-type" | "by-date";
  encoding: "utf8" | "utf16le" | "ascii";
  enableChecksums: boolean;
}

export interface NotionComment extends NotionObject {
  type: NotionObjectType.COMMENT;
  parent: NotionParent;
  rich_text: any[];
}

/**
 * Represents a Notion property item with standardized structure.
 * Maps to Notion's PropertyItemObjectResponse union type.
 */
export interface NotionPropertyItem {
  id?: string;
  type: PropertyItemType;
  object: "property_item" | "list";
  results?: NotionPropertyItem[];
  has_more?: boolean;
  next_cursor?: string | null;
  property_item?: {
    id: string;
    type: PropertyItemType;
    [key: string]: any;
  };
}

/**
 * Property types supported by Notion API for property items.
 */
export type PropertyItemType =
  | "property_item"
  | "number"
  | "url"
  | "select"
  | "multi_select"
  | "status"
  | "date"
  | "email"
  | "phone_number"
  | "checkbox"
  | "files"
  | "created_by"
  | "created_time"
  | "last_edited_by"
  | "last_edited_time"
  | "formula"
  | "button"
  | "unique_id"
  | "verification"
  | "title"
  | "rich_text"
  | "people"
  | "relation"
  | "rollup";

export interface NotionWorkspace {
  id: string;
  name: string;
  owner: string;
  createdTime: string;
}
