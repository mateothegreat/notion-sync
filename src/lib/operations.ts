import { APIErrorCode, ClientErrorCode, isNotionClientError } from "@notionhq/client";
import { CircuitBreaker, delay } from "./export/util";

/**
 * Error types that should trigger a retry.
 */
const RETRYABLE_ERROR_CODES = [
  "ECONNRESET",
  "ETIMEDOUT",
  "ECONNREFUSED",
  "ENOTFOUND",
  "notionhq_client_request_timeout",
  "rate_limited",
  "conflict_error",
  "internal_server_error",
  "service_unavailable"
];

/**
 * Check if an error is retryable.
 *
 * @param error - The error to check.
 *
 * @returns True if the error is retryable, false otherwise.
 */
const isRetryableError = (error: unknown): boolean => {
  if (!error) return false;

  // Check for Notion client errors
  if (isNotionClientError(error)) {
    const retryableApiCodes: (APIErrorCode | ClientErrorCode)[] = [
      APIErrorCode.RateLimited,
      APIErrorCode.ConflictError,
      APIErrorCode.InternalServerError,
      APIErrorCode.ServiceUnavailable,
      ClientErrorCode.RequestTimeout
    ];

    return retryableApiCodes.includes(error.code);
  }

  // Check for network errors
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorCode = (error as any)?.code || (error as any)?.cause?.code;

  return RETRYABLE_ERROR_CODES.some((code) => errorMessage.includes(code) || errorCode === code);
};

/**
 * Calculate exponential backoff delay.
 *
 * @param attempt - The current attempt number.
 * @param baseDelay - The base delay in milliseconds.
 * @param maxDelay - The maximum delay in milliseconds.
 *
 * @returns The calculated delay with jitter.
 */
function calculateBackoffDelay(attempt: number, baseDelay: number, maxDelay: number = 60000): number {
  // Exponential backoff: 2^attempt * baseDelay
  const exponentialDelay = Math.pow(2, attempt) * baseDelay;

  // Cap at maxDelay
  const cappedDelay = Math.min(exponentialDelay, maxDelay);

  // Add jitter (±25%) to prevent thundering herd
  const jitter = cappedDelay * 0.25;
  const jitteredDelay = cappedDelay + (Math.random() - 0.5) * 2 * jitter;

  return Math.max(baseDelay, Math.round(jitteredDelay));
}

/**
 * Operation event types.
 */
export type OperationEvent = "api-call" | "retry" | "api-call-error" | "debug" | "progress" | "error" | "checkpoint";

/**
 * Operation types.
 */
export type OperationType = "get" | "search" | "delete" | "create" | "update" | "query" | "list";

/**
 * Operation priorities.
 */
export type OperationPriority = "high" | "normal" | "low";

/**
 * The data that is emitted by an event emitter.
 *
 * @template T - The type of the data.
 */
export type EventData<T = any> = {
  /**
   * The name of the operation.
   */
  name: string;

  /**
   * The type of operation.
   */
  operation: OperationType;

  /**
   * The priority of the operation.
   */
  priority: OperationPriority;

  /**
   * The ID of the operation.
   */
  id?: string;

  /**
   * The data of the operation.
   */
  data?: T;
};

/**
 * Event emitter for operation events (optional).
 */
export interface OperationEventEmitter {
  emit(event: OperationEvent, data: EventData): void;
}

/**
 * Event emitter interface for operation events.
 */
export interface OperationEventEmitter {
  /**
   * Emit a retry event with retry attempt data.
   */
  emit(event: "retry", data: { attempt: number; maxRetries: number; delay: number; operationName: string }): void;

  /**
   * Emit a timeout event with timeout data.
   */
  emit(event: "timeout", data: { operationName: string; timeout: number }): void;

  /**
   * Emit an error event with error data.
   */
  emit(event: "error", data: { operationName: string; error: Error; attempt?: number }): void;

  /**
   * Emit a success event with success data.
   */
  emit(event: "success", data: { operationName: string; attempt?: number; responseTime?: number }): void;

