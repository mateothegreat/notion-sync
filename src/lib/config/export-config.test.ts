import { describe, it, expect, vi, beforeEach } from "vitest";
import { ExportConfig, ExportConfigLoader, exportConfigSchema } from "./export-config";

describe("ExportConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("ExportConfigLoader", () => {
    describe("loadExportConfig", () => {
      it("should load export configuration from flags", async () => {
        const flags = {
          path: "./test-export",
          format: "json",
          maxConcurrency: 5,
          includeBlocks: true,
          includeComments: false,
          includeProperties: true,
          databases: "db1,db2",
          pages: "page1,page2"
        };

        const config = await ExportConfigLoader.loadExportConfig(flags);

        expect(config).toEqual({
          path: "./test-export",
          format: "json",
          maxConcurrency: 5,
          includeBlocks: true,
          includeComments: false,
          includeProperties: true,
          databases: "db1,db2",
          pages: "page1,page2"
        });
      });

      it("should handle kebab-case to camelCase conversion", async () => {
        const flags = {
          path: "./test-export",
          "max-concurrency": 15,
          "include-blocks": false,
          "include-comments": true,
          "include-properties": false
        };

        const config = await ExportConfigLoader.loadExportConfig(flags);

        expect(config).toEqual({
          path: "./test-export",
          format: "json", // default
          maxConcurrency: 15,
          includeBlocks: false,
          includeComments: true,
          includeProperties: false
        });
      });

      it("should merge flags with config file, with flags taking precedence", async () => {
        const flags = {
          path: "./flag-path",
          format: "markdown"
        };

        const configFile = {
          path: "./config-path",
          format: "json",
          maxConcurrency: 20,
          includeBlocks: false
        };

        const config = await ExportConfigLoader.loadExportConfig(flags, configFile);

        expect(config).toEqual({
          path: "./flag-path", // from flags
          format: "markdown", // from flags
          maxConcurrency: 20, // from config file
          includeBlocks: false, // from config file
          includeComments: false, // default
          includeProperties: true // default
        });
      });

      it("should apply default values when properties are missing", async () => {
        const flags = {};

        const config = await ExportConfigLoader.loadExportConfig(flags);

        expect(config.format).toBe("json");
        expect(config.maxConcurrency).toBe(10);
        expect(config.includeBlocks).toBe(true);
        expect(config.includeComments).toBe(false);
        expect(config.includeProperties).toBe(true);
        expect(config.path).toMatch(/^\.\/notion-export-\d{4}-\d{2}-\d{2}$/);
      });

      it("should handle optional databases and pages", async () => {
        const flags = {
          databases: "db1,db2,db3"
        };

        const config = await ExportConfigLoader.loadExportConfig(flags);

        expect(config.databases).toBe("db1,db2,db3");
        expect(config.pages).toBeUndefined();
      });

      it("should handle empty config file", async () => {
        const flags = {
          path: "./test-path"
        };

        const config = await ExportConfigLoader.loadExportConfig(flags, {});

        expect(config.path).toBe("./test-path");
      });
    });

    describe("getExportFlags", () => {
      it("should return all export flags", () => {
        const flags = ExportConfigLoader.getExportFlags();

        expect(flags).toHaveProperty("path");
        expect(flags).toHaveProperty("format");
        expect(flags).toHaveProperty("maxConcurrency");
        expect(flags).toHaveProperty("includeBlocks");
        expect(flags).toHaveProperty("includeComments");
        expect(flags).toHaveProperty("includeProperties");
        expect(flags).toHaveProperty("databases");
        expect(flags).toHaveProperty("pages");

        expect(Object.keys(flags)).toHaveLength(8);
      });

      it("should return flags with correct properties", () => {
        const flags = ExportConfigLoader.getExportFlags();

        expect(flags.path).toHaveProperty("char", "p");
        expect(flags.format).toHaveProperty("char", "f");
        expect(flags.format).toHaveProperty("options", ["json", "markdown", "html", "csv"]);
        expect(flags.databases).toHaveProperty("char", "d");
        expect(flags.databases).toHaveProperty("required", false);
        expect(flags.pages).toHaveProperty("required", false);
      });
    });

    describe("getExportSchema", () => {
      it("should return the export schema", () => {
        const schema = ExportConfigLoader.getExportSchema();

        expect(schema).toBe(exportConfigSchema);
      });
    });
  });

  describe("exportConfigSchema", () => {
    it("should validate correct configuration", () => {
      const validConfig = {
        path: "./test-export",
        format: "json",
        maxConcurrency: 10,
        includeBlocks: true,
        includeComments: false,
        includeProperties: true,
        databases: "db1,db2",
        pages: "page1,page2"
      };

      const result = exportConfigSchema.parse(validConfig);
      expect(result).toEqual(validConfig);
    });

    it("should apply defaults for missing optional properties", () => {
      const minimalConfig = {};

      const result = exportConfigSchema.parse(minimalConfig);
      expect(result.format).toBe("json");
      expect(result.maxConcurrency).toBe(10);
      expect(result.includeBlocks).toBe(true);
      expect(result.includeComments).toBe(false);
      expect(result.includeProperties).toBe(true);
      expect(result.path).toMatch(/^\.\/notion-export-\d{4}-\d{2}-\d{2}$/);
    });

    it("should validate all format options", () => {
      const formats = ["json", "markdown", "html", "csv"];

      for (const format of formats) {
        const config = { format };
        const result = exportConfigSchema.parse(config);
        expect(result.format).toBe(format);
      }
    });

    it("should reject invalid format", () => {
      const invalidConfig = {
        format: "invalid"
      };

      expect(() => exportConfigSchema.parse(invalidConfig)).toThrow();
    });

    it("should reject maxConcurrency below minimum", () => {
      const invalidConfig = {
        maxConcurrency: 0
      };

      expect(() => exportConfigSchema.parse(invalidConfig)).toThrow();
    });

    it("should reject maxConcurrency above maximum", () => {
      const invalidConfig = {
        maxConcurrency: 51
      };

      expect(() => exportConfigSchema.parse(invalidConfig)).toThrow();
    });

    it("should accept valid maxConcurrency values", () => {
      const validValues = [1, 25, 50];

      for (const value of validValues) {
        const config = { maxConcurrency: value };
        const result = exportConfigSchema.parse(config);
        expect(result.maxConcurrency).toBe(value);
      }
    });

    it("should accept valid boolean values", () => {
      const validConfig = {
        includeBlocks: true,
        includeComments: false,
        includeProperties: true
      };

      const result = exportConfigSchema.parse(validConfig);
      expect(result.includeBlocks).toBe(true);
      expect(result.includeComments).toBe(false);
      expect(result.includeProperties).toBe(true);
    });

    it("should reject non-boolean values for boolean fields", () => {
      const invalidConfig = {
        includeBlocks: "true" as any
      };

      expect(() => exportConfigSchema.parse(invalidConfig)).toThrow();
    });

    it("should handle optional string fields", () => {
      const config = {
        databases: "db1,db2",
        pages: "page1,page2"
      };

      const result = exportConfigSchema.parse(config);
      expect(result.databases).toBe("db1,db2");
      expect(result.pages).toBe("page1,page2");
    });

    it("should handle missing optional string fields", () => {
      const config = {};

      const result = exportConfigSchema.parse(config);
      expect(result.databases).toBeUndefined();
      expect(result.pages).toBeUndefined();
    });

    it("should accept valid path strings", () => {
      const validPaths = [
        "./exports",
        "/absolute/path",
        "relative/path",
        "../../parent/dir",
        "./notion-export-2024-01-01"
      ];

      for (const path of validPaths) {
        const config = { path };
        const result = exportConfigSchema.parse(config);
        expect(result.path).toBe(path);
      }
    });

    it("should handle empty string values", () => {
      const config = {
        databases: "",
        pages: ""
      };

      const result = exportConfigSchema.parse(config);
      expect(result.databases).toBe("");
      expect(result.pages).toBe("");
    });
  });
});