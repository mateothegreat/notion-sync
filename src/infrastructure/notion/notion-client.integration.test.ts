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
