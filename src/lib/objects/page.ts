import { ObjectInstance } from "./object-instance";

export type PageType = {
  id: string;
  title: string;
  url: string;
  createdTime: string;
  lastEditedTime: string;
};

export class Page extends ObjectInstance<PageType> {
  constructor(value: PageType) {
    super(value);
  }
}
