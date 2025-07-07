/**
 * Observable-based concurrency limiter using RxJS.
 *
 * @example
 * ```ts
 * const limiter = new ObservableConcurrencyLimiter(10);
 * limiter.run(() => from(fetch('https://api.example.com'))).subscribe();
 * ```
 */

import { Observable, Subject, from, of, throwError } from "rxjs";
import { catchError, finalize, mergeMap, tap, timeout } from "rxjs/operators";

export class ObservableConcurrencyLimiter {
  /**
   * The number of concurrent operations currently running.
   */
  private running = 0;

  /**
   * The queue of operations waiting to run.
   */
  private queue = new Subject<{
    operation: () => Observable<any>;
    subject: Subject<any>;
  }>();

  constructor(private maxConcurrent: number) {
    // Process queue items
    this.queue
      .pipe(
        mergeMap(({ operation, subject }) => {
          // Wait until we have capacity
          return this.waitForCapacity().pipe(
            mergeMap(() => {
              this.running++;
              return operation().pipe(
                tap({
                  next: (value) => subject.next(value),
                  error: (err) => subject.error(err),
                  complete: () => subject.complete()
                }),
                finalize(() => {
                  this.running--;
                  subject.complete();
                }),
                catchError((err) => {
                  subject.error(err);
                  return of(null); // Continue processing queue
                })
              );
            })
          );
        })
      )
      .subscribe();
  }

  /**
   * Runs an operation with the concurrency limiter.
   *
   * @param operation - The operation to run.
   * @param timeoutMs - Optional timeout in milliseconds.
   * @returns Observable of the operation result.
   */
  run<T>(operation: () => Observable<T>, timeoutMs?: number): Observable<T> {
    const subject = new Subject<T>();

    let wrappedOperation = operation;

    // Add timeout if specified
    if (timeoutMs) {
      wrappedOperation = () =>
        operation().pipe(
          timeout(timeoutMs),
          catchError((err) => {
            if (err.name === "TimeoutError") {
              return throwError(() => new Error("Operation timed out"));
            }
            return throwError(() => err);
          })
        );
    }

    this.queue.next({
      operation: wrappedOperation as () => Observable<any>,
      subject: subject as Subject<any>
    });

    return subject.asObservable();
  }

  /**
   * Waits until there is capacity to run another operation.
   */
  private waitForCapacity(): Observable<void> {
    if (this.running < this.maxConcurrent) {
      return of(undefined);
    }

    // Poll until capacity is available
    return new Observable((observer) => {
      const checkCapacity = () => {
        if (this.running < this.maxConcurrent) {
          observer.next();
          observer.complete();
        } else {
          setTimeout(checkCapacity, 10);
        }
      };
      checkCapacity();
    });
  }

  /**
   * Gets the current number of running operations.
   */
  getRunningCount(): number {
    return this.running;
  }

  /**
   * Completes the queue and prevents new operations.
   */
  complete(): void {
    this.queue.complete();
  }
}

/**
 * Simple promise-based concurrency limiter (legacy).
 *
 * @deprecated Use ObservableConcurrencyLimiter instead
 * @example
 * ```ts
 * const limiter = new ConcurrencyLimiter(10);
 * await limiter.run(() => fetch('https://api.example.com'));
 * ```
 */
export class ConcurrencyLimiter {
  /**
   * The number of concurrent operations currently running.
   */
  private running = 0;

  /**
   * The queue of operations waiting to run.
   */
  private queue: Array<() => void> = [];

  /**
   * Creates a new concurrency limiter.
   *
   * @param maxConcurrent - The maximum number of concurrent operations.
   */
  constructor(private maxConcurrent: number) {}

  /**
   * Runs a function with the concurrency limiter.
   *
   * @param fn - The function to run.
   * @param timeout - The timeout for the operation.
   *
   * @returns The result of the function.
   */
  async run<T>(fn: () => Promise<T>, timeout?: number): Promise<T> {
    while (this.running >= this.maxConcurrent) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }

    this.running++;

    try {
      // Add timeout wrapper if specified
      if (timeout) {
        return await Promise.race([
          fn(),
          new Promise<T>((_, reject) => delay(timeout).then(() => reject(new Error("Operation timed out"))))
        ]);
      }
      return await fn();
    } finally {
      this.running--;
      const next = this.queue.shift();
      if (next) next();
    }
  }
}

