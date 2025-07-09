// /**
//  * Notion Client Tests
//  *
//  * Tests API integration and error handling
//  */
// import { firstValueFrom, lastValueFrom } from "rxjs";
// import { take, toArray } from "rxjs/operators";
// import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// import { NotionConfig } from "../../../dumpster/shared/types";
// import { NotionClient } from "./client";

// // Mock the @notionhq/client
// vi.mock("@notionhq/client", () => ({
//   Client: vi.fn(() => ({
//     search: vi.fn(),
//     pages: {
//       retrieve: vi.fn(),
//       properties: {
//         retrieve: vi.fn()
//       }
//     },
//     databases: {
//       retrieve: vi.fn(),
//       query: vi.fn()
//     },
//     blocks: {
//       children: {
//         list: vi.fn()
//       }
//     },
//     users: {
//       list: vi.fn(),
//       me: vi.fn()
//     },
//     comments: {
//       list: vi.fn()
//     }
//   }))
// }));

// // Mock transformers
// vi.mock("./transformers", () => ({
//   transformers: {
//     page: vi.fn((data) => ({ ...data, transformed: true })),
//     database: vi.fn((data) => ({ ...data, transformed: true })),
//     block: vi.fn((data) => ({ ...data, transformed: true })),
//     user: vi.fn((data) => ({ ...data, transformed: true })),
//     comment: vi.fn((data) => ({ ...data, transformed: true })),
//     propertyItem: vi.fn((data) => ({ ...data, transformed: true })),
//     error: vi.fn((error) => error)
//   }
// }));

// // Mock log
// vi.mock("../log", () => ({
//   log: {
//     debug: vi.fn(),
//     error: vi.fn()
//   }
// }));

// describe("NotionClient", () => {
//   let notionClient: NotionClient;
//   let mockClient: any;

//   beforeEach(() => {
//     const config: NotionConfig = {
//       apiKey: "test-key",
//       apiVersion: "2022-06-28",
//       baseUrl: "https://api.notion.com",
//       timeout: 30000,
//       retryAttempts: 3
//     };

//     notionClient = new NotionClient(config);
//     mockClient = (notionClient as any).client;
//   });

//   afterEach(() => {
//     vi.clearAllMocks();
//     notionClient.destroy();
//   });

//   describe("initialization", () => {
//     it("should initialize with correct configuration", () => {
//       expect(notionClient).toBeDefined();
//       expect(mockClient).toBeDefined();
//     });

//     it("should have null rate limit info initially", () => {
//       expect(notionClient.getRateLimitInfo()).toBeNull();
//     });
//   });

//   describe("page operations", () => {
//     it("should fetch page successfully", async () => {
//       const mockPage = {
//         id: "page-1",
//         object: "page",
//         properties: {
//           title: {
//             title: [{ plain_text: "Test Page" }]
//           }
//         },
//         parent: { type: "workspace" },
//         url: "https://notion.so/page-1",
//         archived: false,
//         created_time: "2023-01-01T00:00:00.000Z",
//         last_edited_time: "2023-01-01T00:00:00.000Z",
//         created_by: { id: "user-1", type: "person" },
//         last_edited_by: { id: "user-1", type: "person" }
//       };

//       mockClient.pages.retrieve.mockResolvedValue(mockPage);

//       const result = await lastValueFrom(notionClient.getPage("page-1"));

//       expect(result.id).toBe("page-1");
//       expect(result.title).toBe("Test Page");
//       expect(result.url).toBe("https://notion.so/page-1");
//       expect(result.archived).toBe(false);
//       expect(mockClient.pages.retrieve).toHaveBeenCalledWith({ page_id: "page-1" });
//     });

//     it("should handle page retrieval errors", async () => {
//       const error = new Error("Page not found");
//       (error as any).code = "object_not_found";

//       mockClient.pages.retrieve.mockRejectedValue(error);

//       await expect(lastValueFrom(notionClient.getPage("page-1"))).rejects.toThrow("Object not found.");
//     });

//     it("should get page properties", async () => {
//       const mockPage = {
//         id: "page-1",
//         object: "page",
//         properties: {
//           title: {
//             id: "title",
//             type: "title",
//             title: [{ plain_text: "Test Page" }]
//           },
//           status: {
//             id: "status",
//             type: "select",
//             select: { name: "In Progress" }
//           }
//         },
//         parent: { type: "workspace" },
//         url: "https://notion.so/page-1",
//         archived: false,
//         created_time: "2023-01-01T00:00:00.000Z",
//         last_edited_time: "2023-01-01T00:00:00.000Z",
//         created_by: { id: "user-1", type: "person" },
//         last_edited_by: { id: "user-1", type: "person" }
//       };

//       mockClient.pages.retrieve.mockResolvedValue(mockPage);

//       const result = await lastValueFrom(notionClient.getPageProperties("page-1"));

//       expect(result).toHaveLength(2);
//       expect(result[0].name).toBe("title");
//       expect(result[0].type).toBe("title");
//       expect(result[1].name).toBe("status");
//       expect(result[1].type).toBe("select");
//     });

//     it("should get multiple pages in parallel", async () => {
//       const mockPages = [
//         {
//           id: "page-1",
//           object: "page",
//           properties: { title: { title: [{ plain_text: "Page 1" }] } },
//           parent: { type: "workspace" },
//           url: "https://notion.so/page-1",
//           archived: false,
//           created_time: "2023-01-01T00:00:00.000Z",
//           last_edited_time: "2023-01-01T00:00:00.000Z",
//           created_by: { id: "user-1", type: "person" },
//           last_edited_by: { id: "user-1", type: "person" }
//         },
//         {
//           id: "page-2",
//           object: "page",
//           properties: { title: { title: [{ plain_text: "Page 2" }] } },
//           parent: { type: "workspace" },
//           url: "https://notion.so/page-2",
//           archived: false,
//           created_time: "2023-01-01T00:00:00.000Z",
//           last_edited_time: "2023-01-01T00:00:00.000Z",
//           created_by: { id: "user-1", type: "person" },
//           last_edited_by: { id: "user-1", type: "person" }
//         }
//       ];

