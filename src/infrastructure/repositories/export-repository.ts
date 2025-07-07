/**
 * Export Repository Implementation
 *
 * Provides persistence for export aggregates
 */

import { log } from "$lib/log";
import { Export, ExportRepository, ExportSnapshot } from "../../lib/export/domain";
import { ExportStatus } from "../../shared/types";
import { EventStore } from "../event-store";

/**
 * In-memory implementation of the export repository.
 * This stores exports in memory and persists all changes as events.
 */
export class InMemoryExportRepository implements ExportRepository {
  private exports: Map<string, Export> = new Map();

  constructor(private eventStore?: EventStore) {}

  /**
   * Save an export aggregate.
   *
   * Arguments:
   * - export_: The export aggregate to save
   *
   * Returns:
   * - Promise that resolves when the export is saved
   */
  async save(export_: Export): Promise<void> {
    this.exports.set(export_.id, export_);

    // If we have an event store, persist the current state as an event
    if (this.eventStore) {
      const event = {
        id: crypto.randomUUID(),
        type: "export.saved",
        aggregateId: export_.id,
        aggregateType: "Export",
        version: 1,
        timestamp: new Date(),
        payload: export_.toSnapshot()
      };

      await this.eventStore.save(event);
    }

    log.trace("Export saved", { exportId: export_.id, status: export_.status });
  }

  /**
   * Find an export by ID.
   *
   * Arguments:
   * - id: The export ID
   *
   * Returns:
   * - The export if found, null otherwise
   */
  async findById(id: string): Promise<Export | null> {
    const export_ = this.exports.get(id);
    return export_ || null;
  }

  /**
   * Find exports by status.
   *
   * Arguments:
   * - status: The export status to filter by
   *
   * Returns:
   * - Array of exports with the specified status
   */
  async findByStatus(status: ExportStatus): Promise<Export[]> {
    const results: Export[] = [];

    for (const export_ of this.exports.values()) {
      if (export_.status === status) {
        results.push(export_);
      }
    }

    return results;
  }

  /**
   * Find all running exports.
   *
   * Returns:
   * - Array of running exports
   */
  async findRunning(): Promise<Export[]> {
    return this.findByStatus(ExportStatus.RUNNING);
  }

  /**
   * Delete an export.
   *
   * Arguments:
   * - id: The export ID to delete
   *
   * Returns:
   * - Promise that resolves when the export is deleted
   */
  async delete(id: string): Promise<void> {
    const deleted = this.exports.delete(id);

    if (deleted && this.eventStore) {
      const event = {
        id: crypto.randomUUID(),
        type: "export.deleted",
        aggregateId: id,
        aggregateType: "Export",
        version: 1,
        timestamp: new Date(),
        payload: { id }
      };

      await this.eventStore.save(event);
    }

    log.trace("Export deleted", { exportId: id, deleted });
  }

  /**
   * List exports with pagination.
   *
   * Arguments:
   * - limit: Maximum number of exports to return
   * - offset: Number of exports to skip
   *
   * Returns:
   * - Array of exports
   */
  async list(limit?: number, offset?: number): Promise<Export[]> {
    const all = Array.from(this.exports.values());
    const start = offset || 0;
    const end = limit ? start + limit : all.length;
    return all.slice(start, end);
  }

  /**
   * Clear all exports from the repository.
   * Useful for testing.
   */
  clear(): void {
    this.exports.clear();
  }
}

/**
 * Event-sourced export repository that rebuilds state from events.
 * This implementation uses event sourcing to maintain export state.
 */
export class EventSourcedExportRepository implements ExportRepository {
  private cache: Map<string, Export> = new Map();

  constructor(private eventStore: EventStore) {}

  /**
   * Save an export aggregate.
   * This saves all uncommitted events from the aggregate.
   */
  async save(export_: Export): Promise<void> {
    // In a real event-sourced implementation, we would:
    // 1. Get uncommitted events from the aggregate
    // 2. Save them to the event store
    // 3. Mark events as committed

    // For now, we'll create a snapshot event
    const event = {
      id: crypto.randomUUID(),
      type: "export.snapshot",
      aggregateId: export_.id,
      aggregateType: "Export",
      version: 1,
      timestamp: new Date(),
      payload: export_.toSnapshot()
    };

    await this.eventStore.save(event);
    this.cache.set(export_.id, export_);

    log.trace("Export saved to event store", { exportId: export_.id });
  }

  /**
   * Find an export by ID.
   * This rebuilds the aggregate from its event history.
   */
  async findById(id: string): Promise<Export | null> {
    // Check cache first
    const cached = this.cache.get(id);
    if (cached) {
      return cached;
    }

    // Rebuild from events
    const events = await this.eventStore.getEvents(id);
    if (events.length === 0) {
      return null;
    }

    // Find the latest snapshot event
    const snapshotEvent = events
      .filter((e) => e.type === "export.snapshot")
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];

    if (snapshotEvent) {
      const export_ = Export.fromSnapshot(snapshotEvent.payload as ExportSnapshot);
      this.cache.set(id, export_);
      return export_;
    }

    return null;
  }

  /**
   * Find exports by status.
   * This requires loading all exports and filtering.
   */
  async findByStatus(status: ExportStatus): Promise<Export[]> {
    // In a real implementation, we might use projections or read models
    // For now, we'll load all exports from events
    const allEvents = await this.eventStore.getAllEvents();
    const exportIds = new Set(allEvents.map((e) => e.aggregateId));

    const exports: Export[] = [];
    for (const id of exportIds) {
      const export_ = await this.findById(id);
      if (export_ && export_.status === status) {
        exports.push(export_);
      }
    }

    return exports;
  }

  /**
   * Find all running exports.
   */
  async findRunning(): Promise<Export[]> {
    return this.findByStatus(ExportStatus.RUNNING);
  }

  /**
   * Delete an export.
   * In event sourcing, we don't actually delete data, we add a deletion event.
   */
  async delete(id: string): Promise<void> {
    const event = {
      id: crypto.randomUUID(),
      type: "export.deleted",
      aggregateId: id,
      aggregateType: "Export",
      version: 1,
      timestamp: new Date(),
      payload: { id, deletedAt: new Date() }
    };

    await this.eventStore.save(event);
    this.cache.delete(id);

    log.trace("Export deletion event saved", { exportId: id });
  }

  /**
   * List exports with pagination.
   */
  async list(limit?: number, offset?: number): Promise<Export[]> {
    const allEvents = await this.eventStore.getAllEvents();

    // Get all export IDs and track which ones are deleted
    const exportIds = new Set<string>();
    const deletedIds = new Set<string>();

    for (const event of allEvents) {
      if (event.aggregateType === "Export") {
        if (event.type === "export.deleted") {
          deletedIds.add(event.aggregateId);
        } else {
          exportIds.add(event.aggregateId);
        }
      }
    }

    // Filter out deleted exports
    const activeIds = Array.from(exportIds).filter((id) => !deletedIds.has(id));

    const exports: Export[] = [];
    for (const id of activeIds) {
      const export_ = await this.findById(id);
      if (export_) {
        exports.push(export_);
      }
    }

    // Apply pagination
    const start = offset || 0;
    const end = limit ? start + limit : exports.length;
    return exports.slice(start, end);
  }

  /**
   * Clear the cache.
   * Useful for testing.
   */
  clearCache(): void {
    this.cache.clear();
  }
}
