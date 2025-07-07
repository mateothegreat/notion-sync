/**
 * Event Store Infrastructure
 *
 * Provides persistence for domain events with proper event sourcing support
 */

import { DomainEvent } from "../../shared/types";

/**
 * Event store interface for persisting and retrieving domain events.
 *
 * Arguments:
 * - event: The domain event to persist
 * - aggregateId: The ID of the aggregate that the events belong to
 * - fromVersion: The version to start reading events from
 *
 * Returns:
 * - save: Promise that resolves when the event is persisted
 * - getEvents: Promise that resolves to an array of events for the aggregate
 * - getAllEvents: Promise that resolves to all events in the store
 */
export interface EventStore {
  save(event: DomainEvent): Promise<void>;
  getEvents(aggregateId: string, fromVersion?: number): Promise<DomainEvent[]>;
  getAllEvents(): Promise<DomainEvent[]>;
}

/**
 * In-memory implementation of the event store.
 * This is suitable for development and testing, but should be replaced
 * with a persistent store (e.g., PostgreSQL, EventStore) in production.
 */
export class InMemoryEventStore implements EventStore {
  private events: DomainEvent[] = [];
  private eventsByAggregate: Map<string, DomainEvent[]> = new Map();

  async save(event: DomainEvent): Promise<void> {
    this.events.push(event);

    const aggregateEvents = this.eventsByAggregate.get(event.aggregateId) || [];
    aggregateEvents.push(event);
    this.eventsByAggregate.set(event.aggregateId, aggregateEvents);
  }

  async getEvents(aggregateId: string, fromVersion?: number): Promise<DomainEvent[]> {
    const events = this.eventsByAggregate.get(aggregateId) || [];

    if (fromVersion !== undefined) {
      return events.filter((event) => event.version >= fromVersion);
    }

    return events;
  }

  async getAllEvents(): Promise<DomainEvent[]> {
    return [...this.events];
  }

  /**
   * Clear all events from the store.
   * Useful for testing.
   */
  clear(): void {
    this.events = [];
    this.eventsByAggregate.clear();
  }
}

/**
 * Event store with control plane integration.
 * Publishes events to the control plane after persisting them.
 */
export class EventStoreWithPublishing implements EventStore {
  constructor(private baseStore: EventStore, private publishEvent: (event: DomainEvent) => Promise<void>) {}

  async save(event: DomainEvent): Promise<void> {
    // First persist the event
    await this.baseStore.save(event);

    // Then publish it to the control plane
    await this.publishEvent(event);
  }

  async getEvents(aggregateId: string, fromVersion?: number): Promise<DomainEvent[]> {
    return this.baseStore.getEvents(aggregateId, fromVersion);
  }

  async getAllEvents(): Promise<DomainEvent[]> {
    return this.baseStore.getAllEvents();
  }
}
