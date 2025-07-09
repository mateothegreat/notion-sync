import type {
  DatabaseObjectResponse,
  PageObjectResponse,
  PartialDatabaseObjectResponse,
  PartialPageObjectResponse
} from "@notionhq/client/build/src/api-endpoints";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  discriminateNotionObject,
  isNotionDatabase,
  isNotionPage,
  NotionFilteredSearchResult,
  NotionSDKObjectBase,
  NotionSDKObjectCommon,
  NotionSDKObjectDiscriminatedUnion,
  NotionSDKObjectUnion,
  NotionSearchEvent,
  NotionSearchEventConfig,
  NotionSearchResponse
} from "./search";

describe("NotionSDKObjectBase", () => {
  it("should be a valid type", () => {
    // Basic compilation test - if this compiles, the type exists and is usable
    const testType: NotionSDKObjectBase = {} as any;
    expect(typeof testType).toBeDefined();
  });
});

describe("NotionSDKObjectUnion", () => {
  it("should work with page type parameter", () => {
    // Test that page union type works at compile time
    type PageUnion = NotionSDKObjectUnion<"page">;
    const pageTest: PageUnion = {} as PageObjectResponse;
    expect(pageTest).toBeDefined();
  });

  it("should work with database type parameter", () => {
    // Test that database union type works at compile time
    type DatabaseUnion = NotionSDKObjectUnion<"database">;
    const databaseTest: DatabaseUnion = {} as DatabaseObjectResponse;
    expect(databaseTest).toBeDefined();
  });

  it("should work with no type parameter", () => {
    // Test that default union type works at compile time
    type DefaultUnion = NotionSDKObjectUnion;
    const defaultTest: DefaultUnion = {} as PageObjectResponse;
    expect(defaultTest).toBeDefined();
  });

  it("should work with page type parameter", () => {
    const pageUnion: NotionSDKObjectUnion<"page"> = {
      object: "page",
      id: "test-page-id",
      created_time: "2024-01-01T00:00:00.000Z",
      last_edited_time: "2024-01-01T00:00:00.000Z",
      created_by: { object: "user", id: "user1" },
      last_edited_by: { object: "user", id: "user1" },
      cover: null,
      icon: null,
      parent: { type: "workspace", workspace: true },
      archived: false,
      in_trash: false,
      properties: {},
      url: "https://notion.so/test-page"
    } as PageObjectResponse;
    expect(pageUnion.object).toBe("page");
  });

  it("should work with database type parameter", () => {
    const databaseUnion: NotionSDKObjectUnion<"database"> = {
      object: "database",
      id: "test-database-id",
      created_time: "2024-01-01T00:00:00.000Z",
      last_edited_time: "2024-01-01T00:00:00.000Z",
      created_by: { object: "user", id: "user1" },
      last_edited_by: { object: "user", id: "user1" },
      title: [{ type: "text", text: { content: "Test Database" } }],
      description: [],
      icon: null,
      cover: null,
      properties: {},
      parent: { type: "workspace", workspace: true },
      url: "https://notion.so/test-database",
      archived: false,
      in_trash: false,
      is_inline: false
    } as DatabaseObjectResponse;
    expect(databaseUnion.object).toBe("database");
  });

  it("should work without type parameter", () => {
    const union: NotionSDKObjectUnion = {
      object: "page",
      id: "test-page-id",
      created_time: "2024-01-01T00:00:00.000Z",
      last_edited_time: "2024-01-01T00:00:00.000Z",
      created_by: { object: "user", id: "user1" },
      last_edited_by: { object: "user", id: "user1" },
      cover: null,
      icon: null,
      parent: { type: "workspace", workspace: true },
      archived: false,
      in_trash: false,
      properties: {},
      url: "https://notion.so/test-page"
    } as PageObjectResponse;
    expect(union.object).toBe("page");
  });
});

