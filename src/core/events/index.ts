/**
 * Domain Events
 *
 * Events that represent business-significant occurrences
 */

import { DomainEvent, ErrorInfo, ProgressInfo } from "../../shared/types";

// Base event factory
export function createDomainEvent(
  type: string,
  aggregateId: string,
  aggregateType: string,
  payload: Record<string, any>,
  metadata?: Record<string, any>
): DomainEvent {
  return {
    id: crypto.randomUUID(),
    type,
    aggregateId,
    aggregateType,
    version: 1,
    timestamp: new Date(),
    payload,
    metadata
  };
}

// Export Events
export interface ExportStartedEvent extends DomainEvent {
  type: "export.started";
  payload: {
    exportId: string;
    configuration: any;
    userId?: string;
  };
}

export interface ExportProgressUpdatedEvent extends DomainEvent {
  type: "export.progress.updated";
  payload: {
    exportId: string;
    progress: ProgressInfo;
  };
}

export interface ExportCompletedEvent extends DomainEvent {
  type: "export.completed";
  payload: {
    exportId: string;
    outputPath: string;
    duration: number;
    itemsProcessed: number;
    errors: ErrorInfo[];
  };
}

export interface ExportFailedEvent extends DomainEvent {
  type: "export.failed";
  payload: {
    exportId: string;
    error: ErrorInfo;
    progress: ProgressInfo;
  };
}

export interface ExportCancelledEvent extends DomainEvent {
  type: "export.cancelled";
  payload: {
    exportId: string;
    reason: string;
    progress: ProgressInfo;
  };
}

// Notion API Events
export interface NotionObjectFetchedEvent extends DomainEvent {
  type: "notion.object.fetched";
  payload: {
    objectId: string;
    objectType: string;
    size: number;
    duration: number;
  };
}

export interface NotionRateLimitHitEvent extends DomainEvent {
  type: "notion.rate_limit.hit";
  payload: {
    remaining: number;
    resetTime: Date;
    retryAfter?: number;
  };
}

export interface NotionApiErrorEvent extends DomainEvent {
  type: "notion.api.error";
  payload: {
    error: ErrorInfo;
    endpoint: string;
    retryAttempt: number;
  };
}

// Circuit Breaker Events
export interface CircuitBreakerOpenedEvent extends DomainEvent {
  type: "circuit_breaker.opened";
  payload: {
    name: string;
    failureCount: number;
    threshold: number;
  };
}

export interface CircuitBreakerClosedEvent extends DomainEvent {
  type: "circuit_breaker.closed";
  payload: {
    name: string;
    successCount: number;
  };
}

export interface CircuitBreakerHalfOpenEvent extends DomainEvent {
  type: "circuit_breaker.half_open";
  payload: {
    name: string;
    nextAttemptTime: Date;
  };
}

// Progress Events
export interface ProgressSectionStartedEvent extends DomainEvent {
  type: "progress.section.started";
  payload: {
    exportId: string;
    section: string;
    totalItems: number;
  };
}

export interface ProgressSectionCompletedEvent extends DomainEvent {
  type: "progress.section.completed";
  payload: {
    exportId: string;
    section: string;
    itemsProcessed: number;
    duration: number;
    errors: ErrorInfo[];
  };
}

export interface ProgressItemProcessedEvent extends DomainEvent {
  type: "progress.item.processed";
  payload: {
    exportId: string;
    itemId: string;
    itemType: string;
    duration: number;
    success: boolean;
    error?: ErrorInfo;
  };
}

// File System Events
export interface FileCreatedEvent extends DomainEvent {
  type: "file.created";
  payload: {
    path: string;
    size: number;
    mimeType?: string;
  };
}

export interface FileUpdatedEvent extends DomainEvent {
  type: "file.updated";
  payload: {
    path: string;
    oldSize: number;
    newSize: number;
  };
}

export interface DirectoryCreatedEvent extends DomainEvent {
  type: "directory.created";
  payload: {
    path: string;
  };
}

// Performance Events
export interface PerformanceMetricEvent extends DomainEvent {
  type: "performance.metric";
  payload: {
    metric: string;
    value: number;
    unit: string;
    tags?: Record<string, string>;
  };
}

export interface ConcurrencyAdjustedEvent extends DomainEvent {
  type: "concurrency.adjusted";
  payload: {
    operation: string;
    oldLimit: number;
    newLimit: number;
    reason: string;
  };
}

