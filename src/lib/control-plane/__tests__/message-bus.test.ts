/**
 * Message Bus Tests
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Subject } from "rxjs";
import {
  MessageBus,
  BrokerBus,
  InMemoryAdapter,
  MessageBusChannel,
  PromiseBusChannel,
  provideBusSubject,
  provideBusChannel
} from "../message-bus";
import { Message } from "../types";

describe("InMemoryAdapter", () => {
  let adapter: InMemoryAdapter;

  beforeEach(() => {
    adapter = new InMemoryAdapter();
  });

  it("should publish and subscribe to messages", async () => {
    const messages: Message<string>[] = [];
    const handler = vi.fn((message: Message<string>) => {
      messages.push(message);
    });

    await adapter.subscribe("test-channel", handler);

    const message: Message<string> = {
      id: "test-1",
      type: "test-channel",
      payload: "hello",
      timestamp: Date.now()
    };

    await adapter.publish("test-channel", message);

    expect(handler).toHaveBeenCalledWith(message);
    expect(messages).toHaveLength(1);
    expect(messages[0].payload).toBe("hello");
  });

  it("should handle multiple subscribers", async () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    await adapter.subscribe("test-channel", handler1);
    await adapter.subscribe("test-channel", handler2);

    const message: Message<string> = {
      id: "test-1",
      type: "test-channel",
      payload: "hello",
      timestamp: Date.now()
    };

    await adapter.publish("test-channel", message);

    expect(handler1).toHaveBeenCalledWith(message);
    expect(handler2).toHaveBeenCalledWith(message);
  });

  it("should allow unsubscribing", async () => {
    const handler = vi.fn();
    const unsubscribe = await adapter.subscribe("test-channel", handler);

    const message: Message<string> = {
      id: "test-1",
      type: "test-channel",
      payload: "hello",
      timestamp: Date.now()
    };

    await adapter.publish("test-channel", message);
    expect(handler).toHaveBeenCalledTimes(1);

    unsubscribe();

    await adapter.publish("test-channel", message);
    expect(handler).toHaveBeenCalledTimes(1); // Should not be called again
  });

  it("should close all channels", async () => {
    const handler = vi.fn();
    await adapter.subscribe("test-channel", handler);

    await adapter.close();

    const message: Message<string> = {
      id: "test-1",
      type: "test-channel",
      payload: "hello",
      timestamp: Date.now()
    };

    await adapter.publish("test-channel", message);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("MessageBus", () => {
  let messageBus: MessageBus;
  let adapter: InMemoryAdapter;

  beforeEach(() => {
    adapter = new InMemoryAdapter();
    messageBus = new MessageBus(adapter);
  });

  it("should publish and subscribe to messages", async () => {
    const messages: Message<string>[] = [];
    const handler = vi.fn((message: Message<string>) => {
      messages.push(message);
    });

    await messageBus.subscribe("test-channel", handler);
    await messageBus.publish("test-channel", "hello world");

    expect(handler).toHaveBeenCalledTimes(1);
    expect(messages).toHaveLength(1);
    expect(messages[0].payload).toBe("hello world");
    expect(messages[0].type).toBe("test-channel");
  });

  it("should process middleware", async () => {
    const middlewareOrder: string[] = [];

    messageBus.use(async (message, next) => {
      middlewareOrder.push("middleware1-before");
      await next();
      middlewareOrder.push("middleware1-after");
    });

    messageBus.use(async (message, next) => {
      middlewareOrder.push("middleware2-before");
      await next();
      middlewareOrder.push("middleware2-after");
    });

    const handler = vi.fn();
    await messageBus.subscribe("test-channel", handler);
    await messageBus.publish("test-channel", "test");

    expect(middlewareOrder).toEqual([
      "middleware1-before",
      "middleware2-before",
      "middleware2-after",
      "middleware1-after"
    ]);
  });

  it("should handle middleware errors", async () => {
    messageBus.use(async (message, next) => {
      throw new Error("Middleware error");
    });

    await expect(messageBus.publish("test-channel", "test")).rejects.toThrow("Middleware error");
  });

  it("should generate unique message IDs", async () => {
    const messages: Message<string>[] = [];
    const handler = vi.fn((message: Message<string>) => {
      messages.push(message);
    });

    await messageBus.subscribe("test-channel", handler);
    await messageBus.publish("test-channel", "message1");
    await messageBus.publish("test-channel", "message2");

    expect(messages).toHaveLength(2);
    expect(messages[0].id).not.toBe(messages[1].id);
  });
});

describe("MessageBusChannel", () => {
  let messageBus: MessageBus;
  let channel: MessageBusChannel<string>;

  beforeEach(() => {
    const adapter = new InMemoryAdapter();
    messageBus = new MessageBus(adapter);
    channel = messageBus.channel<string>("test-channel") as MessageBusChannel<string>;
  });

  it("should publish and subscribe to messages", async () => {
    const messages: string[] = [];
    const subscription = channel.subscribe((message) => {
      messages.push(message);
    });

    await channel.publish("hello");
    await channel.publish("world");

    expect(messages).toEqual(["hello", "world"]);

    subscription.unsubscribe();
  });

  it("should throw error when publishing to closed channel", async () => {
    channel.close();
    await expect(channel.publish("test")).rejects.toThrow("Channel test-channel is closed");
  });

  it("should throw error when subscribing to closed channel", () => {
    channel.close();
    expect(() => channel.subscribe(() => {})).toThrow("Channel test-channel is closed");
  });
});

describe("BrokerBus", () => {
  let brokerBus: BrokerBus;

  beforeEach(() => {
    brokerBus = new BrokerBus();
  });

  it("should create RxJS Subject channels", () => {
    const channel = brokerBus.channel<string>("test-channel");
    expect(channel).toBeInstanceOf(Subject);
  });

  it("should handle bidirectional communication", async () => {
    const channel = brokerBus.channel<string>("test-channel");
    const messages: string[] = [];

    channel.subscribe((message) => {
      messages.push(message);
    });

    channel.next("hello");
    channel.next("world");

    // Allow async operations to complete
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(messages).toEqual(["hello", "world"]);
  });

  it("should support middleware", async () => {
    const middlewareExecuted = vi.fn();

    brokerBus.use(async (message, next) => {
      middlewareExecuted();
      await next();
    });

    const channel = brokerBus.channel<string>("test-channel");
    channel.next("test");

    // Allow async operations to complete
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(middlewareExecuted).toHaveBeenCalled();
  });
});

describe("Utility Functions", () => {
  it("should provide bus subject factory", () => {
    const provider = provideBusSubject<Subject<string>>("test-channel");

    expect(provider.provide).toBe("test-channel");
    expect(provider.deps).toEqual([BrokerBus]);
    expect(typeof provider.useFactory).toBe("function");
  });

  it("should provide bus channel factory", () => {
    const provider = provideBusChannel<any>("test-channel");

    expect(provider.provide).toBe("test-channel");
    expect(provider.deps).toEqual([MessageBus]);
    expect(typeof provider.useFactory).toBe("function");
  });
});

describe("Performance Tests", () => {
  it("should handle high message throughput", async () => {
    const adapter = new InMemoryAdapter();
    const messageBus = new MessageBus(adapter);

    const messageCount = 1000;
    const receivedMessages: Message<number>[] = [];

    await messageBus.subscribe("perf-test", (message: Message<number>) => {
      receivedMessages.push(message);
    });

    const startTime = Date.now();

    for (let i = 0; i < messageCount; i++) {
      await messageBus.publish("perf-test", i);
    }

    const endTime = Date.now();
    const duration = endTime - startTime;
    const throughput = messageCount / (duration / 1000);

    expect(receivedMessages).toHaveLength(messageCount);
    expect(throughput).toBeGreaterThan(100); // At least 100 messages per second
  });

  it("should process messages within latency requirements", async () => {
    const adapter = new InMemoryAdapter();
    const messageBus = new MessageBus(adapter);

    const latencies: number[] = [];

    await messageBus.subscribe("latency-test", (message: Message<{ timestamp: number }>) => {
      const latency = Date.now() - message.payload.timestamp;
      latencies.push(latency);
    });

    for (let i = 0; i < 100; i++) {
      await messageBus.publish("latency-test", { timestamp: Date.now() });
    }

    const p99Latency = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.99)];
    expect(p99Latency).toBeLessThan(10); // p99 latency should be under 10ms
  });
});
