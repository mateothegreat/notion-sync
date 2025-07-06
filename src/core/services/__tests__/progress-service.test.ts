/**
 * Progress Service Tests
 *
 * Tests progress tracking functionality
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProgressService } from "../progress-service";

describe("ProgressService", () => {
  let progressService: ProgressService;
  let mockEventPublisher: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockEventPublisher = vi.fn();
    progressService = new ProgressService(mockEventPublisher);
  });

  describe("tracking lifecycle", () => {
    it("should start tracking for export", async () => {
      await progressService.startTracking("export-1");

      const progress = progressService.getProgress("export-1");
      expect(progress.processed).toBe(0);
      expect(progress.total).toBe(0);
      expect(progress.percentage).toBe(0);
      expect(progress.currentOperation).toBe("processing");
    });

    it("should track section progress", async () => {
      await progressService.startTracking("export-1");
      await progressService.startSection("export-1", "pages", 100);

      expect(mockEventPublisher).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "progress.section.started",
          payload: expect.objectContaining({
            exportId: "export-1",
            section: "pages",
            totalItems: 100
          })
        })
      );

      const section = progressService.getSectionProgress("export-1", "pages");
      expect(section).toBeTruthy();
      expect(section!.totalItems).toBe(100);
      expect(section!.processedItems).toBe(0);
    });

    it("should update section progress", async () => {
      await progressService.startTracking("export-1");
      await progressService.startSection("export-1", "pages", 100);
      await progressService.updateSectionProgress("export-1", "pages", 50);

      const progress = progressService.getProgress("export-1");
      expect(progress.processed).toBe(50);
      expect(progress.total).toBe(100);
      expect(progress.percentage).toBe(50);
    });

    it("should complete section", async () => {
      await progressService.startTracking("export-1");
      await progressService.startSection("export-1", "pages", 100);
      await progressService.updateSectionProgress("export-1", "pages", 100);
      await progressService.completeSection("export-1", "pages");

      expect(mockEventPublisher).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "progress.section.completed",
          payload: expect.objectContaining({
            exportId: "export-1",
            section: "pages",
            itemsProcessed: 100
          })
        })
      );

      const section = progressService.getSectionProgress("export-1", "pages");
      expect(section!.endTime).toBeDefined();
    });

    it("should stop tracking", () => {
      progressService.startTracking("export-1");
      progressService.stopTracking("export-1");

      expect(() => progressService.getProgress("export-1")).toThrow("No progress tracker found for export export-1");
    });
  });

  describe("multiple sections", () => {
    it("should handle multiple sections correctly", async () => {
      await progressService.startTracking("export-1");
      await progressService.startSection("export-1", "pages", 50);
      await progressService.startSection("export-1", "databases", 25);

      const progress = progressService.getProgress("export-1");
      expect(progress.total).toBe(75); // 50 + 25

      await progressService.updateSectionProgress("export-1", "pages", 30);
      await progressService.updateSectionProgress("export-1", "databases", 15);

      const updatedProgress = progressService.getProgress("export-1");
      expect(updatedProgress.processed).toBe(45); // 30 + 15
      expect(updatedProgress.percentage).toBe(60); // 45/75 * 100
    });

    it("should track current operation based on active section", async () => {
      await progressService.startTracking("export-1");
      await progressService.startSection("export-1", "pages", 50);

      let progress = progressService.getProgress("export-1");
      expect(progress.currentOperation).toBe("pages");

      await progressService.completeSection("export-1", "pages");
      await progressService.startSection("export-1", "databases", 25);

      progress = progressService.getProgress("export-1");
      expect(progress.currentOperation).toBe("databases");
    });

    it("should get all sections", async () => {
      await progressService.startTracking("export-1");
      await progressService.startSection("export-1", "pages", 50);
      await progressService.startSection("export-1", "databases", 25);

      const sections = progressService.getAllSections("export-1");
      expect(sections).toHaveLength(2);
      expect(sections.map((s) => s.name)).toEqual(["pages", "databases"]);
    });
  });

  describe("error handling", () => {
    it("should add errors to tracker and section", async () => {
      await progressService.startTracking("export-1");
      await progressService.startSection("export-1", "pages", 100);

      const error = {
        id: "err-1",
        message: "Test error",
        code: "TEST_ERROR",
        timestamp: new Date()
      };

      await progressService.addError("export-1", "pages", error);

      const progress = progressService.getProgress("export-1");
      expect(progress.errors).toContain(error);

      const section = progressService.getSectionProgress("export-1", "pages");
      expect(section!.errors).toContain(error);
    });

    it("should record item processing events", async () => {
      await progressService.startTracking("export-1");

      const error = {
        id: "err-1",
        message: "Processing failed",
        code: "PROCESS_ERROR",
        timestamp: new Date()
      };

      await progressService.recordItemProcessed("export-1", "item-1", "page", 1500, false, error);

      expect(mockEventPublisher).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "progress.item.processed",
          payload: expect.objectContaining({
            exportId: "export-1",
            itemId: "item-1",
            itemType: "page",
            duration: 1500,
            success: false,
            error
          })
        })
      );
    });

    it("should throw error for non-existent section", async () => {
      await progressService.startTracking("export-1");

      await expect(progressService.updateSectionProgress("export-1", "non-existent", 10)).rejects.toThrow(
        "Section non-existent not found for export export-1"
      );
    });

    it("should throw error for non-existent tracker", () => {
      expect(() => progressService.getProgress("non-existent")).toThrow(
        "No progress tracker found for export non-existent"
      );
    });
  });

  describe("progress calculations", () => {
    it("should calculate percentage correctly with zero total", async () => {
      await progressService.startTracking("export-1");

      const progress = progressService.getProgress("export-1");
      expect(progress.percentage).toBe(0);
    });

    it("should calculate ETA when processing", async () => {
      await progressService.startTracking("export-1");
      await progressService.startSection("export-1", "pages", 100);

      // Mock time progression
      const tracker = (progressService as any).trackers.get("export-1");
      tracker.startTime = new Date(Date.now() - 10000); // 10 seconds ago

      await progressService.updateSectionProgress("export-1", "pages", 25);

      const progress = progressService.getProgress("export-1");
      expect(progress.estimatedCompletion).toBeDefined();
    });

    it("should handle progress updates correctly", async () => {
      await progressService.startTracking("export-1");
      await progressService.startSection("export-1", "pages", 100);

      // First update
      await progressService.updateSectionProgress("export-1", "pages", 30);
      let progress = progressService.getProgress("export-1");
      expect(progress.processed).toBe(30);

      // Second update (should be cumulative within section)
      await progressService.updateSectionProgress("export-1", "pages", 50);
      progress = progressService.getProgress("export-1");
      expect(progress.processed).toBe(50);
    });
  });

  describe("statistics", () => {
    it("should calculate comprehensive statistics", async () => {
      await progressService.startTracking("export-1");
      await progressService.startSection("export-1", "pages", 100);

      // Mock some processing time
      const tracker = (progressService as any).trackers.get("export-1");
      tracker.startTime = new Date(Date.now() - 30000); // 30 seconds ago

      await progressService.updateSectionProgress("export-1", "pages", 60);

      // Add some errors
      await progressService.addError("export-1", "pages", {
        id: "err-1",
        message: "Error 1",
        code: "ERROR",
        timestamp: new Date()
      });

      const stats = progressService.getStatistics("export-1");

      expect(stats.totalDuration).toBeGreaterThan(0);
      expect(stats.averageItemTime).toBeGreaterThan(0);
      expect(stats.errorRate).toBe(0.01); // 1 error out of 100 total
      expect(stats.itemsPerSecond).toBeGreaterThan(0);
      expect(stats.totalSections).toBe(1);
      expect(stats.completedSections).toBe(0);
    });

    it("should track completed sections in statistics", async () => {
      await progressService.startTracking("export-1");
      await progressService.startSection("export-1", "pages", 50);
      await progressService.updateSectionProgress("export-1", "pages", 50);
      await progressService.completeSection("export-1", "pages");

      const stats = progressService.getStatistics("export-1");
      expect(stats.completedSections).toBe(1);
      expect(stats.totalSections).toBe(1);
    });
  });

  describe("edge cases", () => {
    it("should handle zero processing time gracefully", async () => {
      await progressService.startTracking("export-1");

      const stats = progressService.getStatistics("export-1");
      expect(stats.averageItemTime).toBe(0);
      expect(stats.itemsPerSecond).toBe(0);
    });

    it("should handle section completion without updates", async () => {
      await progressService.startTracking("export-1");
      await progressService.startSection("export-1", "pages", 100);
      await progressService.completeSection("export-1", "pages");

      const section = progressService.getSectionProgress("export-1", "pages");
      expect(section!.endTime).toBeDefined();
      expect(section!.processedItems).toBe(0);
    });

    it("should return null for non-existent section", async () => {
      await progressService.startTracking("export-1");

      const section = progressService.getSectionProgress("export-1", "non-existent");
      expect(section).toBeNull();
    });
  });
});
