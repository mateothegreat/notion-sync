/**
 * Circuit Breaker Implementation
 * 
 * Provides fault tolerance through circuit breaker pattern
 */

import { Observable, Subject, timer, EMPTY } from 'rxjs';
import { 
  CircuitBreakerState, 
  CircuitBreakerConfig, 
  CircuitBreakerError 
} from './types';

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
 * Circuit breaker implementation
 */
export class CircuitBreaker {
  private state: CircuitBreakerState = 'closed';
  private failureCount = 0;
  private successCount = 0;
  private totalRequests = 0;
  private lastFailureTime?: number;
  private lastSuccessTime?: number;
  private nextRetryTime?: number;
  private stateSubject = new Subject<CircuitBreakerState>();

  constructor(
    private name: string,
    private config: CircuitBreakerConfig
  ) {}

  /**
   * Execute an operation with circuit breaker protection
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (!this.canProceed()) {
      throw new CircuitBreakerError(
        `Circuit breaker ${this.name} is open`,
        this.name
      );
    }

    this.totalRequests++;

    try {
      const result = await operation();
      this.reportSuccess();
      return result;
    } catch (error) {
      this.reportFailure(error as Error);
      throw error;
    }
  }

  /**
   * Check if the circuit breaker allows requests
   */
  canProceed(): boolean {
    const now = Date.now();

    switch (this.state) {
      case 'closed':
        return true;

      case 'open':
        if (this.nextRetryTime && now >= this.nextRetryTime) {
          this.setState('half-open');
          return true;
        }
        return false;

      case 'half-open':
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

    if (this.state === 'half-open') {
      this.setState('closed');
      this.resetCounts();
    } else if (this.state === 'closed') {
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

    if (this.state === 'half-open') {
      this.setState('open');
      this.scheduleRetry();
    } else if (this.state === 'closed' && this.shouldOpen()) {
      this.setState('open');
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
   * Get observable for state changes
   */
  onStateChange(): Observable<CircuitBreakerState> {
    return this.stateSubject.asObservable();
  }

  /**
   * Manually reset the circuit breaker
   */
  reset(): void {
    this.setState('closed');
    this.resetCounts();
    this.nextRetryTime = undefined;
  }

  /**
   * Manually open the circuit breaker
   */
  open(): void {
    this.setState('open');
    this.scheduleRetry();
  }

  /**
   * Get the current state
   */
  getState(): CircuitBreakerState {
    return this.state;
  }

  /**
   * Get the circuit breaker name
   */
  getName(): string {
    return this.name;
  }

  /**
   * Check if the circuit breaker should open
   */
  private shouldOpen(): boolean {
    const now = Date.now();
    const monitoringWindow = this.config.monitoringPeriod;

    // Only consider failures within the monitoring window
    if (this.lastFailureTime && (now - this.lastFailureTime) > monitoringWindow) {
      return false;
    }

    return this.failureCount >= this.config.failureThreshold;
  }

  /**
   * Check if an error is expected and shouldn't trigger the circuit breaker
   */
  private isExpectedError(error: Error): boolean {
    if (!this.config.expectedErrors) {
      return false;
    }

    return this.config.expectedErrors.some(expectedError => 
      error.message.includes(expectedError) || 
      error.name === expectedError ||
      (error as any).code === expectedError
    );
  }

  /**
   * Set the circuit breaker state
   */
  private setState(newState: CircuitBreakerState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.stateSubject.next(newState);
    }
  }

  /**
   * Schedule a retry attempt
   */
  private scheduleRetry(): void {
    this.nextRetryTime = Date.now() + this.config.resetTimeout;
  }

  /**
   * Reset failure and success counts
   */
  private resetCounts(): void {
    this.failureCount = 0;
    this.successCount = 0;
  }
}

/**
 * Circuit breaker registry for managing multiple circuit breakers
 */
export class CircuitBreakerRegistry {
  private breakers = new Map<string, CircuitBreaker>();

  /**
   * Create or get a circuit breaker
   */
  getOrCreate(name: string, config: CircuitBreakerConfig): CircuitBreaker {
    if (!this.breakers.has(name)) {
      this.breakers.set(name, new CircuitBreaker(name, config));
    }
    return this.breakers.get(name)!;
  }

  /**
   * Get a circuit breaker by name
   */
  get(name: string): CircuitBreaker | undefined {
    return this.breakers.get(name);
  }

  /**
   * Remove a circuit breaker
   */
  remove(name: string): boolean {
    return this.breakers.delete(name);
  }

  /**
   * Get all circuit breaker names
   */
  getNames(): string[] {
    return Array.from(this.breakers.keys());
  }

  /**
   * Get statistics for all circuit breakers
   */
  getAllStats(): Record<string, CircuitBreakerStats> {
    const stats: Record<string, CircuitBreakerStats> = {};
    for (const [name, breaker] of this.breakers) {
      stats[name] = breaker.getStats();
    }
    return stats;
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }

  /**
   * Clear all circuit breakers
   */
  clear(): void {
    this.breakers.clear();
  }
}

/**
 * Utility function to create a circuit breaker with default configuration
 */
export function createCircuitBreaker(
  name: string,
  options: Partial<CircuitBreakerConfig> = {}
): CircuitBreaker {
  const defaultConfig: CircuitBreakerConfig = {
    failureThreshold: 5,
    resetTimeout: 60000, // 1 minute
    monitoringPeriod: 120000, // 2 minutes
    expectedErrors: []
  };

  const config = { ...defaultConfig, ...options };
  return new CircuitBreaker(name, config);
}

/**
 * Decorator for automatic circuit breaker protection
 */
export function withCircuitBreaker(
  name: string,
  config?: Partial<CircuitBreakerConfig>
) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const circuitBreaker = createCircuitBreaker(name, config);

    descriptor.value = async function (...args: any[]) {
      return circuitBreaker.execute(() => originalMethod.apply(this, args));
    };

    // Store circuit breaker reference for testing
    (descriptor.value as any).circuitBreaker = circuitBreaker;

    return descriptor;
  };
}