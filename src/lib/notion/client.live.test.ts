// import { loadCommandConfig } from "$config/loader";
// import { lastValueFrom } from "rxjs";
// import { afterAll, test as baseTest, describe, expect, vi } from "vitest";
// import { NotionClient } from "./client";
// import { toNotionID } from "./util";

// const config = await loadCommandConfig("export", {});
// const test = baseTest.extend<TestContext>({
//   notionClient: ({}, use) => use(new NotionClient({ apiKey: config.rendered.token }))
// });

// // These tests require a valid Notion integration token and a test workspace
// describe("NotionClient Live API Tests", () => {
//   const testPageId = "1ded7342-e571-802e-8d06-fca37dbe8bc4";
//   const testDatabaseId = toNotionID("16ad7342e57180c4a065c7a1015871d3");

//   afterAll(() => {
//     vi.restoreAllMocks();
//   });

//   test("should retrieve workspace information", async ({ notionClient }) => {
//     const workspace = await lastValueFrom(notionClient.getWorkspace());
//     expect(workspace).toHaveProperty("id");
//     expect(workspace).toHaveProperty("name");
//     expect(workspace).toHaveProperty("owner");
//     expect(workspace).toHaveProperty("createdTime");
//   });

//   test("should list users", async ({ notionClient }) => {
//     const users = await lastValueFrom(notionClient.getUsers());
//     expect(Array.isArray(users)).toBe(true);
//     if (users.length > 0) {
//       const user = users[0];
//       expect(user).toHaveProperty("id");
//       expect(user).toHaveProperty("name");
//     }
//   });

//   test("should retrieve a page", async ({ notionClient }) => {
//     const page = await lastValueFrom(notionClient.getPage(testPageId));
//     expect(page).toHaveProperty("id", testPageId);
//     expect(page).toHaveProperty("title");
//   });

//   test("should retrieve a database", async ({ notionClient }) => {
//     const database = await lastValueFrom(notionClient.getDatabase(testDatabaseId));
//     expect(database).toHaveProperty("id", testDatabaseId);
//     expect(database).toHaveProperty("title");
//   });

//   test("should query a database", async ({ notionClient }) => {
//     const result = await lastValueFrom(notionClient.queryDatabase({ database_id: testDatabaseId }));
//     expect(result).toHaveProperty("results");
//     expect(result).toHaveProperty("hasMore");
//   });

//   test("should get blocks for a page", async ({ notionClient }) => {
//     const result = await lastValueFrom(notionClient.getBlocks(testPageId));
//     expect(Array.isArray(result)).toBe(true);
//   });

//   test("should get comments for a page", async ({ notionClient }) => {
//     const comments = await lastValueFrom(notionClient.getComments(testPageId));
//     expect(Array.isArray(comments)).toBe(true);
//     if (comments.length > 0) {
//       const comment = comments[0];
//       expect(comment).toHaveProperty("id");
//       expect(comment).toHaveProperty("type", "comment");
//       expect(comment).toHaveProperty("parent");
//       expect(comment).toHaveProperty("rich_text");
//     }
//   });

//   test("get-page-property-item", async ({ notionClient }) => {
//     // First get the page to find a property ID
//     const page = await lastValueFrom(notionClient.getPage(testPageId));
//     const propertyId = Object.keys(page.properties)[0];

//     const property = await lastValueFrom(notionClient.getPropertyItem(testPageId, "%3DIr%5C"));
//     // log.debugging.inspect("transformPropertyItem", { v: notionClient.transformPropertyItem(property) });
//     // log.debugging.inspect("Property", { property });
//     expect(property).toHaveProperty("id");
//     expect(property).toHaveProperty("type");
//   });

//   test("should get database properties", async ({ notionClient }) => {
//     const properties = await lastValueFrom(notionClient.getDatabaseProperties(testDatabaseId));
//     expect(Array.isArray(properties)).toBe(true);
//     if (properties.length > 0) {
//       const property = properties[0];
//       expect(property).toHaveProperty("id");
//       expect(property).toHaveProperty("name");
//       expect(property).toHaveProperty("type");
//     }
//   });

//   test("should get page properties", async ({ notionClient }) => {
//     const properties = await lastValueFrom(notionClient.getPageProperties(testPageId));
//     expect(Array.isArray(properties)).toBe(true);
//     if (properties.length > 0) {
//       const property = properties[0];
//       expect(property).toHaveProperty("id");
//       expect(property).toHaveProperty("name");
//       expect(property).toHaveProperty("type");
//     }
//   });

//   test("get-block-children", async ({ notionClient }) => {
//     const blocks = await lastValueFrom(notionClient.getBlockChildren(testPageId));
//     expect(Array.isArray(blocks)).toBe(true);
//     if (blocks.length > 0) {
//       const block = blocks[0];
//       expect(block).toHaveProperty("id");
//       expect(block).toHaveProperty("type");
//     }
//   });

//   test("handle-rate-limit-errors", async ({ notionClient }) => {
//     // Mock console methods to suppress log output during this test
//     const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
//     const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

//     try {
//       const rateLimitError = new Error("Rate limit exceeded") as any;
//       rateLimitError.code = "rate_limited";
//       rateLimitError.status = 429;
//       rateLimitError.headers = { "retry-after": "1" };

//       vi.spyOn(notionClient["client"].pages, "retrieve").mockRejectedValueOnce(rateLimitError);

//       await expect(lastValueFrom(notionClient.getPage(testPageId))).rejects.toThrow(
//         "Rate limit exceeded. Retry after 1 seconds."
//       );

//       // Verify rate limit info is set
//       const rateLimitInfo = notionClient.getRateLimitInfo();
//       expect(rateLimitInfo).toBeDefined();
//       expect(rateLimitInfo?.retryAfter).toBe(1);
//     } finally {
//       // Always restore mocks
//       consoleSpy.mockRestore();
//       consoleErrorSpy.mockRestore();
//       vi.restoreAllMocks();
//     }
//   });

//   test(
//     "handle-authentication-errors",
//     {
//       timeout: getComplexityTimeout(10)
//     },
//     async () => {
//       const badClient = new NotionClient({ apiKey: "invalid_token" });

//       const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
//       const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

//       try {
//         await expect(lastValueFrom(badClient.getPage(testPageId))).rejects.toThrowError();
//       } finally {
//         consoleWarnSpy.mockRestore();
//         consoleErrorSpy.mockRestore();
//       }
//     }
//   );
// });
