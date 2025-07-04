import { ObjectInstance } from "./object-instance";

export type DatabaseType = {
  id: string;
  title: string;
  url: string;
  createdTime: string;
  lastEditedTime: string;
};

export class Database extends ObjectInstance<DatabaseType> {
  constructor(value: DatabaseType) {
    super(value);
  }
}
