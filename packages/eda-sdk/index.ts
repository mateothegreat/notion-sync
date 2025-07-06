/**
 * EDA SDK - Event-Driven Architecture SDK
 *
 * A comprehensive SDK for building event-driven applications with:
 * - Broker Bus for message routing
 * - Circuit Breaker for fault tolerance
 * - Rate Limiting for traffic control
 * - Pluggable adapters for different backends
 */

// Core exports - explicit to avoid conflicts

// Re-export commonly used types
export type {
  BrokerAdapter,
  BrokerBus,
  BrokerBusChannel,
  BrokerConfig,
  CircuitBreakerConfig,
  Message,
  Middleware,
  Plugin,
  RateLimitConfig,
  RetryConfig
} from "./control-plane/types";

// Re-export main classes
export { DefaultBrokerBus } from "./control-plane/broker-bus";

export {
  CircuitBreaker,
  CircuitBreakerError,
  CircuitBreakerState,
  createCircuitBreaker
} from "./control-plane/circuit-breaker";

export {
  createMultiKeyRateLimiter,
  createRateLimiter,
  MultiKeyRateLimiter,
  RateLimiter
} from "./control-plane/rate-limiter";

export { InMemoryAdapter } from "./control-plane/adapters/in-memory-adapter";

export { MemoryAdapter } from "./control-plane/memory-adapter";

// Utility function to create a fully configured broker bus
import { InMemoryAdapter } from "./control-plane/adapters/in-memory-adapter";
import { DefaultBrokerBus } from "./control-plane/broker-bus";
import type { BrokerConfig } from "./control-plane/types";

export function createBrokerBus(config: Partial<BrokerConfig> = {}) {
  const defaultConfig: BrokerConfig = {
    adapter: new InMemoryAdapter(),
    middleware: [],
    plugins: [],
    ...config
  };

  return new DefaultBrokerBus(defaultConfig);
}
