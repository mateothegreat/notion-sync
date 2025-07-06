/**
 * Error Hierarchy
 *
 * Centralized error definitions for the application
 */

export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly statusCode: number;

  constructor(
    message: string,
    public readonly context?: Record<string, any>
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      context: this.context,
      stack: this.stack
    };
  }
}

// Validation Errors
export class ValidationError extends DomainError {
  readonly code = "VALIDATION_ERROR";
  readonly statusCode = 400;
}

export class ConfigurationError extends DomainError {
  readonly code = "CONFIGURATION_ERROR";
  readonly statusCode = 400;
}

// Business Logic Errors
export class ExportError extends DomainError {
  readonly code = "EXPORT_ERROR";
  readonly statusCode = 422;
}

export class ExportNotFoundError extends DomainError {
  readonly code = "EXPORT_NOT_FOUND";
  readonly statusCode = 404;
}

export class ExportAlreadyRunningError extends DomainError {
  readonly code = "EXPORT_ALREADY_RUNNING";
  readonly statusCode = 409;
}

// Infrastructure Errors
export class NotionApiError extends DomainError {
  readonly code = "NOTION_API_ERROR";
  readonly statusCode = 502;

  constructor(
    message: string,
    public readonly notionErrorCode?: string,
    context?: Record<string, any>
  ) {
    super(message, { ...context, notionErrorCode });
  }
}

export class RateLimitError extends DomainError {
  readonly code = "RATE_LIMIT_ERROR";
  readonly statusCode = 429;

  constructor(
    message: string,
    public readonly retryAfter?: number,
    context?: Record<string, any>
  ) {
    super(message, { ...context, retryAfter });
  }
}

export class CircuitBreakerError extends DomainError {
  readonly code = "CIRCUIT_BREAKER_ERROR";
  readonly statusCode = 503;
}

export class FileSystemError extends DomainError {
  readonly code = "FILESYSTEM_ERROR";
  readonly statusCode = 500;
}

export class NetworkError extends DomainError {
  readonly code = "NETWORK_ERROR";
  readonly statusCode = 502;
}

// System Errors
export class InternalError extends DomainError {
  readonly code = "INTERNAL_ERROR";
  readonly statusCode = 500;
}

export class TimeoutError extends DomainError {
  readonly code = "TIMEOUT_ERROR";
  readonly statusCode = 408;
}

export class ConcurrencyError extends DomainError {
  readonly code = "CONCURRENCY_ERROR";
  readonly statusCode = 409;
}

// Error Factory
export class ErrorFactory {
  static fromNotionError(error: any): NotionApiError {
    const message = error.message || "Unknown Notion API error";
    const code = error.code || "unknown";
    const context = {
      originalError: error,
      url: error.url,
      status: error.status
    };

    return new NotionApiError(message, code, context);
  }

  static fromFileSystemError(error: any, operation: string): FileSystemError {
    const message = `File system error during ${operation}: ${error.message}`;
    const context = {
      operation,
      originalError: error,
      path: error.path,
      code: error.code
    };

    return new FileSystemError(message, context);
  }

  static fromNetworkError(error: any): NetworkError {
    const message = `Network error: ${error.message}`;
    const context = {
      originalError: error,
      code: error.code,
      errno: error.errno,
      syscall: error.syscall
    };

    return new NetworkError(message, context);
  }
}

// Error Handler
export interface ErrorHandler {
  handle(error: Error): Promise<void>;
}

export class DefaultErrorHandler implements ErrorHandler {
  async handle(error: Error): Promise<void> {
    if (error instanceof DomainError) {
      console.error(`[${error.code}] ${error.message}`, error.context);
    } else {
      console.error("Unexpected error:", error);
    }
  }
}

// Error Recovery Strategies
export interface RecoveryStrategy {
  canRecover(error: Error): boolean;
  recover(error: Error): Promise<void>;
}

export class RateLimitRecoveryStrategy implements RecoveryStrategy {
  canRecover(error: Error): boolean {
    return error instanceof RateLimitError;
  }

  async recover(error: Error): Promise<void> {
    if (error instanceof RateLimitError && error.retryAfter) {
      await new Promise((resolve) => setTimeout(resolve, error.retryAfter * 1000));
    }
  }
}

export class CircuitBreakerRecoveryStrategy implements RecoveryStrategy {
  canRecover(error: Error): boolean {
    return error instanceof CircuitBreakerError;
  }

  async recover(error: Error): Promise<void> {
    // Circuit breaker recovery is handled by the circuit breaker itself
    // This strategy just logs the attempt
    console.log("Circuit breaker recovery attempted");
  }
}

export class CompositeRecoveryStrategy implements RecoveryStrategy {
  constructor(private strategies: RecoveryStrategy[]) {}

  canRecover(error: Error): boolean {
    return this.strategies.some((strategy) => strategy.canRecover(error));
  }

  async recover(error: Error): Promise<void> {
    const strategy = this.strategies.find((s) => s.canRecover(error));
    if (strategy) {
      await strategy.recover(error);
    }
  }
}