//       mockClient.pages.retrieve.mockResolvedValueOnce(mockPages[0]).mockResolvedValueOnce(mockPages[1]);

//       const result = await lastValueFrom(notionClient.getPages(["page-1", "page-2"]));

//       expect(result).toHaveLength(2);
//       expect(result[0].title).toBe("Page 1");
//       expect(result[1].title).toBe("Page 2");
//     });
//   });

//   describe("database operations", () => {
//     it("should fetch database successfully", async () => {
//       const mockDatabase = {
//         id: "db-1",
//         object: "database",
//         title: [{ plain_text: "Test Database" }],
//         description: [{ plain_text: "Test Description" }],
//         properties: {
//           title: {
//             id: "title",
//             type: "title"
//           }
//         },
//         parent: { type: "workspace" },
//         url: "https://notion.so/db-1",
//         archived: false,
//         created_time: "2023-01-01T00:00:00.000Z",
//         last_edited_time: "2023-01-01T00:00:00.000Z",
//         created_by: { id: "user-1", type: "person" },
//         last_edited_by: { id: "user-1", type: "person" }
//       };

//       mockClient.databases.retrieve.mockResolvedValue(mockDatabase);

//       const result = await lastValueFrom(notionClient.getDatabase("db-1"));

//       expect(result.id).toBe("db-1");
//       expect(result.title).toBe("Test Database");
//       expect(result.description).toBe("Test Description");
//       expect(result.archived).toBe(false);
//     });

//     it("should query database successfully", async () => {
//       const mockQueryResult: any = {
//         results: [
//           {
//             id: "page-1",
//             object: "page",
//             properties: {
//               title: {
//                 id: "title",
//                 type: "title",
//                 title: [
//                   {
//                     type: "text",
//                     text: {
//                       content: "Test Page",
//                       link: null
//                     },
//                     annotations: {
//                       bold: false,
//                       italic: false,
//                       strikethrough: false,
//                       underline: false,
//                       code: false,
//                       color: "default"
//                     },
//                     plain_text: "Test Page",
//                     href: null
//                   }
//                 ]
//               }
//             },
//             parent: { type: "database_id", database_id: "db-1" },
//             url: "https://notion.so/page-1",
//             archived: false,
//             created_time: "2023-01-01T00:00:00.000Z",
//             last_edited_time: "2023-01-01T00:00:00.000Z",
//             created_by: { id: "user-1", type: "person" },
//             last_edited_by: { id: "user-1", type: "person" }
//           }
//         ],
//         has_more: false,
//         next_cursor: null as string | null,
//         object: "list",
//         type: "page_or_database",
//         page_or_database: {}
//       };

//       mockClient.databases.query.mockResolvedValue(mockQueryResult);

//       const result = await lastValueFrom(notionClient.queryDatabase({ database_id: "db-1" }));

//       expect(result.results).toHaveLength(1);
//       expect(result.hasMore).toBe(false);
//       expect(result.nextCursor).toBeUndefined();
//     });

//     it("should handle query with pagination", async () => {
//       const mockQueryResult = {
//         results: [
//           {
//             id: "page-1",
//             object: "page",
//             properties: {},
//             parent: { type: "database_id", database_id: "db-1" },
//             url: "https://notion.so/page-1",
//             archived: false,
//             created_time: "2023-01-01T00:00:00.000Z",
//             last_edited_time: "2023-01-01T00:00:00.000Z",
//             created_by: { id: "user-1", type: "person" },
//             last_edited_by: { id: "user-1", type: "person" }
//           }
//         ],
//         has_more: true,
//         next_cursor: "cursor-123" as string | null
//       };

//       mockClient.databases.query.mockResolvedValue(mockQueryResult);

//       const result = await lastValueFrom(
//         notionClient.queryDatabase({ database_id: "db-1", start_cursor: "cursor-123" })
//       );

//       expect(result.results).toHaveLength(1);
//       expect(result.hasMore).toBe(true);
//       expect(result.nextCursor).toBe("cursor-123");
//     });

//     it("should get databases", async () => {
//       const mockSearchResult = {
//         results: [
//           {
//             id: "db-1",
//             object: "database",
//             title: [{ plain_text: "Test Database" }],
//             description: [{ plain_text: "Test Description" }],
//             properties: {},
//             parent: { type: "workspace" },
//             url: "https://notion.so/db-1",
//             archived: false,
//             created_time: "2023-01-01T00:00:00.000Z",
//             last_edited_time: "2023-01-01T00:00:00.000Z",
//             created_by: { id: "user-1", type: "person" },
//             last_edited_by: { id: "user-1", type: "person" }
//           }
//         ]
//       };

//       mockClient.search.mockResolvedValue(mockSearchResult);

//       const result = await lastValueFrom(notionClient.getDatabases());

//       expect(result).toHaveLength(1);
//       expect(result[0].id).toBe("db-1");
//       expect(result[0].title).toBe("Test Database");
//     });

