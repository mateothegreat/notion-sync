/**
 * Configuration System Tests
 *
 * Tests unified configuration management with validation and multiple sources
 */
import { promises as fs } from "fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AppConfigSchema,
  createConfigLoader,
  createEnvironmentConfig,
  defaultConfig,
  exportConfig,
  getConfigSection,
  loadConfig,
  validateConfig
} from "../";
import { getTest } from "../../../test/settings";
import { log } from "../../lib/log";

// Mock fs for file operations
vi.mock("fs", () => ({
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    watch: vi.fn()
  }
}));

const mockedFs = vi.mocked(fs);

describe("Configuration System", () => {
  let originalEnv: NodeJS.ProcessEnv;
  let originalArgv: string[];

  beforeEach(() => {
    // Backup original environment and argv
    originalEnv = { ...process.env };
    originalArgv = [...process.argv];

    // Clear all environment variables starting with NOTION_SYNC_
    Object.keys(process.env).forEach((key) => {
      if (key.startsWith("NOTION_SYNC_")) {
        delete process.env[key];
      }
    });

    // Reset argv
    process.argv = ["node", "script.js"];

    // Clear all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore original environment and argv
    process.env = originalEnv;
    process.argv = originalArgv;
  });

  describe("schema validation", () => {
    it("should validate complete config correctly", () => {
      const t = getTest("config-validation", "config-validation");
      log.debugging.inspect("test", t);
      const config = {
        notion: {
          apiKey: "test-key",
          apiVersion: "2022-06-28",
          baseUrl: "https://api.notion.com",
          timeout: 10000,
          retryAttempts: 3
        },
        export: {
          defaultOutputPath: "./exports",
          defaultFormat: "json" as const,
          maxConcurrency: 5,
          chunkSize: 100,
          enableResume: true,
          maxDepth: 3,
          includeArchived: false
        },
        performance: {
          rateLimits: {
            pages: 10,
            blocks: 15,
            databases: 5,
            comments: 8,
            users: 3,
            properties: 20
          },
          circuitBreaker: {
            failureThreshold: 5,
            resetTimeout: 60000,
            monitoringPeriod: 60000
          },
          caching: {
            enabled: false,
            ttl: 300000,
            maxSize: 1000
          },
          memoryLimits: {
            heapWarningThreshold: 209715200,
            heapErrorThreshold: 419430400,
            autoGcThreshold: 157286400
          }
        },
        monitoring: {
          enableMetrics: false,
          enableLogging: true,
          logLevel: "info" as const,
          enableHealthCheck: true,
          metricsPort: 3001,
          healthCheckPort: 3000,
          exportMetrics: false,
          prometheusEndpoint: "/metrics"
        },
        deployment: {
          environment: "development" as const,
          nodeEnv: "development",
          port: 3000,
          enableClusterMode: false,
          maxWorkers: 4,
          gracefulShutdownTimeout: 30000,
          enableHotReload: false
        }
      };

      const result = validateConfig(config);
      expect(result).toEqual(config);
    });

    it("should throw error for invalid configuration", () => {
      const invalidConfig = {
        notion: {
          apiKey: "", // Empty string should fail
          timeout: -1 // Negative number should fail
        },
        export: {
          defaultFormat: "invalid" // Invalid enum value
        }
      };

      expect(() => validateConfig(invalidConfig)).toThrow(/Configuration validation failed/);
    });

    it("should apply defaults for missing values", () => {
      const partialConfig = {
        notion: {
          apiKey: "test-key"
        }
      };

      const result = validateConfig(partialConfig);
      expect(result.notion.apiVersion).toBe("2022-06-28");
      expect(result.notion.baseUrl).toBe("https://api.notion.com");
      expect(result.export.defaultFormat).toBe("json");
      expect(result.performance.rateLimits.pages).toBe(10);
    });
  });

  describe("environment variable loading", () => {
    it("should load configuration from environment variables", async () => {
      process.env.NOTION_SYNC_NOTION_API_KEY = "env-api-key";
      process.env.NOTION_SYNC_NOTION_TIMEOUT = "45000";
      process.env.NOTION_SYNC_EXPORT_MAX_CONCURRENCY = "10";
      process.env.NOTION_SYNC_MONITORING_ENABLE_METRICS = "true";
      process.env.NOTION_SYNC_MONITORING_LOG_LEVEL = "debug";

      mockedFs.readFile.mockRejectedValue(new Error("ENOENT"));

      const config = await loadConfig();

      expect(config.notion.apiKey).toBe("env-api-key");
      expect(config.notion.timeout).toBe(45000);
      expect(config.export.maxConcurrency).toBe(10);
      expect(config.monitoring.enableMetrics).toBe(true);
      expect(config.monitoring.logLevel).toBe("debug");
    });

    it("should handle custom environment prefix", async () => {
      process.env.CUSTOM_PREFIX_NOTION_API_KEY = "custom-key";
      process.env.CUSTOM_PREFIX_EXPORT_MAX_CONCURRENCY = "8";

      mockedFs.readFile.mockRejectedValue(new Error("ENOENT"));

      const config = await loadConfig({ envPrefix: "CUSTOM_PREFIX_" });

      expect(config.notion.apiKey).toBe("custom-key");
      expect(config.export.maxConcurrency).toBe(8);
    });

    it("should handle boolean conversion from strings", async () => {
      process.env.NOTION_SYNC_EXPORT_ENABLE_RESUME = "false";
      process.env.NOTION_SYNC_MONITORING_ENABLE_METRICS = "true";

      mockedFs.readFile.mockRejectedValue(new Error("ENOENT"));

      const config = await loadConfig();

      expect(config.export.enableResume).toBe(false);
      expect(config.monitoring.enableMetrics).toBe(true);
    });

    it("should handle number conversion from strings", async () => {
      process.env.NOTION_SYNC_NOTION_TIMEOUT = "25000";
      process.env.NOTION_SYNC_DEPLOYMENT_PORT = "4000";

      mockedFs.readFile.mockRejectedValue(new Error("ENOENT"));

      const config = await loadConfig();

      expect(config.notion.timeout).toBe(25000);
      expect(config.deployment.port).toBe(4000);
    });
  });

  describe("file loading", () => {
    it("should load configuration from JSON file", async () => {
      const fileConfig = {
        notion: {
          apiKey: "file-api-key",
          timeout: 35000
        },
        export: {
          maxConcurrency: 7
        }
      };

      mockedFs.readFile.mockResolvedValue(JSON.stringify(fileConfig));

      const config = await loadConfig({ configFile: "test-config.json" });

      expect(config.notion.apiKey).toBe("file-api-key");
      expect(config.notion.timeout).toBe(35000);
      expect(config.export.maxConcurrency).toBe(7);
    });

    it("should handle missing config file gracefully", async () => {
      mockedFs.readFile.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));

      const config = await loadConfig();

      // Should use defaults
      expect(config.notion.apiVersion).toBe("2022-06-28");
      expect(config.export.defaultFormat).toBe("json");
    });

    it("should handle malformed JSON file", async () => {
      mockedFs.readFile.mockResolvedValue("invalid json");

      await expect(loadConfig({ configFile: "bad-config.json" })).rejects.toThrow();
    });

    it("should prioritize file config over defaults", async () => {
      const fileConfig = {
        notion: {
          apiKey: "file-key",
          timeout: 20000
        }
      };

      mockedFs.readFile.mockResolvedValue(JSON.stringify(fileConfig));

      const config = await loadConfig();

      expect(config.notion.apiKey).toBe("file-key");
      expect(config.notion.timeout).toBe(20000);
      // Should still have defaults for other values
      expect(config.notion.apiVersion).toBe("2022-06-28");
    });
  });

  describe("argument parsing", () => {
    it("should load configuration from command line arguments", async () => {
      process.argv = [
        "node",
        "script.js",
        "--notion.api-key=arg-key",
        "--export.max-concurrency=12",
        "--monitoring.log-level=warn"
      ];

      mockedFs.readFile.mockRejectedValue(new Error("ENOENT"));

      const config = await loadConfig();

      expect(config.notion.apiKey).toBe("arg-key");
      expect(config.export.maxConcurrency).toBe(12);
      expect(config.monitoring.logLevel).toBe("warn");
    });

    it("should handle complex nested arguments", async () => {
      process.argv = [
        "node",
        "script.js",
        "--performance.rate-limits.pages=15",
        "--performance.circuit-breaker.failure-threshold=8"
      ];

      mockedFs.readFile.mockRejectedValue(new Error("ENOENT"));

      const config = await loadConfig();

      expect(config.performance.rateLimits.pages).toBe(15);
      expect(config.performance.circuitBreaker.failureThreshold).toBe(8);
    });
  });

  describe("configuration precedence", () => {
    it("should follow correct precedence order", async () => {
      // Setup file config
      const fileConfig = {
        notion: {
          apiKey: "file-key",
          timeout: 20000
        },
        export: {
          maxConcurrency: 3
        }
      };
      mockedFs.readFile.mockResolvedValue(JSON.stringify(fileConfig));

      // Setup environment variables
      process.env.NOTION_SYNC_NOTION_API_KEY = "env-key";
      process.env.NOTION_SYNC_EXPORT_MAX_CONCURRENCY = "6";

      // Setup arguments
      process.argv = ["node", "script.js", "--notion.api-key=arg-key"];

      const config = await loadConfig();

      // Arguments should override environment and file
      expect(config.notion.apiKey).toBe("arg-key");
      // Environment should override file
      expect(config.export.maxConcurrency).toBe(6);
      // File should override defaults
      expect(config.notion.timeout).toBe(20000);
    });
  });

  describe("utility functions", () => {
    it("should get configuration section", () => {
      const config = defaultConfig;
      const notionConfig = getConfigSection(config, "notion");

      expect(notionConfig).toBe(config.notion);
      expect(notionConfig.apiVersion).toBe("2022-06-28");
    });

    it("should create custom config loader", async () => {
      const customSchema = AppConfigSchema.pick({ notion: true });
      const customLoader = createConfigLoader(customSchema);

      mockedFs.readFile.mockRejectedValue(new Error("ENOENT"));

      const config = await customLoader();

      expect(config).toHaveProperty("notion");
      expect(config).not.toHaveProperty("export");
    });

    it("should export configuration to file", async () => {
      const config = defaultConfig;

      await exportConfig(config, "output.json");

      expect(mockedFs.writeFile).toHaveBeenCalledWith("output.json", JSON.stringify(config, null, 2), "utf-8");
    });

    it("should create environment-specific configuration", () => {
      const devConfig = createEnvironmentConfig("development");
      const prodConfig = createEnvironmentConfig("production");

      expect(devConfig.monitoring?.logLevel).toBe("debug");
      expect(prodConfig.monitoring?.logLevel).toBe("warn");
      expect(prodConfig.security?.enableApiKeyRotation).toBe(true);
    });
  });

  describe("validation options", () => {
    it("should skip validation when disabled", async () => {
      const invalidConfig = {
        notion: {
          apiKey: "", // This would normally fail validation
          timeout: -1
        }
      };

      mockedFs.readFile.mockResolvedValue(JSON.stringify(invalidConfig));

      const config = await loadConfig({ validate: false });

      expect(config.notion.apiKey).toBe("");
      expect(config.notion.timeout).toBe(-1);
    });

    it("should use custom schema for validation", async () => {
      const customSchema = AppConfigSchema.pick({ notion: true });

      mockedFs.readFile.mockRejectedValue(new Error("ENOENT"));

      const config = await loadConfig({ schema: customSchema });

      expect(config).toHaveProperty("notion");
      expect(config).not.toHaveProperty("export");
    });
  });

  describe("edge cases", () => {
    it("should handle empty environment variables", async () => {
      process.env.NOTION_SYNC_NOTION_API_KEY = "";

      mockedFs.readFile.mockRejectedValue(new Error("ENOENT"));

      await expect(loadConfig()).rejects.toThrow(/Configuration validation failed/);
    });

    it("should handle nested object merging", async () => {
      const fileConfig = {
        performance: {
          rateLimits: {
            pages: 20
          }
        }
      };

      mockedFs.readFile.mockResolvedValue(JSON.stringify(fileConfig));

      process.env.NOTION_SYNC_PERF_RATE_LIMIT_BLOCKS = "25";

      const config = await loadConfig();

      expect(config.performance.rateLimits.pages).toBe(20);
      expect(config.performance.rateLimits.blocks).toBe(25);
      expect(config.performance.rateLimits.databases).toBe(5); // Default value
    });

    it("should handle malformed argument values", async () => {
      process.argv = ["node", "script.js", "--notion.timeout=not-a-number"];

      mockedFs.readFile.mockRejectedValue(new Error("ENOENT"));

      await expect(loadConfig()).rejects.toThrow(/Configuration validation failed/);
    });

    it("should handle unknown environment keys", async () => {
      process.env.NOTION_SYNC_UNKNOWN_KEY = "value";

      mockedFs.readFile.mockRejectedValue(new Error("ENOENT"));

      const config = await loadConfig();

      // Should not affect valid configuration
      expect(config.notion.apiVersion).toBe("2022-06-28");
    });

    it("should handle non-string environment values", async () => {
      // This is more of a TypeScript check, but good to verify
      process.env.NOTION_SYNC_NOTION_TIMEOUT = "30000";

      mockedFs.readFile.mockRejectedValue(new Error("ENOENT"));

      const config = await loadConfig();

      expect(typeof config.notion.timeout).toBe("number");
      expect(config.notion.timeout).toBe(30000);
    });
  });

  describe("type safety", () => {
    it("should maintain type safety for configuration sections", () => {
      const config = defaultConfig;

      // These should all compile without TypeScript errors
      const notionConfig = getConfigSection(config, "notion");
      const exportConfig = getConfigSection(config, "export");
      const perfConfig = getConfigSection(config, "performance");
      const monitoringConfig = getConfigSection(config, "monitoring");
      const securityConfig = getConfigSection(config, "security");
      const deploymentConfig = getConfigSection(config, "deployment");

      expect(notionConfig.apiVersion).toBe("2022-06-28");
      expect(exportConfig.defaultFormat).toBe("json");
      expect(perfConfig.rateLimits.pages).toBe(10);
      expect(monitoringConfig.logLevel).toBe("info");
      expect(securityConfig.enableApiKeyRotation).toBe(false);
      expect(deploymentConfig.environment).toBe("development");
    });
  });
});
