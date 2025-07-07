import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { baseConfigSchema, loadBaseConfig, BaseConfig, baseFlags } from "../base-config";
import { promises as fs } from "fs";
import * as yaml from "yaml";
import { z } from "zod";

// Mock fs and yaml modules
vi.mock("fs", () => ({
  promises: {
    readFile: vi.fn()
  }
}));

vi.mock("yaml", () => ({
  parse: vi.fn()
}));

describe("Base Configuration", () => {
  describe("baseConfigSchema", () => {
    it("should validate a valid configuration", () => {
      const validConfig = {
        token: "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",
        concurrency: 10,
        retries: 3,
        timeout: 300,
        verbose: true,
        flush: false
      };

      const result = baseConfigSchema.parse(validConfig);
      expect(result).toEqual(validConfig);
    });

    it("should provide defaults for optional fields", () => {
      const minimalConfig = {};
      const result = baseConfigSchema.parse(minimalConfig);
      
      expect(result).toEqual({
        concurrency: 10,
        retries: 3,
        timeout: 0,
        verbose: false,
        flush: false
      });
    });

    it("should reject invalid token format", () => {
      const invalidConfig = {
        token: "invalid-token"
      };

      expect(() => baseConfigSchema.parse(invalidConfig)).toThrow();
    });

    it("should reject negative concurrency", () => {
      const invalidConfig = {
        concurrency: -1
      };

      expect(() => baseConfigSchema.parse(invalidConfig)).toThrow();
    });

    it("should reject non-integer retries", () => {
      const invalidConfig = {
        retries: 2.5
      };

      expect(() => baseConfigSchema.parse(invalidConfig)).toThrow();
    });

    it("should accept zero retries", () => {
      const config = {
        retries: 0
      };

      const result = baseConfigSchema.parse(config);
      expect(result.retries).toBe(0);
    });
  });

  describe("baseFlags", () => {
    it("should define all required flags", () => {
      expect(baseFlags).toHaveProperty("token");
      expect(baseFlags).toHaveProperty("concurrency");
      expect(baseFlags).toHaveProperty("retries");
      expect(baseFlags).toHaveProperty("timeout");
      expect(baseFlags).toHaveProperty("verbose");
      expect(baseFlags).toHaveProperty("flush");
    });

    it("should have correct flag types", () => {
      expect(baseFlags.token.type).toBe("option");
      expect(baseFlags.concurrency.type).toBe("option");
      expect(baseFlags.retries.type).toBe("option");
      expect(baseFlags.timeout.type).toBe("option");
      expect(baseFlags.verbose.type).toBe("boolean");
      expect(baseFlags.flush.type).toBe("boolean");
    });

    it("should have environment variable mappings", () => {
      expect(baseFlags.token.env).toBe("NOTION_TOKEN");
      expect(baseFlags.concurrency.env).toBe("CONCURRENCY");
      expect(baseFlags.retries.env).toBe("RETRIES");
      expect(baseFlags.timeout.env).toBe("TIMEOUT");
      expect(baseFlags.verbose.env).toBe("VERBOSE");
      expect(baseFlags.flush.env).toBe("FLUSH");
    });
  });

  describe("loadBaseConfig", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      // Reset environment variables
      process.env = { ...originalEnv };
      // Reset mocks
      vi.clearAllMocks();
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it("should load config from CLI flags with highest priority", async () => {
      const flags: Partial<BaseConfig> = {
        token: "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",
        concurrency: 20,
        verbose: true
      };

      // Set up environment variables (should be overridden)
      process.env.NOTION_TOKEN = "ntn_environmenttoken1234567890123456789012345678";
      process.env.CONCURRENCY = "5";

      // Mock config file (should be overridden)
      vi.mocked(fs.readFile).mockResolvedValue(`
        token: ntn_configfiletoken123456789012345678901234567890
        concurrency: 15
      `);
      vi.mocked(yaml.parse).mockReturnValue({
        token: "ntn_configfiletoken123456789012345678901234567890",
        concurrency: 15
      });

      const config = await loadBaseConfig(flags);

      expect(config.token).toBe(flags.token);
      expect(config.concurrency).toBe(flags.concurrency);
      expect(config.verbose).toBe(true);
    });

    it("should load config from environment variables", async () => {
      process.env.NOTION_TOKEN = "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";
      process.env.CONCURRENCY = "15";
      process.env.RETRIES = "5";
      process.env.TIMEOUT = "600";
      process.env.VERBOSE = "true";
      process.env.FLUSH = "true";

      // Mock file not found
      vi.mocked(fs.readFile).mockRejectedValue(new Error("File not found"));

      const config = await loadBaseConfig();

      expect(config.token).toBe(process.env.NOTION_TOKEN);
      expect(config.concurrency).toBe(15);
      expect(config.retries).toBe(5);
      expect(config.timeout).toBe(600);
      expect(config.verbose).toBe(true);
      expect(config.flush).toBe(true);
    });

    it("should load config from YAML file", async () => {
      const yamlContent = `
token: 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
concurrency: 25
retries: 10
verbose: true
`;

      vi.mocked(fs.readFile).mockResolvedValue(yamlContent);
      vi.mocked(yaml.parse).mockReturnValue({
        token: "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",
        concurrency: 25,
        retries: 10,
        verbose: true
      });

      const config = await loadBaseConfig();

      expect(config.token).toBe("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");
      expect(config.concurrency).toBe(25);
      expect(config.retries).toBe(10);
      expect(config.verbose).toBe(true);
    });

    it("should handle missing config file gracefully", async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));

      const config = await loadBaseConfig();

      // Should return defaults
      expect(config.token).toBeUndefined();
      expect(config.concurrency).toBe(10);
      expect(config.retries).toBe(3);
      expect(config.timeout).toBe(0);
      expect(config.verbose).toBe(false);
      expect(config.flush).toBe(false);
    });

    it("should merge configs with correct precedence", async () => {
      // YAML file (lowest priority)
      vi.mocked(fs.readFile).mockResolvedValue("concurrency: 5\nretries: 1");
      vi.mocked(yaml.parse).mockReturnValue({
        concurrency: 5,
        retries: 1
      });

      // Environment variables (medium priority)
      process.env.CONCURRENCY = "10";
      process.env.TIMEOUT = "300";

      // CLI flags (highest priority)
      const flags = {
        retries: 3
      };

      const config = await loadBaseConfig(flags);

      expect(config.concurrency).toBe(10); // From env (overrides YAML)
      expect(config.retries).toBe(3); // From flags (overrides YAML)
      expect(config.timeout).toBe(300); // From env
    });

    it("should validate the final configuration", async () => {
      process.env.NOTION_TOKEN = "invalid-token";

      await expect(loadBaseConfig()).rejects.toThrow();
    });

    it("should parse boolean environment variables correctly", async () => {
      process.env.VERBOSE = "false";
      process.env.FLUSH = "true";

      vi.mocked(fs.readFile).mockRejectedValue(new Error("File not found"));

      const config = await loadBaseConfig();

      expect(config.verbose).toBe(false);
      expect(config.flush).toBe(true);
    });

    it("should handle empty environment variables", async () => {
      process.env.NOTION_TOKEN = "";
      process.env.CONCURRENCY = "";

      vi.mocked(fs.readFile).mockRejectedValue(new Error("File not found"));

      const config = await loadBaseConfig();

      expect(config.token).toBeUndefined();
      expect(config.concurrency).toBe(10); // Default value
    });
  });
});