/**
 * Enhanced rate limiter with burst protection and adaptive rate limiting.
 */
export class RateLimiter {
  private requestTimes: number[] = [];
  private lastRequestTime: number = 0;
  private consecutiveErrors: number = 0;

  constructor(private maxRequestsPerMinute: number = 60, private minInterval: number = 100) {}

  /**
   * Wait for rate limit before making a request.
   *
   * @returns A promise that resolves when it's safe to make a request.
   */
  async waitForSlot(): Promise<void> {
    const now = Date.now();

    // Clean up old request times (older than 1 minute)
    this.requestTimes = this.requestTimes.filter((time) => now - time < 60000);

    // Check if we're at the rate limit
    if (this.requestTimes.length >= this.maxRequestsPerMinute) {
      const oldestRequest = this.requestTimes[0];
      const waitTime = 60000 - (now - oldestRequest) + 100; // Add 100ms buffer
      // Silently wait without logging to avoid disrupting progress display
      await delay(waitTime);
      return this.waitForSlot(); // Recursively check again
    }

    // Ensure minimum interval between requests
    const timeSinceLastRequest = now - this.lastRequestTime;
    const adaptiveInterval = this.getAdaptiveInterval();

    if (timeSinceLastRequest < adaptiveInterval) {
      await delay(adaptiveInterval - timeSinceLastRequest);
    }

    // Record this request
    this.requestTimes.push(Date.now());
    this.lastRequestTime = Date.now();
  }

  /**
   * Get adaptive interval based on error rate.
   *
   * @returns The adaptive interval in milliseconds.
   */
  private getAdaptiveInterval(): number {
    // Increase interval if we're seeing errors
    return this.minInterval * Math.pow(2, Math.min(this.consecutiveErrors, 5));
  }

  /**
   * Report a successful request.
   */
  reportSuccess(): void {
    this.consecutiveErrors = 0;
  }

  /**
   * Report a failed request.
   */
  reportError(): void {
    this.consecutiveErrors++;
  }

  /**
   * Get the wait time before the next request can be made.
   *
   * @returns The wait time in milliseconds, or 0 if no wait is needed.
   */
  getWaitTime(): number {
    const now = Date.now();

    // Clean up old request times
    this.requestTimes = this.requestTimes.filter((time) => now - time < 60000);

    // Check if we're at the rate limit
    if (this.requestTimes.length >= this.maxRequestsPerMinute) {
      const oldestRequest = this.requestTimes[0];
      return 60000 - (now - oldestRequest) + 100;
    }

    // Check minimum interval
    const timeSinceLastRequest = now - this.lastRequestTime;
    const adaptiveInterval = this.getAdaptiveInterval();

    if (timeSinceLastRequest < adaptiveInterval) {
      return adaptiveInterval - timeSinceLastRequest;
    }

    return 0;
  }
}

/**
 * Circuit breaker pattern for handling repeated failures.
 */
export class CircuitBreaker {
  private failures: number = 0;
  private lastFailureTime: number = 0;
  private state: "closed" | "open" | "half-open" = "closed";

  constructor(private failureThreshold: number = 5, private resetTimeout: number = 60000) {}

  /**
   * Check if the circuit breaker allows the operation.
   *
   * @returns True if the operation is allowed, false otherwise.
   */
  canProceed(): boolean {
    const now = Date.now();

    if (this.state === "closed") {
      return true;
    }

    if (this.state === "open") {
      if (now - this.lastFailureTime >= this.resetTimeout) {
        this.state = "half-open";
        return true;
      }
      return false;
    }

    // Half-open state
    return true;
  }

  /**
   * Report a successful operation.
   */
  reportSuccess(): void {
    this.failures = 0;
    this.state = "closed";
  }

  /**
   * Report a failed operation.
   */
  reportFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.failureThreshold) {
      this.state = "open";
      // Silently open circuit breaker without logging to avoid disrupting progress display
    }
  }

  /**
   * Get the current state of the circuit breaker.
   *
   * @returns The current state.
   */
  getState(): string {
    return this.state;
  }
}

/**
 * Progress tracker with persistence support.
 */
