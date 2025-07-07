/**
 * Shared Types
 *
 * Core types used throughout the application
 */

import { ExportFormat as ExporterFormat } from "$lib/exporters/exporter";

export type ExportFormat = ExporterFormat;
export { ExporterFormat as ExportFormatEnum };

// Base types
export interface Entity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ValueObject {
  equals(other: ValueObject): boolean;
}

export interface DomainEventMetadata {
  caller: string;
  message?: string;
}

export interface DomainEvent {
  id: string;
  type: string;
  aggregateId: string;
  aggregateType: string;
  version: number;
  timestamp: Date;
  payload: Record<string, any>;
  metadata?: DomainEventMetadata;
}

// Command/Query patterns
export interface Command {
  id: string;
  type: string;
  payload: Record<string, any>;
  metadata?: DomainEventMetadata;
}

export interface Query {
  id: string;
  type: string;
  parameters: Record<string, any>;
  metadata?: DomainEventMetadata;
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
  metadata?: DomainEventMetadata;
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

export interface ExportConfiguration {
  outputPath: string;
  format: ExportFormat;
  includeBlocks: boolean;
  includeComments: boolean;
  includeProperties: boolean;
  databases: string[];
  pages: string[];
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
  export: ExportConfiguration;
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
