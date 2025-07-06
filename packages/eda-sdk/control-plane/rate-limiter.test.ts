/**
 * Rate Limiter Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MultiKeyRateLimiter, RateLimiter, createMultiKeyRateLimiter, createRateLimiter } from "./rate-limiter";
import type { RateLimitConfig } from "./types";

describe("RateLimiter", () => {
  let rateLimiter: RateLimiter;
  let config: RateLimitConfig;

  beforeEach(() => {
    config = {
      maxRequests: 5,
      windowMs: 1000
    };
    rateLimiter = new RateLimiter(config);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Constructor", () => {
    it("should initialize with max tokens", () => {
      expect(rateLimiter.getTokens()).toBe(config.maxRequests);
    });

    it("should calculate refill rate correctly", () => {
      const stats = rateLimiter.getStats();
      expect(stats.refillRate).toBe(config.maxRequests / config.windowMs);
    });
  });

  describe("tryConsume", () => {
    it("should consume tokens successfully", () => {
      expect(rateLimiter.tryConsume("test")).toBe(true);
      expect(rateLimiter.getTokens()).toBe(4);
    });

    it("should consume multiple tokens", () => {
      expect(rateLimiter.tryConsume("test", 3)).toBe(true);
      expect(rateLimiter.getTokens()).toBe(2);
    });

    it("should reject when insufficient tokens", () => {
      // Consume all tokens
      rateLimiter.tryConsume("test", 5);
      expect(rateLimiter.tryConsume("test")).toBe(false);
      expect(rateLimiter.getTokens()).toBe(0);
    });

    it("should reject when requesting more tokens than available", () => {
      expect(rateLimiter.tryConsume("test", 6)).toBe(false);
      expect(rateLimiter.getTokens()).toBe(5); // Should remain unchanged
    });
  });

  describe("getTokens", () => {
    it("should return current token count", () => {
      expect(rateLimiter.getTokens()).toBe(5);
      rateLimiter.tryConsume("test", 2);
      expect(rateLimiter.getTokens()).toBe(3);
    });

    it("should refill tokens over time", () => {
      rateLimiter.tryConsume("test", 5); // Consume all tokens
      expect(rateLimiter.getTokens()).toBe(0);

      vi.advanceTimersByTime(500); // Half the window
      expect(rateLimiter.getTokens()).toBe(2.5); // Half the tokens refilled

      vi.advanceTimersByTime(500); // Complete window
      expect(rateLimiter.getTokens()).toBe(5); // All tokens refilled
    });

    it("should not exceed max tokens", () => {
      vi.advanceTimersByTime(2000); // Double the window
      expect(rateLimiter.getTokens()).toBe(5); // Should not exceed max
    });
  });

  describe("getTimeUntilNextToken", () => {
    it("should return 0 when tokens are available", () => {
      expect(rateLimiter.getTimeUntilNextToken()).toBe(0);
    });

    it("should calculate time until next token when empty", () => {
      rateLimiter.tryConsume("test", 5); // Consume all tokens
      const timeUntilNext = rateLimiter.getTimeUntilNextToken();
      expect(timeUntilNext).toBeGreaterThan(0);
      expect(timeUntilNext).toBeLessThanOrEqual(1000 / 5); // Time for one token
    });
  });

  describe("reset", () => {
    it("should reset to max tokens", () => {
      rateLimiter.tryConsume("test", 3);
      expect(rateLimiter.getTokens()).toBe(2);

      rateLimiter.reset();
      expect(rateLimiter.getTokens()).toBe(5);
    });
  });

  describe("getStats", () => {
    it("should return comprehensive statistics", () => {
      rateLimiter.tryConsume("test", 2);
      const stats = rateLimiter.getStats();

      expect(stats).toMatchObject({
        tokens: 3,
        maxTokens: 5,
        refillRate: 5 / 1000,
        timeUntilNextToken: 0
      });
    });

    it("should show time until next token when empty", () => {
      rateLimiter.tryConsume("test", 5);
      const stats = rateLimiter.getStats();

      expect(stats.tokens).toBe(0);
      expect(stats.timeUntilNextToken).toBeGreaterThan(0);
    });
  });

  describe("Token Refill", () => {
    it("should refill tokens gradually", () => {
      rateLimiter.tryConsume("test", 5); // Consume all

      vi.advanceTimersByTime(200); // 1/5 of window
      expect(rateLimiter.getTokens()).toBe(1);

      vi.advanceTimersByTime(200); // 2/5 of window
      expect(rateLimiter.getTokens()).toBe(2);
    });

    it("should handle fractional tokens", () => {
      rateLimiter.tryConsume("test", 5);

      vi.advanceTimersByTime(100); // 1/10 of window
      expect(rateLimiter.getTokens()).toBe(0.5);
    });

    it("should not refill when no time has passed", () => {
      rateLimiter.tryConsume("test", 2);
      const tokensBefore = rateLimiter.getTokens();

      // Call getTokens again immediately
      const tokensAfter = rateLimiter.getTokens();
      expect(tokensAfter).toBe(tokensBefore);
    });
  });
});

describe("MultiKeyRateLimiter", () => {
  let multiLimiter: MultiKeyRateLimiter;
  let config: RateLimitConfig;

  beforeEach(() => {
    config = {
      maxRequests: 3,
      windowMs: 1000
    };
    multiLimiter = new MultiKeyRateLimiter(config);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("tryConsume", () => {
    it("should create separate limiters for different keys", () => {
      expect(multiLimiter.tryConsume("user1")).toBe(true);
      expect(multiLimiter.tryConsume("user2")).toBe(true);

      // Each key should have its own token bucket
      expect(multiLimiter.getLimiter("user1")?.getTokens()).toBe(2);
      expect(multiLimiter.getLimiter("user2")?.getTokens()).toBe(2);
    });

    it("should enforce limits per key", () => {
      // Consume all tokens for user1
      multiLimiter.tryConsume("user1", 3);
      expect(multiLimiter.tryConsume("user1")).toBe(false);

      // user2 should still have tokens
      expect(multiLimiter.tryConsume("user2")).toBe(true);
    });
  });

  describe("getLimiter", () => {
    it("should return undefined for non-existent key", () => {
      expect(multiLimiter.getLimiter("nonexistent")).toBeUndefined();
    });

    it("should return limiter after first use", () => {
      multiLimiter.tryConsume("user1");
      const limiter = multiLimiter.getLimiter("user1");
      expect(limiter).toBeInstanceOf(RateLimiter);
    });
  });

  describe("getOrCreateLimiter", () => {
    it("should create new limiter for new key", () => {
      const limiter = multiLimiter.getOrCreateLimiter("newkey");
      expect(limiter).toBeInstanceOf(RateLimiter);
      expect(limiter.getTokens()).toBe(3);
    });

    it("should return existing limiter for existing key", () => {
      const limiter1 = multiLimiter.getOrCreateLimiter("key1");
      limiter1.tryConsume("key1", 1);

      const limiter2 = multiLimiter.getOrCreateLimiter("key1");
      expect(limiter1).toBe(limiter2);
      expect(limiter2.getTokens()).toBe(2);
    });
  });

  describe("reset", () => {
    it("should reset specific key", () => {
      multiLimiter.tryConsume("user1", 2);
      multiLimiter.tryConsume("user2", 1);

      multiLimiter.reset("user1");

      expect(multiLimiter.getLimiter("user1")?.getTokens()).toBe(3);
      expect(multiLimiter.getLimiter("user2")?.getTokens()).toBe(2);
    });

    it("should handle reset of non-existent key", () => {
      expect(() => multiLimiter.reset("nonexistent")).not.toThrow();
    });
  });

  describe("resetAll", () => {
    it("should reset all limiters", () => {
      multiLimiter.tryConsume("user1", 2);
      multiLimiter.tryConsume("user2", 1);

      multiLimiter.resetAll();

      expect(multiLimiter.getLimiter("user1")?.getTokens()).toBe(3);
      expect(multiLimiter.getLimiter("user2")?.getTokens()).toBe(3);
    });
  });

  describe("remove", () => {
    it("should remove specific limiter", () => {
      multiLimiter.tryConsume("user1");
      expect(multiLimiter.getLimiter("user1")).toBeDefined();

      const removed = multiLimiter.remove("user1");
      expect(removed).toBe(true);
      expect(multiLimiter.getLimiter("user1")).toBeUndefined();
    });

    it("should return false for non-existent key", () => {
      const removed = multiLimiter.remove("nonexistent");
      expect(removed).toBe(false);
    });
  });

  describe("clear", () => {
    it("should remove all limiters", () => {
      multiLimiter.tryConsume("user1");
      multiLimiter.tryConsume("user2");

      multiLimiter.clear();

      expect(multiLimiter.getLimiter("user1")).toBeUndefined();
      expect(multiLimiter.getLimiter("user2")).toBeUndefined();
      expect(multiLimiter.getKeys()).toHaveLength(0);
    });
  });

  describe("getAllStats", () => {
    it("should return stats for all limiters", () => {
      multiLimiter.tryConsume("user1", 1);
      multiLimiter.tryConsume("user2", 2);

      const stats = multiLimiter.getAllStats();

      expect(stats).toHaveProperty("user1");
      expect(stats).toHaveProperty("user2");
      expect(stats.user1.tokens).toBe(2);
      expect(stats.user2.tokens).toBe(1);
    });

    it("should return empty object when no limiters", () => {
      const stats = multiLimiter.getAllStats();
      expect(stats).toEqual({});
    });
  });

  describe("getKeys", () => {
    it("should return all active keys", () => {
      multiLimiter.tryConsume("user1");
      multiLimiter.tryConsume("user2");

      const keys = multiLimiter.getKeys();
      expect(keys).toContain("user1");
      expect(keys).toContain("user2");
      expect(keys).toHaveLength(2);
    });

    it("should return empty array when no limiters", () => {
      const keys = multiLimiter.getKeys();
      expect(keys).toEqual([]);
    });
  });

  describe("cleanup", () => {
    it("should remove limiters with full tokens", () => {
      // Create limiters
      multiLimiter.tryConsume("user1", 1); // Partially used
      multiLimiter.tryConsume("user2", 0); // Unused (full tokens)

      multiLimiter.cleanup();

      expect(multiLimiter.getLimiter("user1")).toBeDefined();
      expect(multiLimiter.getLimiter("user2")).toBeUndefined();
    });

    it("should not remove limiters with consumed tokens", () => {
      multiLimiter.tryConsume("user1", 1);

      multiLimiter.cleanup();

      expect(multiLimiter.getLimiter("user1")).toBeDefined();
    });
  });
});

describe("Utility Functions", () => {
  describe("createRateLimiter", () => {
    it("should create rate limiter with config", () => {
      const config: RateLimitConfig = {
        maxRequests: 10,
        windowMs: 5000
      };

      const limiter = createRateLimiter(config);
      expect(limiter).toBeInstanceOf(RateLimiter);
      expect(limiter.getTokens()).toBe(10);
    });
  });

  describe("createMultiKeyRateLimiter", () => {
    it("should create multi-key rate limiter with config", () => {
      const config: RateLimitConfig = {
        maxRequests: 5,
        windowMs: 2000
      };

      const limiter = createMultiKeyRateLimiter(config);
      expect(limiter).toBeInstanceOf(MultiKeyRateLimiter);

      limiter.tryConsume("test");
      expect(limiter.getLimiter("test")?.getTokens()).toBe(4);
    });
  });
});

describe("Edge Cases", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should handle zero window time", () => {
    const config: RateLimitConfig = {
      maxRequests: 5,
      windowMs: 0
    };

    const limiter = new RateLimiter(config);
    // Should handle division by zero gracefully
    expect(limiter.getTokens()).toBe(5);
  });

  it("should handle very small window time", () => {
    const config: RateLimitConfig = {
      maxRequests: 1,
      windowMs: 1
    };

    const limiter = new RateLimiter(config);
    limiter.tryConsume("test");

    vi.advanceTimersByTime(1);
    expect(limiter.getTokens()).toBe(1);
  });

  it("should handle very large refill rates", () => {
    const config: RateLimitConfig = {
      maxRequests: 1000000,
      windowMs: 1
    };

    const limiter = new RateLimiter(config);
    limiter.tryConsume("test", 1000000);

    vi.advanceTimersByTime(1);
    expect(limiter.getTokens()).toBe(1000000);
  });
});