describe("NotionSDKObjectDiscriminatedUnion", () => {
  it("should be a union of page and database types with discriminator", () => {
    type Expected =
      | (PageObjectResponse & { object: "page" })
      | (PartialPageObjectResponse & { object: "page" })
      | (DatabaseObjectResponse & { object: "database" })
      | (PartialDatabaseObjectResponse & { object: "database" });

    expectTypeOf<NotionSDKObjectDiscriminatedUnion>().toEqualTypeOf<Expected>();
  });
});

describe("Type Guards", () => {
  const createMockPage = (partial = false): PageObjectResponse | PartialPageObjectResponse =>
    ({
      object: "page",
      id: "page-id",
      created_time: "2023-01-01T00:00:00.000Z",
      last_edited_time: "2023-01-01T00:00:00.000Z",
      created_by: { object: "user", id: "user-id" },
      last_edited_by: { object: "user", id: "user-id" },
      cover: null,
      icon: null,
      parent: { type: "workspace", workspace: true },
      archived: false,
      properties: {},
      url: "https://notion.so/page-id",
      ...(partial
        ? {}
        : {
            public_url: null,
            in_trash: false
          })
    } as PageObjectResponse);

  const createMockDatabase = (partial = false): DatabaseObjectResponse | PartialDatabaseObjectResponse =>
    ({
      object: "database",
      id: "database-id",
      created_time: "2023-01-01T00:00:00.000Z",
      last_edited_time: "2023-01-01T00:00:00.000Z",
      created_by: { object: "user", id: "user-id" },
      last_edited_by: { object: "user", id: "user-id" },
      cover: null,
      icon: null,
      parent: { type: "workspace", workspace: true },
      archived: false,
      properties: {},
      url: "https://notion.so/database-id",
      title: [],
      description: [],
      is_inline: false,
      ...(partial
        ? {}
        : {
            public_url: null,
            in_trash: false
          })
    } as DatabaseObjectResponse);

  describe("isNotionPage", () => {
    it("should return true for page objects", () => {
      const page = createMockPage();
      expect(isNotionPage(page)).toBe(true);
    });

    it("should return false for database objects", () => {
      const database = createMockDatabase();
      expect(isNotionPage(database)).toBe(false);
    });

    it("should properly narrow types", () => {
      const obj: NotionSDKObjectDiscriminatedUnion = createMockPage();

      if (isNotionPage(obj)) {
        // Type narrowing test - if this compiles, type narrowing works
        expect(obj.object).toBe("page");
      }
    });

    it("should return true for page objects", () => {
      expect(
        isNotionPage({
          object: "page",
          id: "test-page-id",
          created_time: "2024-01-01T00:00:00.000Z",
          last_edited_time: "2024-01-01T00:00:00.000Z",
          created_by: { object: "user", id: "user1" },
          last_edited_by: { object: "user", id: "user1" },
          cover: null,
          icon: null,
          parent: { type: "workspace", workspace: true },
          archived: false,
          in_trash: false,
          properties: {},
          url: "https://notion.so/test-page"
        } as PageObjectResponse)
      ).toBe(true);
    });

    it("should return false for database objects", () => {
      expect(
        isNotionPage({
          object: "database",
          id: "test-database-id",
          created_time: "2024-01-01T00:00:00.000Z",
          last_edited_time: "2024-01-01T00:00:00.000Z",
          created_by: { object: "user", id: "user1" },
          last_edited_by: { object: "user", id: "user1" },
          title: [{ type: "text", text: { content: "Test Database" } }],
          description: [],
          icon: null,
          cover: null,
          properties: {},
          parent: { type: "workspace", workspace: true },
          url: "https://notion.so/test-database",
          archived: false,
          in_trash: false,
          is_inline: false
        } as DatabaseObjectResponse)
      ).toBe(false);
    });
  });

  describe("isNotionDatabase", () => {
    it("should return true for database objects", () => {
      const database = createMockDatabase();
      expect(isNotionDatabase(database)).toBe(true);
    });

    it("should return false for page objects", () => {
      const page = createMockPage();
      expect(isNotionDatabase(page)).toBe(false);
    });

    it("should properly narrow types", () => {
      const obj: NotionSDKObjectDiscriminatedUnion = createMockDatabase();

      if (isNotionDatabase(obj)) {
        // Type narrowing test - if this compiles, type narrowing works
        expect(obj.object).toBe("database");
      }
    });

    it("should return true for database objects", () => {
      expect(
        isNotionDatabase({
          object: "database",
          id: "test-database-id",
          created_time: "2024-01-01T00:00:00.000Z",
          last_edited_time: "2024-01-01T00:00:00.000Z",
          created_by: { object: "user", id: "user1" },
          last_edited_by: { object: "user", id: "user1" },
          title: [{ type: "text", text: { content: "Test Database" } }],
          description: [],
          icon: null,
          cover: null,
          properties: {},
          parent: { type: "workspace", workspace: true },
          url: "https://notion.so/test-database",
          archived: false,
          in_trash: false,
          is_inline: false
        } as DatabaseObjectResponse)
      ).toBe(true);
    });

    it("should return false for page objects", () => {
      expect(
        isNotionDatabase({
          object: "page",
          id: "test-page-id",
          created_time: "2024-01-01T00:00:00.000Z",
          last_edited_time: "2024-01-01T00:00:00.000Z",
          created_by: { object: "user", id: "user1" },
          last_edited_by: { object: "user", id: "user1" },
          cover: null,
          icon: null,
          parent: { type: "workspace", workspace: true },
          archived: false,
          in_trash: false,
          properties: {},
          url: "https://notion.so/test-page"
        } as PageObjectResponse)
      ).toBe(false);
    });
  });
});