  /**
   * Emit a circuit breaker event with circuit breaker data.
   */
  emit(event: "circuit-breaker", data: { state: "open" | "closed" | "half-open"; operation: string }): void;

  /**
   * Emit a rate limit event with rate limit data.
   */
  emit(event: "rate-limit", data: { waitTime: number; operationName?: string }): void;

  /**
   * Emit a debug event with debug message.
   */
  emit(event: "debug", data: string): void;
}

/**
 * Retry context for smart retry operations.
 */
export interface RetryContext {
  op?: "read" | "write" | "delete";
  priority?: "high" | "normal" | "low";
  circuitBreaker?: CircuitBreaker;
  objectId?: string;
  rateLimiter?: {
    recordRetryAttempt: (successful: boolean) => void;
    updateFromHeaders: (headers: Record<string, string>, responseTime?: number, wasError?: boolean) => void;
  };
}

/**
 * Smart retry operation with enhanced retry logic and context awareness.
 *
 * @param operation - The operation to retry.
 * @param operationName - The name of the operation.
 * @param context - Optional retry context for smarter retry decisions.
 * @param maxRetries - The maximum number of retries.
 * @param baseDelay - The base delay between retries.
 * @param timeout - The base timeout for the operation.
 * @param eventEmitter - Optional event emitter for retry events.
 *
 * @returns A promise that resolves when the operation is completed.
 */
export const retry = async <T>(args: {
  fn: () => Promise<T>;
  operation: string;
  context?: RetryContext;
  maxRetries?: number;
  baseDelay?: number;
  timeout?: number;
  emitter?: OperationEventEmitter;
}): Promise<T> => {
  const { fn, operation, context = {}, maxRetries = 3, baseDelay = 1000, timeout, emitter } = args;

  // Check circuit breaker if provided
  if (context.circuitBreaker && !context.circuitBreaker.canProceed()) {
    throw new Error(`Circuit breaker is open for ${operation}`);
  }

  // Adjust retry policy based on operation type
  const adjustedMaxRetries =
    context.op === "write" ? Math.min(maxRetries, 1) : context.op === "delete" ? Math.min(maxRetries, 2) : maxRetries;

  // Adjust base delay based on priority
  const adjustedBaseDelay =
    context.priority === "high" ? baseDelay * 0.5 : context.priority === "low" ? baseDelay * 2 : baseDelay;

  let lastError: Error | unknown;
  const startTime = Date.now();

  for (let attempt = 0; attempt <= adjustedMaxRetries; attempt++) {
    try {
      // Emit API call event
      if (emitter && attempt === 0) {
        emitter.emit("api-call", {
          name: operation,
          operation: "list",
          priority: "normal",
          id: context.objectId
        });
      }

      // Adaptive timeout: increase timeout with each retry
      const adaptiveTimeout = timeout ? timeout * (attempt + 1) : undefined;

      const operationPromise = fn();

      if (adaptiveTimeout) {
        const timeoutPromise = new Promise<T>((_, reject) => {
          const timeoutId = globalThis.setTimeout(() => {
            globalThis.clearTimeout(timeoutId);
            reject(
              new Error(
                `${operation} timed out after ${adaptiveTimeout}ms (attempt ${attempt + 1}/${adjustedMaxRetries + 1})`
              )
            );
          }, adaptiveTimeout);
        });

        const result = await Promise.race([operationPromise, timeoutPromise]);

        // Report success to circuit breaker
        if (context.circuitBreaker) {
          context.circuitBreaker.reportSuccess();
        }

        // Record successful retry if this was a retry attempt
        if (context.rateLimiter && attempt > 0) {
          context.rateLimiter.recordRetryAttempt(true); // Successful retry
        }

        return result;
      }

      const result = await operationPromise;

      // Report success to circuit breaker
      if (context.circuitBreaker) {
        context.circuitBreaker.reportSuccess();
      }

      // Record successful retry if this was a retry attempt
      if (context.rateLimiter && attempt > 0) {
        context.rateLimiter.recordRetryAttempt(true); // Successful retry
      }

      return result;
    } catch (error) {
      lastError = error;

      // Report failure to circuit breaker
      if (context.circuitBreaker) {
        context.circuitBreaker.reportFailure();
      }

      const isRetryable = isRetryableError(error);
      const hasRetriesLeft = attempt < adjustedMaxRetries;

      if (!isRetryable || !hasRetriesLeft) {
        throw error;
      }

      // Calculate exponential backoff delay with jitter
      const backoffDelay = calculateBackoffDelay(attempt, adjustedBaseDelay);

      // Record retry attempt in rate limiter
      if (context.rateLimiter && attempt > 0) {
        context.rateLimiter.recordRetryAttempt(false); // Failed retry
      }

      // Emit retry event
      if (emitter) {
        emitter.emit("retry", {
          name: operation,
          operation: "list",
          priority: "normal",
          id: context.objectId,
          data: {
            attempt: attempt + 1,
            maxRetries: adjustedMaxRetries + 1
          }
        });
      }

      await delay(backoffDelay);
    }
  }

  const totalTime = Date.now() - startTime;
  throw lastError;
};