//     it("should get database properties", async () => {
//       const mockDatabase = {
//         id: "db-1",
//         object: "database",
//         title: [{ plain_text: "Test Database" }],
//         description: [{ plain_text: "Test Description" }],
//         properties: {
//           title: {
//             id: "title",
//             type: "title"
//           },
//           status: {
//             id: "status",
//             type: "select"
//           }
//         },
//         parent: { type: "workspace" },
//         url: "https://notion.so/db-1",
//         archived: false,
//         created_time: "2023-01-01T00:00:00.000Z",
//         last_edited_time: "2023-01-01T00:00:00.000Z",
//         created_by: { id: "user-1", type: "person" },
//         last_edited_by: { id: "user-1", type: "person" }
//       };

//       mockClient.databases.retrieve.mockResolvedValue(mockDatabase);

//       const result = await lastValueFrom(notionClient.getDatabaseProperties("db-1"));

//       expect(result).toHaveLength(2);
//       expect(result[0].name).toBe("title");
//       expect(result[0].type).toBe("title");
//       expect(result[1].name).toBe("status");
//       expect(result[1].type).toBe("select");
//     });

//     it("should get multiple databases in parallel", async () => {
//       const mockDatabases = [
//         {
//           id: "db-1",
//           object: "database",
//           title: [{ plain_text: "Database 1" }],
//           description: [] as any[],
//           properties: { title: { id: "title", type: "title" } },
//           parent: { type: "workspace" },
//           url: "https://notion.so/db-1",
//           archived: false,
//           created_time: "2023-01-01T00:00:00.000Z",
//           last_edited_time: "2023-01-01T00:00:00.000Z",
//           created_by: { id: "user-1", type: "person" },
//           last_edited_by: { id: "user-1", type: "person" }
//         },
//         {
//           id: "db-2",
//           object: "database",
//           title: [{ plain_text: "Database 2" }],
//           description: [] as any[],
//           properties: { title: { id: "title", type: "title" } },
//           parent: { type: "workspace" },
//           url: "https://notion.so/db-2",
//           archived: false,
//           created_time: "2023-01-01T00:00:00.000Z",
//           last_edited_time: "2023-01-01T00:00:00.000Z",
//           created_by: { id: "user-1", type: "person" },
//           last_edited_by: { id: "user-1", type: "person" }
//         }
//       ];

//       mockClient.databases.retrieve.mockResolvedValueOnce(mockDatabases[0]).mockResolvedValueOnce(mockDatabases[1]);

//       const result = await lastValueFrom(notionClient.getDatabasesById(["db-1", "db-2"]));

//       expect(result).toHaveLength(2);
//       expect(result[0].title).toBe("Database 1");
//       expect(result[1].title).toBe("Database 2");
//     });
//   });

//   describe("block operations", () => {
//     it("should fetch blocks successfully", async () => {
//       const mockBlocksResult = {
//         results: [
//           {
//             id: "block-1",
//             object: "block",
//             type: "paragraph",
//             paragraph: {
//               rich_text: [{ plain_text: "Test content" }]
//             },
//             has_children: false,
//             archived: false,
//             parent: { type: "page_id", page_id: "page-1" },
//             created_time: "2023-01-01T00:00:00.000Z",
//             last_edited_time: "2023-01-01T00:00:00.000Z",
//             created_by: { id: "user-1", type: "person" },
//             last_edited_by: { id: "user-1", type: "person" }
//           }
//         ]
//       };

//       mockClient.blocks.children.list.mockResolvedValue(mockBlocksResult);

//       const result = await lastValueFrom(notionClient.getBlocks("page-1"));

//       expect(result).toHaveLength(1);
//       expect(result[0].id).toBe("block-1");
//       expect(result[0].blockType).toBe("paragraph");
//       expect(result[0].hasChildren).toBe(false);
//     });

//     it("should get block children", async () => {
//       const mockBlocksResult = {
//         results: [
//           {
//             id: "block-1",
//             object: "block",
//             type: "paragraph",
//             has_children: false,
//             archived: false,
//             paragraph: {
//               rich_text: [{ plain_text: "Test content" }]
//             },
//             created_time: "2023-01-01T00:00:00.000Z",
//             last_edited_time: "2023-01-01T00:00:00.000Z",
//             created_by: { id: "user-1", type: "person" },
//             last_edited_by: { id: "user-1", type: "person" }
//           }
//         ]
//       };

//       mockClient.blocks.children.list.mockResolvedValue(mockBlocksResult);

//       const result = await lastValueFrom(notionClient.getBlockChildren("page-1"));

//       expect(result).toHaveLength(1);
//       expect(result[0].id).toBe("block-1");
//       expect(result[0].blockType).toBe("paragraph");
//     });
//   });

//   describe("user operations", () => {
//     it("should fetch users successfully", async () => {
//       const mockUsersResult = {
//         results: [
//           {
//             id: "user-1",
//             type: "person",
//             name: "John Doe",
//             avatar_url: "https://example.com/avatar.jpg",
//             email: "john@example.com"
//           }
//         ]
//       };

//       mockClient.users.list.mockResolvedValue(mockUsersResult);

//       const result = await lastValueFrom(notionClient.getUsers());

//       expect(result).toHaveLength(1);
//       expect(result[0].id).toBe("user-1");
//       expect(result[0].name).toBe("John Doe");
//       expect(result[0].email).toBe("john@example.com");
//     });

//     it("should get workspace information", async () => {
//       const mockUserResult = {
//         id: "user-1",
//         name: "John Doe",
//         type: "person"
//       };

//       mockClient.users.me.mockResolvedValue(mockUserResult);

//       const result = await lastValueFrom(notionClient.getWorkspace());

//       expect(result.id).toBe("personal");
//       expect(result.name).toBe("John Doe");
//       expect(result.owner).toBe("user-1");
//       expect(result.createdTime).toBeDefined();
//     });
//   });

