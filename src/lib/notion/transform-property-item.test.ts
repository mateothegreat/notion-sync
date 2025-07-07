/**
 * NotionClient transformPropertyItem Method Tests
 *
 * Tests for the transformPropertyItem method to ensure it correctly handles
 * PropertyItemObjectResponse and PropertyItemListResponse types.
 */

import { PropertyItemListResponse, PropertyItemObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import { beforeEach, describe, expect, it } from "vitest";
import { NotionClient } from "./notion-client";

describe("NotionClient - transformPropertyItem", () => {
  let notionClient: NotionClient;

  beforeEach(() => {
    notionClient = new NotionClient({
      apiKey: "secret_test_key",
      baseUrl: "https://api.notion.com",
      timeout: 30000
    });
  });

  describe("PropertyItemListResponse handling", () => {
    it("should transform list response correctly", () => {
      const listResponse: PropertyItemListResponse = {
        type: "property_item",
        property_item: {
          type: "relation",
          relation: {},
          next_url: null,
          id: "property-1"
        },
        object: "list",
        next_cursor: "cursor-123",
        has_more: true,
        results: [
          {
            type: "relation",
            relation: { id: "relation-1" },
            id: "result-1",
            object: "property_item"
          }
        ]
      };

      const result = notionClient.transformPropertyItem(listResponse);

      expect(result.id).toBe("result-1");
      expect(result.object).toBe("list");
      expect(result.results).toHaveLength(1);
      expect(result.has_more).toBe(true);
      expect(result.next_cursor).toBe("cursor-123");
      expect(result.property_item).toBeDefined();
      expect(result.property_item?.id).toBe("property-1");
    });

    it("should handle list response with empty results", () => {
      const listResponse: PropertyItemListResponse = {
        type: "property_item",
        property_item: {
          type: "title",
          title: {},
          next_url: null,
          id: "property-2"
        },
        object: "list",
        next_cursor: null,
        has_more: false,
        results: []
      };

      const result = notionClient.transformPropertyItem(listResponse);

      expect(result.id).toBe("property-2");
      expect(result.object).toBe("list");
      expect(result.results).toEqual([]);
      expect(result.has_more).toBe(false);
      expect(result.next_cursor).toBe(null);
    });
  });

  describe("PropertyItemObjectResponse handling", () => {
    it("should transform object response correctly", () => {
      const objectResponse: PropertyItemObjectResponse = {
        type: "rich_text",
        rich_text: {
          type: "text",
          text: { content: "Test content", link: null },
          plain_text: "Test content",
          href: null,
          annotations: {
            bold: false,
            italic: false,
            strikethrough: false,
            underline: false,
            code: false,
            color: "default"
          }
        },
        id: "property-3",
        object: "property_item"
      };

      const result = notionClient.transformPropertyItem(objectResponse);

      expect(result.id).toBe("property-3");
      expect(result.type).toBe("rich_text");
      expect(result.object).toBe("property_item");
      expect(result.property_item).toBeDefined();
      expect(result.property_item?.id).toBe("property-3");
    });

    it("should handle number property response", () => {
      const objectResponse: PropertyItemObjectResponse = {
        type: "number",
        number: 42,
        id: "property-4",
        object: "property_item"
      };

      const result = notionClient.transformPropertyItem(objectResponse);

      expect(result.id).toBe("property-4");
      expect(result.type).toBe("number");
      expect(result.object).toBe("property_item");
      expect(result.property_item).toBeDefined();
      expect(result.property_item?.id).toBe("property-4");
    });
  });
});
