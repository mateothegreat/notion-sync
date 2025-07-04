// Export optimization components
export {
  createOptimizedExportCLI,
  ETACalculator,
  NotionApiStreamer,
  OptimizedNotionExportCLI,
  StreamingExportManager
} from "./export";

export type { ExportItem, OptimizedExportConfig, StreamingExportConfig } from "./export";

// Export individual utility modules (but not the ones already exported from ./export)
export {
  BoundedQueue,
  StreamProcessor as StreamingProcessor, // Rename to avoid conflict
  streamPaginatedAPI
} from "./streaming";

export {
  AdaptiveRateLimiter,
  OperationTypeAwareLimiter as OperationLimiter, // Rename to avoid conflict
  parallelPaginatedFetch
} from "./rate-limiting";

export { PersistentProgressTracker, ProgressReporter } from "./progress-tracking";

export type { ErrorRecord, ExportCheckpoint, ProgressStats } from "./progress-tracking";

export { OperationTypeAwareLimiter } from "./concurrency-manager";

export type { OperationContext, OperationStats, OperationType } from "./concurrency-manager";

export { collectPaginatedAPI, iteratePaginatedAPI, retryOperation, smartRetryOperation } from "./operations";

export type { OperationEventEmitter, RetryContext } from "./operations";

export * from "./util";