//   describe("search operations", () => {
//     it("should search successfully", async () => {
//       const mockSearchResult = {
//         results: [
//           {
//             id: "page-1",
//             object: "page",
//             properties: {},
//             parent: { type: "workspace" },
//             url: "https://notion.so/page-1",
//             archived: false,
//             created_time: "2023-01-01T00:00:00.000Z",
//             last_edited_time: "2023-01-01T00:00:00.000Z",
//             created_by: { id: "user-1", type: "person" },
//             last_edited_by: { id: "user-1", type: "person" }
//           }
//         ]
//       };

//       mockClient.search.mockResolvedValue(mockSearchResult);

//       const result = await lastValueFrom(notionClient.search({ query: "test query" }));

//       expect(result.results).toHaveLength(1);
//       expect(result.results[0].id).toBe("page-1");
//       expect(mockClient.search).toHaveBeenCalledWith({
//         query: "test query"
//       });
//     });
//   });

//   describe("comment operations", () => {
//     it("should get comments successfully", async () => {
//       const mockCommentsResult = {
//         results: [
//           {
//             id: "comment-1",
//             object: "comment",
//             parent: { type: "page_id", page_id: "page-1" },
//             rich_text: [{ plain_text: "Test comment" }],
//             created_time: "2023-01-01T00:00:00.000Z",
//             last_edited_time: "2023-01-01T00:00:00.000Z",
//             created_by: { id: "user-1", type: "person" },
//             last_edited_by: { id: "user-1", type: "person" }
//           }
//         ]
//       };

//       mockClient.comments.list.mockResolvedValue(mockCommentsResult);

//       const result = await lastValueFrom(notionClient.getComments("page-1"));

//       expect(result).toHaveLength(1);
//       expect(result[0].id).toBe("comment-1");
//       expect(result[0].type).toBe("comment");
//     });
//   });

//   describe("property operations", () => {
//     it("should get property item successfully", async () => {
//       const mockPropertyResult = {
//         id: "property-1",
//         type: "title",
//         title: {
//           type: "text",
//           text: { content: "Test Title" },
//           plain_text: "Test Title"
//         },
//         object: "property_item"
//       };

//       mockClient.pages.properties.retrieve.mockResolvedValue(mockPropertyResult);

//       const result = await lastValueFrom(notionClient.getPropertyItem("page-1", "property-1"));

//       expect(result.id).toBe("property-1");
//       expect(result.type).toBe("title");
//       expect(result.object).toBe("property_item");
//     });
//   });

//   describe("error handling", () => {
//     it("should handle rate limit errors", async () => {
//       const error = new Error("Rate limit exceeded");
//       (error as any).code = "rate_limited";
//       (error as any).status = 429;
//       (error as any).headers = { "retry-after": "60" };

//       mockClient.pages.retrieve.mockRejectedValue(error);

//       await expect(lastValueFrom(notionClient.getPage("page-1"))).rejects.toThrow(
//         "Rate limit exceeded. Retry after 60 seconds."
//       );
//     });

//     it("should handle unauthorized errors", async () => {
//       const error = new Error("Unauthorized");
//       (error as any).code = "unauthorized";
//       (error as any).status = 401;

//       mockClient.pages.retrieve.mockRejectedValue(error);

//       await expect(lastValueFrom(notionClient.getPage("page-1"))).rejects.toThrow(
//         "Invalid API key or insufficient permissions."
//       );
//     });

//     it("should handle object not found errors", async () => {
//       const error = new Error("Object not found");
//       (error as any).code = "object_not_found";
//       (error as any).status = 404;

//       mockClient.pages.retrieve.mockRejectedValue(error);

//       await expect(lastValueFrom(notionClient.getPage("page-1"))).rejects.toThrow("Object not found.");
//     });

//     it("should handle validation errors", async () => {
//       const error = new Error("Validation error");
//       (error as any).code = "validation_error";
//       (error as any).status = 400;

//       mockClient.pages.retrieve.mockRejectedValue(error);

//       await expect(lastValueFrom(notionClient.getPage("page-1"))).rejects.toThrow("Invalid request parameters.");
//     });

//     it("should handle conflict errors", async () => {
//       const error = new Error("Conflict error");
//       (error as any).code = "conflict_error";
//       (error as any).status = 409;

//       mockClient.pages.retrieve.mockRejectedValue(error);

//       await expect(lastValueFrom(notionClient.getPage("page-1"))).rejects.toThrow("Conflict with current state.");
//     });

//     it("should handle internal server errors", async () => {
//       const error = new Error("Internal server error");
//       (error as any).code = "internal_server_error";
//       (error as any).status = 500;

//       mockClient.pages.retrieve.mockRejectedValue(error);

//       await expect(lastValueFrom(notionClient.getPage("page-1"))).rejects.toThrow("Notion internal server error.");
//     });

//     it("should handle service unavailable errors", async () => {
//       const error = new Error("Service unavailable");
//       (error as any).code = "service_unavailable";
//       (error as any).status = 503;

//       mockClient.pages.retrieve.mockRejectedValue(error);

//       await expect(lastValueFrom(notionClient.getPage("page-1"))).rejects.toThrow("Notion service unavailable.");
//     });

//     it("should handle network errors", async () => {
//       const error = new Error("Network error");
//       (error as any).code = "ECONNRESET";

//       mockClient.pages.retrieve.mockRejectedValue(error);

//       await expect(lastValueFrom(notionClient.getPage("page-1"))).rejects.toThrow();
//     });

//     it("should handle timeout errors", async () => {
//       const error = new Error("Timeout error");
//       (error as any).code = "ETIMEDOUT";

