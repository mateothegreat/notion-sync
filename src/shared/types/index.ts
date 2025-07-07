/**
 * Shared Types
 *
 * Core types used throughout the application
 */

import { ExportFormat } from "$lib/exporters/exporter";

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

export interface ExportFilters {
  dateRange?: {
    start: Date;
    end: Date;
  };
  properties?: string[];
  tags?: string[];
}

export enum ExportStatus {
  PENDING = "pending",
  RUNNING = "running",
  COMPLETED = "completed",
  FAILED = "failed",
  CANCELLED = "cancelled"
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
