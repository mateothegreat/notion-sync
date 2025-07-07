import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { exportConfigSchema, loadExportConfig, ExportConfig, exportFlags } from "../export-config";
import { z } from "zod";

describe("Export Configuration", () => {
  describe("exportConfigSchema", () => {
    it("should validate a valid configuration", () => {
      const validConfig = {
        path: "./exports",
        databases: [
          { name: "Test DB", id: "db-123" },
          { name: "Another DB", id: "db-456" }
        ],
        pages: "page1,page2,page3",
        format: "json" as const,
        "max-concurrency": 20,
        "include-blocks": true,
        "include-comments": true,
        "include-properties": false,
        output: "./output"
      };

      const result = exportConfigSchema.parse(validConfig);
      expect(result).toEqual(validConfig);
    });

    it("should provide defaults for optional fields", () => {
      const minimalConfig = {};
      const result = exportConfigSchema.parse(minimalConfig);
      
      expect(result.path).toMatch(/^\.\/notion-export-\d{4}-\d{2}-\d{2}$/);
      expect(result.databases).toBeUndefined();
      expect(result.pages).toBeUndefined();
      expect(result.format).toBe("json");
      expect(result["max-concurrency"]).toBe(10);
      expect(result["include-blocks"]).toBe(true);
      expect(result["include-comments"]).toBe(false);
      expect(result["include-properties"]).toBe(true);
      expect(result.output).toBeUndefined();
    });

    it("should validate format options", () => {
      const validFormats = ["json", "markdown", "html", "csv"];
      
      validFormats.forEach(format => {
        const config = { format };
        const result = exportConfigSchema.parse(config);
        expect(result.format).toBe(format);
      });
    });

    it("should reject invalid format", () => {
      const invalidConfig = {
        format: "invalid-format"
      };

      expect(() => exportConfigSchema.parse(invalidConfig)).toThrow();
    });

    it("should reject negative max-concurrency", () => {
      const invalidConfig = {
        "max-concurrency": -1
      };

      expect(() => exportConfigSchema.parse(invalidConfig)).toThrow();
    });

    it("should validate database structure", () => {
      const config = {
        databases: [
          { name: "DB1", id: "id1" },
          { name: "", id: "id2" } // Empty name is allowed
        ]
      };

      const result = exportConfigSchema.parse(config);
      expect(result.databases).toHaveLength(2);
      expect(result.databases![0]).toEqual({ name: "DB1", id: "id1" });
      expect(result.databases![1]).toEqual({ name: "", id: "id2" });
    });
  });

  describe("exportFlags", () => {
    it("should define all required flags", () => {
      expect(exportFlags).toHaveProperty("path");
      expect(exportFlags).toHaveProperty("databases");
      expect(exportFlags).toHaveProperty("pages");
      expect(exportFlags).toHaveProperty("format");
      expect(exportFlags).toHaveProperty("max-concurrency");
      expect(exportFlags).toHaveProperty("include-blocks");
      expect(exportFlags).toHaveProperty("include-comments");
      expect(exportFlags).toHaveProperty("include-properties");
      expect(exportFlags).toHaveProperty("output");
    });

    it("should have correct flag types", () => {
      expect(exportFlags.path.type).toBe("option");
      expect(exportFlags.pages.type).toBe("option");
      expect(exportFlags.format.type).toBe("option");
      expect(exportFlags["max-concurrency"].type).toBe("option");
      expect(exportFlags["include-blocks"].type).toBe("boolean");
      expect(exportFlags["include-comments"].type).toBe("boolean");
      expect(exportFlags["include-properties"].type).toBe("boolean");
    });

    it("should have environment variable mappings", () => {
      expect(exportFlags.path.env).toBe("EXPORT_PATH");
      expect(exportFlags.databases.env).toBe("EXPORT_DATABASES");
      expect(exportFlags.pages.env).toBe("EXPORT_PAGES");
      expect(exportFlags.format.env).toBe("EXPORT_FORMAT");
      expect(exportFlags["max-concurrency"].env).toBe("EXPORT_MAX_CONCURRENCY");
      expect(exportFlags["include-blocks"].env).toBe("EXPORT_INCLUDE_BLOCKS");
      expect(exportFlags["include-comments"].env).toBe("EXPORT_INCLUDE_COMMENTS");
      expect(exportFlags["include-properties"].env).toBe("EXPORT_INCLUDE_PROPERTIES");
      expect(exportFlags.output.env).toBe("EXPORT_OUTPUT");
    });

    it("should have char shortcuts for some flags", () => {
      expect(exportFlags.path.char).toBe("p");
      expect(exportFlags.databases.char).toBe("d");
      expect(exportFlags.format.char).toBe("f");
    });

    it("should have format options", () => {
      expect(exportFlags.format.options).toEqual(["json", "markdown", "html", "csv"]);
    });
  });

  describe("loadExportConfig", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      // Reset environment variables
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it("should load config from CLI flags with highest priority", async () => {
      const flags: Partial<ExportConfig> = {
        path: "./custom-exports",
        format: "markdown",
        "max-concurrency": 25,
        "include-comments": true
      };

      // Set up environment variables (should be overridden)
      process.env.EXPORT_PATH = "./env-exports";
      process.env.EXPORT_FORMAT = "json";
      process.env.EXPORT_MAX_CONCURRENCY = "15";

      const config = await loadExportConfig(flags);

      expect(config.path).toBe("./custom-exports");
      expect(config.format).toBe("markdown");
      expect(config["max-concurrency"]).toBe(25);
      expect(config["include-comments"]).toBe(true);
    });

    it("should load config from environment variables", async () => {
      process.env.EXPORT_PATH = "./env-exports";
      process.env.EXPORT_PAGES = "page1,page2";
      process.env.EXPORT_FORMAT = "html";
      process.env.EXPORT_MAX_CONCURRENCY = "30";
      process.env.EXPORT_INCLUDE_BLOCKS = "false";
      process.env.EXPORT_INCLUDE_COMMENTS = "true";
      process.env.EXPORT_INCLUDE_PROPERTIES = "false";
      process.env.EXPORT_OUTPUT = "./env-output";

      const config = await loadExportConfig();

      // EXPORT_PATH takes priority over EXPORT_OUTPUT for the path field
      expect(config.path).toBe("./env-exports");
      expect(config.pages).toBe("page1,page2");
      expect(config.format).toBe("html");
      expect(config["max-concurrency"]).toBe(30);
      expect(config["include-blocks"]).toBe(false);
      expect(config["include-comments"]).toBe(true);
      expect(config["include-properties"]).toBe(false);
      expect(config.output).toBe("./env-output");
    });

    it("should use defaults when no config is provided", async () => {
      const config = await loadExportConfig();

      expect(config.path).toMatch(/^\.\/notion-export-\d{4}-\d{2}-\d{2}$/);
      expect(config.databases).toBeUndefined();
      expect(config.pages).toBeUndefined();
      expect(config.format).toBe("json");
      expect(config["max-concurrency"]).toBe(10);
      expect(config["include-blocks"]).toBe(true);
      expect(config["include-comments"]).toBe(false);
      expect(config["include-properties"]).toBe(true);
    });

    it("should handle output alias for path", async () => {
      const flags = {
        output: "./output-dir"
      };

      const config = await loadExportConfig(flags);

      expect(config.path).toBe("./output-dir");
      expect(config.output).toBe("./output-dir");
    });

    it("should prioritize path over output if both provided", async () => {
      const flags = {
        path: "./path-dir",
        output: "./output-dir"
      };

      const config = await loadExportConfig(flags);

      expect(config.path).toBe("./path-dir");
      expect(config.output).toBe("./output-dir");
    });

    it("should use output as path from environment", async () => {
      process.env.EXPORT_OUTPUT = "./env-output-dir";

      const config = await loadExportConfig();

      expect(config.path).toBe("./env-output-dir");
      expect(config.output).toBe("./env-output-dir");
    });

    it("should parse boolean environment variables correctly", async () => {
      process.env.EXPORT_INCLUDE_BLOCKS = "true";
      process.env.EXPORT_INCLUDE_COMMENTS = "false";
      process.env.EXPORT_INCLUDE_PROPERTIES = "true";

      const config = await loadExportConfig();

      expect(config["include-blocks"]).toBe(true);
      expect(config["include-comments"]).toBe(false);
      expect(config["include-properties"]).toBe(true);
    });

    it("should handle invalid environment variable values gracefully", async () => {
      process.env.EXPORT_MAX_CONCURRENCY = "invalid";
      process.env.EXPORT_FORMAT = "invalid-format";

      await expect(loadExportConfig()).rejects.toThrow();
    });

    it("should merge environment and flags correctly", async () => {
      process.env.EXPORT_PATH = "./env-path";
      process.env.EXPORT_FORMAT = "json";
      process.env.EXPORT_INCLUDE_BLOCKS = "false";

      const flags = {
        format: "markdown",
        "include-comments": true
      };

      const config = await loadExportConfig(flags);

      expect(config.path).toBe("./env-path"); // From env
      expect(config.format).toBe("markdown"); // From flags (overrides env)
      expect(config["include-blocks"]).toBe(false); // From env
      expect(config["include-comments"]).toBe(true); // From flags
    });
  });
});