import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import { 
  CombinedConfigLoader, 
  CombinedExportConfig, 
  loadExportConfig, 
  getExportFlags, 
  validateExportConfig,
  commandRegistry 
} from "./combined-config";

// Mock fs module
vi.mock("fs/promises", () => ({
  readFile: vi.fn()
}));

// Mock process.env
const originalEnv = process.env;

describe("CombinedConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.readFile).mockReset();
    // Reset process.env to original state
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("CombinedConfigLoader", () => {
    describe("loadConfigFile", () => {
      it("should load YAML config file", async () => {
        const yamlContent = `
token: ntn_abc123def456ghi789jkl012mno345pqr678stu901vwx23
path: ./yaml-export
format: markdown
        `;
        
        vi.mocked(fs.readFile).mockResolvedValue(yamlContent);

        const config = await CombinedConfigLoader.loadConfigFile("./test-config.yaml");

        expect(config).toEqual({
          token: "ntn_abc123def456ghi789jkl012mno345pqr678stu901vwx23",
          path: "./yaml-export",
          format: "markdown"
        });
      });

      it("should load JSON config file", async () => {
        const jsonContent = JSON.stringify({
          token: "ntn_abc123def456ghi789jkl012mno345pqr678stu901vwx23",
          path: "./json-export",
          format: "json"
        });
        
        vi.mocked(fs.readFile).mockResolvedValue(jsonContent);

        const config = await CombinedConfigLoader.loadConfigFile("./test-config.json");

        expect(config).toEqual({
          token: "ntn_abc123def456ghi789jkl012mno345pqr678stu901vwx23",
          path: "./json-export",
          format: "json"
        });
      });

      it("should return empty config when no file is found", async () => {
        vi.mocked(fs.readFile).mockRejectedValue(new Error("File not found"));

        const config = await CombinedConfigLoader.loadConfigFile("./non-existent.yaml");

        expect(config).toEqual({});
      });

      it("should try multiple file paths", async () => {
        vi.mocked(fs.readFile)
          .mockRejectedValueOnce(new Error("File not found"))
          .mockRejectedValueOnce(new Error("File not found"))
          .mockResolvedValue("token: ntn_abc123def456ghi789jkl012mno345pqr678stu901vwx23");

        const config = await CombinedConfigLoader.loadConfigFile();

        expect(vi.mocked(fs.readFile)).toHaveBeenCalledTimes(3);
        expect(config).toEqual({
          token: "ntn_abc123def456ghi789jkl012mno345pqr678stu901vwx23"
        });
      });
    });

    describe("loadEnvConfig", () => {
      it("should load configuration from environment variables", () => {
        process.env.NOTION_TOKEN = "ntn_abc123def456ghi789jkl012mno345pqr678stu901vwx23";
        process.env.NOTION_CONCURRENCY = "15";
        process.env.NOTION_VERBOSE = "true";
        process.env.NOTION_FLUSH = "false";
        process.env.NOTION_PATH = "./env-export";

        const config = CombinedConfigLoader.loadEnvConfig();

        expect(config).toEqual({
          token: "ntn_abc123def456ghi789jkl012mno345pqr678stu901vwx23",
          concurrency: 15,
          verbose: true,
          flush: false,
          path: "./env-export"
        });
      });

      it("should handle boolean string conversion", () => {
        process.env.NOTION_VERBOSE = "true";
        process.env.NOTION_FLUSH = "false";
        process.env.NOTION_INCLUDE_BLOCKS = "true";
        process.env.NOTION_INCLUDE_COMMENTS = "false";

        const config = CombinedConfigLoader.loadEnvConfig();

        expect(config.verbose).toBe(true);
        expect(config.flush).toBe(false);
        expect(config.includeBlocks).toBe(true);
        expect(config.includeComments).toBe(false);
      });

      it("should handle numeric string conversion", () => {
        process.env.NOTION_CONCURRENCY = "20";
        process.env.NOTION_RETRIES = "5";
        process.env.NOTION_TIMEOUT = "300";
        process.env.NOTION_MAX_CONCURRENCY = "25";

        const config = CombinedConfigLoader.loadEnvConfig();

        expect(config.concurrency).toBe(20);
        expect(config.retries).toBe(5);
        expect(config.timeout).toBe(300);
        expect(config.maxConcurrency).toBe(25);
      });

      it("should ignore undefined environment variables", () => {
        const config = CombinedConfigLoader.loadEnvConfig();

        expect(config).toEqual({});
      });

      it("should handle string values that are not booleans or numbers", () => {
        process.env.NOTION_PATH = "./string-path";
        process.env.NOTION_FORMAT = "markdown";
        process.env.NOTION_DATABASES = "db1,db2,db3";

        const config = CombinedConfigLoader.loadEnvConfig();

        expect(config.path).toBe("./string-path");
        expect(config.format).toBe("markdown");
        expect(config.databases).toBe("db1,db2,db3");
      });
    });

    describe("loadCombinedConfig", () => {
      it("should combine base and export configurations", async () => {
        vi.mocked(fs.readFile).mockResolvedValue(""); // empty config file

        const flags = {
          token: "ntn_abc123def456ghi789jkl012mno345pqr678stu901vwx23",
          concurrency: 5,
          path: "./combined-export",
          format: "json"
        };

        const config = await CombinedConfigLoader.loadCombinedConfig("export", flags);

        expect(config).toEqual({
          token: "ntn_abc123def456ghi789jkl012mno345pqr678stu901vwx23",
          concurrency: 5,
          retries: 3, // default
          timeout: 0, // default
          verbose: false, // default
          flush: false, // default
          path: "./combined-export",
          format: "json",
          maxConcurrency: 10, // default
          includeBlocks: true, // default
          includeComments: false, // default
          includeProperties: true // default
        });
      });

      it("should respect precedence: file < env < flags", async () => {
        const configFile = {
          token: "ntn_abc123def456ghi789jkl012mno345pqr678stu901vwx23",
          concurrency: 5,
          path: "./file-path",
          format: "json"
        };

        process.env.NOTION_TOKEN = "ntn_abc123def456ghi789jkl012mno345pqr678stu901vwx23";
        process.env.NOTION_CONCURRENCY = "10";
        process.env.NOTION_PATH = "./env-path";

        const flags = {
          token: "ntn_abc123def456ghi789jkl012mno345pqr678stu901vwx23",
          concurrency: 15
        };

        vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(configFile));

        const config = await CombinedConfigLoader.loadCombinedConfig("export", flags);

        expect(config.token).toBe("ntn_abc123def456ghi789jkl012mno345pqr678stu901vwx23"); // from flags
        expect(config.concurrency).toBe(15); // from flags
        expect(config.path).toBe("./env-path"); // from env (not in flags)
        expect(config.format).toBe("json"); // from file (not in env or flags)
      });

      it("should handle missing config file gracefully", async () => {
        vi.mocked(fs.readFile).mockRejectedValue(new Error("File not found"));

        const flags = {
          token: "ntn_abc123def456ghi789jkl012mno345pqr678stu901vwx23",
          path: "./test-export"
        };

        const config = await CombinedConfigLoader.loadCombinedConfig("export", flags);

        expect(config.token).toBe("ntn_abc123def456ghi789jkl012mno345pqr678stu901vwx23");
        expect(config.path).toBe("./test-export");
      });
    });

    describe("getCombinedFlags", () => {
      it("should return combined flags for export command", () => {
        const flags = CombinedConfigLoader.getCombinedFlags("export");

        // Base flags
        expect(flags).toHaveProperty("token");
        expect(flags).toHaveProperty("concurrency");
        expect(flags).toHaveProperty("retries");
        expect(flags).toHaveProperty("timeout");
        expect(flags).toHaveProperty("verbose");
        expect(flags).toHaveProperty("flush");

        // Export flags
        expect(flags).toHaveProperty("path");
        expect(flags).toHaveProperty("format");
        expect(flags).toHaveProperty("maxConcurrency");
        expect(flags).toHaveProperty("includeBlocks");
        expect(flags).toHaveProperty("includeComments");
        expect(flags).toHaveProperty("includeProperties");
        expect(flags).toHaveProperty("databases");
        expect(flags).toHaveProperty("pages");

        expect(Object.keys(flags)).toHaveLength(14);
      });
    });

    describe("getCombinedSchema", () => {
      it("should return combined schema for export command", () => {
        const schema = CombinedConfigLoader.getCombinedSchema("export");

        expect(schema).toBeDefined();
        expect(typeof schema.parse).toBe("function");
      });
    });

    describe("validateConfig", () => {
      it("should validate combined configuration", async () => {
        const config = {
          token: "ntn_abc123def456ghi789jkl012mno345pqr678stu901vwx23",
          concurrency: 10,
          retries: 3,
          timeout: 30,
          verbose: true,
          flush: false,
          path: "./test-export",
          format: "json",
          maxConcurrency: 15,
          includeBlocks: true,
          includeComments: false,
          includeProperties: true
        };

        const validatedConfig = await CombinedConfigLoader.validateConfig("export", config);

        expect(validatedConfig).toEqual(config);
      });

      it("should throw error for invalid configuration", async () => {
        const invalidConfig = {
          token: "invalid_token",
          concurrency: -1
        };

        await expect(
          CombinedConfigLoader.validateConfig("export", invalidConfig)
        ).rejects.toThrow();
      });
    });
  });

  describe("Helper functions", () => {
    describe("loadExportConfig", () => {
      it("should load export configuration using helper function", async () => {
        vi.mocked(fs.readFile).mockResolvedValue("");

        const flags = {
          token: "ntn_abc123def456ghi789jkl012mno345pqr678stu901vwx23",
          path: "./helper-export"
        };

        const config = await loadExportConfig(flags);

        expect(config).toBeDefined();
        expect(config.token).toBe("ntn_abc123def456ghi789jkl012mno345pqr678stu901vwx23");
        expect(config.path).toBe("./helper-export");
      });

      it("should load export configuration with config path", async () => {
        vi.mocked(fs.readFile).mockResolvedValue("token: ntn_abc123def456ghi789jkl012mno345pqr678stu901vwx23");

        const flags = {
          path: "./helper-export"
        };

        const config = await loadExportConfig(flags, "./custom-config.yaml");

        expect(config).toBeDefined();
        expect(config.token).toBe("ntn_abc123def456ghi789jkl012mno345pqr678stu901vwx23");
        expect(config.path).toBe("./helper-export");
      });
    });

    describe("getExportFlags", () => {
      it("should return export flags using helper function", () => {
        const flags = getExportFlags();

        expect(flags).toBeDefined();
        expect(flags).toHaveProperty("token");
        expect(flags).toHaveProperty("path");
        expect(flags).toHaveProperty("format");
        expect(Object.keys(flags)).toHaveLength(14);
      });
    });

    describe("validateExportConfig", () => {
      it("should validate export configuration using helper function", async () => {
        const config = {
          token: "ntn_abc123def456ghi789jkl012mno345pqr678stu901vwx23",
          concurrency: 10,
          retries: 3,
          timeout: 30,
          verbose: true,
          flush: false,
          path: "./test-export",
          format: "json",
          maxConcurrency: 15,
          includeBlocks: true,
          includeComments: false,
          includeProperties: true
        };

        const validatedConfig = await validateExportConfig(config);

        expect(validatedConfig).toEqual(config);
      });

      it("should throw error for invalid configuration using helper function", async () => {
        const invalidConfig = {
          token: "invalid_token"
        };

        await expect(validateExportConfig(invalidConfig)).rejects.toThrow();
      });
    });
  });

  describe("Command registry", () => {
    it("should contain export command configuration", () => {
      expect(commandRegistry).toHaveProperty("export");
      expect(commandRegistry.export).toHaveProperty("loader");
      expect(commandRegistry.export).toHaveProperty("schema");
    });

    it("should have valid export command loader", () => {
      expect(commandRegistry.export.loader).toBeDefined();
      expect(typeof commandRegistry.export.loader.loadExportConfig).toBe("function");
      expect(typeof commandRegistry.export.loader.getExportFlags).toBe("function");
      expect(typeof commandRegistry.export.loader.getExportSchema).toBe("function");
    });

    it("should have valid export command schema", () => {
      expect(commandRegistry.export.schema).toBeDefined();
      expect(typeof commandRegistry.export.schema.parse).toBe("function");
    });
  });

  describe("Type checking", () => {
    it("should properly type combined export configuration", async () => {
      vi.mocked(fs.readFile).mockResolvedValue("");

      const flags = {
        token: "ntn_abc123def456ghi789jkl012mno345pqr678stu901vwx23",
        path: "./type-test-export"
      };

      const config: CombinedExportConfig = await loadExportConfig(flags);

      // These should compile without TypeScript errors
      expect(config.token).toBeDefined();
      expect(config.concurrency).toBeDefined();
      expect(config.path).toBeDefined();
      expect(config.format).toBeDefined();
      expect(config.maxConcurrency).toBeDefined();
      expect(config.includeBlocks).toBeDefined();
      expect(config.includeComments).toBeDefined();
      expect(config.includeProperties).toBeDefined();
    });
  });
});