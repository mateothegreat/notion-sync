import { beforeEach, describe, expect, it, vi } from "vitest";
import { FileSystemManager } from "../../../infrastructure/filesystem/file-system-manager";
import { NotionClient } from "../../../infrastructure/notion/notion-client";
import { Export } from "./commands/export";

// Mock dependencies
vi.mock("../../../infrastructure/filesystem/file-system-manager");
vi.mock("../../../infrastructure/notion/notion-client");

describe("Export Command", () => {
  let exportCommand: Export;

  beforeEach(() => {
    exportCommand = new Export([], {} as any);
    exportCommand["fileSystemManager"] = new FileSystemManager();
    exportCommand["notionClient"] = new NotionClient({ token: "test" });
    exportCommand["handleExportError"] = vi.fn();
  });

  describe("exportWorkspaceMetadata", () => {
    it("should export workspace metadata", async () => {
      const mockWorkspace = { id: "workspace_1", name: "Test Workspace" };
      vi.spyOn(exportCommand["notionClient"], "getWorkspace").mockResolvedValue(mockWorkspace);
      const writeSpy = vi.spyOn(exportCommand["fileSystemManager"], "writeRawData").mockResolvedValue();

      await exportCommand["exportWorkspaceMetadata"]("export_1", "/output");

      expect(writeSpy).toHaveBeenCalledWith(mockWorkspace, "/output/workspace.json");
    });

    it("should handle error", async () => {
      const error = new Error("Test error");
      vi.spyOn(exportCommand["notionClient"], "getWorkspace").mockRejectedValue(error);

      await exportCommand["exportWorkspaceMetadata"]("export_1", "/output");

      expect(exportCommand["handleExportError"]).toHaveBeenCalledWith("export_1", "workspace", undefined, error);
    });
  });

  describe("exportUsers", () => {
    it("should export users", async () => {
      const mockUsers = [{ id: "user_1", name: "Test User" }];
      vi.spyOn(exportCommand["notionClient"], "getUsers").mockResolvedValue(mockUsers);
      const writeSpy = vi.spyOn(exportCommand["fileSystemManager"], "writeRawData").mockResolvedValue();

      await exportCommand["exportUsers"]("export_1", "/output");

      expect(writeSpy).toHaveBeenCalledWith(mockUsers, "/output/users.json");
    });
  });

  // Add tests for other methods: processPages, processDatabases, etc.
});
