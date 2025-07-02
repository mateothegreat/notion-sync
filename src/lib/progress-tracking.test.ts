import { promises as fs } from "fs";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PersistentProgressTracker, ProgressReporter, type ErrorRecord } from "./progress-tracking";

// Mock fs module
vi.mock("fs", () => ({
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    rename: vi.fn(),
    unlink: vi.fn(),
    mkdir: vi.fn()
  }
}));

describe("progress-tracking", () => {
  describe("PersistentProgressTracker", () => {
    let tracker: PersistentProgressTracker;
    const mockFs = fs as any;
    const exportId = "test-export-123";
    const outputDir = "./test-output";

    beforeEach(() => {
      vi.clearAllMocks();
      tracker = new PersistentProgressTracker(exportId, outputDir, 1000);
    });

    afterEach(() => {
      // Cleanup any intervals
      tracker.cleanup();
    });

    it("should initialize as new export when no checkpoint exists", async () => {
      mockFs.readFile.mockRejectedValue(new Error("File not found"));
      mockFs.writeFile.mockResolvedValue(undefined);

      const isResuming = await tracker.initialize();

      expect(isResuming).toBe(false);
      expect(mockFs.writeFile).toHaveBeenCalled();
    });

    it("should initialize as resuming when checkpoint exists", async () => {
      const existingCheckpoint = {
        exportId,
        startTime: Date.now() - 10000,
        lastUpdateTime: Date.now() - 5000,
        processedCount: 100,
        totalEstimate: 1000,
        completedSections: ["pages"],
        currentSection: "databases",
        outputPath: join(outputDir, `export-${exportId}`),
        errors: [] as ErrorRecord[],
        metadata: {}
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(existingCheckpoint));

      const isResuming = await tracker.initialize();

      expect(isResuming).toBe(true);
      expect(tracker.getStats().processed).toBe(100);
    });

    it("should update progress correctly", () => {
      tracker.updateProgress("pages", 50, "page-123");

      const stats = tracker.getStats();
      expect(stats.processed).toBe(50);
      expect(stats.currentSection).toBe("pages");
      expect(tracker.getLastProcessedId()).toBe("page-123");
    });

    it("should track section completion", () => {
      tracker.updateProgress("pages", 100);
      tracker.completeSection("pages");

      expect(tracker.isSectionCompleted("pages")).toBe(true);
      expect(tracker.isSectionCompleted("databases")).toBe(false);
    });

    it("should calculate ETA with increasing confidence", () => {
      tracker.setTotalEstimate(1000);

      // No progress yet
      let eta = tracker.calculateETA();
      expect(eta.eta).toBe(0);
      expect(eta.confidence).toBe(0);

      // Some progress
      tracker.updateProgress("pages", 100);
      eta = tracker.calculateETA();
      expect(eta.eta).toBeGreaterThan(0);
      expect(eta.confidence).toBeGreaterThan(0);

      // More progress increases confidence
      tracker.updateProgress("pages", 200);
      const eta2 = tracker.calculateETA();
      expect(eta2.confidence).toBeGreaterThan(eta.confidence);
    });

    it("should record errors with context", () => {
      const error = new Error("Test error");
      tracker.recordError("fetch-page", error, "page-123", 2);

      const recentErrors = tracker.getRecentErrors(1);
      expect(recentErrors).toHaveLength(1);
      expect(recentErrors[0].operation).toBe("fetch-page");
      expect(recentErrors[0].error).toBe("Test error");
      expect(recentErrors[0].objectId).toBe("page-123");
      expect(recentErrors[0].retryCount).toBe(2);
    });

    it("should limit error history to prevent unbounded growth", () => {
      // Add 150 errors
      for (let i = 0; i < 150; i++) {
        tracker.recordError("operation", new Error(`Error ${i}`));
      }

      const recentErrors = tracker.getRecentErrors(200);
      expect(recentErrors.length).toBeLessThanOrEqual(100); // Should be capped at 100
    });

    it("should save checkpoint atomically", async () => {
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.rename.mockResolvedValue(undefined);

      tracker.updateProgress("pages", 50);
      await tracker.saveCheckpoint();

      expect(mockFs.writeFile).toHaveBeenCalledWith(expect.stringContaining(".tmp"), expect.any(String));
      expect(mockFs.rename).toHaveBeenCalled();
    });

    it("should handle metadata", () => {
      tracker.setMetadata("testKey", "testValue");
      expect(tracker.getMetadata("testKey")).toBe("testValue");
      expect(tracker.getMetadata("nonexistent")).toBeUndefined();
    });

    it("should provide accurate statistics", () => {
      tracker.setTotalEstimate(1000);
      tracker.updateProgress("pages", 250);

      const stats = tracker.getStats();
      expect(stats.processed).toBe(250);
      expect(stats.total).toBe(1000);
      expect(stats.percentage).toBe(25);
      expect(stats.currentSection).toBe("pages");
      expect(stats.errors).toBe(0);
      expect(stats.memoryUsage).toBeDefined();
    });

    it("should track section statistics", () => {
      tracker.updateProgress("pages", 100);
      tracker.completeSection("pages");
      tracker.updateProgress("databases", 50);

      const sectionStats = tracker.getSectionStats();
      expect(sectionStats.has("pages")).toBe(true);
      expect(sectionStats.has("databases")).toBe(true);

      const pagesStats = sectionStats.get("pages");
      expect(pagesStats?.items).toBe(100);
      expect(pagesStats?.rate).toBeGreaterThan(0);
    });

    it("should remove checkpoint file on cleanup", async () => {
      mockFs.unlink.mockResolvedValue(undefined);

      await tracker.removeCheckpoint();

      expect(mockFs.unlink).toHaveBeenCalledWith(expect.stringContaining(".checkpoint.json"));
    });
  });

  describe("ProgressReporter", () => {
    let tracker: PersistentProgressTracker;
    let reporter: ProgressReporter;
    let consoleLogSpy: any;

    beforeEach(() => {
      tracker = new PersistentProgressTracker("test-123", "./output", 1000);
      reporter = new ProgressReporter(tracker, 100); // Short interval for testing
      consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
    });

    it("should report progress with formatted output", () => {
      tracker.setTotalEstimate(1000);
      tracker.updateProgress("pages", 250);

      reporter.report(true); // Force report

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Export Progress:"));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("25.0%"));
    });

    it("should respect report interval", () => {
      tracker.setTotalEstimate(100);

      // First report should work
      reporter.report();
      expect(consoleLogSpy).toHaveBeenCalled();

      // Immediate second report should be skipped
      consoleLogSpy.mockClear();
      reporter.report();
      expect(consoleLogSpy).not.toHaveBeenCalled();

      // Force report should work
      reporter.report(true);
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it("should show ETA when confidence is sufficient", () => {
      tracker.setTotalEstimate(1000);
      tracker.updateProgress("pages", 400); // 40% complete for good confidence

      reporter.report(true);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringMatching(/ETA:.*confidence/));
    });

    it("should report section completion", () => {
      tracker.updateProgress("pages", 100);
      tracker.completeSection("pages");

      reporter.reportSectionComplete("pages");

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("✅ Completed: pages"));
    });

    it("should report final summary", () => {
      tracker.setTotalEstimate(1000);
      tracker.updateProgress("pages", 500);
      tracker.completeSection("pages");
      tracker.updateProgress("databases", 300);
      tracker.completeSection("databases");
      tracker.recordError("test-op", new Error("Test error"));

      reporter.reportSummary();

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("🎉 Export Complete!"));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Total Items:"));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("⚠️  Errors: 1"));
    });

    it("should format progress bar correctly", () => {
      tracker.setTotalEstimate(100);

      // 0% progress
      tracker.updateProgress("pages", 0);
      reporter.report(true);
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringMatching(/\[░+\]/));

      consoleLogSpy.mockClear();

      // 50% progress
      tracker.updateProgress("pages", 50);
      reporter.report(true);
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringMatching(/\[█+░+\]/));
    });

    it("should show memory usage", () => {
      tracker.updateProgress("pages", 10);
      reporter.report(true);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringMatching(/Memory:.*MB/));
    });
  });
});