export class ProgressTracker {
  private progress: Map<string, any> = new Map();

  /**
   * Set progress for a key.
   *
   * @param key - The progress key.
   * @param value - The progress value.
   */
  set(key: string, value: any): void {
    this.progress.set(key, value);
  }

  /**
   * Get progress for a key.
   *
   * @param key - The progress key.
   *
   * @returns The progress value.
   */
  get(key: string): any {
    return this.progress.get(key);
  }

  /**
   * Check if progress exists for a key.
   *
   * @param key - The progress key.
   *
   * @returns True if progress exists, false otherwise.
   */
  has(key: string): boolean {
    return this.progress.has(key);
  }

  /**
   * Export progress to JSON.
   *
   * @returns The progress as JSON.
   */
  toJSON(): Record<string, any> {
    const obj: Record<string, any> = {};
    for (const [key, value] of this.progress) {
      obj[key] = value;
    }
    return obj;
  }

  /**
   * Import progress from JSON.
   *
   * @param data - The progress data.
   */
  fromJSON(data: Record<string, any>): void {
    this.progress.clear();
    for (const [key, value] of Object.entries(data)) {
      this.progress.set(key, value);
    }
  }
}

/**
 * Delay for a given number of milliseconds.
 *
 * @param ms - The number of milliseconds to delay.
 *
 * @returns A promise that resolves after the given number of milliseconds.
 */
export const delay = (ms: number): Promise<void> => {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
};

/**
 * Sum reducer for an array of numbers.
 *
 * @param sum - The initial sum.
 * @param val - The value to add to the sum.
 *
 * @returns The sum of the values.
 */
export const sumReducer = (sum: number, val: number): number => sum + val;

/**
 * Get a formatted date string in YYYY-MM-DD format.
 *
 * @param date - The date to format (defaults to current date).
 *
 * @returns The formatted date string.
 */
