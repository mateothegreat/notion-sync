import { DatabaseObjectResponse } from "@notionhq/client";
import { NotionObject, NotionObjectType } from "./object";
import { NotionParent } from "./parent";
import { NotionProperty } from "./property";

export class NotionDatabase extends NotionObject {
  title: string;
  description: string;
  properties: Record<string, NotionProperty>;
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
