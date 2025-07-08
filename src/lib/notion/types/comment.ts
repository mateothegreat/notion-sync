import { NotionObject, NotionObjectType } from "./object";
import { NotionParent } from "./parent";

export interface NotionComment extends NotionObject {
  type: NotionObjectType.COMMENT;
  parent: NotionParent;
  rich_text: any[];
}
