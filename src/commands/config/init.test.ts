import * as fs from "fs/promises";
import { inspect } from "util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateConfigYaml } from "../../lib/config-loader";
import Init from "./init";

// Mock the config generation functions
vi.mock("../../lib/config-loader", () => ({
  createCommandFlags: vi.fn(() => ({})),
  generateConfigYaml: vi.fn(),
  generateConfigYaml: vi.fn()
}));

// Mock fs
vi.mock("fs/promises");

describe("Config Init Command", () => {
  let mockLog: ReturnType<typeof vi.fn>;
  let mockError: any;
  let command: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock functions
    mockLog = vi.fn();

    // Create command instance with mocked methods
    command = new Init([], {} as any);
    command.log = mockLog;

    // Mock error method after instance creation to ensure it's properly bound
    mockError = vi.fn().mockImplementation((message: string, options?: any) => {
      const error = new Error(message);
      (error as any).oclif = { exit: options?.exit !== false ? 2 : false };
      throw error;
    });
    command.error = mockError;
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("file existence checks", () => {
    it("should create config file when it doesn't exist", async () => {
      const mockAccess = vi.mocked(fs.access);
      mockAccess.mockRejectedValueOnce(new Error("File not found"));

      const mockGenerateMinimal = vi.mocked(generateConfigYaml);
      mockGenerateMinimal.mockResolvedValueOnce({});

      // Mock the parse method
      vi.spyOn(command as any, "parse").mockResolvedValue({
        flags: {
          output: "./notion-sync.yaml",
          force: false,
          full: false,
          minimal: true
        }
      });

      await command.run();

      expect(mockAccess).toHaveBeenCalledWith("./notion-sync.yaml");
      expect(mockGenerateMinimal).toHaveBeenCalledWith("./notion-sync.yaml");
      expect(mockLog).toHaveBeenCalledWith("✅ Minimal configuration file created at: ./notion-sync.yaml");
    });

    it("should error when file exists and force is false", async () => {
      const mockAccess = vi.mocked(fs.access);
      mockAccess.mockResolvedValueOnce(undefined); // File exists

      // Don't throw in the error mock, just record the call
      mockError.mockImplementation(() => {
        // Just record the call, don't throw
      });

      vi.spyOn(command as any, "parse").mockResolvedValue({
        flags: {
          output: "./existing-config.yaml",
          force: false,
          full: false,
          minimal: true
        }
      });

      await command.run();

      // The important part is that error was called with the right message
      expect(mockError).toHaveBeenCalledTimes(1);
      expect(mockError).toHaveBeenCalledWith(
        "Configuration file already exists at ./existing-config.yaml. Use --force to overwrite."
      );
    });

    it("should overwrite when file exists and force is true", async () => {
      const mockAccess = vi.mocked(fs.access);
      mockAccess.mockResolvedValueOnce(undefined); // File exists

      const mockGenerateMinimal = vi.mocked(generateConfigYaml);
      mockGenerateMinimal.mockResolvedValueOnce({});

      vi.spyOn(command as any, "parse").mockResolvedValue({
        flags: {
          output: "./existing-config.yaml",
          force: true,
          full: false,
          minimal: true
        }
      });

      await command.run();

      expect(mockGenerateMinimal).toHaveBeenCalledWith("./existing-config.yaml");
      expect(mockLog).toHaveBeenCalledWith("✅ Minimal configuration file created at: ./existing-config.yaml");
    });
  });

  describe("config generation modes", () => {
    beforeEach(() => {
      // File doesn't exist for all these tests
      vi.mocked(fs.access).mockRejectedValue(new Error("File not found"));
    });

    it("should generate minimal config by default", async () => {
      const mockGenerateMinimal = vi.mocked(generateConfigYaml);
      mockGenerateMinimal.mockResolvedValueOnce({});

      vi.spyOn(command as any, "parse").mockResolvedValue({
        flags: {
          output: "./notion-sync.yaml",
          force: false,
          full: false,
          minimal: true
        }
      });

      await command.run();

      expect(mockGenerateMinimal).toHaveBeenCalledWith("./notion-sync.yaml");
      expect(mockLog).toHaveBeenCalledWith("Initializing Notion Sync configuration file...");
      expect(mockLog).toHaveBeenCalledWith("✅ Minimal configuration file created at: ./notion-sync.yaml");

      // Check for next steps instructions
      expect(mockLog).toHaveBeenCalledWith("\nNext steps:");
      expect(mockLog).toHaveBeenCalledWith("1. Edit ./notion-sync.yaml and replace the placeholder values:");
      expect(mockLog).toHaveBeenCalledWith("   - Add your Notion integration token");
      expect(mockLog).toHaveBeenCalledWith("   - Add your database ID(s)");
      expect(mockLog).toHaveBeenCalledWith("2. Run 'notion-sync export' to start exporting your Notion data");
      expect(mockLog).toHaveBeenCalledWith("\nFor more configuration options, run: notion-sync config init --full");

      console.log(inspect({ mockLogCalls: mockLog.mock.calls }, { colors: true, compact: false }));
    });

    it("should generate full config when --full flag is used", async () => {
      const mockGenerateFull = vi.mocked(generateConfigYaml);
      mockGenerateFull.mockResolvedValueOnce(undefined);

      vi.spyOn(command as any, "parse").mockResolvedValue({
        flags: {
          output: "./notion-sync.yaml",
          force: false,
          full: true,
          minimal: false
        }
      });

      await command.run();

      expect(mockGenerateFull).toHaveBeenCalledWith("./notion-sync.yaml", true);
      expect(mockLog).toHaveBeenCalledWith("✅ Full configuration file created at: ./notion-sync.yaml");

      // Check for full config next steps
      expect(mockLog).toHaveBeenCalledWith("\nNext steps:");
      expect(mockLog).toHaveBeenCalledWith("1. Edit ./notion-sync.yaml and add your Notion integration token");
      expect(mockLog).toHaveBeenCalledWith("2. Add your database and page IDs");
      expect(mockLog).toHaveBeenCalledWith("3. Customize any other settings as needed");
      expect(mockLog).toHaveBeenCalledWith("4. Run 'notion-sync export' to start exporting your Notion data");
    });

    it("should use custom output path", async () => {
      const mockGenerateMinimal = vi.mocked(generateConfigYaml);
      mockGenerateMinimal.mockResolvedValueOnce({});

      vi.spyOn(command as any, "parse").mockResolvedValue({
        flags: {
          output: "./custom/path/config.yaml",
          force: false,
          full: false,
          minimal: true
        }
      });

      await command.run();

      expect(mockGenerateMinimal).toHaveBeenCalledWith("./custom/path/config.yaml");
      expect(mockLog).toHaveBeenCalledWith("✅ Minimal configuration file created at: ./custom/path/config.yaml");
    });
  });

  describe("error handling", () => {
    beforeEach(() => {
      // File doesn't exist
      vi.mocked(fs.access).mockRejectedValue(new Error("File not found"));
    });

    it("should handle generation errors gracefully", async () => {
      const mockGenerateMinimal = vi.mocked(generateConfigYaml);
      mockGenerateMinimal.mockRejectedValueOnce(new Error("Permission denied"));

      vi.spyOn(command as any, "parse").mockResolvedValue({
        flags: {
          output: "./notion-sync.yaml",
          force: false,
          full: false,
          minimal: true
        }
      });

      await expect(command.run()).rejects.toThrow("Failed to create configuration file: Permission denied");

      expect(mockError).toHaveBeenCalledWith("Failed to create configuration file: Permission denied");
    });

    it("should handle non-Error thrown values", async () => {
      const mockGenerateMinimal = vi.mocked(generateConfigYaml);
      mockGenerateMinimal.mockRejectedValueOnce("String error");

      vi.spyOn(command as any, "parse").mockResolvedValue({
        flags: {
          output: "./notion-sync.yaml",
          force: false,
          full: false,
          minimal: true
        }
      });

      await expect(command.run()).rejects.toThrow("Failed to create configuration file: String error");

      expect(mockError).toHaveBeenCalledWith("Failed to create configuration file: String error");
    });
  });
});
