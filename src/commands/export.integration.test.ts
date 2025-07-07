import { beforeEach, describe, expect, it, vi } from "vitest";
import Export from "./export";
import { CommandConfig } from "../lib/config/simple-config";

// Mock dependencies
vi.mock("../lib/control-plane/control-plane", () => ({
  createControlPlane: vi.fn(() => ({
    initialize: vi.fn(),
    start: vi.fn(),
    destroy: vi.fn(),
    publish: vi.fn(),
    subscribe: vi.fn(),
    getCircuitBreaker: vi.fn(() => ({}))
  }))
}));

vi.mock("../infrastructure/notion/notion-client", () => ({
  NotionClient: vi.fn().mockImplementation(() => ({
    getDatabases: vi.fn().mockResolvedValue([]),
    getDatabase: vi.fn().mockResolvedValue({ id: "db1", title: "Test Database" }),
    getPage: vi.fn().mockResolvedValue({ id: "page1", title: "Test Page" }),
    queryDatabase: vi.fn().mockResolvedValue({ results: [], hasMore: false }),
    search: vi.fn().mockResolvedValue({ results: [], has_more: false }),
    getWorkspace: vi.fn().mockResolvedValue({}),
    getUsers: vi.fn().mockResolvedValue([]),
    getComments: vi.fn().mockResolvedValue([]),
    getPageProperties: vi.fn().mockResolvedValue([]),
    getDatabaseProperties: vi.fn().mockResolvedValue([]),
    getBlocks: vi.fn().mockResolvedValue({ results: [], hasMore: false })
  }))
}));

vi.mock("../core/services/progress-service", () => ({
  ProgressService: vi.fn().mockImplementation(() => ({
    startTracking: vi.fn(),
    stopTracking: vi.fn(),
    startSection: vi.fn(),
    updateSectionProgress: vi.fn(),
    completeSection: vi.fn(),
    addError: vi.fn()
  }))
}));

vi.mock("../lib/export/export-service", () => ({
  ExportService: vi.fn().mockImplementation(() => ({
    create: vi.fn().mockResolvedValue({ id: "export-123" }),
    startExport: vi.fn(),
    completeExport: vi.fn()
  }))
}));

vi.mock("../infrastructure/filesystem/file-system-manager", () => ({
  FileSystemManager: vi.fn().mockImplementation(() => ({
    writeDatabase: vi.fn().mockResolvedValue("./exports/database.json"),
    writePage: vi.fn().mockResolvedValue("./exports/page.json"),
    writeRawData: vi.fn()
  })),
  createDefaultConfig: vi.fn()
}));

vi.mock("fs/promises", () => ({
  mkdir: vi.fn()
}));

vi.mock("../lib/config/simple-config", async () => {
  const actual = await vi.importActual("../lib/config/simple-config");
  return {
    ...actual,
    loadCommandConfig: vi.fn()
  };
});

