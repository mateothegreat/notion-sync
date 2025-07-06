/**
 * Circuit Breaker Tests
 */

import { firstValueFrom, of, throwError } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CircuitBreaker, CircuitBreakerError, CircuitBreakerState, createCircuitBreaker } from "./circuit-breaker";
import type { CircuitBreakerConfig } from "./types";

describe("CircuitBreaker", () => {
  let circuitBreaker: CircuitBreaker;
  let config: CircuitBreakerConfig;

  beforeEach(() => {
    config = {
      failureThreshold: 3,
      resetTimeout: 1000,
      halfOpenRequests: 1,
      expectedErrors: ["ValidationError", "TimeoutError"]
    };
    circuitBreaker = new CircuitBreaker(config);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Constructor", () => {
    it("should initialize with closed state", () => {
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it("should initialize with zero counts", () => {
      const stats = circuitBreaker.getStats();
      expect(stats.failureCount).toBe(0);
      expect(stats.successCount).toBe(0);
      expect(stats.totalRequests).toBe(0);
      expect(stats.failureRate).toBe(0);
    });
  });

  describe("execute", () => {
    it("should execute successful operations", async () => {
      const operation = () => of("success");

      const result = await firstValueFrom(circuitBreaker.execute(operation));
      expect(result).toBe("success");
      const stats = circuitBreaker.getStats();
      expect(stats.successCount).toBe(1);
      expect(stats.totalRequests).toBe(1);
    });

    it("should handle failed operations", async () => {
      const operation = () => throwError(() => new Error("Operation failed"));

      try {
        await firstValueFrom(circuitBreaker.execute(operation));
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.message).toBe("Operation failed");
        const stats = circuitBreaker.getStats();
        expect(stats.failureCount).toBe(1);
        expect(stats.totalRequests).toBe(1);
      }
    });

    it("should reject when circuit is open", async () => {
      // Force circuit to open
      circuitBreaker.open();

      const operation = () => of("success");

      try {
        await firstValueFrom(circuitBreaker.execute(operation));
        expect.fail("Should have thrown CircuitBreakerError");
      } catch (error: any) {
        expect(error).toBeInstanceOf(CircuitBreakerError);
        expect(error.message).toContain("Circuit breaker is OPEN");
        expect(error.circuitBreakerName).toBe("circuit-breaker");
        expect(error.state).toBe(CircuitBreakerState.OPEN);
      }
    });

    it("should track multiple requests", async () => {
      const operation = () => of("success");

      await Promise.all([
        firstValueFrom(circuitBreaker.execute(operation)),
        firstValueFrom(circuitBreaker.execute(operation)),
        firstValueFrom(circuitBreaker.execute(operation))
      ]);

      const stats = circuitBreaker.getStats();
      expect(stats.successCount).toBe(3);
      expect(stats.totalRequests).toBe(3);
    });
  });

  describe("canProceed", () => {
    it("should allow requests when closed", () => {
      expect(circuitBreaker.canProceed()).toBe(true);
    });

    it("should block requests when open", () => {
      circuitBreaker.open();
      expect(circuitBreaker.canProceed()).toBe(false);
    });

    it("should allow requests when half-open", () => {
      // Force to half-open state
      circuitBreaker.open();
      vi.advanceTimersByTime(1001); // Past reset timeout
      expect(circuitBreaker.canProceed()).toBe(true);
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.HALF_OPEN);
    });
  });

  describe("reportSuccess", () => {
    it("should increment success count", () => {
      circuitBreaker.reportSuccess();
      const stats = circuitBreaker.getStats();
      expect(stats.successCount).toBe(1);
    });

    it("should reset failure count in closed state", () => {
      circuitBreaker.reportFailure();
      expect(circuitBreaker.getStats().failureCount).toBe(1);

      circuitBreaker.reportSuccess();
      expect(circuitBreaker.getStats().failureCount).toBe(0);
    });

    it("should close circuit when in half-open state", () => {
      circuitBreaker.open();
      vi.advanceTimersByTime(1001);
      circuitBreaker.canProceed(); // Transition to half-open

      circuitBreaker.reportSuccess();
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });
  });

  describe("reportFailure", () => {
    it("should increment failure count", () => {
      circuitBreaker.reportFailure();
      const stats = circuitBreaker.getStats();
      expect(stats.failureCount).toBe(1);
    });

    it("should open circuit when threshold reached", () => {
      for (let i = 0; i < config.failureThreshold; i++) {
        circuitBreaker.reportFailure();
      }
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
    });

    it("should not count expected errors", () => {
      const expectedError = new Error("ValidationError");
      circuitBreaker.reportFailure(expectedError);

      const stats = circuitBreaker.getStats();
      expect(stats.failureCount).toBe(0);
    });

    it("should handle errors with code property", () => {
      const errorWithCode = new Error("Timeout") as any;
      errorWithCode.code = "TimeoutError";

      circuitBreaker.reportFailure(errorWithCode);
      expect(circuitBreaker.getStats().failureCount).toBe(0);
    });

    it("should open from half-open on failure", () => {
      circuitBreaker.open();
      vi.advanceTimersByTime(1001);
      circuitBreaker.canProceed(); // Transition to half-open

      circuitBreaker.reportFailure();
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
    });
  });

  describe("getStats", () => {
    it("should return comprehensive statistics", () => {
      circuitBreaker.reportSuccess();
      circuitBreaker.reportFailure();

      const stats = circuitBreaker.getStats();
      expect(stats).toMatchObject({
        state: CircuitBreakerState.CLOSED,
        successCount: 1,
        failureCount: 1,
        totalRequests: 0, // Not incremented by direct reports
        failureRate: 0
      });
      expect(stats.lastSuccessTime).toBeTypeOf("number");
      expect(stats.lastFailureTime).toBeTypeOf("number");
    });

    it("should calculate failure rate correctly", async () => {
      const successOp = () => of("success");
      const failOp = () => throwError(() => new Error("fail"));

      await firstValueFrom(circuitBreaker.execute(successOp));

      try {
        await firstValueFrom(circuitBreaker.execute(failOp));
      } catch {}

      try {
        await firstValueFrom(circuitBreaker.execute(failOp));
      } catch {}

      const stats = circuitBreaker.getStats();
      expect(stats.totalRequests).toBe(3);
      expect(stats.successCount).toBe(1);
      expect(stats.failureCount).toBe(2);
      expect(stats.failureRate).toBe(2 / 3);
    });
  });

  describe("onStateChange", () => {
    it("should emit state changes", () => {
      const states: CircuitBreakerState[] = [];

      const subscription = circuitBreaker.onStateChange().subscribe((state) => {
        states.push(state);
      });

      circuitBreaker.open();
      circuitBreaker.reset();

      subscription.unsubscribe();

      expect(states).toEqual([CircuitBreakerState.OPEN, CircuitBreakerState.CLOSED]);
    });
  });

  describe("reset", () => {
    it("should reset to closed state", () => {
      circuitBreaker.open();
      circuitBreaker.reportFailure();
      circuitBreaker.reportSuccess();

      circuitBreaker.reset();

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
      const stats = circuitBreaker.getStats();
      expect(stats.failureCount).toBe(0);
      expect(stats.successCount).toBe(0);
    });
  });

  describe("open", () => {
    it("should manually open the circuit", () => {
      circuitBreaker.open();
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
    });

    it("should schedule retry timeout", () => {
      circuitBreaker.open();
      const stats = circuitBreaker.getStats();
      expect(stats.nextRetryTime).toBeTypeOf("number");
      expect(stats.nextRetryTime).toBeGreaterThan(Date.now());
    });
  });

  describe("State Transitions", () => {
    it("should transition from OPEN to HALF_OPEN after timeout", () => {
      circuitBreaker.open();
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);

      vi.advanceTimersByTime(1001);
      circuitBreaker.canProceed();
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.HALF_OPEN);
    });

    it("should transition from HALF_OPEN to CLOSED on success", () => {
      circuitBreaker.open();
      vi.advanceTimersByTime(1001);
      circuitBreaker.canProceed(); // To half-open

      circuitBreaker.reportSuccess();
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it("should transition from HALF_OPEN to OPEN on failure", () => {
      circuitBreaker.open();
      vi.advanceTimersByTime(1001);
      circuitBreaker.canProceed(); // To half-open

      circuitBreaker.reportFailure();
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
    });
  });

  describe("Expected Errors", () => {
    it("should handle error names", () => {
      const error = new Error("Something went wrong");
      error.name = "ValidationError";

      circuitBreaker.reportFailure(error);
      expect(circuitBreaker.getStats().failureCount).toBe(0);
    });

    it("should handle error messages", () => {
      const error = new Error("TimeoutError occurred");

      circuitBreaker.reportFailure(error);
      expect(circuitBreaker.getStats().failureCount).toBe(0);
    });

    it("should handle undefined expected errors", () => {
      const configWithoutExpected: CircuitBreakerConfig = {
        failureThreshold: 3,
        resetTimeout: 1000,
        halfOpenRequests: 1
      };
      const cb = new CircuitBreaker(configWithoutExpected);

      cb.reportFailure(new Error("Any error"));
      expect(cb.getStats().failureCount).toBe(1);
    });
  });
});

