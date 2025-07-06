import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { BrokerBus } from "./broker";
import { MemoryAdapter } from "./memory-adapter";

describe("BrokerBus", () => {
  let bus: BrokerBus;
  let adapter: MemoryAdapter;

  beforeEach(() => {
    adapter = new MemoryAdapter();
    bus = new BrokerBus(adapter);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("should create a new channel", () => {
    const channel = bus.channel("test");
    expect(channel).toBeDefined();
  });

  test("should publish and subscribe to a channel", async () => {
    const channel = bus.channel<string>("test");
    const spy = vi.fn();
    channel.subscribe(spy);
    await channel.publish("hello");
    expect(spy).toHaveBeenCalledWith("hello");
  });

  test("should handle multiple subscribers", async () => {
    const channel = bus.channel<string>("test");
    const spy1 = vi.fn();
    const spy2 = vi.fn();
    channel.subscribe(spy1);
    channel.subscribe(spy2);
    await channel.publish("hello");
    expect(spy1).toHaveBeenCalledWith("hello");
    expect(spy2).toHaveBeenCalledWith("hello");
  });

  test("should call adapter publish method", async () => {
    const spy = vi.spyOn(adapter, "publish");
    const channel = bus.channel("test");
    await channel.publish("hello");
    expect(spy).toHaveBeenCalledWith("test", "hello");
  });

  test("should call adapter subscribe method", () => {
    const spy = vi.spyOn(adapter, "subscribe");
    bus.channel("test");
    expect(spy).toHaveBeenCalledWith("test");
  });
});
