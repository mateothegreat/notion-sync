/**
 * WorkspaceExporter Test Suite
 *
 * Tests for the WorkspaceExporter class that handles export execution.
 */

import { EventEmitter } from "events";
import { promises as fs } from "fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Export, ExportFactory } from "../../core/domain/export";
import { ExportConfiguration, ExportFormat } from "../../shared/types";
import { ExporterConfig } from "./config";
import { WorkspaceExporter } from "./workspace-exporter";

// Mock modules
vi.mock("fs", () => ({
  promises: {
    mkdir: vi.fn().mockResolvedValue(undefined)
  }
}));

vi.mock("./workspace-metadata-exporter", () => ({
  WorkspaceMetadataExporter: vi.fn().mockImplementation(() => ({
    export: vi.fn().mockResolvedValue({
      exportDate: "2024-01-01T00:00:00Z",
      exportVersion: "1.0.0",
      user: { id: "user-123", name: "Test User" }
    })
  }))
}));

vi.mock("@notionhq/client");

// Mock ProgressService implementation
import { ProgressService } from "../../core/services/progress-service";

const createMockProgressService = (): ProgressService => {
  const mockService = {
    trackers: new Map(),
    eventPublisher: vi.fn(),
    startTracking: vi.fn().mockResolvedValue(undefined),
    stopTracking: vi.fn().mockResolvedValue(undefined),
    startSection: vi.fn().mockResolvedValue(undefined),
    updateSectionProgress: vi.fn().mockResolvedValue(undefined),
    completeSection: vi.fn().mockResolvedValue(undefined),
    addError: vi.fn().mockResolvedValue(undefined),
    updateProgress: vi.fn().mockResolvedValue(undefined),
    getProgress: vi.fn().mockReturnValue({ processed: 0, total: 0 }),
    getAllSections: vi.fn().mockReturnValue([]),
    getStatistics: vi.fn().mockReturnValue({
      totalTime: 0,
      averageProcessingTime: 0,
      throughput: 0,
      errorRate: 0,
      sections: []
    })
  } as unknown as ProgressService;

  return mockService;
};