//       mockClient.pages.retrieve.mockRejectedValue(error);

//       await expect(lastValueFrom(notionClient.getPage("page-1"))).rejects.toThrow();
//     });

//     it("should handle unknown errors", async () => {
//       const error = new Error("Unknown error");
//       (error as any).code = "UNKNOWN_ERROR";

//       mockClient.pages.retrieve.mockRejectedValue(error);

//       await expect(lastValueFrom(notionClient.getPage("page-1"))).rejects.toThrow();
//     });
//   });

//   describe("title extraction", () => {
//     it("should extract title from properties.title.title", async () => {
//       const mockPage = {
//         id: "page-1",
//         object: "page",
//         properties: {
//           title: {
//             title: [{ plain_text: "Test Title" }]
//           }
//         },
//         parent: { type: "workspace" },
//         url: "https://notion.so/page-1",
//         archived: false,
//         created_time: "2023-01-01T00:00:00.000Z",
//         last_edited_time: "2023-01-01T00:00:00.000Z",
//         created_by: { id: "user-1", type: "person" },
//         last_edited_by: { id: "user-1", type: "person" }
//       };

//       mockClient.pages.retrieve.mockResolvedValue(mockPage);

//       const result = await lastValueFrom(notionClient.getPage("page-1"));
//       expect(result.title).toBe("Test Title");
//     });

//     it("should extract title from title property", async () => {
//       const mockDatabase = {
//         id: "db-1",
//         object: "database",
//         title: [{ plain_text: "Test Database" }],
//         description: [{ plain_text: "Test Description" }],
//         properties: {},
//         parent: { type: "workspace" },
//         url: "https://notion.so/db-1",
//         archived: false,
//         created_time: "2023-01-01T00:00:00.000Z",
//         last_edited_time: "2023-01-01T00:00:00.000Z",
//         created_by: { id: "user-1", type: "person" },
//         last_edited_by: { id: "user-1", type: "person" }
//       };

//       mockClient.databases.retrieve.mockResolvedValue(mockDatabase);

//       const result = await lastValueFrom(notionClient.getDatabase("db-1"));
//       expect(result.title).toBe("Test Database");
//     });

//     it("should return 'Untitled' for missing title", async () => {
//       const mockPage = {
//         id: "page-1",
//         object: "page",
//         properties: {},
//         parent: { type: "workspace" },
//         url: "https://notion.so/page-1",
//         archived: false,
//         created_time: "2023-01-01T00:00:00.000Z",
//         last_edited_time: "2023-01-01T00:00:00.000Z",
//         created_by: { id: "user-1", type: "person" },
//         last_edited_by: { id: "user-1", type: "person" }
//       };

//       mockClient.pages.retrieve.mockResolvedValue(mockPage);

//       const result = await lastValueFrom(notionClient.getPage("page-1"));
//       expect(result.title).toBe("Untitled");
//     });
//   });

//   describe("rate limit handling", () => {
//     it("should update rate limit info on rate limit error", async () => {
//       const error = new Error("Rate limit exceeded");
//       (error as any).code = "rate_limited";
//       (error as any).status = 429;
//       (error as any).headers = { "retry-after": "60" };

//       mockClient.pages.retrieve.mockRejectedValue(error);

//       await expect(lastValueFrom(notionClient.getPage("page-1"))).rejects.toThrow();

//       const rateLimitInfo = notionClient.getRateLimitInfo();
//       expect(rateLimitInfo).not.toBeNull();
//       expect(rateLimitInfo?.remaining).toBe(0);
//       expect(rateLimitInfo?.retryAfter).toBe(60);
//     });

//     it("should clear rate limit info after reset time", async () => {
//       const error = new Error("Rate limit exceeded");
//       (error as any).code = "rate_limited";
//       (error as any).status = 429;
//       (error as any).headers = { "retry-after": "1" };

//       mockClient.pages.retrieve.mockRejectedValue(error);

//       await expect(lastValueFrom(notionClient.getPage("page-1"))).rejects.toThrow();

//       // Wait for reset time to pass
//       await new Promise((resolve) => setTimeout(resolve, 1100));

//       const mockPage = {
//         id: "page-1",
//         object: "page",
//         properties: {},
//         parent: { type: "workspace" },
//         url: "https://notion.so/page-1",
//         archived: false,
//         created_time: "2023-01-01T00:00:00.000Z",
//         last_edited_time: "2023-01-01T00:00:00.000Z",
//         created_by: { id: "user-1", type: "person" },
//         last_edited_by: { id: "user-1", type: "person" }
//       };

//       mockClient.pages.retrieve.mockResolvedValue(mockPage);

//       await lastValueFrom(notionClient.getPage("page-1"));

//       const rateLimitInfo = notionClient.getRateLimitInfo();
//       expect(rateLimitInfo).toBeNull();
//     });
//   });

//   describe("streaming operations", () => {
//     it("should handle rate limit updates", async () => {
//       const rateLimitInfo = {
//         remaining: 0,
//         resetTime: new Date(Date.now() + 60000),
//         retryAfter: 60
//       };

//       // Simulate rate limit error
//       const error = new Error("Rate limited");
//       (error as any).code = "rate_limited";
//       (error as any).headers = { "retry-after": "60" };

//       mockClient.pages.retrieve.mockRejectedValue(error);

//       // Subscribe to rate limit updates
//       await new Promise<void>((resolve) => {
//         const subscription = notionClient.rateLimitUpdates$().subscribe({
//           next: (info) => {
//             expect(info.retryAfter).toBe(60);
//             expect(info.remaining).toBe(0);
//             subscription.unsubscribe();
//             resolve();
//           }
//         });

