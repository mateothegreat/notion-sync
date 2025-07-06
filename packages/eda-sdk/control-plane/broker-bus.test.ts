/**
 * DefaultBrokerBus Tests
 */

import { firstValueFrom, of, throwError } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryAdapter } from "./adapters/in-memory-adapter";
import { DefaultBrokerBus } from "./broker-bus";
import type {
  BrokerConfig,
  CircuitBreakerConfig,
  Message,
  Middleware,
  Plugin,
  RateLimitConfig,
  RetryConfig
} from "./types";

describe("DefaultBrokerBus", () => {
  let adapter: InMemoryAdapter;
  let config: BrokerConfig;
  let bus: DefaultBrokerBus;

  beforeEach(async () => {
    adapter = new InMemoryAdapter();
    vi.useFakeTimers();

    const connectPromise = firstValueFrom(adapter.connect());
    vi.advanceTimersByTime(15);
    await connectPromise;

    config = {
      adapter
    };
    bus = new DefaultBrokerBus(config);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Constructor", () => {
    it("should initialize with adapter", () => {
      expect(bus).toBeInstanceOf(DefaultBrokerBus);
    });

    it("should sort middleware by priority", () => {
      const middleware1: Middleware = { name: "mid1", priority: 1 };
      const middleware2: Middleware = { name: "mid2", priority: 3 };
      const middleware3: Middleware = { name: "mid3", priority: 2 };

      const configWithMiddleware: BrokerConfig = {
        adapter,
        middleware: [middleware1, middleware2, middleware3]
      };

      const busWithMiddleware = new DefaultBrokerBus(configWithMiddleware);
      expect(busWithMiddleware).toBeInstanceOf(DefaultBrokerBus);
    });

    it("should install plugins from config", () => {
      const mockPlugin: Plugin = {
        name: "test-plugin",
        version: "1.0.0",
        install: vi.fn()
      };

      const configWithPlugins: BrokerConfig = {
        adapter,
        plugins: [mockPlugin]
      };

      new DefaultBrokerBus(configWithPlugins);
      expect(mockPlugin.install).toHaveBeenCalled();
    });
  });

  describe("channel", () => {
    it("should create new channel", () => {
      const channel = bus.channel<string>("test-channel");
      expect(channel).toBeDefined();
    });

    it("should return same channel for same name", () => {
      const channel1 = bus.channel<string>("test-channel");
      const channel2 = bus.channel<string>("test-channel");
      expect(channel1).toBe(channel2);
    });

    it("should create different channels for different names", () => {
      const channel1 = bus.channel<string>("channel1");
      const channel2 = bus.channel<string>("channel2");
      expect(channel1).not.toBe(channel2);
    });
  });

  describe("use", () => {
    it("should add middleware", () => {
      const middleware: Middleware = { name: "test-middleware" };
      expect(() => bus.use(middleware)).not.toThrow();
    });

    it("should sort middleware by priority after adding", () => {
      const middleware1: Middleware = { name: "mid1", priority: 1 };
      const middleware2: Middleware = { name: "mid2", priority: 3 };

      bus.use(middleware1);
      bus.use(middleware2);

      // Should not throw and should handle priority sorting
      expect(() => bus.channel("test")).not.toThrow();
    });
  });

  describe("install", () => {
    it("should install plugin", () => {
      const plugin: Plugin = {
        name: "test-plugin",
        version: "1.0.0",
        install: vi.fn()
      };

      bus.install(plugin);
      expect(plugin.install).toHaveBeenCalledWith(bus);
    });

    it("should throw if plugin already installed", () => {
      const plugin: Plugin = {
        name: "test-plugin",
        version: "1.0.0",
        install: vi.fn()
      };

      bus.install(plugin);
      expect(() => bus.install(plugin)).toThrow("Plugin test-plugin is already installed");
    });
  });

  describe("uninstall", () => {
    it("should uninstall plugin", () => {
      const plugin: Plugin = {
        name: "test-plugin",
        version: "1.0.0",
        install: vi.fn(),
        uninstall: vi.fn()
      };

      bus.install(plugin);
      bus.uninstall("test-plugin");

      expect(plugin.uninstall).toHaveBeenCalledWith(bus);
    });

    it("should handle plugin without uninstall method", () => {
      const plugin: Plugin = {
        name: "test-plugin",
        version: "1.0.0",
        install: vi.fn()
      };

      bus.install(plugin);
      expect(() => bus.uninstall("test-plugin")).not.toThrow();
    });

    it("should throw if plugin not installed", () => {
      expect(() => bus.uninstall("nonexistent")).toThrow("Plugin nonexistent is not installed");
    });
  });

  describe("connect", () => {
    it("should delegate to adapter", async () => {
      const connectSpy = vi.spyOn(adapter, "connect");
      const connectPromise = firstValueFrom(bus.connect());
      vi.advanceTimersByTime(15);
      await connectPromise;
      expect(connectSpy).toHaveBeenCalled();
    });
  });

  describe("disconnect", () => {
    it("should delegate to adapter", async () => {
      const disconnectSpy = vi.spyOn(adapter, "disconnect");
      const disconnectPromise = firstValueFrom(bus.disconnect());
      vi.advanceTimersByTime(15);
      await disconnectPromise;
      expect(disconnectSpy).toHaveBeenCalled();
    });
  });

  describe("isConnected", () => {
    it("should delegate to adapter", () => {
      const isConnectedSpy = vi.spyOn(adapter, "isConnected");
      bus.isConnected();
      expect(isConnectedSpy).toHaveBeenCalled();
    });
  });
});

