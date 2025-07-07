import { describe, expect, it } from "vitest";
import { NotionClient } from "./notion-client";

describe("NotionClient", () => {
  it("should get databases", async () => {
    const notionClient = new NotionClient({
      apiKey: "test-key",
      apiVersion: "2022-06-28",
      baseUrl: "https://api.notion.com",
      timeout: 30000,
      retryAttempts: 3
    });
    const databases = await notionClient.getDatabases();
    expect(databases).toBeDefined();
  });
});