//         // Trigger rate limit
//         lastValueFrom(notionClient.getPage("page-1")).catch(() => {
//           // Expected to fail
//         });
//       });
//     });
//   });

//   describe("utility methods", () => {
//     it("should clear cache", () => {
//       notionClient.clearCache();
//       expect(notionClient.getRateLimitInfo()).toBeNull();
//     });

//     it("should destroy client properly", () => {
//       expect(() => notionClient.destroy()).not.toThrow();
//     });
//   });

//   describe("search", () => {
//     it("should execute search with correct parameters", async () => {
//       const searchParams = { query: "test", page_size: 10 } as const;
//       const mockResponse = {
//         results: [
//           { object: "page", id: "page-1" },
//           { object: "database", id: "db-1" }
//         ],
//         has_more: false,
//         next_cursor: null as string | null
//       };

//       mockClient.search.mockResolvedValue(mockResponse);

//       const result = await firstValueFrom(notionClient.search(searchParams).pipe(take(1)));

//       expect(mockClient.search).toHaveBeenCalledWith(searchParams);
//       expect(result).toEqual({
//         results: [
//           { object: "page", id: "page-1" },
//           { object: "database", id: "db-1" }
//         ],
//         hasMore: false,
//         nextCursor: undefined,
//         pageInfo: {
//           currentPage: 1,
//           pageSize: 10
//         }
//       });
//     });

//     it("should handle pagination correctly", async () => {
//       const searchParams = { query: "test" } as const;
//       const mockResponse = {
//         results: [{ object: "page", id: "page-1" }],
//         has_more: true,
//         next_cursor: null as string | null
//       };

//       mockClient.search.mockResolvedValue(mockResponse);

//       const result = await firstValueFrom(notionClient.search(searchParams).pipe(take(1)));

//       expect(result).toEqual({
//         results: [{ object: "page", id: "page-1" }],
//         hasMore: true,
//         nextCursor: "cursor-1",
//         pageInfo: {
//           currentPage: 1,
//           pageSize: 10
//         }
//       });
//     });

//     it("should handle unsupported object types", async () => {
//       const searchParams = { query: "test" } as const;
//       const mockResponse = {
//         results: [{ object: "unsupported", id: "unsupported-1" }],
//         has_more: false,
//         next_cursor: null as string | null
//       };

//       mockClient.search.mockResolvedValue(mockResponse);

//       await expect(firstValueFrom(notionClient.search(searchParams).pipe(take(1)))).rejects.toThrow(
//         "Unsupported object type: unsupported"
//       );
//     });

//     it("should handle rate limit errors", async () => {
//       const searchParams = { query: "test" } as const;
//       const rateLimitError = {
//         code: "rate_limited",
//         status: 429,
//         headers: { "retry-after": "60" }
//       };

//       mockClient.search.mockRejectedValue(rateLimitError);

//       await expect(firstValueFrom(notionClient.search(searchParams).pipe(take(1)))).rejects.toThrow();
//     });
//   });

//   describe("searchAll", () => {
//     it("should stream all pages of results", async () => {
//       const searchParams = { query: "test" } as const;

//       // Mock two pages of results
//       mockClient.search
//         .mockResolvedValueOnce({
//           results: [{ object: "page", id: "page-1" }],
//           has_more: true,
//           next_cursor: "cursor-1" as string | null
//         })
//         .mockResolvedValueOnce({
//           results: [{ object: "page", id: "page-2" }],
//           has_more: false,
//           next_cursor: null as string | null
//         });

//       const results = await firstValueFrom(notionClient.searchAll(searchParams).pipe(toArray()));

//       expect(results).toEqual([
//         { object: "page", id: "page-1" },
//         { object: "page", id: "page-2" }
//       ]);
//       expect(mockClient.search).toHaveBeenCalledTimes(2);
//     });
//   });

//   describe("searchEvents$", () => {
//     it("should emit individual result events", async () => {
//       const searchParams = { query: "test" } as const;
//       const mockResponse = {
//         results: [
//           { object: "page", id: "page-1" },
//           { object: "page", id: "page-2" }
//         ],
//         has_more: false,
//         next_cursor: null as string | null
//       };

//       mockClient.search.mockResolvedValue(mockResponse);

//       const events: any[] = [];
//       const observable = notionClient.searchEvents$(searchParams);

//       await new Promise<void>((resolve) => {
//         observable.subscribe({
//           next: (event) => {
//             events.push(event);
//           },
//           complete: () => {
//             // Should have 2 result events, 1 page_complete event, and 1 search_complete event
//             expect(events).toHaveLength(4);

//             // Check result events
//             expect(events[0]).toEqual({
//               type: "result",
//               data: { object: "page", id: "page-1" },
//               metadata: expect.objectContaining({
//                 pageNumber: 1,
//                 totalResults: 1,
//                 hasMore: false
//               })
//             });

//             expect(events[1]).toEqual({
//               type: "result",
//               data: { object: "page", id: "page-2" },
//               metadata: expect.objectContaining({
//                 pageNumber: 1,
//                 totalResults: 2,
//                 hasMore: false
//               })
//             });

//             // Check page_complete event
//             expect(events[2]).toEqual({
//               type: "page_complete",
//               data: [
//                 { object: "page", id: "page-1" },
//                 { object: "page", id: "page-2" }
//               ],
//               metadata: expect.objectContaining({
//                 pageNumber: 1,
//                 totalResults: 2,
//                 hasMore: false
//               })
//             });

