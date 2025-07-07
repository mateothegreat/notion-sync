import { beforeEach, describe, expect, it, suite, test } from "vitest";
import { config } from "../config/config-loader";
import { log } from "../log";
import { NotionClient } from "./notion-client";

let notionClient: NotionClient;

test("config should render", () => {
  expect(config.token).toBeDefined();
});

beforeEach(() => {
  notionClient = new NotionClient({
    apiKey: config.token,
    apiVersion: "2022-06-28",
    baseUrl: "https://api.notion.com",
    timeout: 30000,
    retryAttempts: 3
  });
});

suite("NotionClient", () => {
  test("should get databases", async () => {
    const databases = await notionClient.getDatabases();
    expect(databases.length).toBeGreaterThan(0);
    databases.forEach((database, index) => {
      expect(database.id).toBeDefined();
      expect(database.title).toBeDefined();
      expect(database.url).toBeDefined();
      expect(database.archived).toBeTypeOf("boolean");
      expect(database.createdTime).toBeDefined();
      expect(database.lastEditedTime).toBeDefined();
      expect(database.createdBy.id).toBeDefined();
      expect(database.lastEditedBy).toBeDefined();
    });
    log.debugging.inspect("Found databases", { databases: databases.map((db) => db.title) });
  }, 60000);
});

describe("NotionClient Integration Tests", () => {
  it("should get comments for a page", async () => {
    // Using a valid UUID format - this test will expect a validation error for a non-existent page
    const nonExistentPageId = "12345678-1234-1234-1234-123456789abc";

    try {
      const comments = await notionClient.getComments(nonExistentPageId);
      expect(Array.isArray(comments)).toBe(true);
    } catch (error: any) {
      // Expect NOTION_API_ERROR code with validation_error in context
      expect(error.code).toBe("NOTION_API_ERROR");
      expect(error.notionErrorCode).toBe("validation_error");
    }
  });

  it("should get workspace information", async () => {
    const workspace = await notionClient.getWorkspace();
    expect(workspace).toHaveProperty("id");
    expect(workspace).toHaveProperty("name");
    expect(workspace).toHaveProperty("owner");
    expect(workspace).toHaveProperty("createdTime");
  });

  it("should get database properties", async () => {
    // Using a valid UUID format - this test will expect a validation error for a non-existent database
    const nonExistentDbId = "12345678-1234-1234-1234-123456789abc";

    try {
      const properties = await notionClient.getDatabaseProperties(nonExistentDbId);
      expect(Array.isArray(properties)).toBe(true);
    } catch (error: any) {
      // Expect NOTION_API_ERROR code - the error is properly handled by NotionClient
      expect(error.code).toBe("NOTION_API_ERROR");
      // The error should contain a message indicating invalid parameters
      expect(error.message).toContain("Invalid request parameters");
    }
  });
});
