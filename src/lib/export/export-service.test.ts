import { ResolvedCommandConfig } from "$lib/config/loader";
import { Exporter } from "$lib/exporters/exporter";
import { NamingStrategy } from "$lib/util/normalization";
import { OrganizationStrategy } from "$lib/util/organization";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExportAlreadyRunningError, ExportError, ExportNotFoundError } from "../../shared/errors";
import { ExportStatus } from "../../shared/types";
import { Export } from "./domain";
import { ExportService } from "./export-service";

// Mock fs module
vi.mock("fs", () => ({
  promises: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined)
  }
}));

// Mock workspace-metadata-exporter
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

class MockExportRepository {
  private exports = new Map<string, Export>();

  async save(export_: Export): Promise<void> {
    this.exports.set(export_.id, export_);
  }

  async findById(id: string): Promise<Export | null> {
    return this.exports.get(id) || null;
  }

  async findByStatus(status: ExportStatus): Promise<Export[]> {
    return Array.from(this.exports.values()).filter((exp) => exp.status === status);
  }

  async findRunning(): Promise<Export[]> {
    return Array.from(this.exports.values()).filter((exp) => exp.status === ExportStatus.RUNNING);
  }

  async delete(id: string): Promise<void> {
    this.exports.delete(id);
  }

  async list(limit?: number, offset?: number): Promise<Export[]> {
    const all = Array.from(this.exports.values());
    const start = offset || 0;
    const end = limit ? start + limit : undefined;
    return all.slice(start, end);
  }

  clear(): void {
    this.exports.clear();
  }
}

