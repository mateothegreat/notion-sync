import { DatabaseObjectResponse } from "@notionhq/client";
import { NotionObject, NotionObjectType } from "./object";
import { NotionParent } from "./parent";

export class NotionDatabase extends NotionObject {
  title: string;
  description: string;
  icon: DatabaseObjectResponse["icon"];
  cover: DatabaseObjectResponse["cover"];
  isInline: boolean;
  parent: NotionParent;
  constructor(data: NotionDatabase) {
    super(data);
    this.type = NotionObjectType.DATABASE;
    this.title = data.title;
    this.description = data.description;
    this.properties = data.properties;
    this.parent = data.parent;
    this.url = data.url;
    this.archived = data.archived;
    this.icon = data.icon;
    this.cover = data.cover;
    this.isInline = data.isInline;
  }
}