describe("NotionSDKObjectCommon", () => {
  it("should extract only common properties", () => {
    type MockObject = {
      id: string;
      object: "page";
      created_time: string;
      last_edited_time: string;
      created_by: { object: "user"; id: string };
      last_edited_by: { object: "user"; id: string };
      url: string;
      archived: boolean;
      cover: unknown;
      icon: unknown;
      parent: unknown;
      properties: Record<string, unknown>;
      specificProperty: string;
    };

    type CommonProps = NotionSDKObjectCommon<MockObject>;

    // Should have all base properties
    expectTypeOf<CommonProps>().toHaveProperty("id");
    expectTypeOf<CommonProps>().toHaveProperty("object");
    expectTypeOf<CommonProps>().toHaveProperty("created_time");
    expectTypeOf<CommonProps>().toHaveProperty("url");
    expectTypeOf<CommonProps>().toHaveProperty("archived");

    // Should not have specific properties
    expectTypeOf<CommonProps>().not.toHaveProperty("specificProperty");
  });
});

// Mock data for testing
const mockPageObject = {
  object: "page" as const,
  id: "test-page-id",
  created_time: "2024-01-01T00:00:00.000Z",
  last_edited_time: "2024-01-01T00:00:00.000Z",
  created_by: { object: "user", id: "user1" },
  last_edited_by: { object: "user", id: "user1" },
  cover: null,
  icon: null,
  parent: { type: "workspace", workspace: true },
  archived: false,
  in_trash: false,
  properties: {},
  url: "https://notion.so/test-page",
  public_url: null
} as PageObjectResponse;

const mockDatabaseObject = {
  object: "database" as const,
  id: "test-database-id",
  created_time: "2024-01-01T00:00:00.000Z",
  last_edited_time: "2024-01-01T00:00:00.000Z",
  created_by: { object: "user", id: "user1" },
  last_edited_by: { object: "user", id: "user1" },
  title: [{ type: "text", text: { content: "Test Database" } }],
  description: [],
  icon: null,
  cover: null,
  properties: {},
  parent: { type: "workspace", workspace: true },
  url: "https://notion.so/test-database",
  public_url: null,
  archived: false,
  in_trash: false,
  is_inline: false
} as DatabaseObjectResponse;

