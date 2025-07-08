export type NotionParentType = "database" | "page" | "block" | "workspace";

export interface NotionParent {
  type: NotionParentType;
  id: string;
}
