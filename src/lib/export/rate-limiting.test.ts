import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdaptiveRateLimiter } from "./rate-limiting";

describe("AdaptiveRateLimiter", () => {
  let rateLimiter: AdaptiveRateLimiter;
  let mockDateNow: vi.SpyInstance;
  let currentTime: number;

  beforeEach(() => {
    currentTime = 1000000000; // Fixed starting time
    mockDateNow = vi.spyOn(Date, "now").mockImplementation(() => currentTime);
    rateLimiter = new AdaptiveRateLimiter({
      initialConcurrency: 10,
      maxConcurrency: 50,
      minConcurrency: 2,
      increaseThreshold: 0.2,
      decreaseThreshold: 0.3,
      adjustmentCooldown: 5000,
      sampleSize: 20,
      errorThreshold: 0.1,
      successThreshold: 0.9
    });
  });

  afterEach(() => {
    mockDateNow.mockRestore();
  });

  describe("initialization", () => {
    it("should initialize with correct default values", () => {
      const defaultLimiter = new AdaptiveRateLimiter();
      const stats = defaultLimiter.getStats();

      expect(stats.recommendedConcurrency).toBe(20); // Default initial
      expect(stats.currentConcurrency).toBe(20);
      expect(stats.concurrencyAdjustments).toBe(0);
    });

    it("should initialize with custom configuration", () => {
      const stats = rateLimiter.getStats();

      expect(stats.recommendedConcurrency).toBe(10);
      expect(stats.currentConcurrency).toBe(10);
      expect(stats.backoffMultiplier).toBe(1);
    });
  });

  describe("waitForSlot", () => {
    it("should allow requests when under limit", async () => {
      const startTime = Date.now();
      await rateLimiter.waitForSlot();
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(50); // Should be almost immediate
    });

    it("should apply backoff when errors occur", async () => {
      // Simulate multiple errors
      rateLimiter.reportError("test_error", "high");
      rateLimiter.reportError("test_error", "high");

      const stats = rateLimiter.getStats();
      expect(stats.backoffMultiplier).toBeGreaterThan(1);
    });

    it("should respect retry-after header", async () => {
      const retryAfterTime = currentTime + 2000;

      rateLimiter.updateFromHeaders({
        "retry-after": "2"
      });

      currentTime += 1000; // Advance 1 second

      const waitPromise = rateLimiter.waitForSlot();

      // Should still be waiting
      const isWaiting = await Promise.race([
        waitPromise.then(() => false),
        new Promise((resolve) => setTimeout(() => resolve(true), 100))
      ]);

      expect(isWaiting).toBe(true);
    });
  });

  describe("updateFromHeaders", () => {
    it("should update from standard rate limit headers", () => {
      rateLimiter.updateFromHeaders({
        "x-ratelimit-remaining": "45",
        "x-ratelimit-limit": "100",
        "x-ratelimit-reset": String(Math.floor((currentTime + 60000) / 1000))
      });

      const stats = rateLimiter.getStats();
      expect(stats.remainingRequests).toBe(45);
    });

    it("should handle different header name formats", () => {
      rateLimiter.updateFromHeaders({
        "X-RateLimit-Remaining": "30",
        "X-RateLimit-Limit": "60"
      });

      const stats = rateLimiter.getStats();
      expect(stats.remainingRequests).toBe(30);
    });

    it("should update performance metrics", () => {
      const responseTime = 500;

      rateLimiter.updateFromHeaders(
        {
          "x-ratelimit-remaining": "50"
        },
        responseTime,
        false
      );

      const stats = rateLimiter.getStats();
      expect(stats.avgResponseTime).toBe(responseTime);
    });

    it("should handle header parsing errors gracefully", () => {
      // Pass invalid headers
      rateLimiter.updateFromHeaders({
        "x-ratelimit-remaining": "invalid"
      });

      // Should not throw and continue functioning
      const stats = rateLimiter.getStats();
      expect(stats).toBeDefined();
    });
  });

  describe("dynamic concurrency adjustment", () => {
    it("should increase concurrency when performance is good", async () => {
      // Simulate good performance conditions
      for (let i = 0; i < 15; i++) {
        rateLimiter.reportSuccess();
        rateLimiter.updateFromHeaders(
          {
            "x-ratelimit-remaining": "80"
          },
          200,
          false
        );
      }

      // Advance time past cooldown
      currentTime += 10000;

      // Force check by waiting for slot
      await rateLimiter.waitForSlot();

      const stats = rateLimiter.getStats();
      expect(stats.recommendedConcurrency).toBeGreaterThan(10);
    });

    it("should decrease concurrency when error rate is high", async () => {
      // Simulate high error rate
      for (let i = 0; i < 10; i++) {
        rateLimiter.reportError("test_error", "medium");
      }

      // Advance time past cooldown
      currentTime += 10000;

      await rateLimiter.waitForSlot();

      const stats = rateLimiter.getStats();
      expect(stats.recommendedConcurrency).toBeLessThan(10);
    });

    it("should respect concurrency limits", async () => {
      // Force to maximum
      rateLimiter.forceConcurrencyAdjustment(100, "test");

      let stats = rateLimiter.getStats();
      expect(stats.recommendedConcurrency).toBe(50); // Should be capped at max

      // Force to minimum
      rateLimiter.forceConcurrencyAdjustment(1, "test");

      stats = rateLimiter.getStats();
      expect(stats.recommendedConcurrency).toBe(2); // Should be capped at min
    });

    it("should have cooldown period between adjustments", async () => {
      const initialConcurrency = rateLimiter.getRecommendedConcurrency();

      // Trigger adjustment conditions
      for (let i = 0; i < 15; i++) {
        rateLimiter.reportSuccess();
      }

      // First adjustment (after cooldown)
      currentTime += 6000;
      await rateLimiter.waitForSlot();

      const firstAdjustment = rateLimiter.getRecommendedConcurrency();

      // Try immediate second adjustment (should be blocked by cooldown)
      for (let i = 0; i < 15; i++) {
        rateLimiter.reportSuccess();
      }

      currentTime += 1000; // Less than cooldown
      await rateLimiter.waitForSlot();

      const secondAttempt = rateLimiter.getRecommendedConcurrency();
      expect(secondAttempt).toBe(firstAdjustment); // Should be unchanged
    });
  });

  describe("error handling and fault tolerance", () => {
    it("should handle invalid headers gracefully", () => {
      expect(() => {
        rateLimiter.updateFromHeaders({
          "invalid-header": "value"
        });
      }).not.toThrow();
    });

    it("should enter fallback mode after multiple header errors", () => {
      // Simulate multiple header parsing failures
      for (let i = 0; i < 15; i++) {
        try {
          rateLimiter.updateFromHeaders({
            "x-ratelimit-remaining": "not-a-number"
          });
        } catch (error) {
          // Expected to handle gracefully
        }
      }

      const stats = rateLimiter.getStats();
      expect(stats.recommendedConcurrency).toBe(2); // Should fall back to minimum
    });

    it("should handle emergency concurrency reduction", () => {
      rateLimiter.reportError("critical_error", "high");

      const stats = rateLimiter.getStats();
      expect(stats.recommendedConcurrency).toBeLessThan(10);
    });
  });

  describe("statistics and monitoring", () => {
    it("should track comprehensive statistics", () => {
      rateLimiter.reportSuccess();
      rateLimiter.reportError("test_error");
      rateLimiter.updateFromHeaders(
        {
          "x-ratelimit-remaining": "40"
        },
        300,
        false
      );

      const stats = rateLimiter.getStats();

      expect(stats.totalRequests).toBeGreaterThan(0);
      expect(stats.totalErrors).toBeGreaterThan(0);
      expect(stats.avgResponseTime).toBe(300);
      expect(stats.errorRate).toBeGreaterThan(0);
      expect(stats.successRate).toBeLessThan(1);
    });

    it("should calculate error rates correctly", () => {
      // 3 successes, 1 error = 25% error rate
      rateLimiter.reportSuccess();
      rateLimiter.reportSuccess();
      rateLimiter.reportSuccess();
      rateLimiter.reportError("test_error");

      const stats = rateLimiter.getStats();
      expect(stats.errorRate).toBeCloseTo(0.25);
      expect(stats.successRate).toBeCloseTo(0.75);
    });

    it("should track adjustment history", () => {
      const initialAdjustments = rateLimiter.getStats().concurrencyAdjustments;

      rateLimiter.forceConcurrencyAdjustment(15, "test");

      const stats = rateLimiter.getStats();
      expect(stats.concurrencyAdjustments).toBe(initialAdjustments + 1);
      expect(stats.lastAdjustmentTime).toBeInstanceOf(Date);
    });
  });

  describe("reset functionality", () => {
    it("should reset all statistics and state", () => {
      // Generate some activity
      rateLimiter.reportSuccess();
      rateLimiter.reportError("test_error");
      rateLimiter.forceConcurrencyAdjustment(20, "test");

      rateLimiter.reset();

      const stats = rateLimiter.getStats();
      expect(stats.totalRequests).toBe(0);
      expect(stats.totalErrors).toBe(0);
      expect(stats.concurrencyAdjustments).toBe(0);
      expect(stats.recommendedConcurrency).toBe(10); // Back to initial
    });
  });

  describe("performance optimization", () => {
    it("should optimize wait times based on current load", async () => {
      // Simulate high load scenario
      rateLimiter.updateFromHeaders({
        "x-ratelimit-remaining": "5",
        "x-ratelimit-limit": "100"
      });

      const waitTime = rateLimiter.getStats().adaptiveInterval;
      expect(waitTime).toBeGreaterThan(100); // Should have increased interval
    });

    it("should handle burst scenarios appropriately", async () => {
      // Simulate good quota availability
      rateLimiter.updateFromHeaders({
        "x-ratelimit-remaining": "90",
        "x-ratelimit-limit": "100"
      });

      // Multiple rapid requests should be handled efficiently
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(rateLimiter.waitForSlot());
      }

      const startTime = Date.now();
      await Promise.all(promises);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(1000); // Should be relatively fast
    });
  });

  describe("edge cases", () => {
    it("should handle zero remaining requests", () => {
      rateLimiter.updateFromHeaders({
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": String(Math.floor((currentTime + 60000) / 1000))
      });

      const stats = rateLimiter.getStats();
      expect(stats.remainingRequests).toBe(0);
    });

    it("should handle very high response times", () => {
      rateLimiter.updateFromHeaders({}, 10000, false); // 10 second response

      const stats = rateLimiter.getStats();
      expect(stats.avgResponseTime).toBe(10000);
      expect(stats.adaptiveInterval).toBeGreaterThan(100); // Should increase interval
    });

    it("should handle rapid consecutive errors", () => {
      for (let i = 0; i < 10; i++) {
        rateLimiter.reportError("rapid_error", "high");
      }

      const stats = rateLimiter.getStats();
      expect(stats.backoffMultiplier).toBeGreaterThan(10);
      expect(stats.recommendedConcurrency).toBe(2); // Should hit minimum
    });
  });

  describe("integration scenarios", () => {
    it("should adapt to realistic API patterns", async () => {
      // Simulate realistic usage pattern
      const scenarios = [
        { remaining: 95, responseTime: 200, isError: false },
        { remaining: 90, responseTime: 250, isError: false },
        { remaining: 85, responseTime: 180, isError: false },
        { remaining: 80, responseTime: 300, isError: false },
        { remaining: 75, responseTime: 450, isError: true }, // One error
        { remaining: 70, responseTime: 200, isError: false },
        { remaining: 65, responseTime: 220, isError: false }
      ];

      for (const scenario of scenarios) {
        rateLimiter.updateFromHeaders(
          {
            "x-ratelimit-remaining": String(scenario.remaining)
          },
          scenario.responseTime,
          scenario.isError
        );

        if (scenario.isError) {
          rateLimiter.reportError("api_error");
        } else {
          rateLimiter.reportSuccess();
        }

        await rateLimiter.waitForSlot();
        currentTime += 1000; // Advance time
      }

      const stats = rateLimiter.getStats();
      expect(stats.errorRate).toBeCloseTo(1 / 7); // One error out of 7 requests
      expect(stats.avgResponseTime).toBeGreaterThan(200);
    });

    it("should handle mixed severity errors appropriately", () => {
      rateLimiter.reportError("low_error", "low");
      rateLimiter.reportError("medium_error", "medium");
      rateLimiter.reportError("high_error", "high");

      const stats = rateLimiter.getStats();
      expect(stats.backoffMultiplier).toBeGreaterThan(2); // Should have significant backoff
    });
  });
});
