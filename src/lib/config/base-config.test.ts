import { describe, it, expect, vi, beforeEach } from "vitest";
import { BaseConfig, BaseConfigLoader, baseConfigSchema } from "./base-config";

describe("BaseConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("BaseConfigLoader", () => {
    describe("loadBaseConfig", () => {
      it("should load base configuration from flags", async () => {
        const flags = {
          token: "ntn_abc123def456ghi789jkl012mno345pqr678stu901vwx2",
          concurrency: 5,
          retries: 2,
          timeout: 30,
          verbose: true,
          flush: false
        };

        const config = await BaseConfigLoader.loadBaseConfig(flags);

        expect(config).toEqual({
          token: "ntn_abc123def456ghi789jkl012mno345pqr678stu901vwx2",
          concurrency: 5,
          retries: 2,
          timeout: 30,
          verbose: true,
          flush: false
        });
      });

      it("should merge flags with config file, with flags taking precedence", async () => {
        const flags = {
          token: "ntn_abc123def456ghi789jkl012mno345pqr678stu901vwx2",
          concurrency: 8
        };

        const configFile = {
          token: "ntn_old123def456ghi789jkl012mno345pqr678stu901vwx2",
          concurrency: 3,
          retries: 5,
          verbose: false
        };

        const config = await BaseConfigLoader.loadBaseConfig(flags, configFile);

        expect(config).toEqual({
          token: "ntn_abc123def456ghi789jkl012mno345pqr678stu901vwx2", // from flags
          concurrency: 8, // from flags  
          retries: 5, // from config file
          timeout: 0, // default
          verbose: false, // from config file
          flush: false // default
        });
      });

      it("should apply default values when properties are missing", async () => {
        const flags = {
          token: "ntn_abc123def456ghi789jkl012mno345pqr678stu901vwx2"
        };

        const config = await BaseConfigLoader.loadBaseConfig(flags);

        expect(config).toEqual({
          token: "ntn_abc123def456ghi789jkl012mno345pqr678stu901vwx2",
          concurrency: 10, // default
          retries: 3, // default
          timeout: 0, // default
          verbose: false, // default
          flush: false // default
        });
      });

      it("should throw error for invalid token format", async () => {
        const flags = {
          token: "invalid_token"
        };

        await expect(BaseConfigLoader.loadBaseConfig(flags)).rejects.toThrow(
          "The notion api token must be a 50 character string"
        );
      });

      it("should throw error for invalid concurrency value", async () => {
        const flags = {
          token: "ntn_abc123def456ghi789jkl012mno345pqr678stu901vwx2",
          concurrency: 0
        };

        await expect(BaseConfigLoader.loadBaseConfig(flags)).rejects.toThrow();
      });

      it("should throw error for invalid retries value", async () => {
        const flags = {
          token: "ntn_abc123def456ghi789jkl012mno345pqr678stu901vwx2",
          retries: -1
        };

        await expect(BaseConfigLoader.loadBaseConfig(flags)).rejects.toThrow();
      });

      it("should accept maximum valid values", async () => {
        const flags = {
          token: "ntn_abc123def456ghi789jkl012mno345pqr678stu901vwx2",
          concurrency: 100,
          retries: 10,
          timeout: 999999
        };

        const config = await BaseConfigLoader.loadBaseConfig(flags);

        expect(config.concurrency).toBe(100);
        expect(config.retries).toBe(10);
        expect(config.timeout).toBe(999999);
      });

      it("should handle empty config file", async () => {
        const flags = {
          token: "ntn_abc123def456ghi789jkl012mno345pqr678stu901vwx2"
        };

        const config = await BaseConfigLoader.loadBaseConfig(flags, {});

        expect(config.token).toBe("ntn_abc123def456ghi789jkl012mno345pqr678stu901vwx2");
      });
    });

    describe("getBaseFlags", () => {
      it("should return all base flags", () => {
        const flags = BaseConfigLoader.getBaseFlags();

        expect(flags).toHaveProperty("token");
        expect(flags).toHaveProperty("concurrency");
        expect(flags).toHaveProperty("retries");
        expect(flags).toHaveProperty("timeout");
        expect(flags).toHaveProperty("verbose");
        expect(flags).toHaveProperty("flush");

        expect(Object.keys(flags)).toHaveLength(6);
      });

      it("should return flags with correct properties", () => {
        const flags = BaseConfigLoader.getBaseFlags();

        expect(flags.token).toHaveProperty("description");
        expect(flags.token).toHaveProperty("required", true);
        expect(flags.verbose).toHaveProperty("char", "v");
        expect(flags.concurrency).toHaveProperty("default", 10);
      });
    });

    describe("getBaseSchema", () => {
      it("should return the base schema", () => {
        const schema = BaseConfigLoader.getBaseSchema();

        expect(schema).toBe(baseConfigSchema);
      });
    });
  });

  describe("baseConfigSchema", () => {
    it("should validate correct configuration", () => {
      const validConfig = {
        token: "ntn_abc123def456ghi789jkl012mno345pqr678stu901vwx2",
        concurrency: 10,
        retries: 3,
        timeout: 30,
        verbose: true,
        flush: false
      };

      const result = baseConfigSchema.parse(validConfig);
      expect(result).toEqual(validConfig);
    });

    it("should apply defaults for missing optional properties", () => {
      const minimalConfig = {
        token: "ntn_abc123def456ghi789jkl012mno345pqr678stu901vwx2"
      };

      const result = baseConfigSchema.parse(minimalConfig);
      expect(result).toEqual({
        token: "ntn_abc123def456ghi789jkl012mno345pqr678stu901vwx2",
        concurrency: 10,
        retries: 3,
        timeout: 0,
        verbose: false,
        flush: false
      });
    });

    it("should reject invalid token format", () => {
      const invalidConfig = {
        token: "invalid_token"
      };

      expect(() => baseConfigSchema.parse(invalidConfig)).toThrow();
    });

    it("should reject token with wrong length", () => {
      const invalidConfig = {
        token: "ntn_short"
      };

      expect(() => baseConfigSchema.parse(invalidConfig)).toThrow();
    });

    it("should reject token with wrong prefix", () => {
      const invalidConfig = {
        token: "abc_abc123def456ghi789jkl012mno345pqr678stu901vwx234"
      };

      expect(() => baseConfigSchema.parse(invalidConfig)).toThrow();
    });

    it("should reject concurrency below minimum", () => {
      const invalidConfig = {
        token: "ntn_abc123def456ghi789jkl012mno345pqr678stu901vwx2",
        concurrency: 0
      };

      expect(() => baseConfigSchema.parse(invalidConfig)).toThrow();
    });

    it("should reject concurrency above maximum", () => {
      const invalidConfig = {
        token: "ntn_abc123def456ghi789jkl012mno345pqr678stu901vwx2",
        concurrency: 101
      };

      expect(() => baseConfigSchema.parse(invalidConfig)).toThrow();
    });

    it("should reject retries below minimum", () => {
      const invalidConfig = {
        token: "ntn_abc123def456ghi789jkl012mno345pqr678stu901vwx2",
        retries: -1
      };

      expect(() => baseConfigSchema.parse(invalidConfig)).toThrow();
    });

    it("should reject retries above maximum", () => {
      const invalidConfig = {
        token: "ntn_abc123def456ghi789jkl012mno345pqr678stu901vwx2",
        retries: 11
      };

      expect(() => baseConfigSchema.parse(invalidConfig)).toThrow();
    });

    it("should reject timeout below minimum", () => {
      const invalidConfig = {
        token: "ntn_abc123def456ghi789jkl012mno345pqr678stu901vwx2",
        timeout: -1
      };

      expect(() => baseConfigSchema.parse(invalidConfig)).toThrow();
    });

    it("should accept valid boolean values", () => {
      const validConfig = {
        token: "ntn_abc123def456ghi789jkl012mno345pqr678stu901vwx2",
        verbose: true,
        flush: false
      };

      const result = baseConfigSchema.parse(validConfig);
      expect(result.verbose).toBe(true);
      expect(result.flush).toBe(false);
    });

    it("should reject non-boolean values for boolean fields", () => {
      const invalidConfig = {
        token: "ntn_abc123def456ghi789jkl012mno345pqr678stu901vwx2",
        verbose: "true" as any
      };

      expect(() => baseConfigSchema.parse(invalidConfig)).toThrow();
    });
  });
});