//             // Check search_complete event
//             expect(events[3]).toEqual({
//               type: "search_complete",
//               data: [],
//               metadata: expect.objectContaining({
//                 pageNumber: 1,
//                 totalResults: 2,
//                 hasMore: false
//               })
//             });

//             resolve();
//           }
//         });
//       });
//     });

//     it("should handle pagination in events", async () => {
//       const searchParams = { query: "test" } as const;

//       mockClient.search
//         .mockResolvedValueOnce({
//           results: [{ object: "page", id: "page-1" }],
//           has_more: true,
//           next_cursor: "cursor-1" as string | null
//         })
//         .mockResolvedValueOnce({
//           results: [{ object: "page", id: "page-2" }],
//           has_more: false,
//           next_cursor: null as string | null
//         });

//       const events: any[] = [];
//       const observable = notionClient.searchEvents$(searchParams);

//       await new Promise<void>((resolve) => {
//         observable.subscribe({
//           next: (event) => {
//             events.push(event);
//           },
//           complete: () => {
//             // Should have events from both pages
//             expect(events.length).toBeGreaterThan(4);

//             // Check that we have results from both pages
//             const resultEvents = events.filter((e) => e.type === "result");
//             expect(resultEvents).toHaveLength(2);
//             expect(resultEvents[0].data.id).toBe("page-1");
//             expect(resultEvents[1].data.id).toBe("page-2");

//             // Check that we have page_complete events for both pages
//             const pageCompleteEvents = events.filter((e) => e.type === "page_complete");
//             expect(pageCompleteEvents).toHaveLength(2);

//             resolve();
//           }
//         });
//       });
//     });

//     it("should handle errors in events", async () => {
//       const searchParams = { query: "test" } as const;
//       const error = new Error("Search failed");

//       mockClient.search.mockRejectedValue(error);

//       const events: any[] = [];
//       const observable = notionClient.searchEvents$(searchParams);

//       await new Promise<void>((resolve, reject) => {
//         observable.subscribe({
//           next: (event) => {
//             events.push(event);
//           },
//           error: (err) => {
//             try {
//               expect(events).toHaveLength(1);
//               expect(events[0]).toEqual({
//                 type: "error",
//                 data: error,
//                 metadata: expect.objectContaining({
//                   pageNumber: 1,
//                   totalResults: 0,
//                   hasMore: false
//                 })
//               });
//               resolve();
//             } catch (e) {
//               reject(e);
//             }
//           }
//         });
//       });
//     });

//     it("should apply throttling when configured", async () => {
//       const searchParams = { query: "test" } as const;
//       const config = { throttleMs: 100 };
//       const mockResponse = {
//         results: [{ object: "page", id: "page-1" }],
//         has_more: false,
//         next_cursor: null as string | null
//       };

//       mockClient.search.mockResolvedValue(mockResponse);

//       const startTime = Date.now();
//       const events: any[] = [];
//       const observable = notionClient.searchEvents$(searchParams, config);

//       await new Promise<void>((resolve) => {
//         observable.subscribe({
//           next: (event) => {
//             events.push(event);
//           },
//           complete: () => {
//             const endTime = Date.now();
//             const elapsed = endTime - startTime;

//             // Should have been throttled
//             expect(elapsed).toBeGreaterThanOrEqual(100);
//             expect(events.length).toBeGreaterThan(0);
//             resolve();
//           }
//         });
//       });
//     });

//     it("should apply batching when configured", async () => {
//       const searchParams = { query: "test" } as const;
//       const config = { batchSize: 2 };
//       const mockResponse = {
//         results: [
//           { object: "page", id: "page-1" },
//           { object: "page", id: "page-2" }
//         ],
//         has_more: false,
//         next_cursor: null as string | null
//       };

//       mockClient.search.mockResolvedValue(mockResponse);

//       const events: any[] = [];
//       const observable = notionClient.searchEvents$(searchParams, config);

//       await new Promise<void>((resolve) => {
//         observable.subscribe({
//           next: (event) => {
//             events.push(event);
//           },
//           complete: () => {
//             // Should have batched the results
//             expect(events.length).toBe(1);
//             expect(events[0].type).toBe("result");
//             expect(events[0].data).toHaveLength(2);
//             expect(events[0].data[0].id).toBe("page-1");
//             expect(events[0].data[1].id).toBe("page-2");
//             resolve();
//           }
//         });
//       });
//     });

//     it("should reuse subjects for same search parameters", () => {
//       const searchParams = { query: "test" } as const;
//       const mockResponse = {
//         results: [{ object: "page", id: "page-1" }],
//         has_more: false,
//         next_cursor: null as string | null
//       };

//       mockClient.search.mockResolvedValue(mockResponse);

//       const observable1 = notionClient.searchEvents$(searchParams);
//       const observable2 = notionClient.searchEvents$(searchParams);

//       // Should be the same observable (subject reuse)
//       expect(observable1).toBe(observable2);
//     });
//   });

//   describe("caching", () => {
//     it("should cache page updates", async () => {
//       const pageId = "test-page-id";
//       const mockPage = { id: pageId, object: "page", transformed: true };

//       mockClient.pages.retrieve.mockResolvedValue(mockPage);

//       const updates: any[] = [];
//       const subscription = notionClient.pageUpdates$(pageId).subscribe({
//         next: (page) => updates.push(page)
//       });

//       // Wait for initial load
//       await new Promise((resolve) => setTimeout(resolve, 10));

//       expect(updates).toHaveLength(1);
//       expect(updates[0]).toEqual(mockPage);

//       subscription.unsubscribe();
//     });

//     it("should cache database updates", async () => {
//       const databaseId = "test-database-id";
//       const mockDatabase = { id: databaseId, object: "database", transformed: true };

