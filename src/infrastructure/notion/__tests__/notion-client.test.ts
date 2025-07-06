/**
 * Notion Client Tests
 *
 * Tests API integration and error handling
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotionConfig } from "../../../shared/types";
import { NotionClient } from "../notion-client";

// Mock the @notionhq/client
vi.mock("@notionhq/client", () => ({
  Client: vi.fn().mockImplementation(() => ({
    pages: {
      retrieve: vi.fn()
    },
    databases: {
      retrieve: vi.fn(),
      query: vi.fn()
    },
    blocks: {
      children: {
        list: vi.fn()
      }
    },
    users: {
      list: vi.fn(),
      me: vi.fn()
    },
    search: vi.fn()
  })),
  APIErrorCode: {
    RateLimited: "rate_limited",
    Unauthorized: "unauthorized",
    ObjectNotFound: "object_not_found",
    ValidationError: "validation_error",
    ConflictError: "conflict_error",
    InternalServerError: "internal_server_error",
    ServiceUnavailable: "service_unavailable"
  },
  isNotionClientError: vi.fn()
}));

describe("NotionClient", () => {
  let notionClient: NotionClient;
  let mockEventPublisher: ReturnType<typeof vi.fn>;
  let mockCircuitBreaker: any;
  let mockClient: any;

  beforeEach(() => {
    mockEventPublisher = vi.fn();
    mockCircuitBreaker = {
      execute: vi.fn().mockImplementation((fn) => fn()),
      canProceed: vi.fn().mockReturnValue(true)
    };

    const config: NotionConfig = {
      apiKey: "test-key",
      apiVersion: "2022-06-28",
      baseUrl: "https://api.notion.com",
      timeout: 30000,
      retryAttempts: 3
    };

    notionClient = new NotionClient(config, mockEventPublisher, mockCircuitBreaker);
    mockClient = (notionClient as any).client;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("initialization", () => {
    it("should initialize with correct configuration", () => {
      expect(notionClient).toBeDefined();
      expect(mockClient).toBeDefined();
    });

    it("should have null rate limit info initially", () => {
      expect(notionClient.getRateLimitInfo()).toBeNull();
    });
  });

  describe("page operations", () => {
    it("should fetch page successfully", async () => {
      const mockPage = {
        id: "page-1",
        object: "page",
        properties: {
          title: {
            title: [{ plain_text: "Test Page" }]
          }
        },
        parent: { type: "workspace" },
        url: "https://notion.so/page-1",
        archived: false,
        created_time: "2023-01-01T00:00:00.000Z",
        last_edited_time: "2023-01-01T00:00:00.000Z",
        created_by: { id: "user-1", type: "person" },
        last_edited_by: { id: "user-1", type: "person" }
      };

      mockClient.pages.retrieve.mockResolvedValue(mockPage);

      const result = await notionClient.getPage("page-1");

      expect(result.id).toBe("page-1");
      expect(result.title).toBe("Test Page");
      expect(result.url).toBe("https://notion.so/page-1");

      expect(mockEventPublisher).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "notion.object.fetched",
          payload: expect.objectContaining({
            objectId: "page-1",
            objectType: "page"
          })
        })
      );

      expect(mockCircuitBreaker.execute).toHaveBeenCalled();
    });

    it("should handle page retrieval errors", async () => {
      const error = new Error("Page not found");
      (error as any).code = "object_not_found";

      mockClient.pages.retrieve.mockRejectedValue(error);

      await expect(notionClient.getPage("page-1")).rejects.toThrow();

      expect(mockEventPublisher).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "notion.api.error"
        })
      );
    });
  });

  describe("database operations", () => {
    it("should fetch database successfully", async () => {
      const mockDatabase = {
        id: "db-1",
        object: "database",
        title: [{ plain_text: "Test Database" }],
        description: [{ plain_text: "Test Description" }],
        properties: {},
        parent: { type: "workspace" },
        url: "https://notion.so/db-1",
        archived: false,
        created_time: "2023-01-01T00:00:00.000Z",
        last_edited_time: "2023-01-01T00:00:00.000Z",
        created_by: { id: "user-1", type: "person" },
        last_edited_by: { id: "user-1", type: "person" }
      };

      mockClient.databases.retrieve.mockResolvedValue(mockDatabase);

      const result = await notionClient.getDatabase("db-1");

      expect(result.id).toBe("db-1");
      expect(result.title).toBe("Test Database");
      expect(result.description).toBe("Test Description");

      expect(mockEventPublisher).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "notion.object.fetched",
          payload: expect.objectContaining({
            objectId: "db-1",
            objectType: "database"
          })
        })
      );
    });

    it("should query database successfully", async () => {
      const mockQueryResult = {
        results: [
          {
            id: "page-1",
            object: "page",
            properties: {},
            parent: { type: "database_id", database_id: "db-1" },
            url: "https://notion.so/page-1",
            archived: false,
            created_time: "2023-01-01T00:00:00.000Z",
            last_edited_time: "2023-01-01T00:00:00.000Z",
            created_by: { id: "user-1", type: "person" },
            last_edited_by: { id: "user-1", type: "person" }
          }
        ],
        has_more: false,
        next_cursor: null
      };

      mockClient.databases.query.mockResolvedValue(mockQueryResult);

      const result = await notionClient.queryDatabase("db-1");

      expect(result.results).toHaveLength(1);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeUndefined();

      expect(mockEventPublisher).toHaveBeenCalledTimes(1); // Once for the page
    });

    it("should handle query with pagination", async () => {
      const mockQueryResult = {
        results: [
          {
            id: "page-1",
            object: "page",
            properties: {},
            parent: { type: "database_id", database_id: "db-1" },
            url: "https://notion.so/page-1",
            archived: false,
            created_time: "2023-01-01T00:00:00.000Z",
            last_edited_time: "2023-01-01T00:00:00.000Z",
            created_by: { id: "user-1", type: "person" },
            last_edited_by: { id: "user-1", type: "person" }
          }
        ],
        has_more: true,
        next_cursor: "cursor-123"
      };

      mockClient.databases.query.mockResolvedValue(mockQueryResult);

      const result = await notionClient.queryDatabase("db-1", {
        start_cursor: "cursor-456"
      });

      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBe("cursor-123");

      expect(mockClient.databases.query).toHaveBeenCalledWith({
        database_id: "db-1",
        start_cursor: "cursor-456"
      });
    });
  });

  describe("block operations", () => {
    it("should fetch blocks successfully", async () => {
      const mockBlocksResult = {
        results: [
          {
            id: "block-1",
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [{ plain_text: "Test content" }]
            },
            has_children: false,
            archived: false,
            created_time: "2023-01-01T00:00:00.000Z",
            last_edited_time: "2023-01-01T00:00:00.000Z",
            created_by: { id: "user-1", type: "person" },
            last_edited_by: { id: "user-1", type: "person" }
          }
        ],
        has_more: false,
        next_cursor: null
      };

      mockClient.blocks.children.list.mockResolvedValue(mockBlocksResult);

      const result = await notionClient.getBlocks("page-1");

      expect(result.results).toHaveLength(1);
      expect(result.results[0].blockType).toBe("paragraph");
      expect(result.hasMore).toBe(false);

      expect(mockEventPublisher).toHaveBeenCalledTimes(1); // Once for the block
    });
  });

  describe("user operations", () => {
    it("should fetch users successfully", async () => {
      const mockUsersResult = {
        results: [
          {
            id: "user-1",
            type: "person",
            name: "Test User",
            avatar_url: "https://example.com/avatar.jpg"
          }
        ]
      };

      mockClient.users.list.mockResolvedValue(mockUsersResult);

      const result = await notionClient.getUsers();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("user-1");

      expect(mockEventPublisher).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "notion.object.fetched",
          payload: expect.objectContaining({
            objectId: "users",
            objectType: "users"
          })
        })
      );
    });
  });

  describe("search operations", () => {
    it("should search successfully", async () => {
      const mockSearchResult = {
        results: [
          {
            id: "page-1",
            object: "page"
          }
        ],
        has_more: false,
        next_cursor: null
      };

      mockClient.search.mockResolvedValue(mockSearchResult);

      const result = await notionClient.search("test query");

      expect(result.results).toHaveLength(1);
      expect(mockClient.search).toHaveBeenCalledWith({
        query: "test query"
      });

      expect(mockEventPublisher).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "notion.object.fetched",
          payload: expect.objectContaining({
            objectId: "search",
            objectType: "search"
          })
        })
      );
    });
  });

  describe("error handling", () => {
    it("should handle rate limit errors", async () => {
      const rateLimitError = {
        code: "rate_limited",
        status: 429,
        headers: { "retry-after": "60" }
      };

      mockClient.pages.retrieve.mockRejectedValue(rateLimitError);

      await expect(notionClient.getPage("page-1")).rejects.toThrow(/Rate limit exceeded/);

      expect(mockEventPublisher).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "notion.rate_limit.hit",
          payload: expect.objectContaining({
            remaining: 0,
            retryAfter: 60
          })
        })
      );

      const rateLimitInfo = notionClient.getRateLimitInfo();
      expect(rateLimitInfo).toBeTruthy();
      expect(rateLimitInfo!.retryAfter).toBe(60);
    });

    it("should handle unauthorized errors", async () => {
      const unauthorizedError = {
        code: "unauthorized",
        status: 401
      };

      mockClient.pages.retrieve.mockRejectedValue(unauthorizedError);

      await expect(notionClient.getPage("page-1")).rejects.toThrow(/Invalid API key/);
    });

    it("should handle object not found errors", async () => {
      const notFoundError = {
        code: "object_not_found",
        status: 404
      };

      mockClient.pages.retrieve.mockRejectedValue(notFoundError);

      await expect(notionClient.getPage("page-1")).rejects.toThrow(/Object not found/);
    });

    it("should handle validation errors", async () => {
      const validationError = {
        code: "validation_error",
        status: 400
      };

      mockClient.pages.retrieve.mockRejectedValue(validationError);

      await expect(notionClient.getPage("page-1")).rejects.toThrow(/Invalid request parameters/);
    });

    it("should handle network errors", async () => {
      const networkError = new Error("Network error");
      (networkError as any).code = "ECONNRESET";

      mockClient.pages.retrieve.mockRejectedValue(networkError);

      await expect(notionClient.getPage("page-1")).rejects.toThrow();
    });
  });

  describe("circuit breaker integration", () => {
    it("should use circuit breaker for all operations", async () => {
      mockClient.pages.retrieve.mockResolvedValue({ id: "page-1" });

      await notionClient.getPage("page-1");

      expect(mockCircuitBreaker.execute).toHaveBeenCalled();
    });

    it("should handle circuit breaker open state", async () => {
      mockCircuitBreaker.canProceed.mockReturnValue(false);
      mockCircuitBreaker.execute.mockImplementation(() => {
        throw new Error("Circuit breaker is open");
      });

      await expect(notionClient.getPage("page-1")).rejects.toThrow(/Circuit breaker is open/);
    });
  });

  describe("title extraction", () => {
    it("should extract title from properties.title.title", async () => {
      const mockPage = {
        id: "page-1",
        properties: {
          title: {
            title: [{ plain_text: "Part 1" }, { plain_text: " Part 2" }]
          }
        },
        parent: { type: "workspace" },
        url: "https://notion.so/page-1",
        archived: false,
        created_time: "2023-01-01T00:00:00.000Z",
        last_edited_time: "2023-01-01T00:00:00.000Z",
        created_by: { id: "user-1" },
        last_edited_by: { id: "user-1" }
      };

      mockClient.pages.retrieve.mockResolvedValue(mockPage);

      const result = await notionClient.getPage("page-1");
      expect(result.title).toBe("Part 1 Part 2");
    });

    it("should extract title from title property", async () => {
      const mockDatabase = {
        id: "db-1",
        title: [{ plain_text: "Database" }, { plain_text: " Title" }],
        description: [],
        properties: {},
        parent: { type: "workspace" },
        url: "https://notion.so/db-1",
        archived: false,
        created_time: "2023-01-01T00:00:00.000Z",
        last_edited_time: "2023-01-01T00:00:00.000Z",
        created_by: { id: "user-1" },
        last_edited_by: { id: "user-1" }
      };

      mockClient.databases.retrieve.mockResolvedValue(mockDatabase);

      const result = await notionClient.getDatabase("db-1");
      expect(result.title).toBe("Database Title");
    });

    it("should return empty string for missing title", async () => {
      const mockPage = {
        id: "page-1",
        properties: {},
        parent: { type: "workspace" },
        url: "https://notion.so/page-1",
        archived: false,
        created_time: "2023-01-01T00:00:00.000Z",
        last_edited_time: "2023-01-01T00:00:00.000Z",
        created_by: { id: "user-1" },
        last_edited_by: { id: "user-1" }
      };

      mockClient.pages.retrieve.mockResolvedValue(mockPage);

      const result = await notionClient.getPage("page-1");
      expect(result.title).toBe("");
    });
  });
});