// Event Factories
export const ExportEvents = {
  started: (exportId: string, configuration: any, userId?: string): ExportStartedEvent =>
    createDomainEvent("export.started", exportId, "Export", { exportId, configuration, userId }) as ExportStartedEvent,

  progressUpdated: (exportId: string, progress: ProgressInfo): ExportProgressUpdatedEvent =>
    createDomainEvent("export.progress.updated", exportId, "Export", {
      exportId,
      progress
    }) as ExportProgressUpdatedEvent,

  completed: (
    exportId: string,
    outputPath: string,
    duration: number,
    itemsProcessed: number,
    errors: ErrorInfo[]
  ): ExportCompletedEvent =>
    createDomainEvent("export.completed", exportId, "Export", {
      exportId,
      outputPath,
      duration,
      itemsProcessed,
      errors
    }) as ExportCompletedEvent,

  failed: (exportId: string, error: ErrorInfo, progress: ProgressInfo): ExportFailedEvent =>
    createDomainEvent("export.failed", exportId, "Export", { exportId, error, progress }) as ExportFailedEvent,

  cancelled: (exportId: string, reason: string, progress: ProgressInfo): ExportCancelledEvent =>
    createDomainEvent("export.cancelled", exportId, "Export", { exportId, reason, progress }) as ExportCancelledEvent
};

export const NotionEvents = {
  objectFetched: (objectId: string, objectType: string, size: number, duration: number): NotionObjectFetchedEvent =>
    createDomainEvent("notion.object.fetched", objectId, "NotionObject", {
      objectId,
      objectType,
      size,
      duration
    }) as NotionObjectFetchedEvent,

  rateLimitHit: (remaining: number, resetTime: Date, retryAfter?: number): NotionRateLimitHitEvent =>
    createDomainEvent("notion.rate_limit.hit", "rate-limiter", "RateLimiter", {
      remaining,
      resetTime,
      retryAfter
    }) as NotionRateLimitHitEvent,

  apiError: (error: ErrorInfo, endpoint: string, retryAttempt: number): NotionApiErrorEvent =>
    createDomainEvent("notion.api.error", endpoint, "NotionApi", {
      error,
      endpoint,
      retryAttempt
    }) as NotionApiErrorEvent
};

export const CircuitBreakerEvents = {
  opened: (name: string, failureCount: number, threshold: number): CircuitBreakerOpenedEvent =>
    createDomainEvent("circuit_breaker.opened", name, "CircuitBreaker", {
      name,
      failureCount,
      threshold
    }) as CircuitBreakerOpenedEvent,

  closed: (name: string, successCount: number): CircuitBreakerClosedEvent =>
    createDomainEvent("circuit_breaker.closed", name, "CircuitBreaker", {
      name,
      successCount
    }) as CircuitBreakerClosedEvent,

  halfOpen: (name: string, nextAttemptTime: Date): CircuitBreakerHalfOpenEvent =>
    createDomainEvent("circuit_breaker.half_open", name, "CircuitBreaker", {
      name,
      nextAttemptTime
    }) as CircuitBreakerHalfOpenEvent
};

export const ProgressEvents = {
  sectionStarted: (exportId: string, section: string, totalItems: number): ProgressSectionStartedEvent =>
    createDomainEvent("progress.section.started", exportId, "Progress", {
      exportId,
      section,
      totalItems
    }) as ProgressSectionStartedEvent,

  sectionCompleted: (
    exportId: string,
    section: string,
    itemsProcessed: number,
    duration: number,
    errors: ErrorInfo[]
  ): ProgressSectionCompletedEvent =>
    createDomainEvent("progress.section.completed", exportId, "Progress", {
      exportId,
      section,
      itemsProcessed,
      duration,
      errors
    }) as ProgressSectionCompletedEvent,

  itemProcessed: (
    exportId: string,
    itemId: string,
    itemType: string,
    duration: number,
    success: boolean,
    error?: ErrorInfo
  ): ProgressItemProcessedEvent =>
    createDomainEvent("progress.item.processed", exportId, "Progress", {
      exportId,
      itemId,
      itemType,
      duration,
      success,
      error
    }) as ProgressItemProcessedEvent
};

export const FileSystemEvents = {
  fileCreated: (path: string, size: number, mimeType?: string): FileCreatedEvent =>
    createDomainEvent("file.created", path, "File", { path, size, mimeType }) as FileCreatedEvent,

  fileUpdated: (path: string, oldSize: number, newSize: number): FileUpdatedEvent =>
    createDomainEvent("file.updated", path, "File", { path, oldSize, newSize }) as FileUpdatedEvent,

  directoryCreated: (path: string): DirectoryCreatedEvent =>
    createDomainEvent("directory.created", path, "Directory", { path }) as DirectoryCreatedEvent
};

export const PerformanceEvents = {
  metric: (metric: string, value: number, unit: string, tags?: Record<string, string>): PerformanceMetricEvent =>
    createDomainEvent("performance.metric", metric, "Performance", {
      metric,
      value,
      unit,
      tags
    }) as PerformanceMetricEvent,

  concurrencyAdjusted: (
    operation: string,
    oldLimit: number,
    newLimit: number,
    reason: string
  ): ConcurrencyAdjustedEvent =>
    createDomainEvent("concurrency.adjusted", operation, "Concurrency", {
      operation,
      oldLimit,
      newLimit,
      reason
    }) as ConcurrencyAdjustedEvent
};