/**
 * Improved pagination handling with rate limiting.
 *
 * @param listFn - The function to list the results.
 * @param firstPageArgs - The arguments to pass to the first page.
 * @param operationName - The name of the operation.
 *
 * @returns The results of the API.
 */
export async function* iteratePaginatedAPI<T extends { next_cursor: string | null; results: any[] }>(
  listFn: (args: any) => Promise<T>,
  firstPageArgs: any,
  operationName: string,
  pageSize: number,
  rateLimitDelay: number
): AsyncGenerator<T["results"][0], void, unknown> {
  let nextCursor: string | undefined = firstPageArgs.start_cursor;
  let pageCount = 0;

  do {
    try {
      // Add page size limit
      const args = {
        ...firstPageArgs,
        start_cursor: nextCursor,
        page_size: pageSize
      };

      // Wait before making request
      await delay(rateLimitDelay);

      const response = await listFn(args);
      pageCount++;

      for (const result of response.results) {
        yield result;
      }

      nextCursor = response.next_cursor ?? undefined;
    } catch (error) {
      // Throw without logging to avoid disrupting progress display
      throw error;
    }
  } while (nextCursor);
}

/**
 * Collects paginated API results.
 *
 * @param listFn - The function to list the results.
 * @param firstPageArgs - The arguments to pass to the first page.
 * @param pageSize - The size of the page.
 * @param rateLimitDelay - The delay between requests.
 *
 * @returns The results of the API.
 */
export async function collectPaginatedAPI<T extends { next_cursor: string | null; results: any[] }>(
  listFn: (args: any) => Promise<T>,
  firstPageArgs: any,
  pageSize: number,
  rateLimitDelay: number
): Promise<T["results"]> {
  const results: T["results"] = [];
  for await (const item of iteratePaginatedAPI(listFn, firstPageArgs, "", pageSize, rateLimitDelay)) {
    results.push(item);
  }
  return results;
}

/**
 * Smart retry operation (alias for retry function).
 *
 * @param operation - The operation to retry.
 * @param operationName - The name of the operation.
 * @param context - Optional retry context for smarter retry decisions.
 * @param maxRetries - The maximum number of retries.
 * @param baseDelay - The base delay between retries.
 * @param timeout - The base timeout for the operation.
 * @param eventEmitter - Optional event emitter for retry events.
 *
 * @returns A promise that resolves when the operation is completed.
 */
export const smartRetryOperation = async <T>(
  operation: () => Promise<T>,
  operationName: string,
  context?: RetryContext,
  maxRetries?: number,
  baseDelay?: number,
  timeout?: number,
  eventEmitter?: OperationEventEmitter
): Promise<T> => {
  return retry({
    fn: operation,
    operation: operationName,
    context,
    maxRetries,
    baseDelay,
    timeout,
    emitter: eventEmitter
  });
};