describe("Export Command Integration", () => {
  let exportCommand: Export;
  let mockConfig: CommandConfig<"export">;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Set up default mock configuration
    mockConfig = {
      // Base config
      token: "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",
      verbose: false,
      flush: false,
      timeout: 0,
      concurrency: 10,
      retries: 3,
      // Export config
      path: "./test-exports",
      databases: undefined,
      pages: undefined,
      format: "json",
      "max-concurrency": 10,
      "include-blocks": true,
      "include-comments": false,
      "include-properties": true
    };

    // Mock the config loader
    vi.mocked(require("../lib/config/simple-config").loadCommandConfig).mockResolvedValue(mockConfig);

    exportCommand = new Export([], {});
  });

  describe("Configuration Loading", () => {
    it("should load configuration with CLI flags", async () => {
      const { loadCommandConfig } = require("../lib/config/simple-config");
      
      // Mock parse to return specific flags
      exportCommand.parse = vi.fn().mockResolvedValue({
        args: {},
        flags: {
          path: "./custom-path",
          format: "markdown",
          verbose: true
        }
      });

      // Mock methods to prevent actual execution
      exportCommand.log = vi.fn();
      exportCommand.error = vi.fn();

      await exportCommand.run();

      expect(loadCommandConfig).toHaveBeenCalledWith("export", {
        path: "./custom-path",
        format: "markdown",
        verbose: true
      });
    });

    it("should use loaded configuration throughout the command", async () => {
      mockConfig.verbose = true;
      mockConfig.path = "./configured-path";
      mockConfig.format = "markdown";
      
      exportCommand.parse = vi.fn().mockResolvedValue({ args: {}, flags: {} });
      exportCommand.log = vi.fn();

      await exportCommand.run();

      // Verify configuration is used
      expect(exportCommand.log).toHaveBeenCalledWith(expect.stringContaining("./configured-path"));
      expect(exportCommand.log).toHaveBeenCalledWith(expect.stringContaining("markdown"));
    });
  });

  describe("Database and Page Parsing", () => {
    it("should parse databases from configuration", async () => {
      mockConfig.databases = "db1,db2,db3";
      
      exportCommand.parse = vi.fn().mockResolvedValue({ args: {}, flags: {} });
      exportCommand.log = vi.fn();
      
      const NotionClient = require("../infrastructure/notion/notion-client").NotionClient;
      const mockNotionClient = new NotionClient();
      mockNotionClient.queryDatabase.mockResolvedValue({
        results: [
          { id: "page1", title: "Page 1" },
          { id: "page2", title: "Page 2" }
        ],
        hasMore: false
      });

      await exportCommand.run();

      // Verify databases were processed
      expect(mockNotionClient.getDatabase).toHaveBeenCalledWith("db1");
      expect(mockNotionClient.getDatabase).toHaveBeenCalledWith("db2");
      expect(mockNotionClient.getDatabase).toHaveBeenCalledWith("db3");
    });

    it("should parse pages from configuration", async () => {
      mockConfig.pages = "page1,page2";
      
      exportCommand.parse = vi.fn().mockResolvedValue({ args: {}, flags: {} });
      exportCommand.log = vi.fn();

      await exportCommand.run();

      const NotionClient = require("../infrastructure/notion/notion-client").NotionClient;
      const mockNotionClient = new NotionClient();
      
      expect(mockNotionClient.getPage).toHaveBeenCalledWith("page1");
      expect(mockNotionClient.getPage).toHaveBeenCalledWith("page2");
    });

    it("should discover all content when no specific items provided", async () => {
      mockConfig.databases = undefined;
      mockConfig.pages = undefined;
      
      exportCommand.parse = vi.fn().mockResolvedValue({ args: {}, flags: {} });
      exportCommand.log = vi.fn();

      const NotionClient = require("../infrastructure/notion/notion-client").NotionClient;
      const mockNotionClient = new NotionClient();
      
      mockNotionClient.getDatabases.mockResolvedValue([
        { id: "discovered-db1", title: "Discovered DB 1" }
      ]);
      
      mockNotionClient.search.mockResolvedValue({
        results: [
          { id: "discovered-page1", title: "Discovered Page 1", parent: { type: "workspace" } }
        ],
        has_more: false
      });

      await exportCommand.run();

      expect(mockNotionClient.getDatabases).toHaveBeenCalled();
      expect(mockNotionClient.search).toHaveBeenCalled();
    });
  });

  describe("Service Configuration", () => {
    it("should initialize services with configuration values", async () => {
      mockConfig.verbose = true;
      mockConfig.token = "ntn_testtoken12345678901234567890123456789012345678";
      
      exportCommand.parse = vi.fn().mockResolvedValue({ args: {}, flags: {} });
      exportCommand.log = vi.fn();

      const { createControlPlane } = require("../lib/control-plane/control-plane");
      const NotionClient = require("../infrastructure/notion/notion-client").NotionClient;

      await exportCommand.run();

      // Verify control plane initialized with verbose flag
      expect(createControlPlane).toHaveBeenCalledWith({
        enableLogging: true,
        enableMetrics: true,
        enableHealthCheck: true,
        autoStartComponents: true
      });

      // Verify NotionClient initialized with token
      expect(NotionClient).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: "ntn_testtoken12345678901234567890123456789012345678"
        })
      );
    });
  });

  describe("Export Options", () => {
    it("should respect include-blocks configuration", async () => {
      mockConfig["include-blocks"] = false;
      mockConfig.pages = "page1";
      
      exportCommand.parse = vi.fn().mockResolvedValue({ args: {}, flags: {} });
      exportCommand.log = vi.fn();

      const NotionClient = require("../infrastructure/notion/notion-client").NotionClient;
      const mockNotionClient = new NotionClient();

      await exportCommand.run();

      // Should not call getBlocks when include-blocks is false
      expect(mockNotionClient.getBlocks).not.toHaveBeenCalled();
    });

    it("should respect include-comments configuration", async () => {
      mockConfig["include-comments"] = true;
      mockConfig.pages = "page1";
      
      exportCommand.parse = vi.fn().mockResolvedValue({ args: {}, flags: {} });
      exportCommand.log = vi.fn();

      const NotionClient = require("../infrastructure/notion/notion-client").NotionClient;
      const mockNotionClient = new NotionClient();

      await exportCommand.run();

      // Should call getComments when include-comments is true
      expect(mockNotionClient.getComments).toHaveBeenCalledWith("page1");
    });

    it("should respect include-properties configuration", async () => {
      mockConfig["include-properties"] = true;
      mockConfig.databases = "db1";
      
      exportCommand.parse = vi.fn().mockResolvedValue({ args: {}, flags: {} });
      exportCommand.log = vi.fn();

      const NotionClient = require("../infrastructure/notion/notion-client").NotionClient;
      const mockNotionClient = new NotionClient();

      await exportCommand.run();

      // Should call getDatabaseProperties when include-properties is true
      expect(mockNotionClient.getDatabaseProperties).toHaveBeenCalledWith("db1");
    });
  });

  describe("Error Handling", () => {
    it("should handle configuration validation errors", async () => {
      const { loadCommandConfig } = require("../lib/config/simple-config");
      loadCommandConfig.mockRejectedValue(new Error("Configuration validation failed: token: Invalid format"));
      
      exportCommand.parse = vi.fn().mockResolvedValue({ args: {}, flags: {} });
      exportCommand.error = vi.fn();

      await exportCommand.run();

      expect(exportCommand.error).toHaveBeenCalledWith(
        expect.stringContaining("Configuration validation failed")
      );
    });

    it("should show detailed errors in verbose mode", async () => {
      mockConfig.verbose = true;
      
      exportCommand.parse = vi.fn().mockResolvedValue({ args: {}, flags: {} });
      exportCommand.log = vi.fn();
      exportCommand.error = vi.fn();

      // Force an error during initialization
      const { createControlPlane } = require("../lib/control-plane/control-plane");
      createControlPlane.mockImplementation(() => {
        throw new Error("Control plane initialization failed");
      });

      await exportCommand.run();

      // In verbose mode, should log detailed error information
      const { log } = require("../lib/log");
      expect(log.error).toHaveBeenCalledWith(
        "Export error details",
        expect.objectContaining({ error: expect.any(String) })
      );
    });
  });

  describe("Output Format", () => {
    it("should use configured output format", async () => {
      mockConfig.format = "markdown";
      mockConfig.pages = "page1";
      
      exportCommand.parse = vi.fn().mockResolvedValue({ args: {}, flags: {} });
      exportCommand.log = vi.fn();

      const FileSystemManager = require("../infrastructure/filesystem/file-system-manager").FileSystemManager;
      const mockFSManager = new FileSystemManager();

      await exportCommand.run();

      expect(mockFSManager.writePage).toHaveBeenCalledWith(
        expect.any(Object),
        "markdown"
      );
    });
  });

  describe("Concurrency Control", () => {
    it("should respect max-concurrency configuration", async () => {
      mockConfig["max-concurrency"] = 5;
      
      exportCommand.parse = vi.fn().mockResolvedValue({ args: {}, flags: {} });
      exportCommand.log = vi.fn();

      await exportCommand.run();

      // Verify max-concurrency is displayed in output
      expect(exportCommand.log).toHaveBeenCalledWith(
        expect.stringContaining("Max Concurrency: \u001b[33m5")
      );
    });
  });
});