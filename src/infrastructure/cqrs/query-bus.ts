/**
 * Query Bus Implementation
 *
 * Handles query dispatching and execution in the CQRS pattern
 */

import { ControlPlane } from "../../lib/control-plane/control-plane";
import { log } from "../../lib/log";

/**
 * Query interface for query pattern implementation.
 */
export interface Query<TResult = any> {
  id: string;
  type: string;
  payload: any;
  timestamp: number;
  metadata?: Record<string, any>;
}

/**
 * Query handler function type.
 */
export type QueryHandler<TQuery = any, TResult = any> = (query: Query<TQuery>) => Promise<TResult>;

/**
 * Query handler registration interface.
 * Maps query types to their handlers.
 */
export interface QueryHandlerRegistry {
  [queryType: string]: QueryHandler<any, any>;
}

/**
 * Query bus interface for dispatching queries.
 */
export interface IQueryBus {
  execute<TResult = any>(query: Query): Promise<TResult>;
  register<TQuery = any, TResult = any>(queryType: string, handler: QueryHandler<TQuery, TResult>): void;
  unregister(queryType: string): void;
}

/**
 * Query bus implementation that integrates with the control plane.
 * Provides query routing and execution with proper error handling.
 */
export class QueryBus implements IQueryBus {
  private handlers: QueryHandlerRegistry = {};
  private readonly queryChannel = "queries";
  private readonly responseChannel = "query-responses";

  constructor(private controlPlane: ControlPlane) {
    this.setupQuerySubscription();
  }

  /**
   * Set up subscription to query channel.
   * Routes incoming queries to appropriate handlers.
   */
  private setupQuerySubscription(): void {
    this.controlPlane.subscribe(this.queryChannel, async (message) => {
      const query = message.payload as Query;

      if (!query || !query.type) {
        log.error("Invalid query received", { message });
        return;
      }

      try {
        const result = await this.handleQuery(query);

        // Publish query response
        await this.controlPlane.publish(this.responseChannel, {
          queryId: query.id,
          queryType: query.type,
          result,
          timestamp: Date.now()
        });
      } catch (error) {
        log.error("Query execution failed", {
          query: query.type,
          queryId: query.id,
          error
        });

        // Publish query failure event
        await this.controlPlane.publish("query.failed", {
          queryId: query.id,
          queryType: query.type,
          error: error instanceof Error ? error.message : "Unknown error",
          timestamp: Date.now()
        });
      }
    });
  }

  /**
   * Execute a query and return the result.
   *
   * Arguments:
   * - query: The query to execute
   *
   * Returns:
   * - Promise that resolves with the query result
   */
  async execute<TResult = any>(query: Query): Promise<TResult> {
    log.trace("Executing query", { type: query.type, id: query.id });

    // For local execution, directly handle the query
    if (this.handlers[query.type]) {
      try {
        return await this.handleQuery(query);
      } catch (error) {
        // Publish query failure event
        await this.controlPlane.publish("query.failed", {
          queryId: query.id,
          queryType: query.type,
          error: error instanceof Error ? error.message : "Unknown error",
          timestamp: Date.now()
        });
        throw error; // Re-throw for the caller
      }
    }

    // For distributed execution, publish query and wait for response
    return new Promise<TResult>(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Query timeout: ${query.type}`));
      }, 30000); // 30 second timeout

      // Subscribe to response channel for this specific query
      const unsubscribe = await this.controlPlane.subscribe(this.responseChannel, async (message) => {
        const response = message.payload as any;

        if (response.queryId === query.id) {
          clearTimeout(timeout);
          unsubscribe();

          if (response.error) {
            reject(new Error(response.error));
          } else {
            resolve(response.result);
          }
        }
      });

      // Publish query
      this.controlPlane.publish(this.queryChannel, query).catch((error) => {
        clearTimeout(timeout);
        unsubscribe();
        reject(error);
      });
    });
  }

  /**
   * Handle query execution.
   */
  private async handleQuery<TResult = any>(query: Query): Promise<TResult> {
    const handler = this.handlers[query.type];

    if (!handler) {
      throw new Error(`No handler registered for query type: ${query.type}`);
    }

    log.trace("Executing query handler", { type: query.type, id: query.id });

    // Publish query execution started event
    await this.controlPlane.publish("query.started", {
      queryId: query.id,
      queryType: query.type,
      timestamp: Date.now()
    });

    const startTime = Date.now();

    try {
      const result = await handler(query);

      const duration = Date.now() - startTime;

      // Publish query execution completed event
      await this.controlPlane.publish("query.completed", {
        queryId: query.id,
        queryType: query.type,
        duration,
        timestamp: Date.now()
      });

      log.trace("Query executed successfully", {
        type: query.type,
        id: query.id,
        duration
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      log.error("Query handler error", {
        query: query.type,
        queryId: query.id,
        duration,
        error
      });

      throw error;
    }
  }

  /**
   * Register a query handler.
   *
   * Arguments:
   * - queryType: The type of query to handle
   * - handler: The handler function
   */
  register<TQuery = any, TResult = any>(queryType: string, handler: QueryHandler<TQuery, TResult>): void {
    if (this.handlers[queryType]) {
      log.info("Overwriting existing query handler", { queryType });
    }

    this.handlers[queryType] = handler;
    log.trace("Query handler registered", { queryType });
  }

  /**
   * Unregister a query handler.
   *
   * Arguments:
   * - queryType: The type of query to unregister
   */
  unregister(queryType: string): void {
    delete this.handlers[queryType];
    log.trace("Query handler unregistered", { queryType });
  }

  /**
   * Get all registered query types.
   */
  getRegisteredQueries(): string[] {
    return Object.keys(this.handlers);
  }
}

/**
 * Create a query with proper structure.
 *
 * Arguments:
 * - type: The query type
 * - payload: The query payload
 * - metadata: Optional metadata
 *
 * Returns:
 * - A properly structured query
 */
export function createQuery<T = any>(type: string, payload: T, metadata?: Record<string, any>): Query {
  return {
    id: crypto.randomUUID(),
    type,
    payload,
    timestamp: Date.now(),
    metadata
  };
}
