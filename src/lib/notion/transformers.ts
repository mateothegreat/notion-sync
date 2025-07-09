import { PropertyItemListResponse, PropertyItemObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import {
  NotionBlock,
  NotionComment,
  NotionDatabase,
  NotionObjectType,
  NotionPage,
  NotionPropertyItem,
  NotionSDKObjectUnion,
  NotionSDKSearchResultDatabase,
  NotionUser
} from "./types";

import { discriminateNotionObject } from "./types/search";

/**
 * Extract the title from a Notion object (page or database).
 *
 * @param obj - The Notion object.
 * @returns The extracted title.
 */
export const title = (obj: NotionSDKObjectUnion): string => {
  const discriminated = discriminateNotionObject(obj);

  return discriminated.match({
    page: (page) => {
      // For pages, look for title property in properties
      if ("properties" in page && page.properties) {
        const property = Object.entries(page.properties).find(([key, value]) => {
          return (value as any).type === "title" || key === "title";
        });

        if (property) {
          const titleProperty = property[1] as any;

          // Handle pages: title is an array of rich text objects
          if (titleProperty.title && Array.isArray(titleProperty.title)) {
            if (titleProperty.title.length === 0) {
              return "Untitled";
            }

            // Concatenate all plain_text values from the rich text array
            const titleText = titleProperty.title
              .map((richText: any) => richText.plain_text || "")
              .join("")
              .trim();

            return titleText || "Untitled";
          }
        }
      }
      return "Untitled";
    },
    database: (database) => {
      // For databases, check if title is directly on the object first
      if ("title" in database && database.title && Array.isArray(database.title)) {
        const titleText = database.title
          .map((richText: any) => richText.plain_text || "")
          .join("")
          .trim();
        if (titleText) {
          return titleText;
        }
      }

      // For databases, look for title property in properties
      if ("properties" in database && database.properties) {
        const property = Object.entries(database.properties).find(([key, value]) => {
          return (value as any).type === "title" || key === "title";
        });

        if (property) {
          const titleProperty = property[1] as any;

          // Handle databases: title might be an empty object or have different structure
          if (titleProperty.title && typeof titleProperty.title === "object" && !Array.isArray(titleProperty.title)) {
            // For databases, the title might be empty or have a different structure
            return titleProperty.name || "Untitled";
          }
        }
      }
      return "Untitled";
    }
  });
};

const extractDescription = (object: any): string => {
  if (object.description && Array.isArray(object.description)) {
    return object.description.map((text: any) => text.plain_text).join("");
  }
  return "";
};

export namespace transformers {
  /**
   * Transform a Notion API error into our internal type.
   *
   * @param {any} error - The error to transform.
   *
   * @returns {Error} - The transformed error.
   */
  export const error = (error: any): Error => {
    switch (error.code) {
      case "unauthorized":
        return new Error("Invalid API key or insufficient permissions.", { cause: error });
      case "object_not_found":
        return new Error("Object not found.", { cause: error });
      case "validation_error":
        return new Error("Invalid request parameters.", { cause: error });
      case "conflict_error":
        return new Error("Conflict with current state.", { cause: error });
      case "internal_server_error":
        return new Error("Notion internal server error.", { cause: error });
      case "service_unavailable":
        return new Error("Notion service unavailable.", { cause: error });
      case "ECONNRESET":
      case "ENOTFOUND":
      case "ETIMEDOUT":
        return new Error("Network error.", { cause: error });
      default:
        return new Error("Unknown error.", { cause: error });
    }
  };

  /**
   * Transform a Notion page response into our internal format.
   *
   * @param {any} notionPage - The Notion page response.
   *
   * @returns {NotionPage} - The transformed page.
   */
  export const page = (notionPage: any): NotionPage => {
    return new NotionPage({
      id: notionPage.id,
      type: NotionObjectType.PAGE,
      title: title(notionPage),
      properties: notionPage.properties || {},
      parent: notionPage.parent,
      url: notionPage.url,
      publicUrl: notionPage.public_url || null,
      archived: notionPage.archived || false,
      trashed: notionPage.in_trash || false,
      createdTime: notionPage.created_time,
      lastEditedTime: notionPage.last_edited_time,
      createdBy: notionPage.created_by,
      lastEditedBy: notionPage.last_edited_by,
      cover: notionPage.cover,
      icon: notionPage.icon,
      inTrash: notionPage.in_trash || false
    });
  };

  /**
   * Transform a Notion property item response into our internal format.
   *
   * @param {PropertyItemObjectResponse | PropertyItemListResponse} response - The response from Notion API.
   *
   * @returns {NotionPropertyItem} - The transformed property item.
   */
  export const propertyItem = (response: PropertyItemObjectResponse | PropertyItemListResponse): NotionPropertyItem => {
    if ("results" in response && Array.isArray(response.results)) {
      // This is a PropertyItemListResponse.
      return {
        id: response.results[0]?.id || response.property_item?.id || "",
        type: response.type,
        object: "list",
        results: [],
        has_more: response.has_more,
        next_cursor: response.next_cursor,
        property_item: response.property_item
          ? {
              id: response.property_item.id,
              type: response.property_item.type,
              ...response.property_item
            }
          : undefined
      };
    } else {
      // This is a PropertyItemObjectResponse
      const objectResponse = response as PropertyItemObjectResponse;
      return {
        id: objectResponse.id,
        type: objectResponse.type,
        object: "property_item",
        property_item: {
          id: objectResponse.id,
          type: objectResponse.type,
          ...objectResponse
        }
      };
    }
  };

  /**
   * Transform a Notion database response into our internal format.
   *
   * @param {any} notionDatabase - The Notion database response.
   *
   * @returns {NotionSDKSearchResultDatabase} - The transformed database.
   */
  export const database = (notionDatabase: any): NotionDatabase => {
    return new NotionDatabase({
      id: notionDatabase.id,
      icon: notionDatabase.icon,
      cover: notionDatabase.cover,
      isInline: notionDatabase.is_inline,
      publicUrl: notionDatabase.public_url,
      trashed: notionDatabase.in_trash,
      type: NotionObjectType.DATABASE,
      title: title(notionDatabase),
      description: extractDescription(notionDatabase),
      properties: notionDatabase.properties || {},
      parent: notionDatabase.parent,
      url: notionDatabase.url,
      archived: notionDatabase.archived || false,
      createdTime: notionDatabase.created_time,
      lastEditedTime: notionDatabase.last_edited_time,
      createdBy: notionDatabase.created_by,
      lastEditedBy: notionDatabase.last_edited_by
    });
  };

  /**
   * Transform a Notion block response into our internal format.
   *
   * @param {any} notionBlock - The Notion block response.
   *
   * @returns {NotionBlock} - The transformed block.
   */
  export const block = (notionBlock: any): NotionBlock => {
    return {
      id: notionBlock.id,
      type: NotionObjectType.BLOCK,
      blockType: notionBlock.type,
      hasChildren: notionBlock.has_children || false,
      properties: notionBlock.properties || {},
      archived: notionBlock.archived || false,
      content: notionBlock[notionBlock.type] || {},
      createdTime: notionBlock.created_time,
      lastEditedTime: notionBlock.last_edited_time,
      createdBy: notionBlock.created_by,
      lastEditedBy: notionBlock.last_edited_by,
      url: notionBlock.url || `https://www.notion.so/${notionBlock.id.replace(/-/g, "")}`,
      publicUrl: notionBlock.public_url || null,
      trashed: notionBlock.in_trash || false
    };
  };

  /**
   * Transform a Notion user response into our internal format.
   *
   * @param {any} notionUser - The Notion user response.
   *
   * @returns {NotionUser} - The transformed user.
   */
  export const user = (notionUser: any): NotionUser => {
    return {
      id: notionUser.id,
      type: notionUser.type || "person",
      name: notionUser.name || "",
      avatarUrl: notionUser.avatar_url || "",
      email: notionUser.email
    };
  };

  /**
   * Transform a Notion comment response into our internal format.
   *
   * @param {any} notionComment - The Notion comment response.
   *
   * @returns {NotionComment} - The transformed comment.
   */
  export const comment = (notionComment: any): NotionComment => {
    return {
      id: notionComment.id,
      type: NotionObjectType.COMMENT,
      parent: notionComment.parent,
      properties: notionComment.properties || {},
      rich_text: notionComment.rich_text,
      createdTime: notionComment.created_time,
      lastEditedTime: notionComment.last_edited_time,
      createdBy: notionComment.created_by,
      lastEditedBy: notionComment.last_edited_by,
      // Comments don't have URLs in the Notion API
      url: `https://www.notion.so/${notionComment.parent.page_id || notionComment.parent.block_id}`,
      publicUrl: null,
      archived: false,
      trashed: false
    };
  };
}
