/**
 * Circuit Breaker Implementation for EDA SDK
 *
 * Provides fault tolerance through circuit breaker pattern
 */

import { Observable, Subject, throwError } from "rxjs";
import { catchError, map } from "rxjs/operators";
import type { CircuitBreakerConfig } from "./types";

export enum CircuitBreakerState {
  CLOSED = "CLOSED",
  OPEN = "OPEN",
  HALF_OPEN = "HALF_OPEN"
}

/**
 * Circuit breaker statistics
 */
export interface CircuitBreakerStats {
  state: CircuitBreakerState;
  failureCount: number;
  successCount: number;
  totalRequests: number;
  failureRate: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
  nextRetryTime?: number;
}

/**
 * Circuit breaker error
 */
export class CircuitBreakerError extends Error {
  constructor(
    message: string,
    public readonly circuitBreakerName: string,
    public readonly state: CircuitBreakerState
  ) {
    super(message);
    this.name = "CircuitBreakerError";
  }
}

/**
 * Circuit breaker implementation
 */
export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private totalRequests = 0;
  private lastFailureTime?: number;
  private lastSuccessTime?: number;
  private nextRetryTime?: number;
  private stateSubject = new Subject<CircuitBreakerState>();

  constructor(private config: CircuitBreakerConfig) {}

  /**
   * Execute an operation with circuit breaker protection
   */
  execute<T>(operation: () => Observable<T>): Observable<T> {
    if (!this.canProceed()) {
      return throwError(
        () => new CircuitBreakerError(`Circuit breaker is ${this.state}`, "circuit-breaker", this.state)
      );
    }

    this.totalRequests++;

    return operation().pipe(
      map((result) => {
        this.reportSuccess();
        return result;
      }),
      catchError((error) => {
        this.reportFailure(error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Check if the circuit breaker allows requests
   */
  canProceed(): boolean {
    const now = Date.now();

    switch (this.state) {
      case CircuitBreakerState.CLOSED:
        return true;

      case CircuitBreakerState.OPEN:
        if (this.nextRetryTime && now >= this.nextRetryTime) {
          this.setState(CircuitBreakerState.HALF_OPEN);
          return true;
        }
        return false;

      case CircuitBreakerState.HALF_OPEN:
        return true;

      default:
        return false;
    }
  }

  /**
   * Report a successful operation
   */
  reportSuccess(): void {
    this.successCount++;
    this.lastSuccessTime = Date.now();

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.setState(CircuitBreakerState.CLOSED);
      this.resetCounts();
    } else if (this.state === CircuitBreakerState.CLOSED) {
      // Reset failure count on success in closed state
      this.failureCount = 0;
    }
  }

  /**
   * Report a failed operation
   */
  reportFailure(error?: Error): void {
    // Check if this is an expected error that shouldn't trigger the circuit breaker
    if (error && this.isExpectedError(error)) {
      return;
    }

    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.setState(CircuitBreakerState.OPEN);
      this.scheduleRetry();
    } else if (this.state === CircuitBreakerState.CLOSED && this.shouldOpen()) {
      this.setState(CircuitBreakerState.OPEN);
      this.scheduleRetry();
    }
  }

  /**
   * Get current circuit breaker statistics
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      totalRequests: this.totalRequests,
      failureRate: this.totalRequests > 0 ? this.failureCount / this.totalRequests : 0,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      nextRetryTime: this.nextRetryTime
    };
  }

  /**
   * Get current state
   */
  getState(): CircuitBreakerState {
    return this.state;
  }

  /**
   * Get state changes as observable
   */
  onStateChange(): Observable<CircuitBreakerState> {
    return this.stateSubject.asObservable();
  }

  /**
   * Manually reset the circuit breaker
   */
  reset(): void {
    this.setState(CircuitBreakerState.CLOSED);
    this.resetCounts();
    this.nextRetryTime = undefined;
  }

  /**
   * Manually open the circuit breaker
   */
  open(): void {
    this.setState(CircuitBreakerState.OPEN);
    this.scheduleRetry();
  }

  /**
   * Set circuit breaker state and emit change
   */
  private setState(newState: CircuitBreakerState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.stateSubject.next(newState);
    }
  }

  /**
   * Reset failure and success counts
   */
  private resetCounts(): void {
    this.failureCount = 0;
    this.successCount = 0;
  }

  /**
   * Schedule retry attempt
   */
  private scheduleRetry(): void {
    this.nextRetryTime = Date.now() + this.config.resetTimeout;
  }

  /**
   * Check if the circuit breaker should open
   */
  private shouldOpen(): boolean {
    return this.failureCount >= this.config.failureThreshold;
  }

  /**
   * Check if an error is expected and shouldn't trigger the circuit breaker
   */
  private isExpectedError(error: Error): boolean {
    if (!this.config.expectedErrors) {
      return false;
    }

    return this.config.expectedErrors.some(
      (expectedError) =>
        error.message.includes(expectedError) || error.name === expectedError || (error as any).code === expectedError
    );
  }
}

/**
 * Utility function to create a circuit breaker with default configuration
 */
export function createCircuitBreaker(options: Partial<CircuitBreakerConfig> = {}): CircuitBreaker {
  const defaultConfig: CircuitBreakerConfig = {
    failureThreshold: 5,
    resetTimeout: 60000, // 1 minute
    halfOpenRequests: 1,
    expectedErrors: []
  };

  const config = { ...defaultConfig, ...options };
  return new CircuitBreaker(config);
}
