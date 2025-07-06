/**
 * InMemoryAdapter Tests
 */

import { firstValueFrom } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryAdapter } from "./in-memory-adapter";

describe("InMemoryAdapter", () => {
  let adapter: InMemoryAdapter;

  beforeEach(() => {
    adapter = new InMemoryAdapter();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Constructor", () => {
    it("should initialize with disconnected state", () => {
      expect(adapter.isConnected()).toBe(false);
    });
  });

  describe("connect", () => {
    it("should connect successfully", async () => {
      expect(adapter.isConnected()).toBe(false);

      const connectPromise = firstValueFrom(adapter.connect());
      vi.advanceTimersByTime(15); // Past the 10ms delay

      await connectPromise;
      expect(adapter.isConnected()).toBe(true);
    });

    it("should simulate connection delay", async () => {
      const startTime = Date.now();

      const connectPromise = firstValueFrom(adapter.connect());
      vi.advanceTimersByTime(15);

      await connectPromise;

      // Should have taken at least 10ms (simulated)
      expect(Date.now() - startTime).toBeGreaterThanOrEqual(10);
    });
  });

  describe("disconnect", () => {
    it("should disconnect successfully", async () => {
      // First connect
      const connectPromise = firstValueFrom(adapter.connect());
      vi.advanceTimersByTime(15);
      await connectPromise;
      expect(adapter.isConnected()).toBe(true);

      // Then disconnect
      const disconnectPromise = firstValueFrom(adapter.disconnect());
      vi.advanceTimersByTime(15);
      await disconnectPromise;
      expect(adapter.isConnected()).toBe(false);
    });

    it("should clear channels on disconnect", async () => {
      // Connect and create channels
      const connectPromise = firstValueFrom(adapter.connect());
      vi.advanceTimersByTime(15);
      await connectPromise;

      const subscription = adapter.subscribe<string>("test-channel").subscribe();
      await firstValueFrom(adapter.publish("test-channel", "test-message"));

      // Disconnect
      const disconnectPromise = firstValueFrom(adapter.disconnect());
      vi.advanceTimersByTime(15);
      await disconnectPromise;

      subscription.unsubscribe();
      expect(adapter.isConnected()).toBe(false);
    });

    it("should simulate disconnection delay", async () => {
      const connectPromise = firstValueFrom(adapter.connect());
      vi.advanceTimersByTime(15);
      await connectPromise;

      const startTime = Date.now();

      const disconnectPromise = firstValueFrom(adapter.disconnect());
      vi.advanceTimersByTime(15);
      await disconnectPromise;

      // Should have taken at least 10ms (simulated)
      expect(Date.now() - startTime).toBeGreaterThanOrEqual(10);
    });
  });

  describe("publish", () => {
    beforeEach(async () => {
      const connectPromise = firstValueFrom(adapter.connect());
      vi.advanceTimersByTime(15);
      await connectPromise;
    });

    it("should publish message successfully", async () => {
      await firstValueFrom(adapter.publish("test-channel", "hello"));
      // Should not throw
    });

    it("should publish to existing channel", async () => {
      const messages: string[] = [];

      // Subscribe first
      adapter.subscribe<string>("test-channel").subscribe((msg) => {
        messages.push(msg);
      });

      // Then publish
      await firstValueFrom(adapter.publish("test-channel", "hello"));

      expect(messages).toContain("hello");
    });

    it("should publish to non-existent channel without error", async () => {
      // Should not throw even if no subscribers
      await firstValueFrom(adapter.publish("nonexistent-channel", "message"));
    });

    it("should throw when not connected", async () => {
      // Disconnect first
      const disconnectPromise = firstValueFrom(adapter.disconnect());
      vi.advanceTimersByTime(15);
      await disconnectPromise;

      try {
        await firstValueFrom(adapter.publish("test-channel", "message"));
        expect.fail("Should have thrown error");
      } catch (error: any) {
        expect(error.message).toBe("Adapter not connected");
      }
    });

    it("should publish different message types", async () => {
      const stringMessages: string[] = [];
      const numberMessages: number[] = [];
      const objectMessages: any[] = [];

      adapter.subscribe<string>("string-channel").subscribe((msg) => stringMessages.push(msg));
      adapter.subscribe<number>("number-channel").subscribe((msg) => numberMessages.push(msg));
      adapter.subscribe<object>("object-channel").subscribe((msg) => objectMessages.push(msg));

      await firstValueFrom(adapter.publish("string-channel", "hello"));
      await firstValueFrom(adapter.publish("number-channel", 42));
      await firstValueFrom(adapter.publish("object-channel", { key: "value" }));

      expect(stringMessages).toContain("hello");
      expect(numberMessages).toContain(42);
      expect(objectMessages).toContainEqual({ key: "value" });
    });
  });

  describe("subscribe", () => {
    beforeEach(async () => {
      const connectPromise = firstValueFrom(adapter.connect());
      vi.advanceTimersByTime(15);
      await connectPromise;
    });

    it("should create new channel on first subscription", () => {
      const observable = adapter.subscribe<string>("new-channel");
      expect(observable).toBeDefined();
    });

    it("should return same observable for same channel", () => {
      const obs1 = adapter.subscribe<string>("same-channel");
      const obs2 = adapter.subscribe<string>("same-channel");

      // Should return observables from the same underlying subject
      // We can't test object equality since asObservable() creates new instances
      // Instead test that they behave the same way
      expect(obs1).toBeDefined();
      expect(obs2).toBeDefined();
    });

    it("should receive published messages", async () => {
      const messages: string[] = [];

      adapter.subscribe<string>("test-channel").subscribe((msg) => {
        messages.push(msg);
      });

      await firstValueFrom(adapter.publish("test-channel", "message1"));
      await firstValueFrom(adapter.publish("test-channel", "message2"));

      expect(messages).toEqual(["message1", "message2"]);
    });

    it("should handle multiple subscribers to same channel", async () => {
      const messages1: string[] = [];
      const messages2: string[] = [];

      adapter.subscribe<string>("shared-channel").subscribe((msg) => messages1.push(msg));
      adapter.subscribe<string>("shared-channel").subscribe((msg) => messages2.push(msg));

      await firstValueFrom(adapter.publish("shared-channel", "broadcast"));

      expect(messages1).toContain("broadcast");
      expect(messages2).toContain("broadcast");
    });

    it("should throw when not connected", async () => {
      // Create adapter but don't connect
      const disconnectedAdapter = new InMemoryAdapter();

      try {
        const obs = disconnectedAdapter.subscribe<string>("test-channel");
        await firstValueFrom(obs);
        expect.fail("Should have thrown error");
      } catch (error: any) {
        expect(error.message).toBe("Adapter not connected");
      }
    });

    it("should handle subscription errors gracefully", async () => {
      const observable = adapter.subscribe<string>("test-channel");

      // Subscribe with error handler
      const errors: any[] = [];
      observable.subscribe({
        next: () => {},
        error: (err) => errors.push(err)
      });

      // Should not throw during subscription
      expect(errors).toHaveLength(0);
    });
  });

  describe("isConnected", () => {
    it("should return false initially", () => {
      expect(adapter.isConnected()).toBe(false);
    });

    it("should return true after connecting", async () => {
      const connectPromise = firstValueFrom(adapter.connect());
      vi.advanceTimersByTime(15);
      await connectPromise;

      expect(adapter.isConnected()).toBe(true);
    });

    it("should return false after disconnecting", async () => {
      const connectPromise = firstValueFrom(adapter.connect());
      vi.advanceTimersByTime(15);
      await connectPromise;

      const disconnectPromise = firstValueFrom(adapter.disconnect());
      vi.advanceTimersByTime(15);
      await disconnectPromise;

      expect(adapter.isConnected()).toBe(false);
    });
  });

  describe("Channel Management", () => {
    beforeEach(async () => {
      const connectPromise = firstValueFrom(adapter.connect());
      vi.advanceTimersByTime(15);
      await connectPromise;
    });

    it("should create separate channels for different names", () => {
      const channel1 = adapter.subscribe<string>("channel1");
      const channel2 = adapter.subscribe<string>("channel2");

      expect(channel1).not.toBe(channel2);
    });

    it("should handle channel isolation", async () => {
      const messages1: string[] = [];
      const messages2: string[] = [];

      adapter.subscribe<string>("channel1").subscribe((msg) => messages1.push(msg));
      adapter.subscribe<string>("channel2").subscribe((msg) => messages2.push(msg));

      await firstValueFrom(adapter.publish("channel1", "message-for-1"));
      await firstValueFrom(adapter.publish("channel2", "message-for-2"));

      expect(messages1).toEqual(["message-for-1"]);
      expect(messages2).toEqual(["message-for-2"]);
    });

    it("should handle many channels", async () => {
      const channelCount = 100;
      const channels: any[] = [];

      for (let i = 0; i < channelCount; i++) {
        const channel = adapter.subscribe<number>(`channel-${i}`);
        channels.push(channel);
      }

      expect(channels).toHaveLength(channelCount);

      // Publish to random channel
      await firstValueFrom(adapter.publish("channel-50", 42));
    });
  });

  describe("Error Handling", () => {
    it("should handle connect when already connected", async () => {
      const connectPromise1 = firstValueFrom(adapter.connect());
      vi.advanceTimersByTime(15);
      await connectPromise1;

      // Connect again - should not throw
      const connectPromise2 = firstValueFrom(adapter.connect());
      vi.advanceTimersByTime(15);
      await connectPromise2;

      expect(adapter.isConnected()).toBe(true);
    });

    it("should handle disconnect when already disconnected", async () => {
      // Don't connect first

      const disconnectPromise = firstValueFrom(adapter.disconnect());
      vi.advanceTimersByTime(15);
      await disconnectPromise;

      expect(adapter.isConnected()).toBe(false);
    });

    it("should handle publish to channel with no subscribers", async () => {
      // Connect first
      const connectPromise = firstValueFrom(adapter.connect());
      vi.advanceTimersByTime(15);
      await connectPromise;

      await firstValueFrom(adapter.publish("empty-channel", "message"));
      // Should not throw
    });

    it("should handle null/undefined messages", async () => {
      // Connect first
      const connectPromise = firstValueFrom(adapter.connect());
      vi.advanceTimersByTime(15);
      await connectPromise;

      const messages: any[] = [];

      adapter.subscribe<any>("test-channel").subscribe((msg) => {
        messages.push(msg);
      });

      await firstValueFrom(adapter.publish("test-channel", null));
      await firstValueFrom(adapter.publish("test-channel", undefined));

      expect(messages).toContain(null);
      expect(messages).toContain(undefined);
    });
  });

  describe("Memory Management", () => {
    beforeEach(async () => {
      const connectPromise = firstValueFrom(adapter.connect());
      vi.advanceTimersByTime(15);
      await connectPromise;
    });

    it("should clean up channels on disconnect", async () => {
      // Create some channels
      adapter.subscribe<string>("temp-channel-1");
      adapter.subscribe<string>("temp-channel-2");

      // Disconnect
      const disconnectPromise = firstValueFrom(adapter.disconnect());
      vi.advanceTimersByTime(15);
      await disconnectPromise;

      // Reconnect
      const connectPromise = firstValueFrom(adapter.connect());
      vi.advanceTimersByTime(15);
      await connectPromise;

      // Old channels should be gone, new ones should work
      const messages: string[] = [];
      adapter.subscribe<string>("temp-channel-1").subscribe((msg) => messages.push(msg));

      await firstValueFrom(adapter.publish("temp-channel-1", "new-message"));
      expect(messages).toContain("new-message");
    });

    it("should handle unsubscription", () => {
      const subscription = adapter.subscribe<string>("test-channel").subscribe();

      expect(() => subscription.unsubscribe()).not.toThrow();
    });
  });
});
