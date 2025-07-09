import {
  NotionPropertyType,
  PropertyTypeIdentifier,
  PropertyTypeMap,
  PropertyValueType,
  ValidatePropertyStructure
} from "$util/typing";

export interface NotionProperty {
  id: string;
  name: string;
  type: string;
  config: Record<string, any>;
}

/**
 * Represents a Notion property item with standardized structure.
 * Maps to Notion's PropertyItemObjectResponse union type.
 */
export interface NotionPropertyItem {
  id?: string;
  type: NotionPropertyType | "property_item";
  object: "list" | "page" | "database" | "property_item" | "user" | "workspace";
  results?: NotionPropertyItem[];
  has_more?: boolean;
  next_cursor?: string | null;
  property_item?: {
    id: string;
    type: NotionPropertyType;
    [key: string]: any;
  };
}

/**
 * Utility type for creating property-specific interfaces with enhanced type safety.
 * Demonstrates advanced generic constraints and conditional type composition.
 */
export type NotionPropertySpecificInterface<T extends NotionPropertyType> = {
  propertyType: T;
  value: PropertyValueType<T>;
  metadata: {
    typeIdentifier: PropertyTypeIdentifier<T>;
    isValid: ValidatePropertyStructure<PropertyTypeMap[T]> extends never ? false : true;
  };
};

/**
 * Type composition for creating property collections with type safety.
 */
export type NotionPropertyCollection<T extends readonly NotionPropertyType[]> = {
  [K in T[number] as `${K}Properties`]: PropertyTypeMap[K][];
};

/**
 * Type-safe property selector using template literal types and key mapping.
 */
export type NotionPropertySelector<T extends NotionPropertyType> = `select_${T}` | `filter_${T}` | `sort_${T}`;

/**
 * Error handling type for property validation failures.
 * Uses branded types and discriminated unions for comprehensive error handling.
 */
export type NotionPropertyValidationError<T extends NotionPropertyType> = {
  type: "validation_error";
  propertyType: T;
  message: string;
  code: `INVALID_${Uppercase<T>}_PROPERTY`;
};

/**
 * Polymorphic result type for property operations with better error handling
 * using generic constraints and discriminated union patterns.
 */
export type NotionPropertyOperationResult<T extends NotionPropertyType> =
  | { success: true; data: PropertyTypeMap[T] }
  | { success: false; error: NotionPropertyValidationError<T> };
