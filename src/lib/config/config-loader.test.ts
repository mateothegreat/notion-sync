import * as fs from "fs/promises";
import { inspect } from "util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateConfigYaml, parseables } from "./config-loader";

// Mock fs and log modules
vi.mock("fs/promises");
vi.mock("./log", () => ({
  log: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn()
  }
}));

describe("Config YAML Generation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("generateConfigYaml", () => {
    it("should generate a complete config YAML with all parseables", async () => {
      const mockWriteFile = vi.mocked(fs.writeFile);
      let capturedContent = "";
      mockWriteFile.mockImplementation(async (path, content) => {
        capturedContent = content as string;
        return Promise.resolve();
      });

      await generateConfigYaml("./test-config.yaml", true);

      expect(mockWriteFile).toHaveBeenCalledWith("./test-config.yaml", expect.any(String), "utf-8");

      console.log(inspect({ capturedContent }, { colors: true, compact: false }));

      // Verify the content includes comments
      expect(capturedContent).toContain("# Notion Sync Configuration");
      expect(capturedContent).toContain("# Global Settings");
      expect(capturedContent).toContain("# Export Command Settings");

      // Verify global flags are included
      expect(capturedContent).toContain("flush:");
      expect(capturedContent).toContain("timeout:");
      expect(capturedContent).toContain("token:");
      expect(capturedContent).toContain("verbose:");
      expect(capturedContent).toContain("concurrency:");
      expect(capturedContent).toContain("retries:");

      // Verify export-specific flags
      expect(capturedContent).toContain("path:");
      expect(capturedContent).toContain("databases:");
      expect(capturedContent).toContain("format:");
      expect(capturedContent).toContain("include-blocks:");
      expect(capturedContent).toContain("include-comments:");
      expect(capturedContent).toContain("include-properties:");
    });

    it("should generate config without comments when includeComments is false", async () => {
      const mockWriteFile = vi.mocked(fs.writeFile);
      let capturedContent = "";
      mockWriteFile.mockImplementation(async (path, content) => {
        capturedContent = content as string;
        return Promise.resolve();
      });

      await generateConfigYaml("./test-config.yaml", false);

      expect(mockWriteFile).toHaveBeenCalled();

      // Should still have section headers but not field descriptions
      expect(capturedContent).toContain("# Notion Sync Configuration");
      expect(capturedContent).not.toContain("# Flush stdout after each log");
    });

    it("should generate valid example values for different types", async () => {
      const mockWriteFile = vi.mocked(fs.writeFile);
      let capturedContent = "";
      mockWriteFile.mockImplementation(async (path, content) => {
        capturedContent = content as string;
        return Promise.resolve();
      });

      await generateConfigYaml();

      // Parse the YAML to verify structure
      const lines = capturedContent.split("\n");
      const yamlLines = lines.filter((line) => !line.startsWith("#") && line.trim() !== "");
      const yamlContent = yamlLines.join("\n");

      console.log(inspect({ yamlContent }, { colors: true, compact: false }));

      // Check boolean values
      expect(capturedContent).toMatch(/flush: false/);
      expect(capturedContent).toMatch(/verbose: true/);
      expect(capturedContent).toMatch(/include-blocks: true/);

      // Check number values
      expect(capturedContent).toMatch(/timeout: 300/);
      expect(capturedContent).toMatch(/concurrency: 5/);
      expect(capturedContent).toMatch(/retries: 3/);

      // Check string values
      expect(capturedContent).toMatch(/token: ntn_[a-zA-Z0-9]{46}/);
      expect(capturedContent).toMatch(/path: "?\.\/exports\/notion-workspace"?/);
      expect(capturedContent).toMatch(/format: markdown/);

      // Check array values
      expect(capturedContent).toContain("databases:");
      expect(capturedContent).toContain("name: Project Tasks");
      expect(capturedContent).toContain("id: 110e8400-e29b-41d4-a716-446655440001");
    });
  });

  describe("generateConfigYaml", () => {
    it("should generate a minimal config with essential settings only", async () => {
      const mockWriteFile = vi.mocked(fs.writeFile);
      let capturedContent = "";
      mockWriteFile.mockImplementation(async (path, content) => {
        capturedContent = content as string;
        return Promise.resolve();
      });

      const result = await generateConfigYaml("./minimal-config.yaml");

      expect(mockWriteFile).toHaveBeenCalledWith("./minimal-config.yaml", expect.any(String), "utf-8");

      console.log(inspect({ capturedContent }, { colors: true, compact: false }));

      // Verify header
      expect(capturedContent).toContain("# Notion Sync Configuration");
      expect(capturedContent).toContain("# Replace the example values");

      // Verify minimal settings
      expect(capturedContent).toContain("token: ntn_YOUR_NOTION_INTEGRATION_TOKEN_HERE");
      expect(capturedContent).toContain("path: ./exports/notion-workspace");
      expect(capturedContent).toContain("format: markdown");
      expect(capturedContent).toContain("concurrency: 5");
      expect(capturedContent).toContain("retries: 3");
      expect(capturedContent).toContain("timeout: 300");

      // Verify the returned object
      expect(result).toEqual({
        token: "ntn_YOUR_NOTION_INTEGRATION_TOKEN_HERE",
        path: "./exports/notion-workspace",
        format: "markdown",
        databases: [
          {
            name: "Example Database",
            id: "YOUR_DATABASE_ID_HERE"
          }
        ],
        concurrency: 5,
        retries: 3,
        timeout: 300
      });
    });

    it("should use default path when not specified", async () => {
      const mockWriteFile = vi.mocked(fs.writeFile);
      mockWriteFile.mockResolvedValue(undefined);

      await generateConfigYaml();

      expect(mockWriteFile).toHaveBeenCalledWith("./notion-sync.yaml", expect.any(String), "utf-8");
    });
  });

  describe("Example value generation", () => {
    it("should generate valid Notion token format", async () => {
      const mockWriteFile = vi.mocked(fs.writeFile);
      let capturedContent = "";
      mockWriteFile.mockImplementation(async (path, content) => {
        capturedContent = content as string;
        return Promise.resolve();
      });

      await generateConfigYaml();

      const tokenMatch = capturedContent.match(/token: (ntn_[a-zA-Z0-9]{46})/);
      expect(tokenMatch).toBeTruthy();
      expect(tokenMatch![1]).toMatch(/^ntn_[a-zA-Z0-9]{46}$/);
    });

    it("should generate valid UUID-like IDs for pages", async () => {
      const mockWriteFile = vi.mocked(fs.writeFile);
      let capturedContent = "";
      mockWriteFile.mockImplementation(async (path, content) => {
        capturedContent = content as string;
        return Promise.resolve();
      });

      await generateConfigYaml();

      expect(capturedContent).toContain("550e8400-e29b-41d4-a716-446655440000");
      expect(capturedContent).toContain("6ba7b810-9dad-11d1-80b4-00c04fd430c8");
    });

    it("should handle all flag types from parseables", async () => {
      const mockWriteFile = vi.mocked(fs.writeFile);
      mockWriteFile.mockResolvedValue(undefined);

      await generateConfigYaml();

      // Ensure all parseables are covered
      const allFlags = Object.keys(parseables);
      const capturedCall = mockWriteFile.mock.calls[0];
      const content = capturedCall[1] as string;

      console.log(inspect({ allFlags, totalFlags: allFlags.length }, { colors: true, compact: false }));

      for (const flag of allFlags) {
        // Skip the dash variations (max-concurrency, include-blocks, etc)
        const flagPattern = new RegExp(`${flag}:`);
        expect(content).toMatch(flagPattern);
      }
    });
  });
});
