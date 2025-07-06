export type ObjectType = "page" | "database" | "block" | "comment" | "file";

export enum ObjectsEnum {
  PAGE = "page",
  DATABASE = "database",
  BLOCK = "block",
  COMMENT = "comment",
  FILE = "file"
}

/**
 * Type-safe mapping of object types to their enum values.
 */
export const NotionObject = {
  PAGE: ObjectsEnum.PAGE,
  DATABASE: ObjectsEnum.DATABASE,
  BLOCK: ObjectsEnum.BLOCK,
  COMMENT: ObjectsEnum.COMMENT,
  FILE: ObjectsEnum.FILE
} as const;

/**
 * Type representing valid Notion object types.
 */
export type NotionObject = (typeof NotionObject)[keyof typeof NotionObject];

export const getObjects = (value: string): NotionObject[] => {
  return value.split(",").map((v) => v.trim() as NotionObject);
};

export const isNotionObject = (object: string): object is NotionObject => {
  return Object.values(NotionObject).includes(object as NotionObject);
};
