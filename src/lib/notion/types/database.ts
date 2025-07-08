import { NotionObject, NotionObjectType, NotionParent } from "../types";
import { NotionProperty } from "./property";

export class NotionDatabase extends NotionObject {
  public title: string;
  public description: string;
  public properties: Record<string, NotionProperty>;
  public parent: NotionParent;
  public url: string;
  public archived: boolean;

  constructor(data: NotionDatabase) {
    super(data);

    this.type = NotionObjectType.DATABASE;
    this.title = data.title;
    this.description = data.description;
    this.properties = data.properties;
    this.parent = data.parent;
    this.url = data.url;
    this.archived = data.archived;
  }
}
