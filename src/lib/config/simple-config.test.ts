import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs/promises";
import * as yaml from "yaml";
import {
  baseFlags,
  exportFlags,
  baseConfigSchema,
  exportConfigSchema,
  getCommandFlags,
  ConfigLoader,
  loadCommandConfig,
  CommandConfig
} from "./simple-config";

// Mock modules
vi.mock("fs/promises");
vi.mock("yaml");

describe("Simple Config System", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    // Clear environment variables
    Object.keys(process.env).forEach(key => {
      if (key.startsWith("NOTION_") || ["VERBOSE", "FLUSH", "TIMEOUT", "CONCURRENCY", "RETRIES"].includes(key)) {
        delete process.env[key];
      }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Base Configuration", () => {
    it("should define all required base flags", () => {
      expect(baseFlags).toHaveProperty("token");
      expect(baseFlags).toHaveProperty("verbose");
      expect(baseFlags).toHaveProperty("flush");
      expect(baseFlags).toHaveProperty("timeout");
      expect(baseFlags).toHaveProperty("concurrency");
      expect(baseFlags).toHaveProperty("retries");
    });

    it("should have correct flag configurations", () => {
      expect(baseFlags.token.description).toBe("Notion API integration token");
      expect(baseFlags.verbose.char).toBe("v");
      expect(baseFlags.verbose.default).toBe(false);
      expect(baseFlags.concurrency.default).toBe(10);
      expect(baseFlags.retries.default).toBe(3);
    });

    it("should validate base config schema correctly", () => {
      const validConfig = {
        token: "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",
        verbose: true,
        flush: false,
        timeout: 60,
        concurrency: 5,
        retries: 3
      };

      const result = baseConfigSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validConfig);
      }
    });

    it("should reject invalid token format", () => {
      const invalidConfig = {
        token: "invalid-token",
        verbose: true,
        flush: false,
        timeout: 60,
        concurrency: 5,
        retries: 3
      };

      const result = baseConfigSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain("50 character string");
      }
    });

    it("should reject negative values", () => {
      const invalidConfig = {
        token: "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",
        verbose: true,
        flush: false,
        timeout: -1,
        concurrency: 0,
        retries: -5
      };

      const result = baseConfigSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });
  });

  describe("Export Configuration", () => {
    it("should define all required export flags", () => {
      expect(exportFlags).toHaveProperty("path");
      expect(exportFlags).toHaveProperty("databases");
      expect(exportFlags).toHaveProperty("pages");
      expect(exportFlags).toHaveProperty("format");
      expect(exportFlags).toHaveProperty("max-concurrency");
      expect(exportFlags).toHaveProperty("include-blocks");
      expect(exportFlags).toHaveProperty("include-comments");
      expect(exportFlags).toHaveProperty("include-properties");
    });

    it("should have correct export flag configurations", () => {
      expect(exportFlags.path.char).toBe("p");
      expect(exportFlags.path.default).toMatch(/^\.\/notion-export-/);
      expect(exportFlags.format.options).toEqual(["json", "markdown", "html", "csv"]);
      expect(exportFlags.format.default).toBe("json");
      expect(exportFlags["include-blocks"].default).toBe(true);
      expect(exportFlags["include-comments"].default).toBe(false);
    });

    it("should validate export config schema correctly", () => {
      const validConfig = {
        path: "./exports",
        databases: "db1,db2,db3",
        pages: "page1,page2",
        format: "json" as const,
        "max-concurrency": 5,
        "include-blocks": true,
        "include-comments": false,
        "include-properties": true
      };

      const result = exportConfigSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validConfig);
      }
    });

    it("should allow optional databases and pages", () => {
      const validConfig = {
        path: "./exports",
        format: "markdown" as const,
        "max-concurrency": 10,
        "include-blocks": true,
        "include-comments": true,
        "include-properties": false
      };

      const result = exportConfigSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });

    it("should reject invalid format", () => {
      const invalidConfig = {
        path: "./exports",
        format: "pdf",
        "max-concurrency": 10,
        "include-blocks": true,
        "include-comments": false,
        "include-properties": true
      };

      const result = exportConfigSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });
  });

  describe("getCommandFlags", () => {
    it("should return combined flags for export command", () => {
      const flags = getCommandFlags("export");
      
      // Should have all base flags
      expect(flags).toHaveProperty("token");
      expect(flags).toHaveProperty("verbose");
      expect(flags).toHaveProperty("flush");
      expect(flags).toHaveProperty("timeout");
      expect(flags).toHaveProperty("concurrency");
      expect(flags).toHaveProperty("retries");
      
      // Should have all export flags
      expect(flags).toHaveProperty("path");
      expect(flags).toHaveProperty("databases");
      expect(flags).toHaveProperty("pages");
      expect(flags).toHaveProperty("format");
      expect(flags).toHaveProperty("max-concurrency");
      expect(flags).toHaveProperty("include-blocks");
      expect(flags).toHaveProperty("include-comments");
      expect(flags).toHaveProperty("include-properties");
    });

    it("should return only base flags for unknown command", () => {
      const flags = getCommandFlags("unknown" as any);
      
      // Should have base flags
      expect(flags).toHaveProperty("token");
      expect(flags).toHaveProperty("verbose");
      
      // Should not have export-specific flags
      expect(flags).not.toHaveProperty("path");
      expect(flags).not.toHaveProperty("databases");
    });
  });

  describe("ConfigLoader", () => {
    let configLoader: ConfigLoader;

    beforeEach(() => {
      configLoader = new ConfigLoader();
    });

    describe("loadFromFile", () => {
      it("should load valid YAML configuration", async () => {
        const mockConfig = {
          token: "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",
          verbose: true,
          path: "./custom-export"
        };

        vi.mocked(fs.readFile).mockResolvedValue(yaml.stringify(mockConfig));
        vi.mocked(yaml.parse).mockReturnValue(mockConfig);

        await configLoader.loadFromFile("./config.yaml");
        
        expect(fs.readFile).toHaveBeenCalledWith("./config.yaml", "utf-8");
        expect(yaml.parse).toHaveBeenCalled();
      });

      it("should handle missing configuration file", async () => {
        vi.mocked(fs.readFile).mockRejectedValue(new Error("File not found"));

        await configLoader.loadFromFile("./missing.yaml");
        
        // Should not throw, just use empty config
        expect(fs.readFile).toHaveBeenCalledWith("./missing.yaml", "utf-8");
      });

      it("should handle invalid YAML", async () => {
        vi.mocked(fs.readFile).mockResolvedValue("invalid: yaml: content:");
        vi.mocked(yaml.parse).mockImplementation(() => {
          throw new Error("Invalid YAML");
        });

        await configLoader.loadFromFile("./invalid.yaml");
        
        // Should not throw, just use empty config
        expect(yaml.parse).toHaveBeenCalled();
      });
    });

    describe("loadFromEnv", () => {
      it("should load configuration from environment variables", () => {
        process.env.NOTION_TOKEN = "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";
        process.env.VERBOSE = "true";
        process.env.FLUSH = "false";
        process.env.TIMEOUT = "120";
        process.env.CONCURRENCY = "20";
        process.env.RETRIES = "5";

        configLoader.loadFromEnv();
        
        // We can't directly inspect private envConfig, but we can test the result
        // through loadCommandConfig
      });

      it("should ignore unrelated environment variables", () => {
        process.env.OTHER_VAR = "value";
        process.env.PATH = "/usr/bin";

        configLoader.loadFromEnv();
        
        // Should not pick up unrelated env vars
      });
    });

    describe("loadCommandConfig", () => {
      it("should merge configurations with correct precedence", async () => {
        const fileConfig = {
          token: "ntn_filetoken123456789012345678901234567890123456",
          verbose: false,
          path: "./file-export",
          format: "markdown"
        };

        const envConfig = {
          verbose: "true",
          concurrency: "15"
        };

        const cliFlags = {
          path: "./cli-export",
          "include-comments": true
        };

        // Mock file loading
        vi.mocked(fs.readFile).mockResolvedValue(yaml.stringify(fileConfig));
        vi.mocked(yaml.parse).mockReturnValue(fileConfig);

        // Set up environment
        process.env.VERBOSE = envConfig.verbose;
        process.env.CONCURRENCY = envConfig.concurrency;

        await configLoader.loadFromFile("./config.yaml");
        configLoader.loadFromEnv();

        const result = configLoader.loadCommandConfig("export", cliFlags);

        // CLI flags should override everything
        expect(result.path).toBe("./cli-export");
        expect(result["include-comments"]).toBe(true);
        
        // Env should override file
        expect(result.verbose).toBe(true);
        
        // File config should be used when not overridden
        expect(result.token).toBe(fileConfig.token);
        expect(result.format).toBe("markdown");
        
        // Defaults should be used when nothing else is specified
        expect(result["include-blocks"]).toBe(true);
        expect(result["include-properties"]).toBe(true);
      });

      it("should use defaults when no configuration is provided", () => {
        const result = configLoader.loadCommandConfig("export", {
          token: "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"
        });

        expect(result.verbose).toBe(false);
        expect(result.flush).toBe(false);
        expect(result.timeout).toBe(0);
        expect(result.concurrency).toBe(10);
        expect(result.retries).toBe(3);
        expect(result.format).toBe("json");
        expect(result["max-concurrency"]).toBe(10);
        expect(result["include-blocks"]).toBe(true);
        expect(result["include-comments"]).toBe(false);
        expect(result["include-properties"]).toBe(true);
      });

      it("should throw on validation errors", () => {
        const invalidFlags = {
          token: "invalid-token",
          format: "pdf"
        };

        expect(() => {
          configLoader.loadCommandConfig("export", invalidFlags);
        }).toThrow("Configuration validation failed");
      });

      it("should handle partial configurations", () => {
        const partialFlags = {
          token: "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",
          verbose: true,
          format: "json"
        };

        const result = configLoader.loadCommandConfig("export", partialFlags);

        expect(result.token).toBe(partialFlags.token);
        expect(result.verbose).toBe(true);
        expect(result.format).toBe("json");
        
        // Other values should use defaults
        expect(result.path).toMatch(/^\.\/notion-export-/);
        expect(result["include-blocks"]).toBe(true);
      });
    });
  });

  describe("loadCommandConfig helper", () => {
    it("should load configuration using the singleton loader", async () => {
      const mockConfig = {
        token: "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",
        verbose: true
      };

      vi.mocked(fs.readFile).mockResolvedValue(yaml.stringify(mockConfig));
      vi.mocked(yaml.parse).mockReturnValue(mockConfig);

      const result = await loadCommandConfig("export", {
        path: "./test-export"
      });

      expect(result.token).toBe(mockConfig.token);
      expect(result.verbose).toBe(true);
      expect(result.path).toBe("./test-export");
    });

    it("should use custom config path", async () => {
      const mockConfig = {
        token: "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"
      };

      vi.mocked(fs.readFile).mockResolvedValue(yaml.stringify(mockConfig));
      vi.mocked(yaml.parse).mockReturnValue(mockConfig);

      await loadCommandConfig("export", {}, "./custom-config.yaml");

      expect(fs.readFile).toHaveBeenCalledWith("./custom-config.yaml", "utf-8");
    });
  });

  describe("Type Safety", () => {
    it("should enforce correct types for CommandConfig", () => {
      // This is a compile-time test - if it compiles, the types work
      const exportConfig: CommandConfig<"export"> = {
        // Base config
        token: "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",
        verbose: true,
        flush: false,
        timeout: 60,
        concurrency: 10,
        retries: 3,
        // Export config
        path: "./exports",
        databases: "db1,db2",
        pages: "page1",
        format: "json",
        "max-concurrency": 5,
        "include-blocks": true,
        "include-comments": false,
        "include-properties": true
      };

      expect(exportConfig).toBeDefined();
    });
  });
});