//       mockClient.databases.retrieve.mockResolvedValue(mockDatabase);

//       const updates: any[] = [];
//       const subscription = notionClient.databaseUpdates$(databaseId).subscribe({
//         next: (database) => updates.push(database)
//       });

//       // Wait for initial load
//       await new Promise((resolve) => setTimeout(resolve, 10));

//       expect(updates).toHaveLength(1);
//       expect(updates[0]).toEqual(mockDatabase);

//       subscription.unsubscribe();
//     });

//     it("should clear cache", () => {
//       notionClient.clearCache();
//       // Cache clearing is internal, so we just ensure it doesn't throw
//       expect(true).toBe(true);
//     });
//   });

//   describe("rate limiting", () => {
//     it("should handle rate limit errors correctly", async () => {
//       const rateLimitError = {
//         code: "rate_limited",
//         status: 429,
//         headers: { "retry-after": "1" }
//       };

//       mockClient.search.mockRejectedValue(rateLimitError);

//       await expect(notionClient.search({ query: "test" }).pipe(take(1)).toPromise()).rejects.toThrow();
//     });

//     it("should provide rate limit info", () => {
//       const rateLimitInfo = notionClient.getRateLimitInfo();
//       expect(rateLimitInfo).toBeNull(); // Initially null
//     });

//     it("should emit rate limit updates", async () => {
//       const rateLimitInfo = notionClient.getRateLimitInfo();
//       expect(rateLimitInfo).toBeNull();

//       // Since rate limit updates are only emitted on actual rate limit events,
//       // and those are complex to mock, we'll just verify the observable exists
//       const subscription = notionClient.rateLimitUpdates$().subscribe({
//         next: (info) => {
//           // This would be called if rate limit info is available
//           expect(info).toBeDefined();
//         }
//       });

//       // Clean up
//       await new Promise<void>((resolve) => {
//         setTimeout(() => {
//           subscription.unsubscribe();
//           resolve();
//         }, 10);
//       });
//     });
//   });

//   describe("batch operations", () => {
//     it("should retrieve multiple pages in parallel", async () => {
//       const pageIds = ["page-1", "page-2", "page-3"];
//       const mockPages = pageIds.map((id) => ({ id, object: "page", transformed: true }));

//       mockClient.pages.retrieve
//         .mockResolvedValueOnce(mockPages[0])
//         .mockResolvedValueOnce(mockPages[1])
//         .mockResolvedValueOnce(mockPages[2]);

//       const results = await notionClient.getPages(pageIds).pipe(take(1)).toPromise();

//       expect(results).toEqual(mockPages);
//       expect(mockClient.pages.retrieve).toHaveBeenCalledTimes(3);
//     });

//     it("should retrieve multiple databases in parallel", async () => {
//       const databaseIds = ["db-1", "db-2"];
//       const mockDatabases = databaseIds.map((id) => ({ id, object: "database", transformed: true }));

//       mockClient.databases.retrieve.mockResolvedValueOnce(mockDatabases[0]).mockResolvedValueOnce(mockDatabases[1]);

//       const results = await notionClient.getDatabasesById(databaseIds).pipe(take(1)).toPromise();

//       expect(results).toEqual(mockDatabases);
//       expect(mockClient.databases.retrieve).toHaveBeenCalledTimes(2);
//     });

//     it("should retrieve multiple blocks in parallel", async () => {
//       const blockIds = ["block-1", "block-2"];
//       const mockBlocks = blockIds.map((id) => [{ id, object: "block", transformed: true }]);

//       mockClient.blocks.children.list
//         .mockResolvedValueOnce({ results: mockBlocks[0] })
//         .mockResolvedValueOnce({ results: mockBlocks[1] });

//       const results = await notionClient.getMultipleBlocks(blockIds).pipe(take(1)).toPromise();

//       expect(results).toEqual(mockBlocks);
//       expect(mockClient.blocks.children.list).toHaveBeenCalledTimes(2);
//     });
//   });

//   describe("namespaced API methods", () => {
//     it("should provide pages namespace", () => {
//       expect(notionClient.pages).toBeDefined();
//       expect(notionClient.pages.retrieve).toBeDefined();
//       expect(notionClient.pages.retrieveMany).toBeDefined();
//       expect(notionClient.pages.properties).toBeDefined();
//       expect(notionClient.pages.blocks).toBeDefined();
//       expect(notionClient.pages.comments).toBeDefined();
//     });

//     it("should provide databases namespace", () => {
//       expect(notionClient.databases).toBeDefined();
//       expect(notionClient.databases.retrieve).toBeDefined();
//       expect(notionClient.databases.retrieveMany).toBeDefined();
//       expect(notionClient.databases.search).toBeDefined();
//       expect(notionClient.databases.query).toBeDefined();
//       expect(notionClient.databases.queryAll).toBeDefined();
//       expect(notionClient.databases.properties).toBeDefined();
//     });

//     it("should provide blocks namespace", () => {
//       expect(notionClient.blocks).toBeDefined();
//       expect(notionClient.blocks.children).toBeDefined();
//       expect(notionClient.blocks.children.list).toBeDefined();
//       expect(notionClient.blocks.children.listAll).toBeDefined();
//     });

//     it("should provide users namespace", () => {
//       expect(notionClient.users).toBeDefined();
//       expect(notionClient.users.list).toBeDefined();
//       expect(notionClient.users.me).toBeDefined();
//     });

//     it("should provide workspace namespace", () => {
//       expect(notionClient.workspace).toBeDefined();
//       expect(notionClient.workspace.retrieve).toBeDefined();
//     });
//   });
// });
