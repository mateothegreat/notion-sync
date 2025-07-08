import { NotionObject, NotionObjectType } from "./object";
import { NotionParent } from "./parent";

export class NotionPage extends NotionObject {
  title: string;
  properties: Record<string, any>;
  parent: NotionParent;
  cover: any;
  icon: any;
  inTrash: boolean;

  constructor(data: NotionPage) {
    super(data);
    this.type = NotionObjectType.PAGE;
    this.title = data.title;
    this.properties = data.properties;
    this.parent = data.parent;
    this.cover = data.cover;
    this.icon = data.icon;
    this.inTrash = data.inTrash;
  }
}
