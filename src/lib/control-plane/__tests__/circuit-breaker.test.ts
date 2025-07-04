/**
 * Circuit Breaker Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { 
  CircuitBreaker, 
  CircuitBreakerRegistry,
  createCircuitBreaker,
  withCircuitBreaker
} from '../circuit-breaker';
import { CircuitBreakerConfig } from '../types';

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;
  let config: CircuitBreakerConfig;

  beforeEach(() => {
    config = {
      failureThreshold: 3,
      resetTimeout: 1000,
      monitoringPeriod: 5000,
      expectedErrors: ['ValidationError']
    };
    circuitBreaker = new CircuitBreaker('test-breaker', config);
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  it('should start in closed state', () => {
    expect(circuitBreaker.getState()).toBe('closed');
    expect(circuitBreaker.canProceed()).toBe(true);
  });

  it('should execute successful operations', async () => {
    const operation = vi.fn().mockResolvedValue('success');
    
    const result = await circuitBreaker.execute(operation);
    
    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(1);
    expect(circuitBreaker.getState()).toBe('closed');
  });

  it('should track failures and open when threshold is reached', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('Operation failed'));
    
    // First two failures should keep circuit closed
    await expect(circuitBreaker.execute(operation)).rejects.toThrow('Operation failed');
    expect(circuitBreaker.getState()).toBe('closed');
    
    await expect(circuitBreaker.execute(operation)).rejects.toThrow('Operation failed');
    expect(circuitBreaker.getState()).toBe('closed');
    
    // Third failure should open the circuit
    await expect(circuitBreaker.execute(operation)).rejects.toThrow('Operation failed');
    expect(circuitBreaker.getState()).toBe('open');
  });

  it('should reject requests when circuit is open', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('Operation failed'));
    
    // Trigger circuit to open
    for (let i = 0; i < 3; i++) {
      await expect(circuitBreaker.execute(operation)).rejects.toThrow();
    }
    
    expect(circuitBreaker.getState()).toBe('open');
    expect(circuitBreaker.canProceed()).toBe(false);
    
    // Should reject without calling operation
    await expect(circuitBreaker.execute(operation)).rejects.toThrow('Circuit breaker test-breaker is open');
    expect(operation).toHaveBeenCalledTimes(3); // Only the initial failures
  });

  it('should transition to half-open after reset timeout', async () => {
    vi.useFakeTimers();
    
    const operation = vi.fn().mockRejectedValue(new Error('Operation failed'));
    
    // Open the circuit
    for (let i = 0; i < 3; i++) {
      await expect(circuitBreaker.execute(operation)).rejects.toThrow();
    }
    
    expect(circuitBreaker.getState()).toBe('open');
    
    // Fast-forward time to trigger reset
    vi.advanceTimersByTime(1000);
    
    expect(circuitBreaker.canProceed()).toBe(true);
    
    // Next execution should transition to half-open
    operation.mockResolvedValueOnce('success');
    await circuitBreaker.execute(operation);
    
    expect(circuitBreaker.getState()).toBe('closed');
    
    vi.useRealTimers();
  });

  it('should reset to closed state on successful execution in half-open state', async () => {
    vi.useFakeTimers();
    
    const operation = vi.fn().mockRejectedValue(new Error('Operation failed'));
    
    // Open the circuit
    for (let i = 0; i < 3; i++) {
      await expect(circuitBreaker.execute(operation)).rejects.toThrow();
    }
    
    // Wait for reset timeout
    vi.advanceTimersByTime(1000);
    
    // Successful operation should close the circuit
    operation.mockResolvedValueOnce('success');
    await circuitBreaker.execute(operation);
    
    expect(circuitBreaker.getState()).toBe('closed');
    
    vi.useRealTimers();
  });

  it('should return to open state on failure in half-open state', async () => {
    vi.useFakeTimers();
    
    const operation = vi.fn().mockRejectedValue(new Error('Operation failed'));
    
    // Open the circuit
    for (let i = 0; i < 3; i++) {
      await expect(circuitBreaker.execute(operation)).rejects.toThrow();
    }
    
    // Wait for reset timeout
    vi.advanceTimersByTime(1000);
    
    // Failed operation should return to open state
    await expect(circuitBreaker.execute(operation)).rejects.toThrow('Operation failed');
    
    expect(circuitBreaker.getState()).toBe('open');
    
    vi.useRealTimers();
  });

  it('should ignore expected errors', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('ValidationError: Invalid input'));
    
    // Expected errors should not count towards failure threshold
    for (let i = 0; i < 5; i++) {
      await expect(circuitBreaker.execute(operation)).rejects.toThrow('ValidationError');
    }
    
    expect(circuitBreaker.getState()).toBe('closed'); // Should remain closed
  });

  it('should provide accurate statistics', async () => {
    const successOperation = vi.fn().mockResolvedValue('success');
    const failOperation = vi.fn().mockRejectedValue(new Error('Operation failed'));
    
    // Execute some operations
    await circuitBreaker.execute(successOperation);
    await circuitBreaker.execute(successOperation);
    
    await expect(circuitBreaker.execute(failOperation)).rejects.toThrow();
    
    const stats = circuitBreaker.getStats();
    
    expect(stats.state).toBe('closed');
    expect(stats.successCount).toBe(2);
    expect(stats.failureCount).toBe(1);
    expect(stats.totalRequests).toBe(3);
    expect(stats.failureRate).toBeCloseTo(1/3);
    expect(stats.lastSuccessTime).toBeDefined();
    expect(stats.lastFailureTime).toBeDefined();
  });

  it('should emit state change events', async () => {
    const stateChanges: string[] = [];
    
    circuitBreaker.onStateChange().subscribe(state => {
      stateChanges.push(state);
    });
    
    const operation = vi.fn().mockRejectedValue(new Error('Operation failed'));
    
    // Trigger state changes
    for (let i = 0; i < 3; i++) {
      await expect(circuitBreaker.execute(operation)).rejects.toThrow();
    }
    
    expect(stateChanges).toContain('open');
  });

  it('should allow manual reset', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('Operation failed'));
    
    // Open the circuit
    for (let i = 0; i < 3; i++) {
      await expect(circuitBreaker.execute(operation)).rejects.toThrow();
    }
    
    expect(circuitBreaker.getState()).toBe('open');
    
    // Manual reset
    circuitBreaker.reset();
    
    expect(circuitBreaker.getState()).toBe('closed');
    expect(circuitBreaker.canProceed()).toBe(true);
  });

  it('should allow manual opening', () => {
    expect(circuitBreaker.getState()).toBe('closed');
    
    circuitBreaker.open();
    
    expect(circuitBreaker.getState()).toBe('open');
    expect(circuitBreaker.canProceed()).toBe(false);
  });
});

describe('CircuitBreakerRegistry', () => {
  let registry: CircuitBreakerRegistry;

  beforeEach(() => {
    registry = new CircuitBreakerRegistry();
  });

  it('should create and manage circuit breakers', () => {
    const config: CircuitBreakerConfig = {
      failureThreshold: 5,
      resetTimeout: 2000,
      monitoringPeriod: 10000
    };
    
    const breaker1 = registry.getOrCreate('breaker1', config);
    const breaker2 = registry.getOrCreate('breaker1', config); // Same name
    
    expect(breaker1).toBe(breaker2); // Should return same instance
    expect(breaker1.getName()).toBe('breaker1');
  });

  it('should get existing circuit breakers', () => {
    const config: CircuitBreakerConfig = {
      failureThreshold: 3,
      resetTimeout: 1000,
      monitoringPeriod: 5000
    };
    
    const breaker = registry.getOrCreate('test-breaker', config);
    const retrieved = registry.get('test-breaker');
    
    expect(retrieved).toBe(breaker);
  });

  it('should return undefined for non-existent circuit breakers', () => {
    expect(registry.get('non-existent')).toBeUndefined();
  });

  it('should remove circuit breakers', () => {
    const config: CircuitBreakerConfig = {
      failureThreshold: 3,
      resetTimeout: 1000,
      monitoringPeriod: 5000
    };
    
    registry.getOrCreate('removable', config);
    
    expect(registry.get('removable')).toBeDefined();
    expect(registry.remove('removable')).toBe(true);
    expect(registry.get('removable')).toBeUndefined();
    expect(registry.remove('removable')).toBe(false); // Already removed
  });

  it('should list all circuit breaker names', () => {
    const config: CircuitBreakerConfig = {
      failureThreshold: 3,
      resetTimeout: 1000,
      monitoringPeriod: 5000
    };
    
    registry.getOrCreate('breaker1', config);
    registry.getOrCreate('breaker2', config);
    
    const names = registry.getNames();
    expect(names).toContain('breaker1');
    expect(names).toContain('breaker2');
    expect(names).toHaveLength(2);
  });

  it('should provide statistics for all circuit breakers', async () => {
    const config: CircuitBreakerConfig = {
      failureThreshold: 3,
      resetTimeout: 1000,
      monitoringPeriod: 5000
    };
    
    const breaker1 = registry.getOrCreate('breaker1', config);
    const breaker2 = registry.getOrCreate('breaker2', config);
    
    // Execute some operations
    await breaker1.execute(() => Promise.resolve('success'));
    await expect(breaker2.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    
    const allStats = registry.getAllStats();
    
    expect(allStats).toHaveProperty('breaker1');
    expect(allStats).toHaveProperty('breaker2');
    expect(allStats.breaker1.successCount).toBe(1);
    expect(allStats.breaker2.failureCount).toBe(1);
  });

  it('should reset all circuit breakers', async () => {
    const config: CircuitBreakerConfig = {
      failureThreshold: 2,
      resetTimeout: 1000,
      monitoringPeriod: 5000
    };
    
    const breaker1 = registry.getOrCreate('breaker1', config);
    const breaker2 = registry.getOrCreate('breaker2', config);
    
    // Open both breakers
    for (let i = 0; i < 2; i++) {
      await expect(breaker1.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      await expect(breaker2.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    }
    
    expect(breaker1.getState()).toBe('open');
    expect(breaker2.getState()).toBe('open');
    
    registry.resetAll();
    
    expect(breaker1.getState()).toBe('closed');
    expect(breaker2.getState()).toBe('closed');
  });

  it('should clear all circuit breakers', () => {
    const config: CircuitBreakerConfig = {
      failureThreshold: 3,
      resetTimeout: 1000,
      monitoringPeriod: 5000
    };
    
    registry.getOrCreate('breaker1', config);
    registry.getOrCreate('breaker2', config);
    
    expect(registry.getNames()).toHaveLength(2);
    
    registry.clear();
    
    expect(registry.getNames()).toHaveLength(0);
  });
});

describe('createCircuitBreaker utility', () => {
  it('should create circuit breaker with default config', () => {
    const breaker = createCircuitBreaker('test');
    
    expect(breaker.getName()).toBe('test');
    expect(breaker.getState()).toBe('closed');
  });

  it('should create circuit breaker with custom config', () => {
    const breaker = createCircuitBreaker('test', {
      failureThreshold: 10,
      resetTimeout: 5000
    });
    
    expect(breaker.getName()).toBe('test');
    expect(breaker.getState()).toBe('closed');
  });
});

describe('withCircuitBreaker decorator', () => {
  it('should protect method with circuit breaker', async () => {
    class TestService {
      async riskyOperation(shouldFail: boolean): Promise<string> {
        if (shouldFail) {
          throw new Error('Operation failed');
        }
        return 'success';
      }
    }
    
    // Apply decorator manually for testing
    const originalMethod = TestService.prototype.riskyOperation;
    const circuitBreaker = createCircuitBreaker('test-method', { failureThreshold: 2 });
    
    TestService.prototype.riskyOperation = async function(shouldFail: boolean): Promise<string> {
      return circuitBreaker.execute(() => originalMethod.call(this, shouldFail));
    };
    
    const service = new TestService();
    
    // Successful operation
    const result = await service.riskyOperation(false);
    expect(result).toBe('success');
    
    // Fail twice to open circuit
    await expect(service.riskyOperation(true)).rejects.toThrow('Operation failed');
    await expect(service.riskyOperation(true)).rejects.toThrow('Operation failed');
    
    // Circuit should be open now
    await expect(service.riskyOperation(false)).rejects.toThrow('Circuit breaker test-method is open');
  });
});

describe('Performance Tests', () => {
  it('should handle high throughput operations', async () => {
    const breaker = createCircuitBreaker('perf-test');
    const operationCount = 1000;
    
    const startTime = Date.now();
    
    const promises = Array.from({ length: operationCount }, () =>
      breaker.execute(() => Promise.resolve('success'))
    );
    
    await Promise.all(promises);
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    const throughput = operationCount / (duration / 1000);
    
    expect(throughput).toBeGreaterThan(100); // At least 100 operations per second
    
    const stats = breaker.getStats();
    expect(stats.successCount).toBe(operationCount);
    expect(stats.failureCount).toBe(0);
  });

  it('should efficiently handle rapid state transitions', async () => {
    const breaker = createCircuitBreaker('state-test', { failureThreshold: 1 });
    
    const startTime = Date.now();
    
    // Rapidly open and close circuit
    for (let i = 0; i < 100; i++) {
      // Fail to open
      await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      
      // Reset to close
      breaker.reset();
      
      // Succeed
      await breaker.execute(() => Promise.resolve('success'));
    }
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    expect(duration).toBeLessThan(1000); // Should complete quickly
  });
});