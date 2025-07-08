import { PropertyItemListResponse, PropertyItemObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import { ErrorFactory, NotionApiError, RateLimitError } from "../../shared/errors/index";
import {
  NotionBlock,
  NotionComment,
  NotionDatabase,
  NotionObjectType,
  NotionPage,
  NotionPropertyItem,
  NotionUser,
  PropertyItemType
} from "./types";

export namespace transformers {
  /**
   * Transform a Notion API error into our internal format.
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

    /**
     * Using optional chaining and providing default values to handle cases
     * where error properties are not defined.
     */
    const code = error?.code || "UNKNOWN_ERROR";

    switch (code) {
      case "unauthorized":
        return new NotionApiError("invalid API key or insufficient permissions.", code);
      case "object_not_found":
        return new NotionApiError("object not found.", code);
      case "validation_error":
        return new NotionApiError("invalid request parameters.", code);
      case "conflict_error":
        return new NotionApiError("conflict with current state.", code);
      case "internal_server_error":
        return new NotionApiError("notion internal server error.", code);
      case "service_unavailable":
        return new NotionApiError("notion service unavailable.", code);
      case "ECONNRESET":
      case "ENOTFOUND":
      case "ETIMEDOUT":
        return ErrorFactory.fromNetworkError(error);
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
    return {
      id: notionPage.id,
      type: NotionObjectType.PAGE,
      title: notionPage.title,
      properties: notionPage.properties || {},
      parent: notionPage.parent,
      url: notionPage.url,
      archived: notionPage.archived || false,
      createdTime: notionPage.created_time,
      lastEditedTime: notionPage.last_edited_time,
      createdBy: notionPage.created_by,
      lastEditedBy: notionPage.last_edited_by
    };
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
        type: response.type as PropertyItemType,
        object: "list",
        results: response.results || [],
        has_more: response.has_more,
        next_cursor: response.next_cursor,
        property_item: response.property_item
          ? {
              id: response.property_item.id,
              type: response.property_item.type as PropertyItemType,
              ...response.property_item
            }
          : undefined
      };
    } else {
      // This is a PropertyItemObjectResponse
      const objectResponse = response as PropertyItemObjectResponse;
      return {
        id: objectResponse.id,
        type: objectResponse.type as PropertyItemType,
        object: "property_item",
        property_item: {
          id: objectResponse.id,
          type: objectResponse.type as PropertyItemType,
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
   * @returns {NotionDatabase} - The transformed database.
   */
  export const database = (notionDatabase: any): NotionDatabase => {
    return new NotionDatabase({
      id: notionDatabase.id,
      type: NotionObjectType.DATABASE,
      title: notionDatabase.title,
      description: notionDatabase.description,
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
      lastEditedBy: notionBlock.last_edited_by
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
      lastEditedBy: notionComment.last_edited_by
    };
  };
}