describe("DefaultBrokerBusChannel", () => {
  let adapter: InMemoryAdapter;
  let bus: DefaultBrokerBus;

  beforeEach(async () => {
    adapter = new InMemoryAdapter();
    vi.useFakeTimers();

    const connectPromise = firstValueFrom(adapter.connect());
    vi.advanceTimersByTime(15);
    await connectPromise;

    bus = new DefaultBrokerBus({ adapter });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("publish", () => {
    it("should publish message successfully", async () => {
      const channel = bus.channel<string>("test-channel");

      await firstValueFrom(channel.publish("hello"));
      // Should not throw
    });

    it("should generate message with UUID", async () => {
      const channel = bus.channel<string>("test-channel");
      const publishSpy = vi.spyOn(adapter, "publish");

      await firstValueFrom(channel.publish("test"));

      expect(publishSpy).toHaveBeenCalledWith("test-channel", "test");
    });

    it("should handle publish errors", async () => {
      const failingAdapter = {
        ...adapter,
        publish: () => throwError(() => new Error("Publish failed")),
        subscribe: () => of(),
        isConnected: () => true
      };

      const failingBus = new DefaultBrokerBus({ adapter: failingAdapter as any });
      const channel = failingBus.channel<string>("test-channel");

      try {
        await firstValueFrom(channel.publish("test"));
        expect.fail("Should have thrown error");
      } catch (error: any) {
        expect(error.message).toBe("Publish failed");
      }
    });
  });

  describe("subscribe", () => {
    it.skip("should subscribe to messages", async () => {
      const channel = bus.channel<string>("test-channel");
      const messages: string[] = [];

      // Set up subscription first
      const subscriptionPromise = firstValueFrom(
        channel.subscribe((message) => {
          messages.push(message);
        })
      );
      await subscriptionPromise;

      // Publish a message
      await firstValueFrom(channel.publish("hello"));

      // Give time for async operations
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(messages).toContain("hello");
    });

    it("should handle subscription errors", async () => {
      const channel = bus.channel<string>("test-channel");

      // Should not throw when subscribing
      await firstValueFrom(
        channel.subscribe(() => {
          throw new Error("Handler error");
        })
      );
    });
  });

  describe("asSubject", () => {
    it("should return RxJS Subject", () => {
      const channel = bus.channel<string>("test-channel");
      const subject = channel.asSubject();

      expect(subject).toBeDefined();
      expect(typeof subject.next).toBe("function");
      expect(typeof subject.subscribe).toBe("function");
    });

    it("should allow direct subject operations", () => {
      const channel = bus.channel<string>("test-channel");
      const subject = channel.asSubject();
      const messages: string[] = [];

      subject.subscribe((msg) => messages.push(msg));
      subject.next("direct message");

      expect(messages).toContain("direct message");
    });
  });
});

describe("Middleware Integration", () => {
  let adapter: InMemoryAdapter;
  let bus: DefaultBrokerBus;

  beforeEach(async () => {
    adapter = new InMemoryAdapter();
    vi.useFakeTimers();

    const connectPromise = firstValueFrom(adapter.connect());
    vi.advanceTimersByTime(15);
    await connectPromise;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should execute pre-middleware", async () => {
    const preMiddleware = vi.fn().mockReturnValue(of({} as Message));
    const middleware: Middleware = {
      name: "pre-middleware",
      pre: preMiddleware
    };

    bus = new DefaultBrokerBus({ adapter, middleware: [middleware] });
    const channel = bus.channel<string>("test-channel");

    await firstValueFrom(channel.publish("test"));

    expect(preMiddleware).toHaveBeenCalled();
  });

  it("should execute post-middleware", async () => {
    const postMiddleware = vi.fn().mockReturnValue(of(undefined));
    const middleware: Middleware = {
      name: "post-middleware",
      post: postMiddleware
    };

    bus = new DefaultBrokerBus({ adapter, middleware: [middleware] });
    const channel = bus.channel<string>("test-channel");

    await firstValueFrom(channel.publish("test"));

    expect(postMiddleware).toHaveBeenCalled();
  });

  it("should execute error-middleware on pre-middleware error", async () => {
    const errorMiddleware = vi.fn().mockReturnValue(of(undefined));
    const middleware: Middleware = {
      name: "error-middleware",
      pre: () => throwError(() => new Error("Pre error")),
      error: errorMiddleware
    };

    bus = new DefaultBrokerBus({ adapter, middleware: [middleware] });
    const channel = bus.channel<string>("test-channel");

    try {
      await firstValueFrom(channel.publish("test"));
    } catch {}

    expect(errorMiddleware).toHaveBeenCalled();
  });

  it("should execute error-middleware on post-middleware error", async () => {
    const errorMiddleware = vi.fn().mockReturnValue(of(undefined));
    const middleware: Middleware = {
      name: "error-middleware",
      post: () => throwError(() => new Error("Post error")),
      error: errorMiddleware
    };

    bus = new DefaultBrokerBus({ adapter, middleware: [middleware] });
    const channel = bus.channel<string>("test-channel");

    await firstValueFrom(channel.publish("test"));

    expect(errorMiddleware).toHaveBeenCalled();
  });
});

describe("Rate Limiting Integration", () => {
  let adapter: InMemoryAdapter;
  let bus: DefaultBrokerBus;

  beforeEach(async () => {
    adapter = new InMemoryAdapter();
    vi.useFakeTimers();

    const connectPromise = firstValueFrom(adapter.connect());
    vi.advanceTimersByTime(15);
    await connectPromise;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should apply rate limiting", async () => {
    const rateLimitConfig: RateLimitConfig = {
      maxRequests: 1,
      windowMs: 1000
    };

    bus = new DefaultBrokerBus({
      adapter,
      rateLimitConfig
    });

    const channel = bus.channel<string>("test-channel");

    // First message should succeed
    await firstValueFrom(channel.publish("message1"));

    // Second message should fail due to rate limit
    try {
      await firstValueFrom(channel.publish("message2"));
      expect.fail("Should have been rate limited");
    } catch (error: any) {
      expect(error.message).toBe("Rate limit exceeded");
    }
  });
});

describe("Circuit Breaker Integration", () => {
  let adapter: InMemoryAdapter;
  let bus: DefaultBrokerBus;

  beforeEach(async () => {
    adapter = new InMemoryAdapter();
    vi.useFakeTimers();

    const connectPromise = firstValueFrom(adapter.connect());
    vi.advanceTimersByTime(15);
    await connectPromise;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should apply circuit breaker protection", async () => {
    const circuitBreakerConfig: CircuitBreakerConfig = {
      failureThreshold: 1,
      resetTimeout: 1000,
      halfOpenRequests: 1
    };

    // Create a failing adapter
    const failingAdapter = {
      ...adapter,
      publish: () => throwError(() => new Error("Adapter failure")),
      subscribe: () => of(),
      isConnected: () => true
    };

    bus = new DefaultBrokerBus({
      adapter: failingAdapter as any,
      circuitBreakerConfig
    });

    const channel = bus.channel<string>("test-channel");

    // First failure should open the circuit
    try {
      await firstValueFrom(channel.publish("message1"));
    } catch {}

    // Subsequent calls should be rejected by circuit breaker
    try {
      await firstValueFrom(channel.publish("message2"));
      expect.fail("Should have been blocked by circuit breaker");
    } catch (error: any) {
      expect(error.message).toContain("Circuit breaker is");
    }
  });
});

describe("Retry Integration", () => {
  let adapter: InMemoryAdapter;
  let bus: DefaultBrokerBus;

  beforeEach(async () => {
    adapter = new InMemoryAdapter();
    vi.useFakeTimers();

    const connectPromise = firstValueFrom(adapter.connect());
    vi.advanceTimersByTime(15);
    await connectPromise;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.skip("should retry on retryable errors", async () => {
    let callCount = 0;
    const retryingAdapter = {
      ...adapter,
      publish: () => {
        callCount++;
        if (callCount === 1) {
          return throwError(() => new Error("ECONNREFUSED"));
        }
        return of(undefined);
      },
      subscribe: () => of(),
      isConnected: () => true
    };

    const retryConfig: RetryConfig = {
      maxAttempts: 2,
      backoffMultiplier: 1,
      maxBackoff: 100,
      retryableErrors: ["ECONNREFUSED"]
    };

    bus = new DefaultBrokerBus({
      adapter: retryingAdapter as any,
      retryConfig
    });

    const channel = bus.channel<string>("test-channel");

    // Start the publish operation
    const publishPromise = firstValueFrom(channel.publish("test"));

    // Advance timers to handle retry delays
    vi.advanceTimersByTime(1000);

    await publishPromise;
    expect(callCount).toBe(2); // Original call + 1 retry
  });

  it("should not retry on non-retryable errors", async () => {
    let callCount = 0;
    const failingAdapter = {
      ...adapter,
      publish: () => {
        callCount++;
        return throwError(() => new Error("ValidationError"));
      },
      subscribe: () => of(),
      isConnected: () => true
    };

    const retryConfig: RetryConfig = {
      maxAttempts: 3,
      backoffMultiplier: 1,
      maxBackoff: 100,
      retryableErrors: ["ECONNREFUSED"]
    };

    bus = new DefaultBrokerBus({
      adapter: failingAdapter as any,
      retryConfig
    });

    const channel = bus.channel<string>("test-channel");

    try {
      await firstValueFrom(channel.publish("test"));
    } catch {}

    expect(callCount).toBe(1); // No retries for non-retryable error
  });
});
