/**
 * Notion Client Tests
 *
 * Tests API integration and error handling
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotionConfig } from "../../shared/types";
import { NotionClient } from "./client";
import { NotionBlock, NotionDatabase, NotionObjectType, NotionQueryResult } from "./types";

// Mock the @notionhq/client
vi.mock("@notionhq/client", () => ({
  Client: vi.fn().mockImplementation(() => ({
    pages: {
      retrieve: vi.fn(),
      properties: {
        retrieve: vi.fn()
      }
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
    search: vi.fn(),
    comments: {
      list: vi.fn()
    }
  }))
}));

describe("NotionClient", () => {
  let notionClient: NotionClient;
  let mockClient: any;

  beforeEach(() => {
    const config: NotionConfig = {
      apiKey: "test-key",
      apiVersion: "2022-06-28",
      baseUrl: "https://api.notion.com",
      timeout: 30000,
      retryAttempts: 3
    };

    notionClient = new NotionClient(config);
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
      expect(result.archived).toBe(false);
      expect(mockClient.pages.retrieve).toHaveBeenCalledWith({ page_id: "page-1" });
    });

    it("should handle page retrieval errors", async () => {
      const error = new Error("Page not found");
      (error as any).code = "object_not_found";

      mockClient.pages.retrieve.mockRejectedValue(error);

      await expect(notionClient.getPage("page-1")).rejects.toThrow("Object not found.");
    });

    it("should get page properties", async () => {
      const mockPage = {
        id: "page-1",
        object: "page",
        properties: {
          title: {
            id: "title",
            type: "title",
            title: [{ plain_text: "Test Page" }]
          },
          status: {
            id: "status",
            type: "select",
            select: { name: "In Progress" }
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

      const result = await notionClient.getPageProperties("page-1");

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("title");
      expect(result[0].type).toBe("title");
      expect(result[1].name).toBe("status");
      expect(result[1].type).toBe("select");
    });
  });

  describe("database operations", () => {
    it("should fetch database successfully", async () => {
      const mockDatabase = {
        id: "db-1",
        object: "database",
        title: [{ plain_text: "Test Database" }],
        description: [{ plain_text: "Test Description" }],
        properties: {
          title: {
            id: "title",
            type: "title"
          }
        },
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
      expect(result.archived).toBe(false);
    });

    it("should query database successfully", async () => {
      const mockQueryResult: NotionQueryResult<NotionDatabase> = {
        results: [
          {
            id: "page-1",
            properties: {
              title: {
                id: "title",
                type: "title",
                name: "Title",
                config: {}
              }
            },
            parent: { type: "database_id", database_id: "db-1" },
            url: "https://notion.so/page-1",
            archived: false,
            createdTime: "2023-01-01T00:00:00.000Z",
            lastEditedTime: "2023-01-01T00:00:00.000Z",
            createdBy: { id: "user-1", type: "person" },
            lastEditedBy: { id: "user-1", type: "person" },
            type: NotionObjectType.DATABASE,
            title: "Test Database",
            description: "Test Description"
          }
        ],
        hasMore: false,
        nextCursor: null
      };

      mockClient.databases.query.mockResolvedValue(mockQueryResult);

      const result = await notionClient.queryDatabase("db-1");

      expect(result.results).toHaveLength(1);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeUndefined();
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

      const result = await notionClient.queryDatabase("db-1", { start_cursor: "cursor-123" });

      expect(result.results).toHaveLength(1);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBe("cursor-123");
    });

    it("should get databases", async () => {
      const mockSearchResult = {
        results: [
          {
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
          }
        ]
      };

      mockClient.search.mockResolvedValue(mockSearchResult);

      const result = await notionClient.getDatabases();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("db-1");
      expect(result[0].title).toBe("Test Database");
    });

    it("should get database properties", async () => {
      const mockDatabase = {
        id: "db-1",
        object: "database",
        title: [{ plain_text: "Test Database" }],
        description: [{ plain_text: "Test Description" }],
        properties: {
          title: {
            id: "title",
            type: "title"
          },
          status: {
            id: "status",
            type: "select"
          }
        },
        parent: { type: "workspace" },
        url: "https://notion.so/db-1",
        archived: false,
        created_time: "2023-01-01T00:00:00.000Z",
        last_edited_time: "2023-01-01T00:00:00.000Z",
        created_by: { id: "user-1", type: "person" },
        last_edited_by: { id: "user-1", type: "person" }
      };

      mockClient.databases.retrieve.mockResolvedValue(mockDatabase);

      const result = await notionClient.getDatabaseProperties("db-1");

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("title");
      expect(result[0].type).toBe("title");
      expect(result[1].name).toBe("status");
      expect(result[1].type).toBe("select");
    });
  });

  describe("block operations", () => {
    it("should fetch blocks successfully", async () => {
      const mockBlocksResult: NotionQueryResult<NotionBlock> = {
        results: [
          {
            id: "block-1",
            type: NotionObjectType.BLOCK,
            content: {
              paragraph: {
                richText: [{ plainText: "Test content" }]
              }
            },
            hasChildren: false,
            archived: false,
            parent: { type: "page_id", page_id: "page-1" },
            url: "https://notion.so/block-1",
            createdTime: "2023-01-01T00:00:00.000Z",
            lastEditedTime: "2023-01-01T00:00:00.000Z",
            createdBy: { id: "user-1", type: "person" },
            lastEditedBy: { id: "user-1", type: "person" },
            blockType: "paragraph"
          } as NotionBlock
        ],
        hasMore: false,
        nextCursor: null
      };

      mockClient.blocks.children.list.mockResolvedValue(mockBlocksResult);

      const result = await notionClient.getBlocks("page-1");

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("block-1");
      expect(result[0].blockType).toBe("paragraph");
      expect(result[0].hasChildren).toBe(false);
    });

    it("should get block children", async () => {
      const mockBlocksResult = {
        results: [
          {
            id: "block-1",
            object: "block",
            type: "paragraph",
            has_children: false,
            archived: false,
            paragraph: {
              rich_text: [{ plain_text: "Test content" }]
            },
            created_time: "2023-01-01T00:00:00.000Z",
            last_edited_time: "2023-01-01T00:00:00.000Z",
            created_by: { id: "user-1", type: "person" },
            last_edited_by: { id: "user-1", type: "person" }
          }
        ]
      };

      mockClient.blocks.children.list.mockResolvedValue(mockBlocksResult);

      const result = await notionClient.getBlockChildren("page-1");

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("block-1");
      expect(result[0].blockType).toBe("paragraph");
    });
  });

  describe("user operations", () => {
    it("should fetch users successfully", async () => {
      const mockUsersResult = {
        results: [
          {
            id: "user-1",
            type: "person",
            name: "John Doe",
            avatar_url: "https://example.com/avatar.jpg",
            email: "john@example.com"
          }
        ]
      };

      mockClient.users.list.mockResolvedValue(mockUsersResult);

      const result = await notionClient.getUsers();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("user-1");
      expect(result[0].name).toBe("John Doe");
      expect(result[0].email).toBe("john@example.com");
    });

    it("should get workspace information", async () => {
      const mockUserResult = {
        id: "user-1",
        name: "John Doe",
        type: "person"
      };

      mockClient.users.me.mockResolvedValue(mockUserResult);

      const result = await notionClient.getWorkspace();

      expect(result.id).toBe("personal");
      expect(result.name).toBe("John Doe");
      expect(result.owner).toBe("user-1");
      expect(result.createdTime).toBeDefined();
    });
  });

  describe("search operations", () => {
    it("should search successfully", async () => {
      const mockSearchResult = {
        results: [
          {
            id: "page-1",
            object: "page",
            properties: {},
            parent: { type: "workspace" },
            url: "https://notion.so/page-1",
            archived: false,
            created_time: "2023-01-01T00:00:00.000Z",
            last_edited_time: "2023-01-01T00:00:00.000Z",
            created_by: { id: "user-1", type: "person" },
            last_edited_by: { id: "user-1", type: "person" }
          }
        ]
      };

      mockClient.search.mockResolvedValue(mockSearchResult);

      const result = await notionClient.search("test query");

      expect(result.results).toHaveLength(1);
      expect(result.results[0].id).toBe("page-1");
      expect(mockClient.search).toHaveBeenCalledWith({
        query: "test query"
      });
    });
  });

  describe("comment operations", () => {
    it("should get comments successfully", async () => {
      const mockCommentsResult = {
        results: [
          {
            id: "comment-1",
            object: "comment",
            parent: { type: "page_id", page_id: "page-1" },
            rich_text: [{ plain_text: "Test comment" }],
            created_time: "2023-01-01T00:00:00.000Z",
            last_edited_time: "2023-01-01T00:00:00.000Z",
            created_by: { id: "user-1", type: "person" },
            last_edited_by: { id: "user-1", type: "person" }
          }
        ]
      };

      mockClient.comments.list.mockResolvedValue(mockCommentsResult);

      const result = await notionClient.getComments("page-1");

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("comment-1");
      expect(result[0].type).toBe("comment");
    });
  });

  describe("property operations", () => {
    it("should get property item successfully", async () => {
      const mockPropertyResult = {
        id: "property-1",
        type: "title",
        title: {
          type: "text",
          text: { content: "Test Title" },
          plain_text: "Test Title"
        },
        object: "property_item"
      };

      mockClient.pages.properties.retrieve.mockResolvedValue(mockPropertyResult);

      const result = await notionClient.getPropertyItem("page-1", "property-1");

      expect(result.id).toBe("property-1");
      expect(result.type).toBe("title");
      expect(result.object).toBe("property_item");
    });
  });

  describe("error handling", () => {
    it("should handle rate limit errors", async () => {
      const error = new Error("Rate limit exceeded");
      (error as any).code = "rate_limited";
      (error as any).status = 429;
      (error as any).headers = { "retry-after": "60" };

      mockClient.pages.retrieve.mockRejectedValue(error);

      await expect(notionClient.getPage("page-1")).rejects.toThrow("Rate limit exceeded. Retry after 60 seconds.");
    });

    it("should handle unauthorized errors", async () => {
      const error = new Error("Unauthorized");
      (error as any).code = "unauthorized";
      (error as any).status = 401;

      mockClient.pages.retrieve.mockRejectedValue(error);

      await expect(notionClient.getPage("page-1")).rejects.toThrow("Invalid API key or insufficient permissions.");
    });

    it("should handle object not found errors", async () => {
      const error = new Error("Object not found");
      (error as any).code = "object_not_found";
      (error as any).status = 404;

      mockClient.pages.retrieve.mockRejectedValue(error);

      await expect(notionClient.getPage("page-1")).rejects.toThrow("Object not found.");
    });

    it("should handle validation errors", async () => {
      const error = new Error("Validation error");
      (error as any).code = "validation_error";
      (error as any).status = 400;

      mockClient.pages.retrieve.mockRejectedValue(error);

      await expect(notionClient.getPage("page-1")).rejects.toThrow("Invalid request parameters.");
    });

    it("should handle conflict errors", async () => {
      const error = new Error("Conflict error");
      (error as any).code = "conflict_error";
      (error as any).status = 409;

      mockClient.pages.retrieve.mockRejectedValue(error);

      await expect(notionClient.getPage("page-1")).rejects.toThrow("Conflict with current state.");
    });

    it("should handle internal server errors", async () => {
      const error = new Error("Internal server error");
      (error as any).code = "internal_server_error";
      (error as any).status = 500;

      mockClient.pages.retrieve.mockRejectedValue(error);

      await expect(notionClient.getPage("page-1")).rejects.toThrow("Notion internal server error.");
    });

    it("should handle service unavailable errors", async () => {
      const error = new Error("Service unavailable");
      (error as any).code = "service_unavailable";
      (error as any).status = 503;

      mockClient.pages.retrieve.mockRejectedValue(error);

      await expect(notionClient.getPage("page-1")).rejects.toThrow("Notion service unavailable.");
    });

    it("should handle network errors", async () => {
      const error = new Error("Network error");
      (error as any).code = "ECONNRESET";

      mockClient.pages.retrieve.mockRejectedValue(error);

      await expect(notionClient.getPage("page-1")).rejects.toThrow();
    });

    it("should handle timeout errors", async () => {
      const error = new Error("Timeout error");
      (error as any).code = "ETIMEDOUT";

      mockClient.pages.retrieve.mockRejectedValue(error);

      await expect(notionClient.getPage("page-1")).rejects.toThrow();
    });

    it("should handle unknown errors", async () => {
      const error = new Error("Unknown error");
      (error as any).code = "UNKNOWN_ERROR";

      mockClient.pages.retrieve.mockRejectedValue(error);

      await expect(notionClient.getPage("page-1")).rejects.toThrow();
    });
  });

  describe("title extraction", () => {
    it("should extract title from properties.title.title", async () => {
      const mockPage = {
        id: "page-1",
        object: "page",
        properties: {
          title: {
            title: [{ plain_text: "Test Title" }]
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
      expect(result.title).toBe("Test Title");
    });

    it("should extract title from title property", async () => {
      const mockDatabase: NotionDatabase = {
        id: "db-1",
        type: NotionObjectType.DATABASE,
        title: "Test Database",
        description: "",
        properties: {},
        parent: { type: "workspace" },
        url: "https://notion.so/db-1" as any,
        archived: false,
        createdTime: "2023-01-01T00:00:00.000Z",
        lastEditedTime: "2023-01-01T00:00:00.000Z",
        createdBy: { id: "user-1", type: "person" },
        lastEditedBy: { id: "user-1", type: "person" }
      };

      mockClient.databases.retrieve.mockResolvedValue(mockDatabase);

      const result = await notionClient.getDatabase("db-1");
      expect(result.title).toBe("Test Database");
    });

    it("should return 'Untitled' for missing title", async () => {
      const mockPage = {
        id: "page-1",
        object: "page",
        properties: {},
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
      expect(result.title).toBe("Untitled");
    });
  });

  describe("rate limit handling", () => {
    it("should update rate limit info on rate limit error", async () => {
      const error = new Error("Rate limit exceeded");
      (error as any).code = "rate_limited";
      (error as any).status = 429;
      (error as any).headers = { "retry-after": "60" };

      mockClient.pages.retrieve.mockRejectedValue(error);

      await expect(notionClient.getPage("page-1")).rejects.toThrow();

      const rateLimitInfo = notionClient.getRateLimitInfo();
      expect(rateLimitInfo).not.toBeNull();
      expect(rateLimitInfo?.remaining).toBe(0);
      expect(rateLimitInfo?.retryAfter).toBe(60);
    });

    it("should clear rate limit info after reset time", async () => {
      const error = new Error("Rate limit exceeded");
      (error as any).code = "rate_limited";
      (error as any).status = 429;
      (error as any).headers = { "retry-after": "1" };

      mockClient.pages.retrieve.mockRejectedValue(error);

      await expect(notionClient.getPage("page-1")).rejects.toThrow();

      // Wait for reset time to pass
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const mockPage = {
        id: "page-1",
        object: "page",
        properties: {},
        parent: { type: "workspace" },
        url: "https://notion.so/page-1",
        archived: false,
        created_time: "2023-01-01T00:00:00.000Z",
        last_edited_time: "2023-01-01T00:00:00.000Z",
        created_by: { id: "user-1", type: "person" },
        last_edited_by: { id: "user-1", type: "person" }
      };

      mockClient.pages.retrieve.mockResolvedValue(mockPage);

      await notionClient.getPage("page-1");

      const rateLimitInfo = notionClient.getRateLimitInfo();
      expect(rateLimitInfo).toBeNull();
    });
  });
});
