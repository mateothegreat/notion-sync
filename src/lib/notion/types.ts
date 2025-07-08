export interface NotionQueryResult<T extends NotionObject> {
  results: T[];
  hasMore: boolean;
  nextCursor?: string;
}

export class NotionObject {
  id: string;
  type: NotionObjectType;
  createdTime: string;
  lastEditedTime: string;
  createdBy: NotionUser;
  lastEditedBy: NotionUser;

  constructor(data: NotionObject) {
    Object.assign(this, data);
  }
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

export interface NotionComment extends NotionObject {
  type: NotionObjectType.COMMENT;
  parent: NotionParent;
  rich_text: any[];
}

export interface NotionWorkspace {
  id: string;
  name: string;
  owner: string;
  createdTime: string;
}
