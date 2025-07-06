/**
 * State Registry Tests
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  StateRegistry,
  MutableStateContainer,
  ImmutableStateContainer,
  StateSelector,
  createSelector
} from "../state-registry";

describe("MutableStateContainer", () => {
  let container: MutableStateContainer<{ count: number; name: string }>;

  beforeEach(() => {
    container = new MutableStateContainer("test", { count: 0, name: "test" });
  });

  it("should get and set values", () => {
    expect(container.get()).toEqual({ count: 0, name: "test" });

    container.set({ count: 1, name: "updated" });
    expect(container.get()).toEqual({ count: 1, name: "updated" });
  });

  it("should update values using Immer", () => {
    container.update((draft) => {
      draft.count = 5;
      draft.name = "immer";
    });

    expect(container.get()).toEqual({ count: 5, name: "immer" });
  });

  it("should notify subscribers of changes", () => {
    const subscriber = vi.fn();
    const subscription = container.subscribe(subscriber);

    container.set({ count: 1, name: "changed" });

    expect(subscriber).toHaveBeenCalledWith({ count: 1, name: "changed" });

    subscription.unsubscribe();
  });

  it("should emit change events", () => {
    const changeHandler = vi.fn();
    const subscription = container.onChange().subscribe(changeHandler);

    const oldValue = container.get();
    container.set({ count: 1, name: "changed" });

    expect(changeHandler).toHaveBeenCalledWith({
      key: "test",
      oldValue,
      newValue: { count: 1, name: "changed" },
      timestamp: expect.any(Number)
    });

    subscription.unsubscribe();
  });

  it("should handle multiple subscribers", () => {
    const subscriber1 = vi.fn();
    const subscriber2 = vi.fn();

    const sub1 = container.subscribe(subscriber1);
    const sub2 = container.subscribe(subscriber2);

    container.set({ count: 1, name: "multi" });

    expect(subscriber1).toHaveBeenCalledWith({ count: 1, name: "multi" });
    expect(subscriber2).toHaveBeenCalledWith({ count: 1, name: "multi" });

    sub1.unsubscribe();
    sub2.unsubscribe();
  });
});

describe("ImmutableStateContainer", () => {
  let container: ImmutableStateContainer<{ items: string[]; metadata: { version: number } }>;

  beforeEach(() => {
    container = new ImmutableStateContainer("immutable-test", {
      items: ["a", "b"],
      metadata: { version: 1 }
    });
  });

  it("should maintain immutability on set", () => {
    const originalState = container.get();
    const newState = { items: ["x", "y"], metadata: { version: 2 } };

    container.set(newState);

    expect(container.get()).toEqual(newState);
    expect(container.get()).not.toBe(newState); // Should be a different object
    expect(originalState).toEqual({ items: ["a", "b"], metadata: { version: 1 } }); // Original unchanged
  });

  it("should use structural sharing with Immer", () => {
    const originalState = container.get();

    container.update((draft) => {
      draft.items.push("c");
    });

    const newState = container.get();

    expect(newState.items).toEqual(["a", "b", "c"]);
    expect(newState.metadata).toBe(originalState.metadata); // Structural sharing
    expect(newState.items).not.toBe(originalState.items); // Items array changed
  });

  it("should emit change events for immutable updates", () => {
    const changeHandler = vi.fn();
    const subscription = container.onChange().subscribe(changeHandler);

    container.update((draft) => {
      draft.metadata.version = 2;
    });

    expect(changeHandler).toHaveBeenCalledWith({
      key: "immutable-test",
      oldValue: { items: ["a", "b"], metadata: { version: 1 } },
      newValue: { items: ["a", "b"], metadata: { version: 2 } },
      timestamp: expect.any(Number)
    });

    subscription.unsubscribe();
  });
});

describe("StateRegistry", () => {
  let registry: StateRegistry;

  beforeEach(() => {
    registry = new StateRegistry();
  });

  it("should register mutable state containers", () => {
    const container = registry.registerMutable("counter", { value: 0 });

    expect(container).toBeInstanceOf(MutableStateContainer);
    expect(container.get()).toEqual({ value: 0 });
    expect(registry.has("counter")).toBe(true);
  });

  it("should register immutable state containers", () => {
    const container = registry.registerImmutable("list", { items: [] });

    expect(container).toBeInstanceOf(ImmutableStateContainer);
    expect(container.get()).toEqual({ items: [] });
    expect(registry.has("list")).toBe(true);
  });

  it("should throw error for duplicate keys", () => {
    registry.registerMutable("duplicate", { value: 1 });

    expect(() => {
      registry.registerMutable("duplicate", { value: 2 });
    }).toThrow("State container with key 'duplicate' already exists");
  });

  it("should get registered containers", () => {
    const container = registry.registerMutable("test", { data: "test" });
    const retrieved = registry.get("test");

    expect(retrieved).toBe(container);
  });

  it("should return undefined for non-existent containers", () => {
    expect(registry.get("non-existent")).toBeUndefined();
  });

  it("should remove containers", () => {
    registry.registerMutable("removable", { value: 1 });

    expect(registry.has("removable")).toBe(true);
    expect(registry.remove("removable")).toBe(true);
    expect(registry.has("removable")).toBe(false);
    expect(registry.remove("removable")).toBe(false); // Already removed
  });

  it("should list all keys", () => {
    registry.registerMutable("key1", { value: 1 });
    registry.registerImmutable("key2", { value: 2 });

    const keys = registry.keys();
    expect(keys).toContain("key1");
    expect(keys).toContain("key2");
    expect(keys).toHaveLength(2);
  });

  it("should emit global change events", () => {
    const globalChangeHandler = vi.fn();
    const subscription = registry.onAnyChange().subscribe(globalChangeHandler);

    const container1 = registry.registerMutable("global1", { value: 1 });
    const container2 = registry.registerMutable("global2", { value: 2 });

    container1.set({ value: 10 });
    container2.set({ value: 20 });

    expect(globalChangeHandler).toHaveBeenCalledTimes(2);
    expect(globalChangeHandler).toHaveBeenNthCalledWith(1, {
      key: "global1",
      oldValue: { value: 1 },
      newValue: { value: 10 },
      timestamp: expect.any(Number)
    });
    expect(globalChangeHandler).toHaveBeenNthCalledWith(2, {
      key: "global2",
      oldValue: { value: 2 },
      newValue: { value: 20 },
      timestamp: expect.any(Number)
    });

    subscription.unsubscribe();
  });

  it("should create and restore snapshots", () => {
    const container1 = registry.registerMutable("snap1", { value: 1 });
    const container2 = registry.registerImmutable("snap2", { items: ["a"] });

    // Create snapshot
    const snapshot = registry.snapshot();
    expect(snapshot).toEqual({
      snap1: { value: 1 },
      snap2: { items: ["a"] }
    });

    // Modify state
    container1.set({ value: 100 });
    container2.update((draft) => {
      draft.items.push("b");
    });

    expect(container1.get()).toEqual({ value: 100 });
    expect(container2.get()).toEqual({ items: ["a", "b"] });

    // Restore snapshot
    registry.restore(snapshot);

    expect(container1.get()).toEqual({ value: 1 });
    expect(container2.get()).toEqual({ items: ["a"] });
  });

  it("should clear all containers", () => {
    registry.registerMutable("clear1", { value: 1 });
    registry.registerMutable("clear2", { value: 2 });

    expect(registry.keys()).toHaveLength(2);

    registry.clear();

    expect(registry.keys()).toHaveLength(0);
    expect(registry.has("clear1")).toBe(false);
    expect(registry.has("clear2")).toBe(false);
  });
});

describe("StateSelector", () => {
  let container: MutableStateContainer<{ user: { name: string; age: number }; posts: string[] }>;
  let selector: StateSelector<any, string>;

  beforeEach(() => {
    container = new MutableStateContainer("user-data", {
      user: { name: "John", age: 30 },
      posts: ["post1", "post2"]
    });

    selector = new StateSelector(container, (state) => state.user.name);
  });

  it("should select derived state", () => {
    expect(selector.get()).toBe("John");
  });

  it("should update when selected state changes", () => {
    const subscriber = vi.fn();
    const subscription = selector.subscribe(subscriber);

    container.update((draft) => {
      draft.user.name = "Jane";
    });

    expect(subscriber).toHaveBeenCalledWith("Jane");
    expect(selector.get()).toBe("Jane");

    subscription.unsubscribe();
  });

  it("should not update when unrelated state changes", () => {
    const subscriber = vi.fn();
    const subscription = selector.subscribe(subscriber);

    // Change posts, not user name
    container.update((draft) => {
      draft.posts.push("post3");
    });

    expect(subscriber).not.toHaveBeenCalled();

    subscription.unsubscribe();
  });

  it("should use custom equality function", () => {
    const objectSelector = new StateSelector(
      container,
      (state) => ({ name: state.user.name }),
      (a, b) => a.name === b.name // Custom equality
    );

    const subscriber = vi.fn();
    const subscription = objectSelector.subscribe(subscriber);

    // Set same name (should not trigger due to custom equality)
    container.update((draft) => {
      draft.user.name = "John"; // Same value
    });

    expect(subscriber).not.toHaveBeenCalled();

    // Set different name (should trigger)
    container.update((draft) => {
      draft.user.name = "Jane";
    });

    expect(subscriber).toHaveBeenCalledWith({ name: "Jane" });

    subscription.unsubscribe();
  });
});

describe("createSelector utility", () => {
  it("should create a state selector", () => {
    const container = new MutableStateContainer("test", { count: 5 });
    const selector = createSelector(container, (state) => state.count * 2);

    expect(selector).toBeInstanceOf(StateSelector);
    expect(selector.get()).toBe(10);
  });

  it("should work with custom equality function", () => {
    const container = new MutableStateContainer("test", { items: [1, 2, 3] });
    const selector = createSelector(
      container,
      (state) => state.items.length,
      (a, b) => a === b
    );

    const subscriber = vi.fn();
    const subscription = selector.subscribe(subscriber);

    // Add item (length changes)
    container.update((draft) => {
      draft.items.push(4);
    });

    expect(subscriber).toHaveBeenCalledWith(4);

    subscription.unsubscribe();
  });
});

describe("Performance Tests", () => {
  it("should handle rapid state updates efficiently", () => {
    const registry = new StateRegistry();
    const container = registry.registerMutable("perf-test", { counter: 0 });

    const startTime = Date.now();
    const updateCount = 1000;

    for (let i = 0; i < updateCount; i++) {
      container.update((draft) => {
        draft.counter = i;
      });
    }

    const endTime = Date.now();
    const duration = endTime - startTime;

    expect(container.get().counter).toBe(updateCount - 1);
    expect(duration).toBeLessThan(100); // Should complete in under 100ms
  });

  it("should efficiently handle large state objects", () => {
    const largeState = {
      items: Array.from({ length: 10000 }, (_, i) => ({ id: i, value: `item-${i}` })),
      metadata: { version: 1, timestamp: Date.now() }
    };

    const container = new ImmutableStateContainer("large-state", largeState);

    const startTime = Date.now();

    // Update only metadata (should use structural sharing)
    container.update((draft) => {
      draft.metadata.version = 2;
    });

    const endTime = Date.now();
    const duration = endTime - startTime;

    expect(container.get().metadata.version).toBe(2);
    expect(container.get().items).toHaveLength(10000);
    expect(duration).toBeLessThan(50); // Should be fast due to structural sharing
  });
});
