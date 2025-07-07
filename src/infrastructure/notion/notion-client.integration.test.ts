import { beforeEach, expect, suite, test } from "vitest";
import { config } from "../../lib/config-loader";
import { log } from "../../lib/log";
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
    const comments = await notionClient.getComments("some_page_id_with_comments");
    expect(Array.isArray(comments)).toBe(true);
    if (comments.length > 0) {
      const comment = comments[0];
      expect(comment).toHaveProperty("id");
      expect(comment).toHaveProperty("type", "comment");
      expect(comment).toHaveProperty("parent");
      expect(comment).toHaveProperty("rich_text");
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
    const properties = await notionClient.getDatabaseProperties("valid_database_id");
    expect(Array.isArray(properties)).toBe(true);
    if (properties.length > 0) {
      const property = properties[0];
      expect(property).toHaveProperty("id");
      expect(property).toHaveProperty("name");
      expect(property).toHaveProperty("type");
    }
  });
});
