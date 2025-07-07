import fs from "fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FileSystemManager } from "./file-system-manager";

vi.mock("fs", () => ({
  promises: {
    writeFile: vi.fn(),
    mkdir: vi.fn()
  }
}));

describe("FileSystemManager", () => {
  const fileSystemManager = new FileSystemManager();

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("writeRawData", () => {
    it("should write data to a file", async () => {
      const data = { key: "value" };
      const outputPath = "/path/to/file.json";

      const result = await fileSystemManager.writeRawData(data, outputPath);

      expect(fs.promises.mkdir).toHaveBeenCalledWith("/path/to", { recursive: true });
      expect(fs.promises.writeFile).toHaveBeenCalledWith(outputPath, JSON.stringify(data, null, 2), "utf8");
      expect(result.success).toBe(true);
      expect(result.filePath).toBe(outputPath);
    });

    it("should handle errors when writing fails", async () => {
      const error = new Error("Write failed");
      vi.mocked(fs.promises.writeFile).mockRejectedValue(error);

      const result = await fileSystemManager.writeRawData({}, "/path/to/file.json");

      expect(result.success).toBe(false);
      expect(result.error).toEqual(error);
    });

    it("should handle errors when directory creation fails", async () => {
      const error = new Error("Directory creation failed");
      vi.mocked(fs.promises.mkdir).mockRejectedValue(error);

      const result = await fileSystemManager.writeRawData({}, "/path/to/file.json");

      expect(result.success).toBe(false);
      expect(result.error).toEqual(error);
    });
  });
});
