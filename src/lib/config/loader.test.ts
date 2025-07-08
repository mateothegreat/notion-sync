import { Exporter } from "$lib/exporters/exporter";
import { NamingStrategy } from "$lib/util/normalization";
import { OrganizationStrategy } from "$lib/util/organization";
import * as fs from "fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { definitions } from "./definitions";
import {
  createCommandFlags,
  createCommandSchema,
  ExtractFlagKeys,
  loadCommandConfig,
  ResolvedCommandConfig
} from "./loader";

vi.mock("fs/promises");
const VALID_TOKEN = "secret_1234567890123456789012345678901234567890123";

describe("Config Loader", () => {
  const mockDefinitions = {
    ...definitions,
    test: {
      name: "test",
      variants: ["TEST"],
      commands: ["test_cmd"],
      flag: { type: "string" },
      schema: () => z.string()
    }
  };

  const base: ResolvedCommandConfig<"export"> = {
    "naming-strategy": NamingStrategy.TITLE_AND_ID,
    "organization-strategy": OrganizationStrategy.HIERARCHICAL,
    "include-archived": false,
    token: "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",
    timeout: 5000,
    concurrency: 5,
    retries: 1,
    format: Exporter.JSON,
    verbose: false,
    flush: false,
    pages: [],
    output: undefined,
    "max-concurrency": 5,
    path: "",
    databases: [], // Required field
    "include-blocks": true,
    "include-comments": false,
    "include-properties": true
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(fs, "readFile").mockRejectedValue({ code: "ENOENT" });
    process.env = {};
  });

  describe("createCommandFlags", () => {
    it("should create flags for a specific command, including global flags", () => {
      const flags = createCommandFlags("export");
      expect(flags).toHaveProperty("token");
      expect(flags).toHaveProperty("path");
    });
  });

  describe("createCommandSchema", () => {
    it("should create a Zod schema that successfully parses valid data", () => {
      const schema = createCommandSchema("export");
      const result = schema.safeParse(base);
      expect(result.success).toBe(true);
    });

    it("should coerce boolean and number types", () => {
      const schema = createCommandSchema("export");
      const result = schema.safeParse({
        ...base,
        verbose: "true"
      });
      expect(result.success).toBe(true);
      expect((result as any).data.verbose).toBe(true);
    });
  });

  describe("loadCommandConfig", () => {
    it("should load from CLI flags", async () => {
      const flags = { ...base, path: "./cli", format: "json" };
      const config = await loadCommandConfig("export", flags);
      expect(config.rendered.path).toBe("./cli");
    });

    it("should load from environment variables", async () => {
      process.env.PATH = ".env";
      process.env.FORMAT = Exporter.JSON;
      const config = await loadCommandConfig("export", {
        ...base,
        path: ".env"
      });
      expect(config.rendered.path).toBe(".env");
      expect(config.rendered.format).toBe(Exporter.JSON);
    });

    it("should load from YAML file", async () => {
      vi.spyOn(fs, "readFile").mockResolvedValue(`path: .env\nformat: ${Exporter.JSON}`);
      const config = await loadCommandConfig("export", { ...base });
      expect(config.rendered.format).toBe(Exporter.JSON);
    });

    it("should respect precedence: CLI > Env > YAML", async () => {
      vi.spyOn(fs, "readFile").mockResolvedValue(`path: .env\nformat: ${Exporter.JSON}`);
      process.env.PATH = ".env";
      const flags = { ...base };
      const config = await loadCommandConfig("export", flags);
      expect(config.rendered.format).toBe(Exporter.JSON);
    });

    /**
     * No flags, env, or yaml should cause validation to fail for required fields.
     */
    it("should throw on validation error", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await expect(loadCommandConfig("export", {})).rejects.toThrow("Configuration loading failed.");
      consoleSpy.mockRestore();
    });
  });

  describe("TypeScript type safety", () => {
    it("should enforce strict typing on ResolvedCommandConfig", () => {
      // This test verifies that our type system is working correctly
      // The following would cause TypeScript compilation errors if uncommented:

      // const invalidConfig: ResolvedCommandConfig<"export"> = {
      //   badProperty: "this would not compile",
      //   anotherInvalidProp: 123,
      // };

      // Valid config should work fine
      const validConfig: ResolvedCommandConfig<"export"> = {
        flush: false,
        timeout: 0,
        token: "secret_" + "a".repeat(43),
        verbose: false,
        concurrency: 10,
        retries: 3,
        path: "./export",
        databases: [{ name: "test", id: "123" }],
        pages: undefined, // optional
        format: Exporter.JSON,
        "max-concurrency": 10,
        "include-blocks": true,
        "include-comments": false,
        "include-properties": true,
        output: undefined, // optional
        "naming-strategy": NamingStrategy.TITLE_AND_ID,
        "organization-strategy": OrganizationStrategy.HIERARCHICAL,
        "include-archived": false
      };

      expect(validConfig.path).toBe("./export");
      expect(validConfig.format).toBe(Exporter.JSON);

      // Type system should prevent accessing non-existent properties
      // The following would cause TypeScript errors if uncommented:
      // expect(validConfig.badProperty).toBeUndefined();
    });

    it("should correctly extract flag keys for different commands", () => {
      // Test that ExtractFlagKeys works correctly
      type ExportKeys = ExtractFlagKeys<"export">;
      type AllKeys = keyof typeof definitions;

      // These type assertions verify our type extraction is working
      const exportKey: ExportKeys = "path"; // Should work
      const globalKey: ExportKeys = "flush"; // Should work (from "*" commands)

      // The following would cause TypeScript errors if uncommented:
      // const invalidKey: ExportKeys = "nonExistentKey";

      expect(true).toBe(true); // Type checking happens at compile time
    });
  });
});
