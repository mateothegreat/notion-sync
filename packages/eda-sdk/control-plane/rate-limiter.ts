/**
 * Rate Limiter Implementation for EDA SDK
 *
 * Provides rate limiting functionality using token bucket algorithm
 */

import type { RateLimitConfig } from "./types";

/**
 * Token bucket rate limiter
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private maxTokens: number;
  private refillRate: number; // tokens per millisecond

  constructor(private config: RateLimitConfig) {
    this.maxTokens = config.maxRequests;
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
    // Calculate refill rate: maxRequests tokens per windowMs milliseconds
    this.refillRate = config.maxRequests / config.windowMs;
  }

  /**
   * Try to consume a token for the given key
   */
  tryConsume(key: string, tokens: number = 1): boolean {
    this.refillTokens();

    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }

    return false;
  }

  /**
   * Get current token count
   */
  getTokens(): number {
    this.refillTokens();
    return this.tokens;
  }

  /**
   * Get time until next token is available (in milliseconds)
   */
  getTimeUntilNextToken(): number {
    this.refillTokens();

    if (this.tokens > 0) {
      return 0;
    }

    // Calculate time to refill one token
    return Math.ceil(1 / this.refillRate);
  }

  /**
   * Reset the rate limiter
   */
  reset(): void {
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
  }

  /**
   * Get rate limiter statistics
   */
  getStats(): {
    tokens: number;
    maxTokens: number;
    refillRate: number;
    timeUntilNextToken: number;
  } {
    return {
      tokens: this.getTokens(),
      maxTokens: this.maxTokens,
      refillRate: this.refillRate,
      timeUntilNextToken: this.getTimeUntilNextToken()
    };
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refillTokens(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;

    if (elapsed > 0) {
      const tokensToAdd = elapsed * this.refillRate;
      this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }
  }
}

/**
 * Multi-key rate limiter that manages separate rate limiters for different keys
 */
export class MultiKeyRateLimiter {
  private limiters = new Map<string, RateLimiter>();

  constructor(private config: RateLimitConfig) {}

  /**
   * Try to consume a token for the given key
   */
  tryConsume(key: string, tokens: number = 1): boolean {
    const limiter = this.getOrCreateLimiter(key);
    return limiter.tryConsume(key, tokens);
  }

  /**
   * Get rate limiter for a specific key
   */
  getLimiter(key: string): RateLimiter | undefined {
    return this.limiters.get(key);
  }

  /**
   * Get or create rate limiter for a key
   */
  getOrCreateLimiter(key: string): RateLimiter {
    if (!this.limiters.has(key)) {
      this.limiters.set(key, new RateLimiter(this.config));
    }
    return this.limiters.get(key)!;
  }

  /**
   * Reset rate limiter for a specific key
   */
  reset(key: string): void {
    const limiter = this.limiters.get(key);
    if (limiter) {
      limiter.reset();
    }
  }

  /**
   * Reset all rate limiters
   */
  resetAll(): void {
    for (const limiter of this.limiters.values()) {
      limiter.reset();
    }
  }

  /**
   * Remove rate limiter for a key
   */
  remove(key: string): boolean {
    return this.limiters.delete(key);
  }

  /**
   * Clear all rate limiters
   */
  clear(): void {
    this.limiters.clear();
  }

  /**
   * Get statistics for all rate limiters
   */
  getAllStats(): Record<string, ReturnType<RateLimiter["getStats"]>> {
    const stats: Record<string, ReturnType<RateLimiter["getStats"]>> = {};
    for (const [key, limiter] of this.limiters) {
      stats[key] = limiter.getStats();
    }
    return stats;
  }

  /**
   * Get all active keys
   */
  getKeys(): string[] {
    return Array.from(this.limiters.keys());
  }

  /**
   * Clean up rate limiters that haven't been used recently
   */
  cleanup(maxAge: number = 300000): void {
    // 5 minutes default
    const now = Date.now();

    for (const [key, limiter] of this.limiters) {
      const stats = limiter.getStats();
      // If rate limiter has full tokens and hasn't been used, remove it
      if (stats.tokens === stats.maxTokens) {
        this.limiters.delete(key);
      }
    }
  }
}

/**
 * Utility function to create a rate limiter
 */
export function createRateLimiter(options: RateLimitConfig): RateLimiter {
  return new RateLimiter(options);
}

/**
 * Utility function to create a multi-key rate limiter
 */
export function createMultiKeyRateLimiter(options: RateLimitConfig): MultiKeyRateLimiter {
  return new MultiKeyRateLimiter(options);
}
