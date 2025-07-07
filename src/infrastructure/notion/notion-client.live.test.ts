import { afterAll, beforeAll, describe, expect, it, test, vi } from "vitest";
import { config } from "../../lib/config-loader";
import { NotionClient } from "./notion-client";
import { toNotionID } from "./util";

test("config is loaded", () => {
  expect(config).toBeDefined();
  expect(config.token).toHaveLength(50);
});

// These tests require a valid Notion integration token and a test workspace
describe("NotionClient Live API Tests", () => {
  let notionClient: NotionClient;
  const testPageId = "1ded7342-e571-802e-8d06-fca37dbe8bc4";
  const testDatabaseId = toNotionID("16ad7342e57180c4a065c7a1015871d3");

  beforeAll(() => {
    if (!config.token) {
      throw new Error("NOTION_TOKEN is required for live tests");
    }
    notionClient = new NotionClient({ apiKey: config.token });
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it("should retrieve workspace information", async () => {
    const workspace = await notionClient.getWorkspace();
    expect(workspace).toHaveProperty("id");
    expect(workspace).toHaveProperty("name");
    expect(workspace).toHaveProperty("owner");
    expect(workspace).toHaveProperty("createdTime");
  });

  it("should list users", async () => {
    const users = await notionClient.getUsers();
    expect(Array.isArray(users)).toBe(true);
    if (users.length > 0) {
      const user = users[0];
      expect(user).toHaveProperty("id");
      expect(user).toHaveProperty("name");
    }
  });

  it("should retrieve a page", async () => {
    const page = await notionClient.getPage(testPageId);
    expect(page).toHaveProperty("id", testPageId);
    expect(page).toHaveProperty("title");
  });

  it("should retrieve a database", async () => {
    const database = await notionClient.getDatabase(testDatabaseId);
    expect(database).toHaveProperty("id", testDatabaseId);
    expect(database).toHaveProperty("title");
  });

  it("should query a database", async () => {
    const result = await notionClient.queryDatabase(testDatabaseId);
    expect(result).toHaveProperty("results");
    expect(result).toHaveProperty("hasMore");
  });

  it("should get blocks for a page", async () => {
    const result = await notionClient.getBlocks(testPageId);
    expect(result).toHaveProperty("results");
    expect(result).toHaveProperty("hasMore");
  });

  it("should get comments for a page", async () => {
    const comments = await notionClient.getComments(testPageId);
    expect(Array.isArray(comments)).toBe(true);
    if (comments.length > 0) {
      const comment = comments[0];
      expect(comment).toHaveProperty("id");
      expect(comment).toHaveProperty("type", "comment");
      expect(comment).toHaveProperty("parent");
      expect(comment).toHaveProperty("rich_text");
    }
  });

  it("get-page-property-item", async () => {
    // First get the page to find a property ID
    const page = await notionClient.getPage(testPageId);
    const propertyId = Object.keys(page.properties)[0];

    const property = await notionClient.getPropertyItem(testPageId, "%3DIr%5C");
    // log.debugging.inspect("transformPropertyItem", { v: notionClient.transformPropertyItem(property) });
    // log.debugging.inspect("Property", { property });
    expect(property).toHaveProperty("id");
    expect(property).toHaveProperty("type");
  });

  it("should get database properties", async () => {
    const properties = await notionClient.getDatabaseProperties(testDatabaseId);
    expect(Array.isArray(properties)).toBe(true);
    if (properties.length > 0) {
      const property = properties[0];
      expect(property).toHaveProperty("id");
      expect(property).toHaveProperty("name");
      expect(property).toHaveProperty("type");
    }
  });

  it("should get page properties", async () => {
    const properties = await notionClient.getPageProperties(testPageId);
    expect(Array.isArray(properties)).toBe(true);
    if (properties.length > 0) {
      const property = properties[0];
      expect(property).toHaveProperty("id");
      expect(property).toHaveProperty("name");
      expect(property).toHaveProperty("type");
    }
  });

  it("should get block children", async () => {
    const blocks = await notionClient.getBlockChildren(testPageId);
    expect(Array.isArray(blocks)).toBe(true);
    if (blocks.length > 0) {
      const block = blocks[0];
      expect(block).toHaveProperty("id");
      expect(block).toHaveProperty("type");
    }
  });

  it("should handle rate limiting", async () => {
    // Mock rate limit error
    vi.spyOn(notionClient as any, "execute").mockRejectedValueOnce({
      code: 429,
      headers: {
        "retry-after": "1"
      }
    });

    try {
      await notionClient.getPage(testPageId);
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("Rate limit exceeded");
    }
  });

  it("should handle authentication errors", async () => {
    const invalidClient = new NotionClient({ apiKey: "invalid_token" });
    await expect(invalidClient.getPage(testPageId)).rejects.toThrow("Invalid API key");
  });
});
