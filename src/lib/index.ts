// Export optimization components
export {
  createOptimizedExportCLI,
  ETACalculator,
  NotionApiStreamer,
  OptimizedNotionExportCLI,
  StreamingExportManager
} from "../../dump/bad";

export type { ExportItem, OptimizedExportConfig, StreamingExportConfig } from "../../dump/bad";

// Export individual utility modules (but not the ones already exported from ./export)
export {
  BoundedQueue,
  StreamProcessor as StreamingProcessor, // Rename to avoid conflict
  streamPaginatedAPI
} from "./export/streaming";

export {
  AdaptiveRateLimiter,
  OperationTypeAwareLimiter as OperationLimiter, // Rename to avoid conflict
  parallelPaginatedFetch
} from "./export/rate-limiting";

export { PersistentProgressTracker, ProgressReporter } from "./progress-tracking";

export type { ErrorRecord, ExportCheckpoint, ProgressStats } from "./progress-tracking";

export { OperationTypeAwareLimiter } from "./export/concurrency-manager";

export type { OperationContext, OperationStats, OperationType } from "./export/concurrency-manager";

export { collectPaginatedAPI, iteratePaginatedAPI, retry as retryOperation, smartRetryOperation } from "./operations";

export type { OperationEventEmitter, RetryContext } from "./operations";

export * from "./export/util";
