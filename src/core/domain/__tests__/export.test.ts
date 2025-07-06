/**
 * Export Domain Model Tests
 *
 * Tests core business logic and state transitions
 */
import { beforeEach, describe, expect, it } from "vitest";
import { ExportFormat, ExportStatus } from "../../../shared/types";
import { Export, ExportFactory } from "../export";

describe("Export Domain Model", () => {
  let export_: Export;

  beforeEach(() => {
    const config = {
      outputPath: "/test/path",
      format: ExportFormat.JSON,
      includeBlocks: true,
      includeComments: true,
      includeProperties: true,
      databases: ["db1", "db2"],
      pages: ["page1"]
    };
    export_ = ExportFactory.create(config);
  });

  describe("creation and validation", () => {
    it("should create export with valid configuration", () => {
      expect(export_.id).toBeDefined();
      expect(export_.status).toBe(ExportStatus.PENDING);
      expect(export_.configuration.databases).toEqual(["db1", "db2"]);
      expect(export_.configuration.pages).toEqual(["page1"]);
    });

    it("should validate required output path", () => {
      expect(() => {
        ExportFactory.create({
          outputPath: "",
          format: ExportFormat.JSON,
          includeBlocks: true,
          includeComments: true,
          includeProperties: true,
          databases: ["db1"],
          pages: []
        });
      }).toThrow("Output path is required");
    });

    it("should validate at least one database or page", () => {
      expect(() => {
        ExportFactory.create({
          outputPath: "/test",
          format: ExportFormat.JSON,
          includeBlocks: true,
          includeComments: true,
          includeProperties: true,
          databases: [],
          pages: []
        });
      }).toThrow("At least one database or page must be specified");
    });

    it("should validate export format", () => {
      expect(() => {
        ExportFactory.create({
          outputPath: "/test",
          format: "invalid" as any,
          includeBlocks: true,
          includeComments: true,
          includeProperties: true,
          databases: ["db1"],
          pages: []
        });
      }).toThrow("Invalid export format");
    });
  });

  describe("state transitions", () => {
    it("should transition from PENDING to RUNNING", () => {
      export_.start();
      expect(export_.status).toBe(ExportStatus.RUNNING);
      expect(export_.startedAt).toBeDefined();
      expect(export_.updatedAt).toBeInstanceOf(Date);
    });

    it("should prevent starting non-pending export", () => {
      export_.start();
      expect(() => export_.start()).toThrow("Cannot start export in running status");
    });

    it("should complete running export", () => {
      export_.start();
      export_.complete("/output/path");

      expect(export_.status).toBe(ExportStatus.COMPLETED);
      expect(export_.outputPath).toBe("/output/path");
      expect(export_.completedAt).toBeDefined();
      expect(export_.progress.percentage).toBe(100);
    });

    it("should fail running export", () => {
      export_.start();
      const error = {
        id: "err-1",
        message: "Test error",
        code: "TEST_ERROR",
        timestamp: new Date(),
        context: { test: true }
      };

      export_.fail(error);

      expect(export_.status).toBe(ExportStatus.FAILED);
      expect(export_.error).toEqual(error);
      expect(export_.completedAt).toBeDefined();
    });

    it("should cancel running export", () => {
      export_.start();
      export_.cancel("User requested");

      expect(export_.status).toBe(ExportStatus.CANCELLED);
      expect(export_.error?.message).toContain("User requested");
      expect(export_.completedAt).toBeDefined();
    });
  });

  describe("progress tracking", () => {
    it("should update progress correctly", () => {
      export_.start();
      export_.updateProgress({
        processed: 50,
        total: 100,
        currentOperation: "processing"
      });

      expect(export_.progress.processed).toBe(50);
      expect(export_.progress.total).toBe(100);
      expect(export_.progress.percentage).toBe(50);
      expect(export_.progress.currentOperation).toBe("processing");
    });

    it("should calculate ETA with sufficient data", () => {
      export_.start();

      // Simulate processing over time
      export_.updateProgress({
        processed: 25,
        total: 100,
        currentOperation: "processing"
      });

      expect(export_.progress.estimatedCompletion).toBeDefined();
    });

    it("should add errors to progress", () => {
      const error = {
        id: "err-1",
        message: "Test error",
        code: "TEST_ERROR",
        timestamp: new Date()
      };

      export_.addError(error);

      expect(export_.progress.errors).toContain(error);
      expect(export_.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe("utility methods", () => {
    it("should calculate duration correctly", () => {
      export_.start();

      // Mock time passage
      const originalStartedAt = export_.startedAt!;
      const mockCompletedAt = new Date(originalStartedAt.getTime() + 5000);
      (export_ as any).completedAt = mockCompletedAt;

      expect(export_.getDuration()).toBe(5000);
    });

    it("should return null duration if not started", () => {
      expect(export_.getDuration()).toBeNull();
    });

    it("should calculate success rate", () => {
      export_.start();
      export_.updateProgress({
        processed: 90,
        total: 100,
        currentOperation: "processing"
      });

      // Add some errors
      export_.addError({
        id: "err-1",
        message: "Error 1",
        code: "ERROR",
        timestamp: new Date()
      });

      expect(export_.getSuccessRate()).toBe(0.89); // 89/100
    });

    it("should identify running exports", () => {
      expect(export_.isRunning()).toBe(false);

      export_.start();
      expect(export_.isRunning()).toBe(true);

      export_.complete("/path");
      expect(export_.isRunning()).toBe(false);
    });

    it("should identify completed exports", () => {
      expect(export_.isCompleted()).toBe(false);

      export_.start();
      expect(export_.isCompleted()).toBe(false);

      export_.complete("/path");
      expect(export_.isCompleted()).toBe(true);
    });

    it("should determine restart eligibility", () => {
      expect(export_.canBeRestarted()).toBe(false);

      export_.start();
      const error = {
        id: "err-1",
        message: "Test error",
        code: "TEST_ERROR",
        timestamp: new Date()
      };
      export_.fail(error);

      expect(export_.canBeRestarted()).toBe(true);

      // Completed exports cannot be restarted
      const completedExport = ExportFactory.create({
        outputPath: "/test",
        format: ExportFormat.JSON,
        includeBlocks: true,
        includeComments: true,
        includeProperties: true,
        databases: ["db1"],
        pages: []
      });
      completedExport.start();
      completedExport.complete("/path");

      expect(completedExport.canBeRestarted()).toBe(false);
    });
  });

  describe("snapshots", () => {
    it("should create snapshot correctly", () => {
      export_.start();
      export_.updateProgress({
        processed: 50,
        total: 100,
        currentOperation: "processing"
      });

      const snapshot = export_.toSnapshot();

      expect(snapshot.id).toBe(export_.id);
      expect(snapshot.status).toBe(ExportStatus.RUNNING);
      expect(snapshot.progress.processed).toBe(50);
      expect(snapshot.configuration).toEqual(export_.configuration);
    });

    it("should restore from snapshot correctly", () => {
      export_.start();
      export_.updateProgress({
        processed: 75,
        total: 100,
        currentOperation: "finalizing"
      });

      const snapshot = export_.toSnapshot();
      const restored = Export.fromSnapshot(snapshot);

      expect(restored.id).toBe(export_.id);
      expect(restored.status).toBe(export_.status);
      expect(restored.progress.processed).toBe(75);
      expect(restored.configuration).toEqual(export_.configuration);
    });
  });
});
