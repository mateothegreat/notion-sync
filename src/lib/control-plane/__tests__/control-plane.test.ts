/**
 * Control Plane Integration Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Subject } from "rxjs";
import { ControlPlane, createControlPlane, getGlobalControlPlane, setGlobalControlPlane } from "../control-plane";
import { Component, ComponentConfig } from "../types";

describe("ControlPlane", () => {
  let controlPlane: ControlPlane;

  beforeEach(() => {
    controlPlane = createControlPlane({
      enableLogging: false,
      enableMetrics: false,
      enableHealthCheck: false,
      autoStartComponents: false
    });
  });

  afterEach(async () => {
    if (controlPlane.isStarted()) {
      await controlPlane.stop();
    }
    if (controlPlane.isInitialized()) {
      await controlPlane.destroy();
    }
  });

  describe("Lifecycle Management", () => {
    it("should initialize successfully", async () => {
      expect(controlPlane.isInitialized()).toBe(false);

      await controlPlane.initialize();

      expect(controlPlane.isInitialized()).toBe(true);
    });

    it("should start after initialization", async () => {
      await controlPlane.initialize();
      expect(controlPlane.isStarted()).toBe(false);

      await controlPlane.start();

      expect(controlPlane.isStarted()).toBe(true);
    });

    it("should auto-initialize when starting", async () => {
      expect(controlPlane.isInitialized()).toBe(false);

      await controlPlane.start();

      expect(controlPlane.isInitialized()).toBe(true);
      expect(controlPlane.isStarted()).toBe(true);
    });

    it("should stop gracefully", async () => {
      await controlPlane.start();
      expect(controlPlane.isStarted()).toBe(true);

      await controlPlane.stop();

      expect(controlPlane.isStarted()).toBe(false);
    });

    it("should destroy and cleanup resources", async () => {
      await controlPlane.start();

      await controlPlane.destroy();

      expect(controlPlane.isInitialized()).toBe(false);
      expect(controlPlane.isStarted()).toBe(false);
    });

    it("should handle multiple initialization calls", async () => {
      await controlPlane.initialize();
      await controlPlane.initialize(); // Should not throw

      expect(controlPlane.isInitialized()).toBe(true);
    });

    it("should handle multiple start calls", async () => {
      await controlPlane.start();
      await controlPlane.start(); // Should not throw

      expect(controlPlane.isStarted()).toBe(true);
    });
  });

  describe("Message Bus Integration", () => {
    beforeEach(async () => {
      await controlPlane.start();
    });

    it("should create and use channels", async () => {
      const channel = controlPlane.channel<string>("test-channel");
      const messages: string[] = [];

      const subscription = channel.subscribe((message) => {
        messages.push(message);
      });

      await channel.publish("hello");
      await channel.publish("world");

      expect(messages).toEqual(["hello", "world"]);

      subscription.unsubscribe();
    });

    it("should create broker channels (RxJS Subjects)", () => {
      const channel = controlPlane.brokerChannel<string>("broker-test");

      expect(channel).toBeInstanceOf(Subject);

      const messages: string[] = [];
      channel.subscribe((message) => messages.push(message));

      channel.next("test-message");

      expect(messages).toEqual(["test-message"]);
    });

    it("should publish and subscribe to messages", async () => {
      const messages: any[] = [];

      await controlPlane.subscribe("test-topic", (message) => {
        messages.push(message);
      });

      await controlPlane.publish("test-topic", { data: "test" });

      expect(messages).toHaveLength(1);
      expect(messages[0].payload).toEqual({ data: "test" });
      expect(messages[0].type).toBe("test-topic");
    });

    it("should handle middleware in message processing", async () => {
      const middlewareOrder: string[] = [];

      controlPlane.use(async (message, next) => {
        middlewareOrder.push("middleware1-start");
        await next();
        middlewareOrder.push("middleware1-end");
      });

      controlPlane.use(async (message, next) => {
        middlewareOrder.push("middleware2-start");
        await next();
        middlewareOrder.push("middleware2-end");
      });

      await controlPlane.subscribe("middleware-test", () => {
        middlewareOrder.push("handler");
      });

      await controlPlane.publish("middleware-test", "test");

      expect(middlewareOrder).toEqual(["middleware1-start", "middleware2-start", "middleware2-end", "middleware1-end"]);
    });
  });

  describe("State Management Integration", () => {
    beforeEach(async () => {
      await controlPlane.start();
    });

    it("should register and manage mutable state", () => {
      const container = controlPlane.registerMutableState("counter", { value: 0 });

      expect(container.get()).toEqual({ value: 0 });

      container.set({ value: 5 });
      expect(container.get()).toEqual({ value: 5 });

      const retrieved = controlPlane.getState("counter");
      expect(retrieved).toBe(container);
    });

    it("should register and manage immutable state", () => {
      const container = controlPlane.registerImmutableState("list", { items: [] });

      container.update((draft) => {
        draft.items.push("item1");
      });

      expect(container.get()).toEqual({ items: ["item1"] });
    });

    it("should create and restore snapshots", () => {
      controlPlane.registerMutableState("state1", { value: 1 });
      controlPlane.registerMutableState("state2", { value: 2 });

      const snapshot = controlPlane.createSnapshot();
      expect(snapshot).toEqual({
        state1: { value: 1 },
        state2: { value: 2 }
      });

      // Modify state
      controlPlane.getState("state1")!.set({ value: 100 });

      // Restore
      controlPlane.restoreSnapshot(snapshot);

      expect(controlPlane.getState("state1")!.get()).toEqual({ value: 1 });
    });
  });

  describe("Component Management Integration", () => {
    beforeEach(async () => {
      await controlPlane.start();
    });

    it("should register and create components", async () => {
      class TestComponent implements Component {
        id = "test-comp-1";
        name = "TestComponent";
        state: any = "created";

        async initialize() {
          this.state = "initialized";
        }

        async start() {
          this.state = "started";
        }

        async stop() {
          this.state = "stopped";
        }
      }

      const config: ComponentConfig = {
        name: "TestComponent",
        factory: () => new TestComponent()
      };

      controlPlane.registerComponent(config);

      const component = await controlPlane.createComponent("TestComponent");

      expect(component).toBeInstanceOf(TestComponent);
      expect(component.name).toBe("TestComponent");
    });

    it("should manage component lifecycle", async () => {
      class LifecycleComponent implements Component {
        id = "lifecycle-1";
        name = "LifecycleComponent";
        state: any = "created";

        async initialize() {
          this.state = "initialized";
        }

        async start() {
          this.state = "started";
        }

        async stop() {
          this.state = "stopped";
        }
      }

      const config: ComponentConfig = {
        name: "LifecycleComponent",
        factory: () => new LifecycleComponent()
      };

      controlPlane.registerComponent(config);
      const component = await controlPlane.createComponent("LifecycleComponent");

      expect(component.state).toBe("created");

      await controlPlane.startComponent(component.id);
      expect(component.state).toBe("started");

      await controlPlane.stopComponent(component.id);
      expect(component.state).toBe("stopped");
    });
  });

  describe("Circuit Breaker Integration", () => {
    beforeEach(async () => {
      await controlPlane.start();
    });

    it("should create and manage circuit breakers", async () => {
      const breaker = controlPlane.getCircuitBreaker("test-breaker", {
        failureThreshold: 3,
        resetTimeout: 1000,
        monitoringPeriod: 5000
      });

      expect(breaker.getName()).toBe("test-breaker");
      expect(breaker.getState()).toBe("closed");

      // Test operation
      const result = await breaker.execute(() => Promise.resolve("success"));
      expect(result).toBe("success");
    });

    it("should provide circuit breaker statistics", async () => {
      const breaker = controlPlane.getCircuitBreaker("stats-breaker", {
        failureThreshold: 2,
        resetTimeout: 1000,
        monitoringPeriod: 5000
      });

      await breaker.execute(() => Promise.resolve("success"));
      await expect(breaker.execute(() => Promise.reject(new Error("fail")))).rejects.toThrow();

      const stats = controlPlane.getCircuitBreakerStats();

      expect(stats).toHaveProperty("stats-breaker");
      expect(stats["stats-breaker"].successCount).toBe(1);
      expect(stats["stats-breaker"].failureCount).toBe(1);
    });
  });

  describe("Plugin Integration", () => {
    beforeEach(async () => {
      await controlPlane.start();
    });

    it("should register and install plugins", async () => {
      const testPlugin = {
        name: "test-plugin",
        version: "1.0.0",
        install: vi.fn(),
        uninstall: vi.fn()
      };

      controlPlane.registerPlugin(testPlugin);
      await controlPlane.installPlugin("test-plugin");

      expect(testPlugin.install).toHaveBeenCalled();
      expect(controlPlane.getInstalledPlugins()).toContain("test-plugin");
    });

    it("should uninstall plugins", async () => {
      const testPlugin = {
        name: "uninstall-plugin",
        version: "1.0.0",
        install: vi.fn(),
        uninstall: vi.fn()
      };

      controlPlane.registerPlugin(testPlugin);
      await controlPlane.installPlugin("uninstall-plugin");
      await controlPlane.uninstallPlugin("uninstall-plugin");

      expect(testPlugin.uninstall).toHaveBeenCalled();
      expect(controlPlane.getInstalledPlugins()).not.toContain("uninstall-plugin");
    });
  });

  describe("Hook Integration", () => {
    beforeEach(async () => {
      await controlPlane.start();
    });

    it("should register and execute hooks", async () => {
      const hookExecuted = vi.fn();

      const hookId = controlPlane.registerHook("before-message", hookExecuted);

      await controlPlane.executeHooks("before-message", { test: "data" });

      expect(hookExecuted).toHaveBeenCalledWith({ test: "data" });

      const unregistered = controlPlane.unregisterHook(hookId);
      expect(unregistered).toBe(true);
    });

    it("should execute hooks during message processing", async () => {
      const beforeHook = vi.fn();
      const afterHook = vi.fn();

      controlPlane.registerHook("before-message", beforeHook);
      controlPlane.registerHook("after-message", afterHook);

      await controlPlane.publish("hook-test", "test-data");

      expect(beforeHook).toHaveBeenCalled();
      expect(afterHook).toHaveBeenCalled();
    });
  });

  describe("Status and Health", () => {
    it("should provide accurate status information", async () => {
      const status = controlPlane.getStatus();

      expect(status.initialized).toBe(false);
      expect(status.started).toBe(false);
      expect(status.components).toBe(0);
      expect(status.plugins).toBe(0);

      await controlPlane.start();

      const startedStatus = controlPlane.getStatus();
      expect(startedStatus.initialized).toBe(true);
      expect(startedStatus.started).toBe(true);
    });

    it("should provide health check information", async () => {
      const health = controlPlane.getHealth();

      expect(health.status).toBe("stopped");
      expect(health.timestamp).toBeDefined();
      expect(health.uptime).toBeGreaterThan(0);
      expect(health.memory).toBeDefined();
      expect(health.controlPlane).toBeDefined();

      await controlPlane.start();

      const healthyStatus = controlPlane.getHealth();
      expect(healthyStatus.status).toBe("healthy");
    });
  });

  describe("Built-in Plugins", () => {
    it("should install logging plugin when enabled", async () => {
      const loggingControlPlane = createControlPlane({
        enableLogging: true,
        enableMetrics: false,
        enableHealthCheck: false
      });

      await loggingControlPlane.initialize();

      expect(loggingControlPlane.getInstalledPlugins()).toContain("logging");

      await loggingControlPlane.destroy();
    });

    it("should install metrics plugin when enabled", async () => {
      const metricsControlPlane = createControlPlane({
        enableLogging: false,
        enableMetrics: true,
        enableHealthCheck: false
      });

      await metricsControlPlane.initialize();

      expect(metricsControlPlane.getInstalledPlugins()).toContain("metrics");

      await metricsControlPlane.destroy();
    });

    it("should install health check plugin when enabled", async () => {
      const healthControlPlane = createControlPlane({
        enableLogging: false,
        enableMetrics: false,
        enableHealthCheck: true
      });

      await healthControlPlane.initialize();

      expect(healthControlPlane.getInstalledPlugins()).toContain("health-check");

      await healthControlPlane.destroy();
    });
  });
});

describe("Global Control Plane", () => {
  afterEach(() => {
    // Reset global state
    setGlobalControlPlane(createControlPlane());
  });

  it("should create global control plane instance", () => {
    const global1 = getGlobalControlPlane();
    const global2 = getGlobalControlPlane();

    expect(global1).toBe(global2); // Should be same instance
  });

  it("should allow setting custom global control plane", () => {
    const customControlPlane = createControlPlane({ enableLogging: true });

    setGlobalControlPlane(customControlPlane);

    const retrieved = getGlobalControlPlane();
    expect(retrieved).toBe(customControlPlane);
  });
});

describe("Error Handling", () => {
  let controlPlane: ControlPlane;

  beforeEach(() => {
    controlPlane = createControlPlane();
  });

  afterEach(async () => {
    try {
      await controlPlane.destroy();
    } catch {
      // Ignore cleanup errors
    }
  });

  it("should handle initialization errors gracefully", async () => {
    // Mock a plugin that fails during installation
    const failingPlugin = {
      name: "failing-plugin",
      version: "1.0.0",
      install: vi.fn().mockRejectedValue(new Error("Installation failed"))
    };

    controlPlane.registerPlugin(failingPlugin);

    await expect(controlPlane.installPlugin("failing-plugin")).rejects.toThrow("Installation failed");
  });

  it("should handle component creation errors", async () => {
    const failingConfig: ComponentConfig = {
      name: "FailingComponent",
      factory: () => {
        throw new Error("Component creation failed");
      }
    };

    await controlPlane.start();
    controlPlane.registerComponent(failingConfig);

    await expect(controlPlane.createComponent("FailingComponent")).rejects.toThrow("Component creation failed");
  });

  it("should handle message processing errors", async () => {
    await controlPlane.start();

    // Add middleware that throws
    controlPlane.use(async () => {
      throw new Error("Middleware error");
    });

    await expect(controlPlane.publish("error-test", "data")).rejects.toThrow("Middleware error");
  });
});

describe("Performance Tests", () => {
  let controlPlane: ControlPlane;

  beforeEach(async () => {
    controlPlane = createControlPlane();
    await controlPlane.start();
  });

  afterEach(async () => {
    await controlPlane.destroy();
  });

  it("should handle high message throughput", async () => {
    const messageCount = 1000;
    const receivedMessages: any[] = [];

    await controlPlane.subscribe("perf-test", (message) => {
      receivedMessages.push(message);
    });

    const startTime = Date.now();

    const promises = Array.from({ length: messageCount }, (_, i) => controlPlane.publish("perf-test", { id: i }));

    await Promise.all(promises);

    const endTime = Date.now();
    const duration = endTime - startTime;
    const throughput = messageCount / (duration / 1000);

    expect(receivedMessages).toHaveLength(messageCount);
    expect(throughput).toBeGreaterThan(100); // At least 100 messages per second
  });

  it("should maintain low latency under load", async () => {
    const latencies: number[] = [];

    await controlPlane.subscribe("latency-test", (message: any) => {
      const latency = Date.now() - message.payload.timestamp;
      latencies.push(latency);
    });

    for (let i = 0; i < 100; i++) {
      await controlPlane.publish("latency-test", { timestamp: Date.now() });
    }

    const avgLatency = latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length;
    const p99Latency = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.99)];

    expect(avgLatency).toBeLessThan(5); // Average latency under 5ms
    expect(p99Latency).toBeLessThan(10); // p99 latency under 10ms
  });
});