describe("createCircuitBreaker", () => {
  it("should create circuit breaker with default config", () => {
    const cb = createCircuitBreaker();
    const stats = cb.getStats();

    expect(cb.getState()).toBe(CircuitBreakerState.CLOSED);
    expect(stats.failureCount).toBe(0);
  });

  it("should create circuit breaker with custom config", () => {
    const cb = createCircuitBreaker({
      failureThreshold: 10,
      resetTimeout: 5000
    });

    // Test that custom config is applied
    for (let i = 0; i < 10; i++) {
      cb.reportFailure();
    }
    expect(cb.getState()).toBe(CircuitBreakerState.OPEN);
  });

  it("should merge with default config", () => {
    const cb = createCircuitBreaker({
      failureThreshold: 2
    });

    // Should use custom threshold but default timeout
    cb.reportFailure();
    cb.reportFailure();
    expect(cb.getState()).toBe(CircuitBreakerState.OPEN);
  });
});

describe("CircuitBreakerError", () => {
  it("should create error with correct properties", () => {
    const error = new CircuitBreakerError("Circuit is open", "test-breaker", CircuitBreakerState.OPEN);

    expect(error.message).toBe("Circuit is open");
    expect(error.circuitBreakerName).toBe("test-breaker");
    expect(error.state).toBe(CircuitBreakerState.OPEN);
    expect(error.name).toBe("CircuitBreakerError");
    expect(error).toBeInstanceOf(Error);
  });
});