describe("discriminateNotionObject", () => {
  it("should provide correct discrimination for page objects", () => {
    const discriminated = discriminateNotionObject(mockPageObject as NotionSDKObjectDiscriminatedUnion);

    expect(discriminated.original).toBe(mockPageObject);
    expect(discriminated.common.id).toBe("test-page-id");
    expect(discriminated.isPage()).toBe(true);
    expect(discriminated.isDatabase()).toBe(false);
  });

  it("should provide correct discrimination for database objects", () => {
    const discriminated = discriminateNotionObject(mockDatabaseObject as NotionSDKObjectDiscriminatedUnion);

    expect(discriminated.original).toBe(mockDatabaseObject);
    expect(discriminated.common.id).toBe("test-database-id");
    expect(discriminated.isPage()).toBe(false);
    expect(discriminated.isDatabase()).toBe(true);
  });

  it("should correctly cast to page", () => {
    const discriminated = discriminateNotionObject(mockPageObject as NotionSDKObjectDiscriminatedUnion);
    const page = discriminated.asPage();

    expect(page.object).toBe("page");
    expect(page.id).toBe("test-page-id");
  });

  it("should correctly cast to database", () => {
    const discriminated = discriminateNotionObject(mockDatabaseObject as NotionSDKObjectDiscriminatedUnion);
    const database = discriminated.asDatabase();

    expect(database.object).toBe("database");
    expect(database.id).toBe("test-database-id");
  });

  it("should throw error when casting page to database", () => {
    const discriminated = discriminateNotionObject(mockPageObject as NotionSDKObjectDiscriminatedUnion);

    expect(() => discriminated.asDatabase()).toThrow("Object is not a database");
  });

  it("should throw error when casting database to page", () => {
    const discriminated = discriminateNotionObject(mockDatabaseObject as NotionSDKObjectDiscriminatedUnion);

    expect(() => discriminated.asPage()).toThrow("Object is not a page");
  });

  it("should execute callback when page", () => {
    const discriminated = discriminateNotionObject(mockPageObject as NotionSDKObjectDiscriminatedUnion);
    const callback = vi.fn();

    discriminated.whenPage(callback);

    expect(callback).toHaveBeenCalledWith(mockPageObject);
  });

  it("should not execute callback when not page", () => {
    const discriminated = discriminateNotionObject(mockDatabaseObject as NotionSDKObjectDiscriminatedUnion);
    const callback = vi.fn();

    discriminated.whenPage(callback);

    expect(callback).not.toHaveBeenCalled();
  });

  it("should execute callback when database", () => {
    const discriminated = discriminateNotionObject(mockDatabaseObject as NotionSDKObjectDiscriminatedUnion);
    const callback = vi.fn();

    discriminated.whenDatabase(callback);

    expect(callback).toHaveBeenCalledWith(mockDatabaseObject);
  });

  it("should not execute callback when not database", () => {
    const discriminated = discriminateNotionObject(mockPageObject as NotionSDKObjectDiscriminatedUnion);
    const callback = vi.fn();

    discriminated.whenDatabase(callback);

    expect(callback).not.toHaveBeenCalled();
  });

  it("should match page handler", () => {
    const discriminated = discriminateNotionObject(mockPageObject as NotionSDKObjectDiscriminatedUnion);
    const result = discriminated.match({
      page: (page) => "page: " + page.id,
      database: (db) => "database: " + db.id
    });

    expect(result).toBe("page: test-page-id");
  });

  it("should match database handler", () => {
    const discriminated = discriminateNotionObject(mockDatabaseObject as NotionSDKObjectDiscriminatedUnion);
    const result = discriminated.match({
      page: (page) => "page: " + page.id,
      database: (db) => "database: " + db.id
    });

    expect(result).toBe("database: test-database-id");
  });
});

describe("NotionFilteredSearchResult", () => {
  it("should infer page result type from parameters", () => {
    const pageParams = { filter: { property: "object", value: "page" } } as const;
    type PageResult = NotionFilteredSearchResult<typeof pageParams>;

    // This is a compile-time test - if it compiles, the type is correct
    const result = mockPageObject as PageResult;
    expect(result.object).toBe("page");
  });

  it("should infer database result type from parameters", () => {
    const databaseParams = { filter: { property: "object", value: "database" } } as const;
    type DatabaseResult = NotionFilteredSearchResult<typeof databaseParams>;

    // This is a compile-time test - if it compiles, the type is correct
    const result = mockDatabaseObject as DatabaseResult;
    expect(result.object).toBe("database");
  });

  it("should infer union type for no filter", () => {
    const noFilterParams = { query: "test" } as const;
    type UnionResult = NotionFilteredSearchResult<typeof noFilterParams>;

    // This is a compile-time test - if it compiles, the type is correct
    const pageResult = mockPageObject as UnionResult;
    const databaseResult = mockDatabaseObject as UnionResult;

    expect(pageResult.object).toBe("page");
    expect(databaseResult.object).toBe("database");
  });
});

