import { NotionBlock } from "./block";
import { NotionComment } from "./comment";
import { NotionDatabase } from "./database";
import { NotionPage } from "./page";
import { NotionProperty, NotionPropertyItem } from "./property";
import { NotionUser } from "./user";

export class NotionObject implements NotionExportableObject {
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
  properties: Record<string, NotionPropertyItem>;

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

export type NotionObjectUnion = NotionDatabase | NotionPage | NotionBlock | NotionUser | NotionComment | NotionProperty;

export type NotionExportableObject = NotionObject;