describe("ExportService", () => {
  let exportService: ExportService;
  let mockRepository: MockExportRepository;
  let publishedEvents: any[];

  const mockEventPublisher = async (event: any) => {
    publishedEvents.push(event);
  };

  const createTestConfiguration = (): ResolvedCommandConfig<"export"> => ({
    output: "/test/output",
    "include-archived": false,
    "include-comments": false,
    "include-properties": true,
    "include-blocks": true,
    databases: [
      { name: "db1", id: "db1" },
      { name: "db2", id: "db2" }
    ],
    pages: [{ name: "page1", id: "page1" }],
    "naming-strategy": NamingStrategy.TITLE_AND_ID,
    "organization-strategy": OrganizationStrategy.HIERARCHICAL,
    token: "test-token",
    timeout: 30000,
    concurrency: 5,
    retries: 1,
    "max-concurrency": 5,
    path: "",
    format: Exporter.JSON,
    verbose: false,
    flush: false
  });

  beforeEach(() => {
    mockRepository = new MockExportRepository();
    publishedEvents = [];
    exportService = new ExportService(mockRepository, mockEventPublisher);
  });

  describe("createExport", () => {
    it("should create a new export successfully", async () => {
      const configuration = createTestConfiguration();

      const export_ = await exportService.create(configuration);

      expect(export_).toBeDefined();
      expect(export_.status).toBe(ExportStatus.PENDING);
      expect(export_.configuration).toEqual(configuration);
      expect(publishedEvents).toHaveLength(1);
      expect(publishedEvents[0].type).toBe("export.started");
    });

    it("should throw error for invalid configuration", async () => {
      const invalidConfig = {
        ...createTestConfiguration(),
        outputPath: ""
      };

      await expect(exportService.create(invalidConfig)).rejects.toThrow(ExportError);
    });

    it("should throw error when conflicting export is running", async () => {
      const configuration = createTestConfiguration();

      // Create and start first export
      const firstExport = await exportService.create(configuration);
      await exportService.startExport(firstExport.id);

      // Try to create conflicting export
      await expect(exportService.create(configuration)).rejects.toThrow(ExportAlreadyRunningError);
    });
  });

  describe("startExport", () => {
    it("should start a pending export", async () => {
      const configuration = createTestConfiguration();
      const export_ = await exportService.create(configuration);

      await exportService.startExport(export_.id);

      const updatedExport = await exportService.getExport(export_.id);
      expect(updatedExport.status).toBe(ExportStatus.RUNNING);
      expect(updatedExport.startedAt).toBeDefined();
      expect(publishedEvents).toHaveLength(2); // created + progress updated
    });

    it("should throw error for non-existent export", async () => {
      await expect(exportService.startExport("non-existent")).rejects.toThrow(ExportNotFoundError);
    });

    it("should throw error when export is not in pending status", async () => {
      const configuration = createTestConfiguration();
      const export_ = await exportService.create(configuration);
      await exportService.startExport(export_.id);

      // Try to start again
      await expect(exportService.startExport(export_.id)).rejects.toThrow(ExportError);
    });
  });

  describe("cancelExport", () => {
    it("should cancel a running export", async () => {
      const configuration = createTestConfiguration();
      const export_ = await exportService.create(configuration);
      await exportService.startExport(export_.id);

      await exportService.cancelExport(export_.id, "User requested");

      const updatedExport = await exportService.getExport(export_.id);
      expect(updatedExport.status).toBe(ExportStatus.CANCELLED);
      expect(updatedExport.error?.message).toContain("User requested");
      expect(publishedEvents.some((e) => e.type === "export.cancelled")).toBe(true);
    });

    it("should throw error when export is not running", async () => {
      const configuration = createTestConfiguration();
      const export_ = await exportService.create(configuration);

      await expect(exportService.cancelExport(export_.id, "Test")).rejects.toThrow(ExportError);
    });
  });

  describe("updateExportProgress", () => {
    it("should update export progress", async () => {
      const configuration = createTestConfiguration();
      const export_ = await exportService.create(configuration);
      await exportService.startExport(export_.id);

      await exportService.updateExportProgress(export_.id, {
        processed: 50,
        total: 100,
        currentOperation: "processing pages"
      });

      const updatedExport = await exportService.getExport(export_.id);
      expect(updatedExport.progress.processed).toBe(50);
      expect(updatedExport.progress.total).toBe(100);
      expect(updatedExport.progress.percentage).toBe(50);
      expect(updatedExport.progress.currentOperation).toBe("processing pages");
    });
  });

  describe("completeExport", () => {
    it("should complete a running export", async () => {
      const configuration = createTestConfiguration();
      const export_ = await exportService.create(configuration);
      await exportService.startExport(export_.id);

      const outputPath = "/test/output/result.json";
      await exportService.completeExport(export_.id, outputPath);

      const updatedExport = await exportService.getExport(export_.id);
      expect(updatedExport.status).toBe(ExportStatus.COMPLETED);
      expect(updatedExport.outputPath).toBe(outputPath);
      expect(updatedExport.completedAt).toBeDefined();
      expect(publishedEvents.some((e) => e.type === "export.completed")).toBe(true);
    });
  });

  describe("failExport", () => {
    it("should fail a running export", async () => {
      const configuration = createTestConfiguration();
      const export_ = await exportService.create(configuration);
      await exportService.startExport(export_.id);

      const error = new Error("Test error");
      await exportService.failExport(export_.id, error);

      const updatedExport = await exportService.getExport(export_.id);
      expect(updatedExport.status).toBe(ExportStatus.FAILED);
      expect(updatedExport.error?.message).toBe("Test error");
      expect(publishedEvents.some((e) => e.type === "export.failed")).toBe(true);
    });
  });

  describe("restartExport", () => {
    it("should restart a failed export", async () => {
      const configuration = createTestConfiguration();
      const export_ = await exportService.create(configuration);
      await exportService.startExport(export_.id);
      await exportService.failExport(export_.id, new Error("Test error"));

      const newExport = await exportService.restartExport(export_.id);

      expect(newExport.id).not.toBe(export_.id);
      expect(newExport.status).toBe(ExportStatus.PENDING);
      expect(newExport.configuration).toEqual(configuration);
    });

    it("should throw error when export cannot be restarted", async () => {
      const configuration = createTestConfiguration();
      const export_ = await exportService.create(configuration);
      await exportService.startExport(export_.id);
      await exportService.completeExport(export_.id, "/test/output");

      await expect(exportService.restartExport(export_.id)).rejects.toThrow(ExportError);
    });
  });

  describe("deleteExport", () => {
    it("should delete a completed export", async () => {
      const configuration = createTestConfiguration();
      const export_ = await exportService.create(configuration);
      await exportService.startExport(export_.id);
      await exportService.completeExport(export_.id, "/test/output");

      await exportService.deleteExport(export_.id);

      await expect(exportService.getExport(export_.id)).rejects.toThrow(ExportNotFoundError);
    });

    it("should throw error when trying to delete running export", async () => {
      const configuration = createTestConfiguration();
      const export_ = await exportService.create(configuration);
      await exportService.startExport(export_.id);

      await expect(exportService.deleteExport(export_.id)).rejects.toThrow(ExportError);
    });
  });

  describe("listExports", () => {
    it("should list all exports", async () => {
      const config1 = createTestConfiguration();
      const config2 = { ...createTestConfiguration(), outputPath: "/test/output2" };

      await exportService.create(config1);
      await exportService.create(config2);

      const exports = await exportService.listExports();
      expect(exports).toHaveLength(2);
    });

    it("should respect limit and offset", async () => {
      for (let i = 0; i < 5; i++) {
        const config = { ...createTestConfiguration(), outputPath: `/test/output${i}` };
        await exportService.create(config);
      }

      const exports = await exportService.listExports(2, 1);
      expect(exports).toHaveLength(2);
    });
  });

  describe("getRunningExports", () => {
    it("should return only running exports", async () => {
      const config1 = createTestConfiguration();
      const config2 = { ...createTestConfiguration(), outputPath: "/test/output2" };

      const export1 = await exportService.create(config1);
      const export2 = await exportService.create(config2);

      await exportService.startExport(export1.id);
      // export2 remains pending

      const runningExports = await exportService.getRunningExports();
      expect(runningExports).toHaveLength(1);
      expect(runningExports[0].id).toBe(export1.id);
    });
  });

  describe("executeExport", () => {
    let mockProgressService: any;
    let exportServiceWithProgress: ExportService;

    beforeEach(() => {
      // Create mock ProgressService
      mockProgressService = {
        startTracking: vi.fn().mockResolvedValue(undefined),
        stopTracking: vi.fn().mockResolvedValue(undefined),
        updateProgress: vi.fn().mockResolvedValue(undefined),
        getProgress: vi.fn().mockReturnValue({ processed: 0, total: 0 })
      };

      // Create ExportService with ProgressService
      exportServiceWithProgress = new ExportService(mockRepository, mockEventPublisher, mockProgressService);
    });

    it("should throw error when export is not running", async () => {
      const configuration = createTestConfiguration();
      const export_ = await exportServiceWithProgress.create(configuration);

      const exporterConfig = {
        token: "test-token",
        output: "/test/output",
        timeout: 30000
      } as any;

      await expect(exportServiceWithProgress.startExport(export_.id)).rejects.toThrow(
        "Cannot execute export in pending status"
      );
    });

    it("should throw error when ProgressService is not provided", async () => {
      const configuration = createTestConfiguration();
      const export_ = await exportService.create(configuration);
      await exportService.startExport(export_.id);

      const exporterConfig = {
        token: "test-token",
        output: "/test/output",
        timeout: 30000
      } as any;

      await expect(exportService.startExport(export_.id)).rejects.toThrow(
        "ProgressService is required for export execution"
      );
    });

    it("should execute export successfully", async () => {
      const configuration = createTestConfiguration();
      const export_ = await exportServiceWithProgress.create(configuration);
      await exportServiceWithProgress.startExport(export_.id);

      const exporterConfig = {
        token: "test-token",
        output: "/test/output",
        timeout: 30000,
        archived: false,
        comments: false,
        properties: true,
        size: 10
      } as any;

      const result = await exportServiceWithProgress.startExport(export_.id);
      expect(mockProgressService.startTracking).toHaveBeenCalledWith(export_.id);

      const completedExport = await exportServiceWithProgress.getExport(export_.id);
      expect(completedExport.status).toBe(ExportStatus.COMPLETED);
      expect(completedExport.outputPath).toBe("/test/output");
    });

    it("should update progress with export result statistics", async () => {
      const configuration = createTestConfiguration();
      const export_ = await exportServiceWithProgress.create(configuration);
      await exportServiceWithProgress.startExport(export_.id);

      const exporterConfig = {
        token: "test-token",
        output: "/test/output",
        timeout: 30000,
        archived: false,
        comments: false,
        properties: true,
        size: 10
      } as any;

      // Execute export
      await exportServiceWithProgress.startExport(export_.id);

      // Verify progress was updated
      const completedExport = await exportServiceWithProgress.getExport(export_.id);
      expect(completedExport.progress.processed).toBeGreaterThan(0);
      expect(completedExport.progress.total).toBeGreaterThan(0);
      expect(completedExport.progress.percentage).toBe(100);
      expect(completedExport.progress.currentOperation).toBe("completed");
    });
  });
});
