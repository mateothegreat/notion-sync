import type { PropertyItemObjectResponse } from "@notionhq/client/build/src/api-endpoints";

/**
 * Utility to extract the 'type' field from union types.
 */
type ExtractPropertyType<T> = T extends { type: infer U } ? U : never;

/**
 * Derives all property types directly from the official Notion client's union type.
 */
export type NotionPropertyType = ExtractPropertyType<PropertyItemObjectResponse>;

/**
 * Creates a more sophisticated type that can be extended with additional metadata.
 */
export type PropertyTypeMap = {
  [K in PropertyItemObjectResponse as K["type"]]: K;
};

/**
 * Uses phantom types to create nominal typing for property types.
 */
export type BrandedPropertyType<T extends NotionPropertyType> = T & { readonly __brand: unique symbol };

/**
 * Useful for creating type-safe property keys and validation.
 */
export type PropertyTypeIdentifier<T extends NotionPropertyType> = `property_${T}`;

/**
 * Maps each property type to its corresponding value structure.
 */
export type PropertyValueType<T extends NotionPropertyType> = T extends keyof PropertyTypeMap
  ? PropertyTypeMap[T] extends { [K in T]: infer V }
    ? V
    : never
  : never;

/**
 * Useful for complex property configurations and validation.
 */
export type DeepPropertyType<T> = T extends object
  ? {
      [K in keyof T]: T[K] extends NotionPropertyType ? PropertyValueType<T[K]> : DeepPropertyType<T[K]>;
    }
  : T;

/**
 * Uses the discriminated union pattern for better type narrowing.
 */
export interface NotionPropertyItem<T extends NotionPropertyType = NotionPropertyType> {
  id?: string;
  type: T;
  object: "property_item" | "list";
  results?: NotionPropertyItem<T>[];
  has_more?: boolean;
  next_cursor?: string | null;
  property_item?: PropertyTypeMap[T] extends { property_item: infer PI } ? PI : never;
}

/**
 * Demonstrates advanced generic constraints and factory patterns.
 */
export type PropertyFactory<T extends NotionPropertyType> = (
  config: Omit<PropertyTypeMap[T], "type" | "object" | "id">
) => PropertyTypeMap[T];

/**
 * Uses const assertions and template literals for optimal type inference.
 */
export const createPropertyTypeGuard = <T extends NotionPropertyType>(
  propertyType: T
): ((item: PropertyItemObjectResponse) => item is PropertyTypeMap[T]) => {
  return (item): item is PropertyTypeMap[T] => item.type === propertyType;
};

/**
 * Validates property structures at compile time.
 */
export type ValidatePropertyStructure<T> = T extends PropertyItemObjectResponse
  ? T["type"] extends NotionPropertyType
    ? T
    : never
  : never;

/**
 * Uses mapped types with key remapping for flexible property manipulation.
 */
export type TransformPropertyType<T extends PropertyItemObjectResponse, U extends string = T["type"]> = {
  [K in keyof T as K extends "type" ? "transformedType" : K]: K extends "type" ? U : T[K];
};

/**
 * Retrieves the title from a Notion object in a type-safe manner.
 *
 * This function checks if the given Notion object is a page or a database,
 * which are the types known to have a title property. If it is, it returns
 * the title. Otherwise, it returns undefined.
 *
 * This function handles both internal application-specific Notion objects
 * and raw API responses from the Notion client.
 *
 * @param item - The Notion object from which to get the title.
 * @returns The title of the object if it's a page or database, otherwise undefined.
 */
export function getTitle(item: any): string | undefined {
  if (!item) {
    return undefined;
  }

  // Handle internal NotionObject types which have a string `title`
  if (typeof item.title === "string" && (item.type === "page" || item.type === "database")) {
    return item.title;
  }

  // Handle Notion API DatabaseObjectResponse
  if (item.object === "database" && item.title && Array.isArray(item.title)) {
    return item.title[0]?.plain_text;
  }

  // Handle Notion API PageObjectResponse
  if (item.object === "page" && item.properties) {
    const titleProp: any = Object.values(item.properties).find((prop: any) => prop.type === "title");
    if (titleProp && titleProp.title && Array.isArray(titleProp.title)) {
      return titleProp.title[0]?.plain_text;
    }
  }

  return undefined;
}
