import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ExportCommandConfig,
  exportCommandConfigSchema,
  loadExportCommandConfig,
  commandConfigLoaders,
  getCommandConfigLoader
} from "../config-combiner";
import * as baseConfig from "../base-config";
import * as exportConfig from "../export-config";

// Only mock the loader functions, not the schemas
vi.mock("../base-config", async () => {
  const actual = await vi.importActual<typeof import("../base-config")>("../base-config");
  return {
    ...actual,
    loadBaseConfig: vi.fn()
  };
});

vi.mock("../export-config", async () => {
  const actual = await vi.importActual<typeof import("../export-config")>("../export-config");
  return {
    ...actual,
    loadExportConfig: vi.fn()
  };
});

describe("Config Combiner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("exportCommandConfigSchema", () => {
    it("should merge base and export schemas", () => {
      // The merged schema should accept properties from both schemas
      const validConfig = {
        // Base config properties
        token: "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",
        concurrency: 10,
        retries: 3,
        timeout: 300,
        verbose: true,
        flush: false,
        // Export config properties
        path: "./exports",
        format: "json",
        "max-concurrency": 20,
        "include-blocks": true,
        "include-comments": false,
        "include-properties": true
      };

      const result = exportCommandConfigSchema.parse(validConfig);
      expect(result).toMatchObject(validConfig);
    });

    it("should apply defaults from both schemas", () => {
      const minimalConfig = {};
      const result = exportCommandConfigSchema.parse(minimalConfig);

      // Base config defaults
      expect(result.concurrency).toBe(10);
      expect(result.retries).toBe(3);
      expect(result.timeout).toBe(0);
      expect(result.verbose).toBe(false);
      expect(result.flush).toBe(false);

      // Export config defaults
      expect(result.path).toMatch(/^\.\/notion-export-\d{4}-\d{2}-\d{2}$/);
      expect(result.format).toBe("json");
      expect(result["max-concurrency"]).toBe(10);
      expect(result["include-blocks"]).toBe(true);
      expect(result["include-comments"]).toBe(false);
      expect(result["include-properties"]).toBe(true);
    });

    it("should validate combined constraints", () => {
      const invalidConfig = {
        token: "invalid-token", // Invalid base config
        format: "invalid-format" // Invalid export config
      };

      expect(() => exportCommandConfigSchema.parse(invalidConfig)).toThrow();
    });
  });

  describe("loadExportCommandConfig", () => {
    it("should split and load flags correctly", async () => {
      // Mock the configs to return what would be returned after processing the flags
      const mockBaseConfig = {
        token: "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",
        concurrency: 10,
        retries: 3,
        timeout: 0,
        verbose: true,  // Changed from false to true based on flags
        flush: false
      };

      const mockExportConfig = {
        path: "./custom-exports",  // Changed from "./exports" to "./custom-exports" based on flags
        format: "markdown" as "markdown",  // Changed from "json" to "markdown" based on flags
        "max-concurrency": 10,
        "include-blocks": true,
        "include-comments": false,
        "include-properties": true
      };

      vi.mocked(baseConfig.loadBaseConfig).mockResolvedValue(mockBaseConfig);
      vi.mocked(exportConfig.loadExportConfig).mockResolvedValue(mockExportConfig);

      const flags: Partial<ExportCommandConfig> = {
        token: "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",
        verbose: true,
        path: "./custom-exports",
        format: "markdown"
      };

      const result = await loadExportCommandConfig(flags);

      // Verify base config loader was called with base flags only
      expect(baseConfig.loadBaseConfig).toHaveBeenCalledWith({
        token: "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",
        verbose: true
      });

      // Verify export config loader was called with export flags only
      expect(exportConfig.loadExportConfig).toHaveBeenCalledWith({
        path: "./custom-exports",
        format: "markdown"
      });

      // Verify combined result - should just be the merged configs
      expect(result).toEqual({
        ...mockBaseConfig,
        ...mockExportConfig
      });
    });

    it("should handle all flag types correctly", async () => {
      const allFlags: Partial<ExportCommandConfig> = {
        // Base flags
        token: "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",
        concurrency: 20,
        retries: 5,
        timeout: 600,
        verbose: true,
        flush: true,
        // Export flags
        path: "./exports",
        databases: [{ name: "DB1", id: "id1" }],
        pages: "page1,page2",
        format: "html",
        "max-concurrency": 30,
        "include-blocks": false,
        "include-comments": true,
        "include-properties": false,
        output: "./output"
      };

      vi.mocked(baseConfig.loadBaseConfig).mockResolvedValue({
        token: allFlags.token!,
        concurrency: allFlags.concurrency!,
        retries: allFlags.retries!,
        timeout: allFlags.timeout!,
        verbose: allFlags.verbose!,
        flush: allFlags.flush!
      });

      vi.mocked(exportConfig.loadExportConfig).mockResolvedValue({
        path: allFlags.path!,
        databases: allFlags.databases,
        pages: allFlags.pages,
        format: allFlags.format as any,
        "max-concurrency": allFlags["max-concurrency"]!,
        "include-blocks": allFlags["include-blocks"]!,
        "include-comments": allFlags["include-comments"]!,
        "include-properties": allFlags["include-properties"]!,
        output: allFlags.output
      });

      await loadExportCommandConfig(allFlags);

      // Verify all base flags were passed correctly
      expect(baseConfig.loadBaseConfig).toHaveBeenCalledWith({
        token: allFlags.token,
        concurrency: allFlags.concurrency,
        retries: allFlags.retries,
        timeout: allFlags.timeout,
        verbose: allFlags.verbose,
        flush: allFlags.flush
      });

      // Verify all export flags were passed correctly
      expect(exportConfig.loadExportConfig).toHaveBeenCalledWith({
        path: allFlags.path,
        databases: allFlags.databases,
        pages: allFlags.pages,
        format: allFlags.format,
        "max-concurrency": allFlags["max-concurrency"],
        "include-blocks": allFlags["include-blocks"],
        "include-comments": allFlags["include-comments"],
        "include-properties": allFlags["include-properties"],
        output: allFlags.output
      });
    });

    it("should handle empty flags", async () => {
      vi.mocked(baseConfig.loadBaseConfig).mockResolvedValue({
        concurrency: 10,
        retries: 3,
        timeout: 0,
        verbose: false,
        flush: false
      });

      vi.mocked(exportConfig.loadExportConfig).mockResolvedValue({
        path: "./notion-export-2024-01-01",
        format: "json",
        "max-concurrency": 10,
        "include-blocks": true,
        "include-comments": false,
        "include-properties": true
      });

      const result = await loadExportCommandConfig();

      expect(baseConfig.loadBaseConfig).toHaveBeenCalledWith({});
      expect(exportConfig.loadExportConfig).toHaveBeenCalledWith({});
      expect(result).toBeDefined();
    });
  });

  describe("commandConfigLoaders", () => {
    it("should have export command loader", () => {
      expect(commandConfigLoaders).toHaveProperty("export");
      expect(commandConfigLoaders.export).toHaveProperty("load");
      expect(commandConfigLoaders.export).toHaveProperty("schema");
      expect(commandConfigLoaders.export.load).toBe(loadExportCommandConfig);
      expect(commandConfigLoaders.export.schema).toBe(exportCommandConfigSchema);
    });

    it("should be extensible for new commands", () => {
      // The structure allows for easy addition of new commands
      const loaders = commandConfigLoaders;
      expect(typeof loaders).toBe("object");
      
      // Future commands can be added like:
      // loaders.import = { load: loadImportCommandConfig, schema: importCommandConfigSchema };
    });
  });

  describe("getCommandConfigLoader", () => {
    it("should return loader for export command", () => {
      const loader = getCommandConfigLoader("export");
      expect(loader).toBe(commandConfigLoaders.export);
      expect(loader.load).toBe(loadExportCommandConfig);
      expect(loader.schema).toBe(exportCommandConfigSchema);
    });

    it("should have correct TypeScript typing", () => {
      // This is mainly a compile-time check, but we can verify the runtime behavior
      const loader = getCommandConfigLoader("export");
      expect(loader).toHaveProperty("load");
      expect(loader).toHaveProperty("schema");
      expect(typeof loader.load).toBe("function");
      expect(loader.schema).toBeDefined();
    });
  });
});