describe("NotionSearchResponse", () => {
  it("should have correct structure for page search", () => {
    const pageParams = { filter: { property: "object", value: "page" } } as const;
    const response: NotionSearchResponse<typeof pageParams> = {
      results: [mockPageObject as NotionFilteredSearchResult<typeof pageParams>],
      hasMore: false,
      nextCursor: undefined,
      pageInfo: {
        currentPage: 1,
        pageSize: 10
      }
    };

    expect(response.results).toHaveLength(1);
    expect(response.results[0].object).toBe("page");
    expect(response.hasMore).toBe(false);
  });

  it("should have correct structure for database search", () => {
    const databaseParams = { filter: { property: "object", value: "database" } } as const;
    const response: NotionSearchResponse<typeof databaseParams> = {
      results: [mockDatabaseObject as NotionFilteredSearchResult<typeof databaseParams>],
      hasMore: true,
      nextCursor: "next-cursor",
      pageInfo: {
        currentPage: 1,
        totalPages: 2,
        pageSize: 10
      }
    };

    expect(response.results).toHaveLength(1);
    expect(response.results[0].object).toBe("database");
    expect(response.hasMore).toBe(true);
    expect(response.nextCursor).toBe("next-cursor");
  });
});

describe("NotionSearchEvent", () => {
  it("should create result event correctly", () => {
    const params = { query: "test" } as const;
    const event: NotionSearchEvent<typeof params> = {
      type: "result",
      data: mockPageObject as NotionFilteredSearchResult<typeof params>,
      metadata: {
        pageNumber: 1,
        totalResults: 1,
        hasMore: false,
        timestamp: new Date()
      }
    };

    expect(event.type).toBe("result");
    expect(event.data).toBe(mockPageObject);
    expect(event.metadata.totalResults).toBe(1);
  });

  it("should create page complete event correctly", () => {
    const params = { query: "test" } as const;
    const results = [mockPageObject as NotionFilteredSearchResult<typeof params>];
    const event: NotionSearchEvent<typeof params> = {
      type: "page_complete",
      data: results,
      metadata: {
        pageNumber: 1,
        totalResults: 1,
        hasMore: false,
        timestamp: new Date()
      }
    };

    expect(event.type).toBe("page_complete");
    expect(Array.isArray(event.data)).toBe(true);
    expect((event.data as any[]).length).toBe(1);
  });

  it("should create error event correctly", () => {
    const params = { query: "test" } as const;
    const error = new Error("Test error");
    const event: NotionSearchEvent<typeof params> = {
      type: "error",
      data: error,
      metadata: {
        pageNumber: 1,
        totalResults: 0,
        hasMore: false,
        timestamp: new Date()
      }
    };

    expect(event.type).toBe("error");
    expect(event.data).toBe(error);
    expect(event.metadata.totalResults).toBe(0);
  });
});

describe("NotionSearchEventConfig", () => {
  it("should have correct default values", () => {
    const config: NotionSearchEventConfig = {};

    expect(config.batchSize).toBeUndefined();
    expect(config.throttleMs).toBeUndefined();
    expect(config.enableMetrics).toBeUndefined();
  });

  it("should accept custom values", () => {
    const config: NotionSearchEventConfig = {
      batchSize: 50,
      throttleMs: 1000,
      enableMetrics: true
    };

    expect(config.batchSize).toBe(50);
    expect(config.throttleMs).toBe(1000);
    expect(config.enableMetrics).toBe(true);
  });
});
