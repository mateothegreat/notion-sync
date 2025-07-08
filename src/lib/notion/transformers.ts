import { NotionPropertyType } from "$lib/util/typing";
import { PropertyItemListResponse, PropertyItemObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import { ErrorFactory, NotionError, RateLimitError } from "../../shared/errors/index";
import {
  NotionBlock,
  NotionComment,
  NotionDatabase,
  NotionObjectType,
  NotionPage,
  NotionPropertyItem,
  NotionSDKSearchResultDatabase,
  NotionUser
} from "./types";

const extractTitle = (object: any): string => {
  if (object.properties?.title?.title && Array.isArray(object.properties.title.title)) {
    return object.properties.title.title.map((text: any) => text.plain_text).join("");
  }
  if (object.title && Array.isArray(object.title)) {
    return object.title.map((text: any) => text.plain_text).join("");
  }
  return "Untitled";
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
    if (error instanceof RateLimitError) {
      // It should be caught and thrown as RateLimitError before this
      return new RateLimitError("Rate limit exceeded.", 60) as Error;
    }

    switch (error.code) {
      case "unauthorized":
        return new NotionError("Invalid API key or insufficient permissions.", error);
      case "object_not_found":
        return new NotionError("Object not found.", error);
      case "validation_error":
        return new NotionError("Invalid request parameters.", error);
      case "conflict_error":
        return new NotionError("Conflict with current state.", error);
      case "internal_server_error":
        return new NotionError("Notion internal server error.", error);
      case "service_unavailable":
        return new NotionError("Notion service unavailable.", error);
      case "ECONNRESET":
      case "ENOTFOUND":
      case "ETIMEDOUT":
        return ErrorFactory.fromNetworkError(error) as Error;
      default:
        return ErrorFactory.fromNotionError(error);
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
      title: extractTitle(notionPage),
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
        type: response.type as NotionPropertyType,
        object: "list",
        results: [],
        has_more: response.has_more,
        next_cursor: response.next_cursor,
        property_item: response.property_item
          ? {
              id: response.property_item.id,
              type: response.property_item.type as NotionPropertyType,
              ...response.property_item
            }
          : undefined
      };
    } else {
      // This is a PropertyItemObjectResponse
      const objectResponse = response as PropertyItemObjectResponse;
      return {
        id: objectResponse.id,
        type: objectResponse.type as NotionPropertyType,
        object: "property_item",
        property_item: {
          id: objectResponse.id,
          type: objectResponse.type as NotionPropertyType,
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
      title: extractTitle(notionDatabase),
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
