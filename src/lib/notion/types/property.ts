export interface NotionProperty {
  id: string;
  name: string;
  type: string;
  config: Record<string, any>;
}

/**
 * Represents a Notion property item with standardized structure.
 * Maps to Notion's PropertyItemObjectResponse union type.
 */
export interface NotionPropertyItem {
  id?: string;
  type: NotionPropertyItemType;
  object: "property_item" | "list";
  results?: NotionPropertyItem[];
  has_more?: boolean;
  next_cursor?: string | null;
  property_item?: {
    id: string;
    type: NotionPropertyItemType;
    [key: string]: any;
  };
}

/**
 * Property types supported by Notion API for property items.
 */
export type NotionPropertyItemType =
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
