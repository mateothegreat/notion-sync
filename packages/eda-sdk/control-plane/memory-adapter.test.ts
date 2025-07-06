import { beforeEach, describe, expect, test, vi } from "vitest";
import { MemoryAdapter } from "./memory-adapter";

describe("MemoryAdapter", () => {
  let adapter: MemoryAdapter;

  beforeEach(() => {
    adapter = new MemoryAdapter();
  });

  test("should publish a message to a channel", async () => {
    const spy = vi.fn();
    adapter.subscribe("test").subscribe(spy);
    await adapter.publish("test", "hello");
    expect(spy).toHaveBeenCalledWith("hello");
  });

  test("should not fail if no subscribers", async () => {
    await expect(adapter.publish("test", "hello")).resolves.not.toThrow();
  });

  test("should create a new channel on subscribe if it does not exist", () => {
    const observable = adapter.subscribe("test");
    expect(observable).toBeDefined();
  });
});
