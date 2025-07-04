import { APIErrorCode, Client, isNotionClientError } from "@notionhq/client";
import { promises as fs } from "fs";
import { inspect } from "util";
import { afterEach, beforeEach, describe, expect, it, Mock, vi } from "vitest";
import { ExporterConfig } from "./config";
import { Exporter } from "./exporter";

// Mock the Notion client
vi.mock("@notionhq/client", () => ({
  Client: vi.fn(),
  isNotionClientError: vi.fn(),
  APIErrorCode: {
    ObjectNotFound: "object_not_found",
  },
}));

// Mock fs promises
vi.mock("fs", () => ({
  promises: {
    mkdir: vi.fn(),
    writeFile: vi.fn(),
    readdir: vi.fn(),
  },
}));

describe("WorkspaceExporter", () => {
  let exporter: Exporter;
  let mockClient: any;
  let config: ExporterConfig;

  // Mock data
  const mockUsers = [
    {
      object: "user",
      id: "user-1",
      type: "person",
      person: { email: "user1@example.com" },
      name: "User 1",
    },
    {
      object: "user",
      id: "user-2",
      type: "bot",
      bot: {},
      name: "Bot User",
    },
  ];

  const mockDatabase = {
    object: "database",
    id: "db-1",
    created_time: "2023-01-01T00:00:00Z",
    archived: false,
    title: [{ text: { content: "Test Database" } }],
  };

  const mockPage = {
    object: "page",
    id: "page-1",
    created_time: "2023-01-01T00:00:00Z",
    archived: false,
    parent: { type: "workspace", workspace: true },
    properties: {},
  };

  const mockDatabasePage = {
    object: "page",
    id: "db-page-1",
    created_time: "2023-01-01T00:00:00Z",
    archived: false,
    parent: { type: "database_id", database_id: "db-1" },
    properties: {},
  };

  const mockBlock = {
    object: "block",
    id: "block-1",
    created_time: "2023-01-01T00:00:00Z",
    type: "paragraph",
    has_children: true,
    paragraph: { rich_text: [{ text: { content: "Test block" } }] },
  };

  const mockChildBlock = {
    object: "block",
    id: "block-2",
    created_time: "2023-01-01T00:00:00Z",
    type: "paragraph",
    has_children: false,
    paragraph: { rich_text: [{ text: { content: "Test child block" } }] },
  };

  const mockComment = {
    object: "comment",
    id: "comment-1",
    created_time: "2023-01-01T00:00:00Z",
    rich_text: [{ text: { content: "Test comment" } }],
  };

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    config = {
      token: "test-token",
      output: "/test/output",
    };

    // Setup mock client
    mockClient = {
      users: {
        list: vi.fn(),
      },
      search: vi.fn(),
      databases: {
        query: vi.fn(),
      },
      blocks: {
        children: {
          list: vi.fn(),
        },
      },
      comments: {
        list: vi.fn(),
      },
    };

    (Client as unknown as Mock).mockImplementation(() => mockClient);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    it("should initialize with provided config", () => {
      console.log(
        inspect(
          { test: "constructor - provided config" },
          { colors: true, compact: false }
        )
      );
      exporter = new Exporter(config);

      expect(Client).toHaveBeenCalledWith({ auth: "test-token" });
    });

    it("should apply default config values", () => {
      console.log(
        inspect(
          { test: "constructor - default values" },
          { colors: true, compact: false }
        )
      );
      exporter = new Exporter(config);

      // Access private config through export method behavior
      expect(Client).toHaveBeenCalledWith({ auth: "test-token" });
    });

    it("should override default config with provided values", () => {
      console.log(
        inspect(
          { test: "constructor - override defaults" },
          { colors: true, compact: false }
        )
      );
      const customConfig = {
        ...config,
        includeArchived: true,
        maxDepth: 5,
        includeComments: false,
        rateLimitDelay: 200,
      };

      exporter = new Exporter(customConfig);
      expect(Client).toHaveBeenCalledWith({ auth: "test-token" });
    });
  });

  describe("export", () => {
    beforeEach(() => {
      exporter = new Exporter(config);

      // Setup default mock responses
      mockClient.users.list.mockResolvedValue({
        results: mockUsers,
        next_cursor: null,
      });

      mockClient.search.mockImplementation(({ filter }: any) => {
        if (filter.value === "database") {
          return Promise.resolve({
            results: [mockDatabase],
            next_cursor: null,
          });
        } else if (filter.value === "page") {
          return Promise.resolve({
            results: [mockPage],
            next_cursor: null,
          });
        }
        return Promise.resolve({ results: [], next_cursor: null });
      });

      mockClient.databases.query.mockResolvedValue({
        results: [mockDatabasePage],
        next_cursor: null,
      });

      mockClient.blocks.children.list.mockResolvedValue({
        results: [mockBlock],
        next_cursor: null,
      });

      mockClient.comments.list.mockResolvedValue({
        results: [mockComment],
        next_cursor: null,
      });

      (fs.readdir as Mock).mockResolvedValue(["page-1.json"]);
    });

    it("should export all workspace content successfully", async () => {
      console.log(
        inspect(
          { test: "export - success case" },
          { colors: true, compact: false }
        )
      );

      const result = await exporter.export();

      expect(result).toMatchObject({
        usersCount: 2,
        databasesCount: 1,
        pagesCount: 2, // 1 standalone + 1 database page
        blocksCount: 3, // page-1, db-page-1, and block-1 (child block is fetched but block-1 is only counted once)
        commentsCount: 1,
        errors: [],
      });

      expect(result.startTime).toBeInstanceOf(Date);
      expect(result.endTime).toBeInstanceOf(Date);
      expect(result.endTime.getTime()).toBeGreaterThanOrEqual(
        result.startTime.getTime()
      );
    });

    it("should create directory structure", async () => {
      console.log(
        inspect(
          { test: "export - directory creation" },
          { colors: true, compact: false }
        )
      );

      await exporter.export();

      expect(fs.mkdir).toHaveBeenCalledWith("/test/output", {
        recursive: true,
      });
      expect(fs.mkdir).toHaveBeenCalledWith("/test/output/users", {
        recursive: true,
      });
      expect(fs.mkdir).toHaveBeenCalledWith("/test/output/databases", {
        recursive: true,
      });
      expect(fs.mkdir).toHaveBeenCalledWith("/test/output/pages", {
        recursive: true,
      });
      expect(fs.mkdir).toHaveBeenCalledWith("/test/output/blocks", {
        recursive: true,
      });
      expect(fs.mkdir).toHaveBeenCalledWith("/test/output/comments", {
        recursive: true,
      });
    });

    it("should handle export errors", async () => {
      console.log(
        inspect(
          { test: "export - error handling" },
          { colors: true, compact: false }
        )
      );

      const error = new Error("Export failed");
      (fs.mkdir as Mock).mockRejectedValue(error);

      await expect(exporter.export()).rejects.toThrow("Export failed");
    });

    it("should skip comments when disabled", async () => {
      console.log(
        inspect(
          { test: "export - skip comments" },
          { colors: true, compact: false }
        )
      );

      exporter = new Exporter({ ...config, comments: false });

      const result = await exporter.export();

      expect(result.commentsCount).toBe(0);
      expect(mockClient.comments.list).not.toHaveBeenCalled();
    });
  });

  describe("exportUsers", () => {
    beforeEach(() => {
      exporter = new Exporter(config);
      mockClient.users.list.mockResolvedValue({
        results: mockUsers,
        next_cursor: null,
      });
    });

    it("should export all users", async () => {
      console.log(
        inspect(
          { test: "exportUsers - success" },
          { colors: true, compact: false }
        )
      );

      await exporter.export();

      expect(fs.writeFile).toHaveBeenCalledWith(
        "/test/output/users/all-users.json",
        JSON.stringify(mockUsers, null, 2)
      );

      expect(fs.writeFile).toHaveBeenCalledWith(
        "/test/output/users/user-1.json",
        JSON.stringify(mockUsers[0], null, 2)
      );

      expect(fs.writeFile).toHaveBeenCalledWith(
        "/test/output/users/user-2.json",
        JSON.stringify(mockUsers[1], null, 2)
      );
    });

    it("should handle user export errors gracefully", async () => {
      console.log(
        inspect(
          { test: "exportUsers - error handling" },
          { colors: true, compact: false }
        )
      );

      mockClient.users.list.mockRejectedValue(new Error("API Error"));

      const result = await exporter.export();

      expect(result.usersCount).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({
        type: "users",
        error: "API Error",
      });
    });

    it("should handle pagination", async () => {
      console.log(
        inspect(
          { test: "exportUsers - pagination" },
          { colors: true, compact: false }
        )
      );

      const firstPage = {
        results: [mockUsers[0]],
        next_cursor: "cursor-1",
      };

      const secondPage = {
        results: [mockUsers[1]],
        next_cursor: null as any,
      };

      mockClient.users.list
        .mockResolvedValueOnce(firstPage)
        .mockResolvedValueOnce(secondPage);

      await exporter.export();

      expect(mockClient.users.list).toHaveBeenCalledTimes(2);
      expect(mockClient.users.list).toHaveBeenNthCalledWith(1, {
        start_cursor: undefined,
      });
      expect(mockClient.users.list).toHaveBeenNthCalledWith(2, {
        start_cursor: "cursor-1",
      });
    });
  });

  describe("exportDatabases", () => {
    beforeEach(() => {
      exporter = new Exporter(config);
      mockClient.search.mockImplementation(({ filter }: any) => {
        if (filter.value === "database") {
          return Promise.resolve({
            results: [mockDatabase],
            next_cursor: null,
          });
        }
        return Promise.resolve({ results: [], next_cursor: null });
      });

      mockClient.databases.query.mockResolvedValue({
        results: [mockDatabasePage],
        next_cursor: null,
      });
    });

    it("should export databases and their pages", async () => {
      console.log(
        inspect(
          { test: "exportDatabases - success" },
          { colors: true, compact: false }
        )
      );

      await exporter.export();

      expect(fs.writeFile).toHaveBeenCalledWith(
        "/test/output/databases/db-1.json",
        JSON.stringify(mockDatabase, null, 2)
      );

      expect(mockClient.databases.query).toHaveBeenCalledWith({
        database_id: "db-1",
        start_cursor: undefined,
      });

      expect(fs.writeFile).toHaveBeenCalledWith(
        "/test/output/pages/db-page-1.json",
        JSON.stringify(mockDatabasePage, null, 2)
      );
    });

    it("should skip archived databases when includeArchived is false", async () => {
      console.log(
        inspect(
          { test: "exportDatabases - skip archived" },
          { colors: true, compact: false }
        )
      );

      const archivedDatabase = { ...mockDatabase, archived: true };
      mockClient.search.mockImplementation(({ filter }: any) => {
        if (filter.value === "database") {
          return Promise.resolve({
            results: [archivedDatabase],
            next_cursor: null,
          });
        }
        return Promise.resolve({ results: [], next_cursor: null });
      });

      const result = await exporter.export();

      expect(result.databasesCount).toBe(0);
      expect(fs.writeFile).not.toHaveBeenCalledWith(
        expect.stringContaining("databases/db-1.json"),
        expect.any(String)
      );
    });

    it("should include archived databases when includeArchived is true", async () => {
      console.log(
        inspect(
          { test: "exportDatabases - include archived" },
          { colors: true, compact: false }
        )
      );

      exporter = new Exporter({ ...config, archived: true });
      const archivedDatabase = { ...mockDatabase, archived: true };

      mockClient.search.mockImplementation(({ filter }: any) => {
        if (filter.value === "database") {
          return Promise.resolve({
            results: [archivedDatabase],
            next_cursor: null,
          });
        }
        return Promise.resolve({ results: [], next_cursor: null });
      });

      const result = await exporter.export();

      expect(result.databasesCount).toBe(1);
    });

    it("should handle database query errors", async () => {
      console.log(
        inspect(
          { test: "exportDatabases - query error" },
          { colors: true, compact: false }
        )
      );

      mockClient.databases.query.mockRejectedValue(new Error("Query failed"));

      const result = await exporter.export();

      expect(result.errors).toContainEqual({
        type: "database-pages",
        id: "db-1",
        error: "Query failed",
      });
    });

    it("should filter out partial database objects", async () => {
      console.log(
        inspect(
          { test: "exportDatabases - filter partial" },
          { colors: true, compact: false }
        )
      );

      const partialDatabase = {
        object: "database",
        id: "db-partial",
        // Missing created_time
      };

      mockClient.search.mockImplementation(({ filter }: any) => {
        if (filter.value === "database") {
          return Promise.resolve({
            results: [mockDatabase, partialDatabase],
            next_cursor: null,
          });
        }
        return Promise.resolve({ results: [], next_cursor: null });
      });

      const result = await exporter.export();

      expect(result.databasesCount).toBe(1); // Only full database
    });
  });

  describe("exportStandalonePages", () => {
    beforeEach(() => {
      exporter = new Exporter(config);
      mockClient.search.mockImplementation(({ filter }: any) => {
        if (filter.value === "page") {
          return Promise.resolve({
            results: [mockPage, mockDatabasePage],
            next_cursor: null,
          });
        }
        return Promise.resolve({ results: [], next_cursor: null });
      });
    });

    it("should only export standalone pages", async () => {
      console.log(
        inspect(
          { test: "exportStandalonePages - filter database pages" },
          { colors: true, compact: false }
        )
      );

      await exporter.export();

      // Should only write the standalone page, not the database page
      expect(fs.writeFile).toHaveBeenCalledWith(
        "/test/output/pages/page-1.json",
        JSON.stringify(mockPage, null, 2)
      );
    });

    it("should skip archived pages when includeArchived is false", async () => {
      console.log(
        inspect(
          { test: "exportStandalonePages - skip archived" },
          { colors: true, compact: false }
        )
      );

      const archivedPage = { ...mockPage, archived: true };
      mockClient.search.mockImplementation(({ filter }: any) => {
        if (filter.value === "page") {
          return Promise.resolve({
            results: [archivedPage],
            next_cursor: null,
          });
        }
        return Promise.resolve({ results: [], next_cursor: null });
      });

      const result = await exporter.export();

      expect(result.pagesCount).toBe(0); // No standalone pages
    });
  });

  describe("exportBlocks", () => {
    beforeEach(() => {
      exporter = new Exporter(config);

      // Setup mock for recursive block fetching
      mockClient.blocks.children.list.mockImplementation(
        ({ block_id }: any) => {
          if (block_id === "page-1" || block_id === "db-page-1") {
            return Promise.resolve({
              results: [mockBlock],
              next_cursor: null,
            });
          } else if (block_id === "block-1") {
            return Promise.resolve({
              results: [mockChildBlock],
              next_cursor: null,
            });
          }
          return Promise.resolve({ results: [], next_cursor: null });
        }
      );
    });

    it("should recursively export blocks", async () => {
      console.log(
        inspect(
          { test: "exportBlocks - recursive" },
          { colors: true, compact: false }
        )
      );

      await exporter.export();

      // Check that blocks were fetched for pages
      expect(mockClient.blocks.children.list).toHaveBeenCalledWith({
        block_id: "page-1",
        start_cursor: undefined,
      });

      // Check that child blocks were fetched
      expect(mockClient.blocks.children.list).toHaveBeenCalledWith({
        block_id: "block-1",
        start_cursor: undefined,
      });

      // Check that blocks were saved
      expect(fs.writeFile).toHaveBeenCalledWith(
        "/test/output/blocks/page-1-children.json",
        JSON.stringify([mockBlock], null, 2)
      );

      expect(fs.writeFile).toHaveBeenCalledWith(
        "/test/output/blocks/block-1-children.json",
        JSON.stringify([mockChildBlock], null, 2)
      );
    });

    it("should respect maxDepth limit", async () => {
      console.log(
        inspect(
          { test: "exportBlocks - maxDepth" },
          { colors: true, compact: false }
        )
      );

      exporter = new Exporter({ ...config, depth: 1 });

      await exporter.export();

      // Should fetch page blocks but not grandchildren
      expect(mockClient.blocks.children.list).toHaveBeenCalledWith({
        block_id: "page-1",
        start_cursor: undefined,
      });

      // Should not fetch children of blocks at maxDepth
      expect(mockClient.blocks.children.list).not.toHaveBeenCalledWith({
        block_id: "block-1",
        start_cursor: undefined,
      });
    });

    it("should avoid duplicate block exports", async () => {
      console.log(
        inspect(
          { test: "exportBlocks - avoid duplicates" },
          { colors: true, compact: false }
        )
      );

      // Make both pages have the same block
      mockClient.blocks.children.list.mockResolvedValue({
        results: [mockBlock],
        next_cursor: null,
      });

      await exporter.export();

      // Should only write block-1-children.json once
      const blockChildrenCalls = (fs.writeFile as Mock).mock.calls.filter(
        (call) => call[0].includes("block-1-children.json")
      );

      expect(blockChildrenCalls).toHaveLength(1);
    });

    it("should handle block export errors", async () => {
      console.log(
        inspect(
          { test: "exportBlocks - error handling" },
          { colors: true, compact: false }
        )
      );

      mockClient.blocks.children.list.mockRejectedValue(
        new Error("Block fetch failed")
      );

      const result = await exporter.export();

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          type: "blocks",
          error: "Block fetch failed",
        })
      );
    });

    it("should filter out partial block objects", async () => {
      console.log(
        inspect(
          { test: "exportBlocks - filter partial" },
          { colors: true, compact: false }
        )
      );

      const partialBlock = {
        object: "block",
        id: "block-partial",
        // Missing created_time
      };

      mockClient.blocks.children.list.mockResolvedValue({
        results: [mockBlock, partialBlock],
        next_cursor: null,
      });

      await exporter.export();

      // Should only process full blocks for recursion
      expect(mockClient.blocks.children.list).toHaveBeenCalledWith({
        block_id: "block-1",
        start_cursor: undefined,
      });

      expect(mockClient.blocks.children.list).not.toHaveBeenCalledWith({
        block_id: "block-partial",
        start_cursor: undefined,
      });
    });
  });

  describe("exportComments", () => {
    beforeEach(() => {
      exporter = new Exporter(config);
      (fs.readdir as Mock).mockResolvedValue(["page-1.json", "db-page-1.json"]);

      mockClient.comments.list.mockResolvedValue({
        results: [mockComment],
        next_cursor: null,
      });
    });

    it("should export comments for all pages", async () => {
      console.log(
        inspect(
          { test: "exportComments - success" },
          { colors: true, compact: false }
        )
      );

      await exporter.export();

      expect(mockClient.comments.list).toHaveBeenCalledWith({
        block_id: "page-1",
        start_cursor: undefined,
      });

      expect(mockClient.comments.list).toHaveBeenCalledWith({
        block_id: "db-page-1",
        start_cursor: undefined,
      });

      expect(fs.writeFile).toHaveBeenCalledWith(
        "/test/output/comments/page-1-comments.json",
        JSON.stringify([mockComment], null, 2)
      );
    });

    it("should skip pages without comments", async () => {
      console.log(
        inspect(
          { test: "exportComments - no comments" },
          { colors: true, compact: false }
        )
      );

      mockClient.comments.list.mockResolvedValue({
        results: [],
        next_cursor: null,
      });

      await exporter.export();

      // Should not write comment files for pages without comments
      expect(fs.writeFile).not.toHaveBeenCalledWith(
        expect.stringContaining("comments"),
        expect.any(String)
      );
    });

    it("should handle ObjectNotFound errors gracefully", async () => {
      console.log(
        inspect(
          { test: "exportComments - not found error" },
          { colors: true, compact: false }
        )
      );

      const notFoundError = { code: APIErrorCode.ObjectNotFound };
      (isNotionClientError as unknown as Mock).mockReturnValue(true);
      mockClient.comments.list.mockRejectedValue(notFoundError);

      const result = await exporter.export();

      // Should not add ObjectNotFound errors to error list
      expect(result.errors).not.toContainEqual(
        expect.objectContaining({
          type: "comments",
        })
      );
    });

    it("should handle other comment errors", async () => {
      console.log(
        inspect(
          { test: "exportComments - other errors" },
          { colors: true, compact: false }
        )
      );

      const otherError = new Error("Comments API error");
      (isNotionClientError as unknown as Mock).mockReturnValue(false);
      mockClient.comments.list.mockRejectedValue(otherError);

      const result = await exporter.export();

      expect(result.errors).toContainEqual({
        type: "comments",
        id: "page-1",
        error: "Comments API error",
      });
    });
  });

  describe("rate limiting", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should apply rate limiting delays", async () => {
      console.log(
        inspect(
          { test: "rate limiting - delays" },
          { colors: true, compact: false }
        )
      );

      exporter = new Exporter({ ...config, rate: 200 });

      const exportPromise = exporter.export();

      // Advance timers to allow rate limit delays
      await vi.advanceTimersByTimeAsync(5000);

      await exportPromise;

      // Verify setTimeout was called with correct delay
      expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 200);
    });

    it("should use custom rate limit delay", async () => {
      console.log(
        inspect(
          { test: "rate limiting - custom delay" },
          { colors: true, compact: false }
        )
      );

      exporter = new Exporter({ ...config, rate: 500 });

      const exportPromise = exporter.export();

      await vi.advanceTimersByTimeAsync(10000);

      await exportPromise;

      expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 500);
    });
  });

  describe("error handling", () => {
    beforeEach(() => {
      exporter = new Exporter(config);
    });

    it("should handle and collect various error types", async () => {
      console.log(
        inspect(
          { test: "error handling - multiple errors" },
          { colors: true, compact: false }
        )
      );

      // Setup various errors
      mockClient.users.list.mockRejectedValue(new Error("Users error"));
      mockClient.search.mockRejectedValue(new Error("Search error"));

      const result = await exporter.export();

      expect(result.errors).toContainEqual({
        type: "users",
        id: undefined,
        error: "Users error",
      });

      expect(result.errors).toContainEqual({
        type: "databases",
        id: undefined,
        error: "Search error",
      });
    });

    it("should handle non-Error objects", async () => {
      console.log(
        inspect(
          { test: "error handling - non-Error objects" },
          { colors: true, compact: false }
        )
      );

      mockClient.users.list.mockRejectedValue("String error");

      const result = await exporter.export();

      expect(result.errors).toContainEqual({
        type: "users",
        id: undefined,
        error: "String error",
      });
    });

    it("should log errors to console", async () => {
      console.log(
        inspect(
          { test: "error handling - console logging" },
          { colors: true, compact: false }
        )
      );

      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      mockClient.users.list.mockRejectedValue(new Error("Test error"));

      await exporter.export();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Error exporting users: Test error")
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe("type guards", () => {
    beforeEach(() => {
      exporter = new Exporter(config);
    });

    it("should correctly identify full vs partial objects", async () => {
      console.log(
        inspect(
          { test: "type guards - full vs partial" },
          { colors: true, compact: false }
        )
      );

      const partialPage = {
        object: "page",
        id: "partial-page",
        // Missing created_time
      };

      const partialDatabase = {
        object: "database",
        id: "partial-db",
        // Missing created_time
      };

      const partialBlock = {
        object: "block",
        id: "partial-block",
        // Missing created_time
      };

      mockClient.search.mockImplementation(({ filter }: any) => {
        if (filter.value === "page") {
          return Promise.resolve({
            results: [mockPage, partialPage],
            next_cursor: null,
          });
        } else if (filter.value === "database") {
          return Promise.resolve({
            results: [mockDatabase, partialDatabase],
            next_cursor: null,
          });
        }
        return Promise.resolve({ results: [], next_cursor: null });
      });

      mockClient.blocks.children.list.mockResolvedValue({
        results: [mockBlock, partialBlock],
        next_cursor: null,
      });

      const result = await exporter.export();

      // Should only count full objects
      expect(result.pagesCount).toBe(2); // 1 standalone + 1 database page
      expect(result.databasesCount).toBe(1);
    });
  });

  describe("edge cases", () => {
    beforeEach(() => {
      exporter = new Exporter(config);
    });

    it("should handle empty workspace", async () => {
      console.log(
        inspect(
          { test: "edge cases - empty workspace" },
          { colors: true, compact: false }
        )
      );

      // All API calls return empty results
      mockClient.users.list.mockResolvedValue({
        results: [],
        next_cursor: null,
      });
      mockClient.search.mockResolvedValue({ results: [], next_cursor: null });
      (fs.readdir as Mock).mockResolvedValue([]);

      const result = await exporter.export();

      expect(result).toMatchObject({
        usersCount: 0,
        databasesCount: 0,
        pagesCount: 0,
        blocksCount: 0,
        commentsCount: 0,
        errors: [],
      });
    });

    it("should handle pages with no blocks", async () => {
      console.log(
        inspect(
          { test: "edge cases - no blocks" },
          { colors: true, compact: false }
        )
      );

      mockClient.blocks.children.list.mockResolvedValue({
        results: [],
        next_cursor: null,
      });

      const result = await exporter.export();

      expect(result.blocksCount).toBe(0);
    });

    it("should handle blocks without children", async () => {
      console.log(
        inspect(
          { test: "edge cases - blocks without children" },
          { colors: true, compact: false }
        )
      );

      const blockNoChildren = { ...mockBlock, has_children: false };

      mockClient.blocks.children.list.mockResolvedValue({
        results: [blockNoChildren],
        next_cursor: null,
      });

      await exporter.export();

      // Should not try to fetch children for blocks with has_children: false
      expect(mockClient.blocks.children.list).toHaveBeenCalledTimes(2); // Only for the two pages
    });

    it("should handle circular references in blocks", async () => {
      console.log(
        inspect(
          { test: "edge cases - circular references" },
          { colors: true, compact: false }
        )
      );

      // Simulate circular reference by making block-1 appear again
      mockClient.blocks.children.list.mockImplementation(
        ({ block_id }: any) => {
          return Promise.resolve({
            results: [mockBlock], // Always returns block-1
            next_cursor: null,
          });
        }
      );

      const result = await exporter.export();

      // Should not get stuck in infinite loop
      expect(result.blocksCount).toBe(1); // Only unique blocks
    });

    it("should handle very deep nesting up to maxDepth", async () => {
      console.log(
        inspect(
          { test: "edge cases - deep nesting" },
          { colors: true, compact: false }
        )
      );

      exporter = new Exporter({ ...config, depth: 3 });

      // Create deep nesting
      const blocks: any[] = [];
      for (let i = 0; i < 5; i++) {
        blocks.push({
          object: "block",
          id: `block-${i}`,
          created_time: "2023-01-01T00:00:00Z",
          type: "paragraph",
          has_children: true,
          paragraph: { rich_text: [] },
        });
      }

      mockClient.blocks.children.list.mockImplementation(
        ({ block_id }: any) => {
          const match = block_id.match(/block-(\d+)/);
          if (match) {
            const index = parseInt(match[1]);
            if (index < blocks.length - 1) {
              return Promise.resolve({
                results: [blocks[index + 1]],
                next_cursor: null,
              });
            }
          } else if (block_id === "page-1") {
            return Promise.resolve({
              results: [blocks[0]],
              next_cursor: null,
            });
          }
          return Promise.resolve({ results: [], next_cursor: null });
        }
      );

      await exporter.export();

      // Should stop at maxDepth (3)
      expect(mockClient.blocks.children.list).toHaveBeenCalledTimes(4); // page + 3 levels
    });
  });
});
