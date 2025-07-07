/**
 * Export Repository Tests
 *
 * Tests for export repository implementations
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExportFactory } from "../../core/domain/export";
import { ExportFormat, ExportStatus } from "../../shared/types";
import { InMemoryEventStore } from "../event-store";
import { EventSourcedExportRepository, InMemoryExportRepository } from "./export-repository";

describe("InMemoryExportRepository", () => {
  let repository: InMemoryExportRepository;
  let eventStore: InMemoryEventStore;

  beforeEach(() => {
    eventStore = new InMemoryEventStore();
    repository = new InMemoryExportRepository(eventStore);
  });

  describe("save", () => {
    it("should save an export", async () => {
      const exportConfig = {
        outputPath: "/tmp/export",
        format: ExportFormat.JSON,
        includeBlocks: true,
        includeComments: true,
        includeProperties: true,
        databases: ["db1"],
        pages: ["page1"]
      };

      const export_ = ExportFactory.create(exportConfig);

      await repository.save(export_);

      const found = await repository.findById(export_.id);
      expect(found).toEqual(export_);
    });

    it("should persist export as event when event store is provided", async () => {
      const exportConfig = {
        outputPath: "/tmp/export",
        format: ExportFormat.JSON,
        includeBlocks: true,
        includeComments: true,
        includeProperties: true,
        databases: ["db1"],
        pages: ["page1"]
      };

      const export_ = ExportFactory.create(exportConfig);

      await repository.save(export_);

      const events = await eventStore.getEvents(export_.id);
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("export.saved");
      expect(events[0].aggregateId).toBe(export_.id);
    });
  });

  describe("findById", () => {
    it("should find an export by id", async () => {
      const exportConfig = {
        outputPath: "/tmp/export",
        format: ExportFormat.JSON,
        includeBlocks: true,
        includeComments: true,
        includeProperties: true,
        databases: ["db1"],
        pages: ["page1"]
      };

      const export_ = ExportFactory.create(exportConfig);
      await repository.save(export_);

      const found = await repository.findById(export_.id);
      expect(found).toEqual(export_);
    });

    it("should return null for non-existent id", async () => {
      const found = await repository.findById("non-existent");
      expect(found).toBeNull();
    });
  });

  describe("findByStatus", () => {
    it("should find exports by status", async () => {
      const exportConfig = {
        outputPath: "/tmp/export",
        format: ExportFormat.JSON,
        includeBlocks: true,
        includeComments: true,
        includeProperties: true,
        databases: ["db1"],
        pages: ["page1"]
      };

      const export1 = ExportFactory.create(exportConfig);
      const export2 = ExportFactory.create({ ...exportConfig, outputPath: "/tmp/export2" });
      const export3 = ExportFactory.create({ ...exportConfig, outputPath: "/tmp/export3" });

      export1.start();
      export2.start();
      // export3 remains in PENDING status

      await repository.save(export1);
      await repository.save(export2);
      await repository.save(export3);

      const runningExports = await repository.findByStatus(ExportStatus.RUNNING);
      expect(runningExports).toHaveLength(2);
      expect(runningExports).toContainEqual(export1);
      expect(runningExports).toContainEqual(export2);

      const pendingExports = await repository.findByStatus(ExportStatus.PENDING);
      expect(pendingExports).toHaveLength(1);
      expect(pendingExports).toContainEqual(export3);
    });
  });

  describe("findRunning", () => {
    it("should find all running exports", async () => {
      const exportConfig = {
        outputPath: "/tmp/export",
        format: ExportFormat.JSON,
        includeBlocks: true,
        includeComments: true,
        includeProperties: true,
        databases: ["db1"],
        pages: ["page1"]
      };

      const export1 = ExportFactory.create(exportConfig);
      const export2 = ExportFactory.create({ ...exportConfig, outputPath: "/tmp/export2" });

      export1.start();

      await repository.save(export1);
      await repository.save(export2);

      const runningExports = await repository.findRunning();
      expect(runningExports).toHaveLength(1);
      expect(runningExports[0]).toEqual(export1);
    });
  });

  describe("delete", () => {
    it("should delete an export", async () => {
      const exportConfig = {
        outputPath: "/tmp/export",
        format: ExportFormat.JSON,
        includeBlocks: true,
        includeComments: true,
        includeProperties: true,
        databases: ["db1"],
        pages: ["page1"]
      };

      const export_ = ExportFactory.create(exportConfig);
      await repository.save(export_);

      await repository.delete(export_.id);

      const found = await repository.findById(export_.id);
      expect(found).toBeNull();
    });

    it("should persist deletion as event", async () => {
      const exportConfig = {
        outputPath: "/tmp/export",
        format: ExportFormat.JSON,
        includeBlocks: true,
        includeComments: true,
        includeProperties: true,
        databases: ["db1"],
        pages: ["page1"]
      };

      const export_ = ExportFactory.create(exportConfig);
      await repository.save(export_);

      await repository.delete(export_.id);

      const events = await eventStore.getEvents(export_.id);
      expect(events).toHaveLength(2);
      expect(events[1].type).toBe("export.deleted");
    });
  });

  describe("list", () => {
    it("should list all exports", async () => {
      const exportConfig = {
        outputPath: "/tmp/export",
        format: ExportFormat.JSON,
        includeBlocks: true,
        includeComments: true,
        includeProperties: true,
        databases: ["db1"],
        pages: ["page1"]
      };

      const export1 = ExportFactory.create(exportConfig);
      const export2 = ExportFactory.create({ ...exportConfig, outputPath: "/tmp/export2" });
      const export3 = ExportFactory.create({ ...exportConfig, outputPath: "/tmp/export3" });

      await repository.save(export1);
      await repository.save(export2);
      await repository.save(export3);

      const exports = await repository.list();
      expect(exports).toHaveLength(3);
      expect(exports).toContainEqual(export1);
      expect(exports).toContainEqual(export2);
      expect(exports).toContainEqual(export3);
    });

    it("should support pagination", async () => {
      const exportConfig = {
        outputPath: "/tmp/export",
        format: ExportFormat.JSON,
        includeBlocks: true,
        includeComments: true,
        includeProperties: true,
        databases: ["db1"],
        pages: ["page1"]
      };

      // Create 5 exports
      for (let i = 0; i < 5; i++) {
        const export_ = ExportFactory.create({ ...exportConfig, outputPath: `/tmp/export${i}` });
        await repository.save(export_);
      }

      // Get first 2
      const page1 = await repository.list(2, 0);
      expect(page1).toHaveLength(2);

      // Get next 2
      const page2 = await repository.list(2, 2);
      expect(page2).toHaveLength(2);

      // Get last 1
      const page3 = await repository.list(2, 4);
      expect(page3).toHaveLength(1);
    });
  });

  describe("clear", () => {
    it("should clear all exports", async () => {
      const exportConfig = {
        outputPath: "/tmp/export",
        format: ExportFormat.JSON,
        includeBlocks: true,
        includeComments: true,
        includeProperties: true,
        databases: ["db1"],
        pages: ["page1"]
      };

      const export1 = ExportFactory.create(exportConfig);
      const export2 = ExportFactory.create({ ...exportConfig, outputPath: "/tmp/export2" });

      await repository.save(export1);
      await repository.save(export2);

      repository.clear();

      const exports = await repository.list();
      expect(exports).toHaveLength(0);
    });
  });
});

describe("EventSourcedExportRepository", () => {
  let repository: EventSourcedExportRepository;
  let eventStore: InMemoryEventStore;

  beforeEach(() => {
    eventStore = new InMemoryEventStore();
    repository = new EventSourcedExportRepository(eventStore);
  });

  describe("save", () => {
    it("should save export as snapshot event", async () => {
      const exportConfig = {
        outputPath: "/tmp/export",
        format: ExportFormat.JSON,
        includeBlocks: true,
        includeComments: true,
        includeProperties: true,
        databases: ["db1"],
        pages: ["page1"]
      };

      const export_ = ExportFactory.create(exportConfig);

      await repository.save(export_);

      const events = await eventStore.getEvents(export_.id);
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("export.snapshot");
      expect(events[0].payload).toEqual(export_.toSnapshot());
    });
  });

  describe("findById", () => {
    it("should rebuild export from snapshot event", async () => {
      const exportConfig = {
        outputPath: "/tmp/export",
        format: ExportFormat.JSON,
        includeBlocks: true,
        includeComments: true,
        includeProperties: true,
        databases: ["db1"],
        pages: ["page1"]
      };

      const export_ = ExportFactory.create(exportConfig);
      await repository.save(export_);

      // Clear cache to force rebuild from events
      repository.clearCache();

      const found = await repository.findById(export_.id);
      expect(found).toBeDefined();
      expect(found?.id).toBe(export_.id);
      expect(found?.configuration).toEqual(export_.configuration);
    });

    it("should return cached export if available", async () => {
      const exportConfig = {
        outputPath: "/tmp/export",
        format: ExportFormat.JSON,
        includeBlocks: true,
        includeComments: true,
        includeProperties: true,
        databases: ["db1"],
        pages: ["page1"]
      };

      const export_ = ExportFactory.create(exportConfig);
      await repository.save(export_);

      // Spy on eventStore to ensure it's not called
      const getEventsSpy = vi.spyOn(eventStore, "getEvents");

      const found = await repository.findById(export_.id);
      expect(found).toEqual(export_);
      expect(getEventsSpy).not.toHaveBeenCalled();
    });

    it("should return null for non-existent export", async () => {
      const found = await repository.findById("non-existent");
      expect(found).toBeNull();
    });
  });

  describe("delete", () => {
    it("should save deletion event", async () => {
      const exportConfig = {
        outputPath: "/tmp/export",
        format: ExportFormat.JSON,
        includeBlocks: true,
        includeComments: true,
        includeProperties: true,
        databases: ["db1"],
        pages: ["page1"]
      };

      const export_ = ExportFactory.create(exportConfig);
      await repository.save(export_);

      await repository.delete(export_.id);

      const events = await eventStore.getEvents(export_.id);
      expect(events).toHaveLength(2);
      expect(events[1].type).toBe("export.deleted");
      expect(events[1].payload).toHaveProperty("deletedAt");
    });

    it("should remove from cache", async () => {
      const exportConfig = {
        outputPath: "/tmp/export",
        format: ExportFormat.JSON,
        includeBlocks: true,
        includeComments: true,
        includeProperties: true,
        databases: ["db1"],
        pages: ["page1"]
      };

      const export_ = ExportFactory.create(exportConfig);
      await repository.save(export_);

      await repository.delete(export_.id);

      // Try to find from cache (without rebuilding from events)
      const getEventsSpy = vi.spyOn(eventStore, "getEvents");
      const found = await repository.findById(export_.id);

      // Should have called getEvents since it's not in cache
      expect(getEventsSpy).toHaveBeenCalledWith(export_.id);
    });
  });

  describe("list", () => {
    it("should list all non-deleted exports", async () => {
      const exportConfig = {
        outputPath: "/tmp/export",
        format: ExportFormat.JSON,
        includeBlocks: true,
        includeComments: true,
        includeProperties: true,
        databases: ["db1"],
        pages: ["page1"]
      };

      const export1 = ExportFactory.create(exportConfig);
      const export2 = ExportFactory.create({ ...exportConfig, outputPath: "/tmp/export2" });
      const export3 = ExportFactory.create({ ...exportConfig, outputPath: "/tmp/export3" });

      await repository.save(export1);
      await repository.save(export2);
      await repository.save(export3);

      // Delete export2
      await repository.delete(export2.id);

      const exports = await repository.list();
      expect(exports).toHaveLength(2);
      expect(exports.map((e) => e.id)).toContain(export1.id);
      expect(exports.map((e) => e.id)).toContain(export3.id);
      expect(exports.map((e) => e.id)).not.toContain(export2.id);
    });
  });
});
