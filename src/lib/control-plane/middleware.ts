/**
 * Middleware System
 *
 * Provides extensible middleware pipeline for message processing
 */

import { Observable, from, of } from "rxjs";
import { mergeMap, catchError } from "rxjs/operators";
import { Message, Middleware } from "./types";

/**
 * Middleware context for passing data between middleware
 */
export interface MiddlewareContext {
  [key: string]: any;
}

/**
 * Enhanced middleware function with context
 */
export type EnhancedMiddleware<T = any> = (
  message: Message<T>,
  context: MiddlewareContext,
  next: () => void | Promise<void>
) => void | Promise<void>;

/**
 * Middleware pipeline for processing messages
 */
export class MiddlewarePipeline {
  private middleware: EnhancedMiddleware[] = [];

  /**
   * Add middleware to the pipeline
   */
  use(middleware: EnhancedMiddleware): void {
    this.middleware.push(middleware);
  }

  /**
   * Remove middleware from the pipeline
   */
  remove(middleware: EnhancedMiddleware): boolean {
    const index = this.middleware.indexOf(middleware);
    if (index !== -1) {
      this.middleware.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Execute the middleware pipeline
   */
  async execute<T>(message: Message<T>, context: MiddlewareContext = {}): Promise<void> {
    let index = 0;

    const next = async (): Promise<void> => {
      if (index < this.middleware.length) {
        const middleware = this.middleware[index++];
        await middleware(message, context, next);
      }
    };

    await next();
  }

  /**
   * Get the number of middleware in the pipeline
   */
  size(): number {
    return this.middleware.length;
  }

  /**
   * Clear all middleware
   */
  clear(): void {
    this.middleware.length = 0;
  }
}

/**
 * Built-in middleware for logging
 */
export const loggingMiddleware: EnhancedMiddleware = async (message, context, next) => {
  const startTime = Date.now();

  console.log(`[${new Date().toISOString()}] Processing message: ${message.type} (${message.id})`);

  try {
    await next();
    const duration = Date.now() - startTime;
    console.log(`[${new Date().toISOString()}] Completed message: ${message.type} (${message.id}) in ${duration}ms`);
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(
      `[${new Date().toISOString()}] Failed message: ${message.type} (${message.id}) after ${duration}ms`,
      error
    );
    throw error;
  }
};

/**
 * Built-in middleware for validation
 */
export function validationMiddleware<T>(
  validator: (payload: T) => boolean | Promise<boolean>,
  errorMessage = "Message validation failed"
): EnhancedMiddleware<T> {
  return async (message, context, next) => {
    const isValid = await validator(message.payload);

    if (!isValid) {
      throw new Error(`${errorMessage}: ${message.type} (${message.id})`);
    }

    await next();
  };
}

/**
 * Built-in middleware for rate limiting
 */
export function rateLimitingMiddleware(maxRequests: number, windowMs: number): EnhancedMiddleware {
  const requests = new Map<string, number[]>();

  return async (message, context, next) => {
    const now = Date.now();
    const key = message.source || "default";

    if (!requests.has(key)) {
      requests.set(key, []);
    }

    const timestamps = requests.get(key)!;

    // Remove old timestamps outside the window
    const cutoff = now - windowMs;
    while (timestamps.length > 0 && timestamps[0] < cutoff) {
      timestamps.shift();
    }

    // Check if rate limit exceeded
    if (timestamps.length >= maxRequests) {
      throw new Error(`Rate limit exceeded for ${key}: ${maxRequests} requests per ${windowMs}ms`);
    }

    // Add current timestamp
    timestamps.push(now);

    await next();
  };
}

/**
 * Built-in middleware for error handling
 */
export function errorHandlingMiddleware(
  errorHandler?: (error: Error, message: Message) => void | Promise<void>
): EnhancedMiddleware {
  return async (message, context, next) => {
    try {
      await next();
    } catch (error) {
      if (errorHandler) {
        await errorHandler(error as Error, message);
      } else {
        console.error(`Error processing message ${message.type} (${message.id}):`, error);
      }
      throw error;
    }
  };
}

/**
 * Built-in middleware for metrics collection
 */
export function metricsMiddleware(
  metricsCollector?: (metrics: {
    messageType: string;
    messageId: string;
    duration: number;
    success: boolean;
    error?: Error;
  }) => void
): EnhancedMiddleware {
  return async (message, context, next) => {
    const startTime = Date.now();
    let success = true;
    let error: Error | undefined;

    try {
      await next();
    } catch (err) {
      success = false;
      error = err as Error;
      throw err;
    } finally {
      const duration = Date.now() - startTime;

      if (metricsCollector) {
        metricsCollector({
          messageType: message.type,
          messageId: message.id,
          duration,
          success,
          error
        });
      }
    }
  };
}

/**
 * Built-in middleware for message transformation
 */
export function transformationMiddleware<T, R>(transformer: (payload: T) => R | Promise<R>): EnhancedMiddleware<T> {
  return async (message, context, next) => {
    const transformedPayload = await transformer(message.payload);

    // Store original payload in context
    context.originalPayload = message.payload;

    // Replace payload with transformed version
    (message as any).payload = transformedPayload;

    await next();
  };
}

/**
 * Built-in middleware for caching
 */
export function cachingMiddleware<T>(
  cacheKey: (message: Message<T>) => string,
  cache: Map<string, any> = new Map(),
  ttlMs = 300000 // 5 minutes
): EnhancedMiddleware<T> {
  const timestamps = new Map<string, number>();

  return async (message, context, next) => {
    const key = cacheKey(message);
    const now = Date.now();

    // Check if cached result exists and is not expired
    if (cache.has(key)) {
      const timestamp = timestamps.get(key);
      if (timestamp && now - timestamp < ttlMs) {
        context.cachedResult = cache.get(key);
        return; // Skip processing, use cached result
      } else {
        // Remove expired entry
        cache.delete(key);
        timestamps.delete(key);
      }
    }

    await next();

    // Cache the result if available in context
    if (context.result !== undefined) {
      cache.set(key, context.result);
      timestamps.set(key, now);
    }
  };
}

/**
 * Built-in middleware for authentication
 */
export function authenticationMiddleware(
  authenticator: (message: Message) => boolean | Promise<boolean>
): EnhancedMiddleware {
  return async (message, context, next) => {
    const isAuthenticated = await authenticator(message);

    if (!isAuthenticated) {
      throw new Error(`Authentication failed for message ${message.type} (${message.id})`);
    }

    await next();
  };
}

/**
 * Built-in middleware for message filtering
 */
export function filteringMiddleware<T>(
  filter: (message: Message<T>) => boolean | Promise<boolean>
): EnhancedMiddleware<T> {
  return async (message, context, next) => {
    const shouldProcess = await filter(message);

    if (!shouldProcess) {
      context.filtered = true;
      return; // Skip processing
    }

    await next();
  };
}

/**
 * Middleware composer for combining multiple middleware
 */
export class MiddlewareComposer {
  private middleware: EnhancedMiddleware[] = [];

  /**
   * Add middleware to the composer
   */
  use(middleware: EnhancedMiddleware): this {
    this.middleware.push(middleware);
    return this;
  }

  /**
   * Compose all middleware into a single middleware function
   */
  compose(): EnhancedMiddleware {
    return async (message, context, next) => {
      const pipeline = new MiddlewarePipeline();

      // Add all middleware to the pipeline
      for (const middleware of this.middleware) {
        pipeline.use(middleware);
      }

      // Add the final next function
      pipeline.use(async (msg, ctx, nextFn) => {
        await next();
      });

      await pipeline.execute(message, context);
    };
  }

  /**
   * Clear all middleware
   */
  clear(): this {
    this.middleware.length = 0;
    return this;
  }
}
