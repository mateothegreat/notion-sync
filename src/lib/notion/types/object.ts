import { NotionUser } from "./user";

export class NotionObject {
  id: string;
  type: NotionObjectType;
  createdTime: string;
  lastEditedTime: string;
  createdBy: NotionUser;
  lastEditedBy: NotionUser;
  url: string;
  publicUrl: string | null;
  archived: boolean;
  trashed: boolean;

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
