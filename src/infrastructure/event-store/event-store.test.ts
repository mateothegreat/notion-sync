/**
 * Event Store Tests
 *
 * Tests for event store implementations
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { DomainEvent } from "../../shared/types";
import { EventStoreWithPublishing, InMemoryEventStore } from "./index";

describe("InMemoryEventStore", () => {
  let store: InMemoryEventStore;

  beforeEach(() => {
    store = new InMemoryEventStore();
  });

  describe("save", () => {
    it("should save an event", async () => {
      const event: DomainEvent = {
        id: "123",
        type: "export.started",
        aggregateId: "export-1",
        aggregateType: "Export",
        version: 1,
        timestamp: new Date(),
        payload: { exportId: "export-1" }
      };

      await store.save(event);
      const events = await store.getAllEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual(event);
    });

    it("should save multiple events for the same aggregate", async () => {
      const event1: DomainEvent = {
        id: "123",
        type: "export.started",
        aggregateId: "export-1",
        aggregateType: "Export",
        version: 1,
        timestamp: new Date(),
        payload: { exportId: "export-1" }
      };

      const event2: DomainEvent = {
        id: "124",
        type: "export.completed",
        aggregateId: "export-1",
        aggregateType: "Export",
        version: 2,
        timestamp: new Date(),
        payload: { exportId: "export-1" }
      };

      await store.save(event1);
      await store.save(event2);

      const events = await store.getEvents("export-1");
      expect(events).toHaveLength(2);
      expect(events[0]).toEqual(event1);
      expect(events[1]).toEqual(event2);
    });
  });

  describe("getEvents", () => {
    it("should return events for a specific aggregate", async () => {
      const event1: DomainEvent = {
        id: "123",
        type: "export.started",
        aggregateId: "export-1",
        aggregateType: "Export",
        version: 1,
        timestamp: new Date(),
        payload: { exportId: "export-1" }
      };

      const event2: DomainEvent = {
        id: "124",
        type: "export.started",
        aggregateId: "export-2",
        aggregateType: "Export",
        version: 1,
        timestamp: new Date(),
        payload: { exportId: "export-2" }
      };

      await store.save(event1);
      await store.save(event2);

      const events = await store.getEvents("export-1");
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual(event1);
    });

    it("should return events from a specific version", async () => {
      const event1: DomainEvent = {
        id: "123",
        type: "export.started",
        aggregateId: "export-1",
        aggregateType: "Export",
        version: 1,
        timestamp: new Date(),
        payload: { exportId: "export-1" }
      };

      const event2: DomainEvent = {
        id: "124",
        type: "export.progress.updated",
        aggregateId: "export-1",
        aggregateType: "Export",
        version: 2,
        timestamp: new Date(),
        payload: { exportId: "export-1" }
      };

      const event3: DomainEvent = {
        id: "125",
        type: "export.completed",
        aggregateId: "export-1",
        aggregateType: "Export",
        version: 3,
        timestamp: new Date(),
        payload: { exportId: "export-1" }
      };

      await store.save(event1);
      await store.save(event2);
      await store.save(event3);

      const events = await store.getEvents("export-1", 2);
      expect(events).toHaveLength(2);
      expect(events[0]).toEqual(event2);
      expect(events[1]).toEqual(event3);
    });

    it("should return empty array for non-existent aggregate", async () => {
      const events = await store.getEvents("non-existent");
      expect(events).toHaveLength(0);
    });
  });

  describe("getAllEvents", () => {
    it("should return all events in the store", async () => {
      const event1: DomainEvent = {
        id: "123",
        type: "export.started",
        aggregateId: "export-1",
        aggregateType: "Export",
        version: 1,
        timestamp: new Date(),
        payload: { exportId: "export-1" }
      };

      const event2: DomainEvent = {
        id: "124",
        type: "export.started",
        aggregateId: "export-2",
        aggregateType: "Export",
        version: 1,
        timestamp: new Date(),
        payload: { exportId: "export-2" }
      };

      await store.save(event1);
      await store.save(event2);

      const events = await store.getAllEvents();
      expect(events).toHaveLength(2);
      expect(events).toContainEqual(event1);
      expect(events).toContainEqual(event2);
    });
  });

  describe("clear", () => {
    it("should clear all events from the store", async () => {
      const event: DomainEvent = {
        id: "123",
        type: "export.started",
        aggregateId: "export-1",
        aggregateType: "Export",
        version: 1,
        timestamp: new Date(),
        payload: { exportId: "export-1" }
      };

      await store.save(event);
      expect(await store.getAllEvents()).toHaveLength(1);

      store.clear();
      expect(await store.getAllEvents()).toHaveLength(0);
      expect(await store.getEvents("export-1")).toHaveLength(0);
    });
  });
});

describe("EventStoreWithPublishing", () => {
  let baseStore: InMemoryEventStore;
  let publishEvent: ReturnType<typeof vi.fn>;
  let store: EventStoreWithPublishing;

  beforeEach(() => {
    baseStore = new InMemoryEventStore();
    publishEvent = vi.fn().mockResolvedValue(undefined);
    store = new EventStoreWithPublishing(baseStore, publishEvent);
  });

  describe("save", () => {
    it("should save event and publish it", async () => {
      const event: DomainEvent = {
        id: "123",
        type: "export.started",
        aggregateId: "export-1",
        aggregateType: "Export",
        version: 1,
        timestamp: new Date(),
        payload: { exportId: "export-1" }
      };

      await store.save(event);

      // Check that event was saved
      const events = await baseStore.getAllEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual(event);

      // Check that event was published
      expect(publishEvent).toHaveBeenCalledWith(event);
    });

    it("should not publish if save fails", async () => {
      const error = new Error("Save failed");
      vi.spyOn(baseStore, "save").mockRejectedValue(error);

      const event: DomainEvent = {
        id: "123",
        type: "export.started",
        aggregateId: "export-1",
        aggregateType: "Export",
        version: 1,
        timestamp: new Date(),
        payload: { exportId: "export-1" }
      };

      await expect(store.save(event)).rejects.toThrow(error);
      expect(publishEvent).not.toHaveBeenCalled();
    });
  });

  describe("getEvents", () => {
    it("should delegate to base store", async () => {
      const event: DomainEvent = {
        id: "123",
        type: "export.started",
        aggregateId: "export-1",
        aggregateType: "Export",
        version: 1,
        timestamp: new Date(),
        payload: { exportId: "export-1" }
      };

      await baseStore.save(event);
      const events = await store.getEvents("export-1");
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual(event);
    });
  });

  describe("getAllEvents", () => {
    it("should delegate to base store", async () => {
      const event: DomainEvent = {
        id: "123",
        type: "export.started",
        aggregateId: "export-1",
        aggregateType: "Export",
        version: 1,
        timestamp: new Date(),
        payload: { exportId: "export-1" }
      };

      await baseStore.save(event);
      const events = await store.getAllEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual(event);
    });
  });
});