describe("WorkspaceExporter", () => {
  let workspaceExporter: WorkspaceExporter;
  let mockProgressService: ProgressService;
  let publishedEvents: any[];
  let export_: Export;

  const mockEventPublisher = async (event: any) => {
    publishedEvents.push(event);
  };

  const createTestConfiguration = (): ExportConfiguration => ({
    outputPath: "/test/output",
    format: ExportFormat.JSON,
    includeBlocks: true,
    includeComments: false,
    includeProperties: true,
    databases: ["db1", "db2"],
    pages: ["page1", "page2", "page3"]
  });

  const createTestExporterConfig = (): ExporterConfig =>
    new ExporterConfig({
      token: "test-token",
      output: "/test/output",
      timeout: 30000,
      retries: 3,
      rate: 100,
      archived: false,
      comments: false,
      properties: true,
      size: 10
    });

  beforeEach(() => {
    publishedEvents = [];
    mockProgressService = createMockProgressService();

    const config = createTestExporterConfig();
    workspaceExporter = new WorkspaceExporter(config, mockProgressService, mockEventPublisher);

    // Create a test export
    const configuration = createTestConfiguration();
    export_ = ExportFactory.create(configuration);
    export_.start(); // Set status to RUNNING
  });

  describe("execute", () => {
    it("should successfully execute an export", async () => {
      const result = await workspaceExporter.execute(export_);

      expect(result).toBeDefined();
      expect(result.databasesCount).toBe(2);
      expect(result.pagesCount).toBe(3);
      expect(result.workspaceInfo).toBeDefined();
      expect(result.errors).toHaveLength(0);
      expect(result.startTime).toBeInstanceOf(Date);
      expect(result.endTime).toBeInstanceOf(Date);
    });

    it("should create directory structure", async () => {
      await workspaceExporter.execute(export_);

      const expectedDirs = [
        "/test/output",
        "/test/output/users",
        "/test/output/databases",
        "/test/output/pages",
        "/test/output/properties",
        "/test/output/blocks",
        "/test/output/comments",
        "/test/output/metadata",
        "/test/output/files"
      ];

      expect(fs.mkdir).toHaveBeenCalledTimes(expectedDirs.length);
      expectedDirs.forEach((dir) => {
        expect(fs.mkdir).toHaveBeenCalledWith(dir, { recursive: true });
      });
    });

    it("should publish directory created events", async () => {
      await workspaceExporter.execute(export_);

      const directoryEvents = publishedEvents.filter((e) => e.type === "directory.created");
      expect(directoryEvents).toHaveLength(9); // 9 directories
    });

    it("should start progress tracking", async () => {
      const startTrackingSpy = vi.spyOn(mockProgressService, "startTracking");

      await workspaceExporter.execute(export_);

      expect(startTrackingSpy).toHaveBeenCalledWith(export_.id);
    });

    it("should export workspace metadata", async () => {
      const result = await workspaceExporter.execute(export_);

      expect(result.workspaceInfo).toEqual({
        exportDate: "2024-01-01T00:00:00Z",
        exportVersion: "1.0.0",
        user: { id: "user-123", name: "Test User" }
      });
    });

    it("should publish progress event for metadata export", async () => {
      await workspaceExporter.execute(export_);

      const progressEvents = publishedEvents.filter((e) => e.type === "progress.item.processed");
      expect(progressEvents).toHaveLength(1);
      expect(progressEvents[0].payload.itemId).toBe("workspace-metadata");
      expect(progressEvents[0].payload.itemType).toBe("metadata");
      expect(progressEvents[0].payload.success).toBe(true);
    });

    it("should handle errors during export", async () => {
      const error = new Error("Test export error");
      vi.spyOn(mockProgressService, "startTracking").mockRejectedValueOnce(error);

      await expect(workspaceExporter.execute(export_)).rejects.toThrow("Test export error");
    });

    it("should emit debug events on error", async () => {
      const error = new Error("Test export error");
      vi.spyOn(mockProgressService, "startTracking").mockRejectedValueOnce(error);

      const debugEvents: string[] = [];
      workspaceExporter.on("debug", (message) => debugEvents.push(message));

      try {
        await workspaceExporter.execute(export_);
      } catch {
        // Expected to throw
      }

      expect(debugEvents).toHaveLength(1);
      expect(debugEvents[0]).toContain("Error exporting export");
      expect(debugEvents[0]).toContain("Test export error");
    });

    it("should handle filesystem errors", async () => {
      const fsError = new Error("Permission denied");
      vi.mocked(fs.mkdir).mockRejectedValueOnce(fsError);

      await expect(workspaceExporter.execute(export_)).rejects.toThrow("Permission denied");
    });

    it("should handle metadata export errors gracefully", async () => {
      const { WorkspaceMetadataExporter } = await import("./workspace-metadata-exporter");
      vi.mocked(WorkspaceMetadataExporter).mockImplementationOnce(() => ({
        export: vi.fn().mockRejectedValue(new Error("Metadata export failed"))
      }));

      await expect(workspaceExporter.execute(export_)).rejects.toThrow("Metadata export failed");
    });
  });

  describe("OperationEventEmitter compatibility", () => {
    it("should implement EventEmitter interface", () => {
      expect(workspaceExporter).toBeInstanceOf(EventEmitter);
    });

    it("should emit events", () => {
      const testEvent = { test: true };
      const listener = vi.fn();

      workspaceExporter.on("test", listener);
      workspaceExporter.emit("test", testEvent);

      expect(listener).toHaveBeenCalledWith(testEvent);
    });
  });

  describe("error handling", () => {
    it("should collect errors during export", async () => {
      // Create a new instance to test error collection
      const exporter = new WorkspaceExporter(createTestExporterConfig(), mockProgressService, mockEventPublisher);

      // Access private method through type assertion
      const handleError = (exporter as any).handleError.bind(exporter);

      handleError("database", "db-123", new Error("Database error"));
      handleError("page", "page-456", new Error("Page error"));

      // Execute and check collected errors
      const result = await exporter.execute(export_);

      expect(result.errors).toHaveLength(2);
      expect(result.errors[0]).toEqual({
        type: "database",
        id: "db-123",
        error: "Database error"
      });
      expect(result.errors[1]).toEqual({
        type: "page",
        id: "page-456",
        error: "Page error"
      });
    });
  });
});