export const getDateString = (date?: Date): string => {
  if (!date) {
    date = new Date();
  }

  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date
    .getDate()
    .toString()
    .padStart(2, "0")}`;
};

/**
 * Log levels for debug logging.
 */
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  VERBOSE = 4
}

/**
 * A debug log entry with timestamp and level.
 */
interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  message: string;
  context?: string;
}

/**
 * Debug logger that maintains a circular buffer of log messages.
 * Designed to work alongside progress spinners by displaying recent debug messages above.
 */
export class DebugLogger {
  private entries: LogEntry[] = [];
  private maxEntries: number;
  private currentLevel: LogLevel;
  private displayCount: number;

  /**
   * Creates a new debug logger.
   *
   * @param level - The minimum log level to capture.
   * @param maxEntries - Maximum number of entries to keep in buffer.
   * @param displayCount - Number of recent entries to display.
   */
  constructor(level: LogLevel = LogLevel.INFO, maxEntries: number = 100, displayCount: number = 5) {
    this.currentLevel = level;
    this.maxEntries = maxEntries;
    this.displayCount = displayCount;
  }

  /**
   * Log a message at the specified level.
   *
   * @param level - The log level.
   * @param message - The message to log.
   * @param context - Optional context (e.g., operation name).
   */
  log(level: LogLevel, message: string, context?: string): void {
    if (level > this.currentLevel) return;

    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      message,
      context
    };

    this.entries.push(entry);

    // Maintain circular buffer
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }
  }

  /**
   * Log an error message.
   *
   * @param message - The error message.
   * @param context - Optional context.
   */
  error(message: string, context?: string): void {
    this.log(LogLevel.ERROR, message, context);
  }

  /**
   * Log a warning message.
   *
   * @param message - The warning message.
   * @param context - Optional context.
   */
  warn(message: string, context?: string): void {
    this.log(LogLevel.WARN, message, context);
  }

  /**
   * Log an info message.
   *
   * @param message - The info message.
   * @param context - Optional context.
   */
  info(message: string, context?: string): void {
    this.log(LogLevel.INFO, message, context);
  }

  /**
   * Log a debug message.
   *
   * @param message - The debug message.
   * @param context - Optional context.
   */
  debug(message: string, context?: string): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  /**
   * Log a verbose message.
   *
   * @param message - The verbose message.
   * @param context - Optional context.
   */
  verbose(message: string, context?: string): void {
    this.log(LogLevel.VERBOSE, message, context);
  }

  /**
   * Get recent log entries for display.
   *
   * @param count - Number of entries to retrieve (defaults to displayCount).
   *
   * @returns Array of recent log entries.
   */
  getRecentEntries(count?: number): LogEntry[] {
    const displayCount = count ?? this.displayCount;
    return this.entries.slice(-displayCount);
  }

  /**
   * Format a log entry for display.
   *
   * @param entry - The log entry to format.
   * @param includeTimestamp - Whether to include timestamp.
   *
   * @returns Formatted string for display.
   */
  formatEntry(entry: LogEntry, includeTimestamp: boolean = true): string {
    const levelSymbols = {
      [LogLevel.ERROR]: "❌",
      [LogLevel.WARN]: "⚠️ ",
      [LogLevel.INFO]: "ℹ️ ",
      [LogLevel.DEBUG]: "🔍",
      [LogLevel.VERBOSE]: "📝"
    };

    const levelColors = {
      [LogLevel.ERROR]: "\x1b[31m", // red
      [LogLevel.WARN]: "\x1b[33m", // yellow
      [LogLevel.INFO]: "\x1b[36m", // cyan
      [LogLevel.DEBUG]: "\x1b[90m", // gray
      [LogLevel.VERBOSE]: "\x1b[90m" // gray
    };

    const reset = "\x1b[0m";
    const symbol = levelSymbols[entry.level];
    const color = levelColors[entry.level];

    let formatted = "";

    if (includeTimestamp) {
      const time = entry.timestamp.toLocaleTimeString();
      formatted += `\x1b[90m[${time}]${reset} `;
    }

    formatted += `${symbol} `;

    if (entry.context) {
      formatted += `\x1b[35m[${entry.context}]${reset} `;
    }

    formatted += `${color}${entry.message}${reset}`;

    return formatted;
  }

  /**
   * Get formatted recent entries for display above a spinner.
   *
   * @returns Array of formatted strings.
   */
  getFormattedDisplay(): string[] {
    return this.getRecentEntries().map((entry) => this.formatEntry(entry));
  }

  /**
   * Clear all log entries.
   */
  clear(): void {
    this.entries = [];
  }

  /**
   * Set the current log level.
   *
   * @param level - The new log level.
   */
  setLevel(level: LogLevel): void {
    this.currentLevel = level;
  }

  /**
   * Set the number of entries to display.
   *
   * @param count - The number of entries to display.
   */
  setDisplayCount(count: number): void {
    this.displayCount = count;
  }
}

/**
 * Tracks rates of operations over time.
 */
export class RateTracker {
  private lastCounts: Map<string, number> = new Map();
  private lastTimes: Map<string, number> = new Map();
  private rates: Map<string, number> = new Map();
  private updateInterval: number;

  constructor(updateInterval: number = 2000) {
    this.updateInterval = updateInterval;
  }

  /**
   * Update count for a metric and calculate its rate.
   *
   * @param metric - The metric name.
   * @param currentCount - The current count.
   */
  updateMetric(metric: string, currentCount: number): number {
    const now = Date.now();
    const lastTime = this.lastTimes.get(metric) || now;
    const lastCount = this.lastCounts.get(metric) || 0;

    // Only update rate if enough time has passed
    if (now - lastTime >= this.updateInterval) {
      const timeDiff = (now - lastTime) / 1000; // Convert to seconds
      const countDiff = currentCount - lastCount;
      const rate = countDiff / timeDiff;

      this.rates.set(metric, rate);
      this.lastTimes.set(metric, now);
      this.lastCounts.set(metric, currentCount);
    }

    return this.rates.get(metric) || 0;
  }

  /**
   * Format a rate for display.
   *
   * @param rate - The rate to format.
   */
  static formatRate(rate: number): string {
    if (rate >= 100) {
      return `${Math.round(rate)}/s`;
    } else if (rate >= 10) {
      return `${rate.toFixed(1)}/s`;
    } else {
      return `${rate.toFixed(2)}/s`;
    }
  }
}

/**
 * Utility to convert a Promise-based function to an Observable
 */
export function fromPromiseFactory<T>(fn: () => Promise<T>): Observable<T> {
  return from(fn());
}
