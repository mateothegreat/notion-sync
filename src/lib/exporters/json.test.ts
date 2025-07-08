import { ResolvedCommandConfig } from "$lib/config/loader";
import { log } from "$lib/log";
import {
  NotionObject,
  NotionObjectType,
  NotionSDKSearchResultDatabase,
  NotionSDKSearchResultPage
} from "$lib/notion/types";
import util from "$lib/util";
import { tskit } from "@mateothegreat/ts-kit";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Exporter, exporters, ExportHookConfig } from "./exporter";
import { json } from "./json";

vi.mock("$lib/log", () => ({
  log: {
    debugging: {
      inspect: vi.fn()
    },
    error: vi.fn()
  }
}));

vi.mock("$lib/util", () => ({
  default: {
    normalization: {
      normalize: vi.fn()
    }
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
    expect(exporter.id).toBe(exporters.json.id);
    expect(exporter.config).toBe(mockHookConfig);
  });

  describe("write", () => {
    const mockNotionPage: NotionSDKSearchResultPage = {
      id: "123",
      type: NotionObjectType.PAGE,
      createdTime: "2023-01-01T00:00:00.000Z",
      lastEditedTime: "2023-01-01T00:00:00.000Z",
      createdBy: { id: "user-id", type: "person" },
      lastEditedBy: { id: "user-id", type: "person" },
      parent: { type: "database_id", database_id: "db-id" },
      archived: false,
      properties: {},
      url: "",
      title: "Mock Page"
    };

    const mockNotionDatabase = {
      id: "456",
      type: NotionObjectType.DATABASE,
      title: "Test DB",
      createdTime: "2023-01-01T00:00:00.000Z",
      lastEditedTime: "2023-01-01T00:00:00.000Z",
      createdBy: { id: "user-id", type: "person" },
      lastEditedBy: { id: "user-id", type: "person" }
    } as unknown as NotionSDKSearchResultDatabase;

    it("should write a JSON file for a given NotionObject", async () => {
      const exporter = json(mockHookConfig, mockExporterConfig);
      const spy = vi.spyOn(util.normalization, "normalize").mockReturnValue("normalized-filename");
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
      const spy = vi.spyOn(util.normalization, "normalize").mockReturnValue("normalized-filename");
      vi.spyOn(tskit.fs, "write").mockRejectedValue(error);

      await exporter.write(mockNotionPage as unknown as NotionObject);

      expect(spy).toHaveBeenCalledWith(mockNotionPage, "title");
      expect(log.error).toHaveBeenCalledWith("failed to write file normalized-filename.json", { error });
    });

    it("should log debugging info after writing for a database", async () => {
      const exporter = json(mockHookConfig, mockExporterConfig);
      const spy = vi.spyOn(util.normalization, "normalize").mockReturnValue("normalized-filename-db");
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
