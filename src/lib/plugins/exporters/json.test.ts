import { ResolvedCommandConfig } from "$config/loader";
import { NotionDatabase, NotionObject, NotionObjectType, NotionSDKSearchResultDatabase } from "$notion/types";
import { log } from "$util/log";
import { normalization } from "$util/normalization";
import { tskit } from "@mateothegreat/ts-kit";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Exporter, exporters, ExportHookConfig } from "./exporter";
import { json } from "./json";

vi.mock("$util/log", () => ({
  log: {
    debugging: {
      inspect: vi.fn()
    },
    error: vi.fn()
  }
}));

vi.mock("$util/normalization", () => ({
  normalization: {
    normalize: vi.fn()
  }
}));

vi.mock("@mateothegreat/ts-kit", () => ({
  tskit: {
    fs: {
      write: vi.fn()
    }
  }
}));

describe("jsonExporterHook", () => {
  const mockHookConfig: ExportHookConfig = {
    formats: [Exporter.JSON],
    types: [NotionObjectType.PAGE, NotionObjectType.DATABASE]
  };
  const mockExporterConfig = {
    path: "/fake/path",
    "naming-strategy": "title"
  } as unknown as ResolvedCommandConfig<"export">;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return an exporter with id "json"', () => {
    const exporter = json(mockHookConfig, mockExporterConfig);
    expect(exporter.id).toBe(exporters.exporters.json.id);
    expect(exporter.config).toBe(mockHookConfig);
  });

  describe("write", () => {
    const mockNotionPage: NotionDatabase = {
      id: "123",
      description: "Mock Page",
      icon: { type: "emoji", emoji: "👋" },
      cover: { type: "external", external: { url: "https://example.com/cover.jpg" } },
      isInline: false,
      url: "https://example.com/page",
      title: "Mock Page",
      type: NotionObjectType.DATABASE,
      createdTime: "2023-01-01T00:00:00.000Z",
      lastEditedTime: "2023-01-01T00:00:00.000Z",
      createdBy: { id: "user-id", type: "person" },
      lastEditedBy: { id: "user-id", type: "person" },
      archived: false,
      properties: {},
      publicUrl: "https://example.com/page",
      trashed: false,
      parent: { type: "workspace", id: "workspace-id" }
    };

    const mockNotionDatabase = {
      id: "456",
      object: "database",
      title: "Test DB",
      createdTime: "2023-01-01T00:00:00.000Z",
      lastEditedTime: "2023-01-01T00:00:00.000Z",
      createdBy: { id: "user-id", type: "person" },
      lastEditedBy: { id: "user-id", type: "person" }
    } as unknown as NotionSDKSearchResultDatabase;

    it("should write a JSON file for a given NotionObject", async () => {
      const exporter = json(mockHookConfig, mockExporterConfig);
      const spy = vi.spyOn(normalization, "normalize").mockReturnValue("normalized-filename");
      const writeSpy = vi.spyOn(tskit.fs, "write").mockResolvedValue(null);

      await exporter.write(mockNotionPage as unknown as NotionObject);

      expect(spy).toHaveBeenCalledWith(mockNotionPage, "title");
      expect(writeSpy).toHaveBeenCalledWith(
        "/fake/path/normalized-filename.json",
        JSON.stringify(mockNotionPage, null, 2)
      );
    });

    it("should log an error if writing the file fails", async () => {
      const exporter = json(mockHookConfig, mockExporterConfig);
      const error = new Error("write error");
      const spy = vi.spyOn(normalization, "normalize").mockReturnValue("normalized-filename");
      vi.spyOn(tskit.fs, "write").mockRejectedValue(error);

      await exporter.write(mockNotionPage as unknown as NotionObject);

      expect(spy).toHaveBeenCalledWith(mockNotionPage, "title");
      expect(log.error).toHaveBeenCalledWith("failed to write file normalized-filename.json", { error });
    });

    it("should log debugging info after writing for a database", async () => {
      const exporter = json(mockHookConfig, mockExporterConfig);
      const spy = vi.spyOn(normalization, "normalize").mockReturnValue("normalized-filename-db");
      const writeSpy = vi.spyOn(tskit.fs, "write");

      await exporter.write(mockNotionDatabase as unknown as NotionObject);

      expect(spy).toHaveBeenCalledWith(mockNotionDatabase, "title");

      expect(writeSpy).toHaveBeenCalledWith(
        "/fake/path/normalized-filename-db.json",
        JSON.stringify(mockNotionDatabase, null, 2)
      );
    });
  });
});
