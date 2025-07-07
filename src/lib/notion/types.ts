export interface NotionObject {
  id: string;
  type: NotionObjectType;
  createdTime: string;
  lastEditedTime: string;
  createdBy: NotionUser;
  lastEditedBy: NotionUser;
}

export enum NotionObjectType {
  PAGE = "page",
  DATABASE = "database",
  BLOCK = "block",
  USER = "user",
  COMMENT = "comment",
  PROPERTY = "property",
  WORKSPACE = "workspace"
}

export interface NotionUser {
  id: string;
  type: "person" | "bot";
  name?: string;
  avatarUrl?: string;
  email?: string;
}

export interface NotionPage extends NotionObject {
  type: NotionObjectType.PAGE;
  title: string;
  properties: Record<string, any>;
  parent: NotionParent;
  url: string;
  archived: boolean;
}

export interface NotionDatabase extends NotionObject {
  type: NotionObjectType.DATABASE;
  title: string;
  description: string;
  properties: Record<string, NotionProperty>;
  parent: NotionParent;
  url: string;
  archived: boolean;
}

export interface NotionBlock extends NotionObject {
  type: NotionObjectType.BLOCK;
  blockType: string;
  hasChildren: boolean;
  archived: boolean;
  content: Record<string, any>;
}

export interface NotionParent {
  type: "database_id" | "page_id" | "workspace";
  database_id?: string;
  page_id?: string;
}

export interface NotionProperty {
  id: string;
  name: string;
  type: string;
  config: Record<string, any>;
}

export interface NotionComment extends NotionObject {
  type: NotionObjectType.COMMENT;
  parent: NotionParent;
  rich_text: any[];
}

/**
 * Represents a Notion property item with standardized structure.
 * Maps to Notion's PropertyItemObjectResponse union type.
 */
export interface NotionPropertyItem {
  id?: string;
  type: PropertyItemType;
  object: "property_item" | "list";
  results?: NotionPropertyItem[];
  has_more?: boolean;
  next_cursor?: string | null;
  property_item?: {
    id: string;
    type: PropertyItemType;
    [key: string]: any;
  };
}

/**
 * Property types supported by Notion API for property items.
 */
export type PropertyItemType =
  | "property_item"
  | "number"
  | "url"
  | "select"
  | "multi_select"
  | "status"
  | "date"
  | "email"
  | "phone_number"
  | "checkbox"
  | "files"
  | "created_by"
  | "created_time"
  | "last_edited_by"
  | "last_edited_time"
  | "formula"
  | "button"
  | "unique_id"
  | "verification"
  | "title"
  | "rich_text"
  | "people"
  | "relation"
  | "rollup";

export interface NotionWorkspace {
  id: string;
  name: string;
  owner: string;
  createdTime: string;
}
