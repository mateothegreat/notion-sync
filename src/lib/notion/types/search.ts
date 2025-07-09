import type {
  DatabaseObjectResponse,
  PageObjectResponse,
  PartialDatabaseObjectResponse,
  PartialPageObjectResponse,
  SearchParameters,
  SearchResponse
} from "@notionhq/client/build/src/api-endpoints";

/**
 * Utility type to extract common properties between two types.
 *
 * @remarks
 * This type automatically determines which properties exist in both types
 * without requiring manual maintenance. It uses TypeScript's built-in
 * utility types to create an intersection of the keys that exist in both types.
 */
type CommonKeys<T, U> = keyof T & keyof U;

/**
 * Base type representing the intersection of common properties shared by all Notion objects.
 *
 * @remarks
 * This type is automatically derived from the intersection of existing library types,
 * ensuring we don't re-implement what's already available in the dependency and
 * don't maintain manual lists of properties. It dynamically extracts only the
 * properties that are guaranteed to exist across all object types.
 */
export type NotionSDKObjectBase = Pick<
  PageObjectResponse & DatabaseObjectResponse,
  CommonKeys<PageObjectResponse, DatabaseObjectResponse>
>;

/**
 * Enhanced union type for Notion SDK objects with improved discrimination capabilities.
 *
 * @remarks
 * This type provides several key improvements over the original:
 * 1. When no type parameter is provided, it returns the full union with access to common properties
 * 2. When a specific type is provided, it returns only objects of that type
 * 3. It maintains compatibility with existing code while adding new flexibility
 *
 * The type uses conditional types and mapped types to provide precise type inference
 * based on the generic parameter, falling back to a discriminated union when no
 * parameter is specified.
 *
 * @typeParam T - Optional discriminator for specific object types. When omitted,
 * returns the full union of all possible object types.
 *
 * @example
 * ```typescript
 * // Access common properties without specifying type
 * const obj: NotionSDKObjectUnion = getNotionObject();
 * console.log(obj.id, obj.created_time); // Always safe
 *
 * // Discriminate to specific type
 * const page: NotionSDKObjectUnion<"page"> = getNotionPage();
 * console.log(page.properties.title); // Type-safe page access
 * ```
 */
export type NotionSDKObjectUnion<T extends "page" | "database" | undefined = undefined> = T extends "page"
  ? PageObjectResponse | PartialPageObjectResponse
  : T extends "database"
  ? DatabaseObjectResponse | PartialDatabaseObjectResponse
  : T extends undefined
  ? NotionSDKObjectDiscriminatedUnion
  : never;

/**
 * A discriminated union of all possible Notion object types with enhanced type safety.
 *
 * @remarks
 * This type serves as the foundation for the enhanced discrimination system.
 * It combines all possible object types into a single union while maintaining
 * the discriminator property (`object`) that enables type narrowing.
 *
 * The union includes both full and partial response types, ensuring compatibility
 * with various API responses while providing type-safe access to common properties.
 */
export type NotionSDKObjectDiscriminatedUnion =
  | (PageObjectResponse & { object: "page" })
  | (PartialPageObjectResponse & { object: "page" })
  | (DatabaseObjectResponse & { object: "database" })
  | (PartialDatabaseObjectResponse & { object: "database" });

/**
 * Type guard function to determine if a Notion object is a page.
 *
 * @param obj - The Notion object to check.
 * @returns True if the object is a page, false otherwise.
 *
 * @example
 * ```typescript
 * const obj: NotionSDKObjectUnion = getNotionObject();
 * if (isNotionPage(obj)) {
 *   // obj is now typed as PageObjectResponse | PartialPageObjectResponse
 *   console.log(obj.properties);
 * }
 * ```
 */
export const isNotionPage = (obj: NotionSDKObjectDiscriminatedUnion): obj is NotionSDKObjectUnion<"page"> => {
  return obj.object === "page";
};

/**
 * Type guard function to determine if a Notion object is a database.
 *
 * @param obj - The Notion object to check.
 * @returns True if the object is a database, false otherwise.
 *
 * @example
 * ```typescript
 * const obj: NotionSDKObjectUnion = getNotionObject();
 * if (isNotionDatabase(obj)) {
 *   // obj is now typed as DatabaseObjectResponse | PartialDatabaseObjectResponse
 *   console.log(obj.title);
 * }
 * ```
 */
export const isNotionDatabase = (obj: NotionSDKObjectDiscriminatedUnion): obj is NotionSDKObjectUnion<"database"> => {
  return obj.object === "database";
};

/**
 * Utility type to extract common properties from any Notion object.
 *
 * @remarks
 * This mapped type provides a way to access only the common properties
 * from any Notion object type, ensuring type safety when working with
 * mixed collections or when the specific object type is unknown.
 *
 * Uses the existing library types to ensure we don't re-implement what's already available.
 */
export type NotionSDKObjectCommon<T extends NotionSDKObjectDiscriminatedUnion> = Pick<
  T,
  CommonKeys<T, NotionSDKObjectBase>
>;

/**
 * Advanced discriminator function that provides type-safe object discrimination.
 *
 * @remarks
 * This function goes beyond simple type guards by providing a fluent API
 * for object discrimination. It returns an object with methods that allow
 * for type-safe access to specific object types while maintaining the
 * original object reference.
 *
 * @param obj - The Notion object to discriminate.
 * @returns An object with discrimination methods and the original object.
 *
 * @example
 * ```typescript
 * const obj: NotionSDKObjectUnion = getNotionObject();
 * const discriminated = discriminateNotionObject(obj);
 *
 * // Access common properties safely
 * console.log(discriminated.common.id);
 *
 * // Type-safe discrimination
 * if (discriminated.isPage()) {
 *   console.log(discriminated.asPage().properties);
 * }
 *
 * // Fluent API for conditional access
 * discriminated.whenPage(page => console.log(page.properties.title));
 * ```
 */
export const discriminateNotionObject = <T extends NotionSDKObjectDiscriminatedUnion>(obj: T) => {
  return {
    /** The original object */
    original: obj,

    /** Common properties accessible on all object types */
    common: obj as NotionSDKObjectCommon<T>,

    /** Check if the object is a page */
    isPage: (): boolean => isNotionPage(obj),

    /** Check if the object is a database */
    isDatabase: (): boolean => isNotionDatabase(obj),

    /** Get the object as a page (throws if not a page) */
    asPage: (): NotionSDKObjectUnion<"page"> => {
      if (!isNotionPage(obj)) {
        throw new Error("Object is not a page");
      }
      return obj;
    },

    /** Get the object as a database (throws if not a database) */
    asDatabase: (): NotionSDKObjectUnion<"database"> => {
      if (!isNotionDatabase(obj)) {
        throw new Error("Object is not a database");
      }
      return obj;
    },

    /** Execute a callback if the object is a page */
    whenPage: (callback: (page: NotionSDKObjectUnion<"page">) => void): void => {
      if (isNotionPage(obj)) {
        callback(obj);
      }
    },

    /** Execute a callback if the object is a database */
    whenDatabase: (callback: (database: NotionSDKObjectUnion<"database">) => void): void => {
      if (isNotionDatabase(obj)) {
        callback(obj);
      }
    },

    /** Transform the object based on its type */
    match: <R>(handlers: {
      page: (page: NotionSDKObjectUnion<"page">) => R;
      database: (database: NotionSDKObjectUnion<"database">) => R;
    }): R => {
      if (isNotionPage(obj)) {
        return handlers.page(obj);
      } else if (isNotionDatabase(obj)) {
        return handlers.database(obj);
      } else {
        throw new Error("Unknown object type");
      }
    }
  };
};

/**
 * Represents the union of all possible object types returned within the `results`
 * array of a Notion API search response.
 *
 * @remarks
 * This type is derived directly from the official `@notionhq/client` library's
 * `SearchResponse` type. By using an indexed access type (`SearchResponse["results"][number]`),
 * we create a direct, robust link to the source of truth. If the Notion SDK updates
 * its response types to include new objects (e.g., a "block" object in the future),
 * this `NotionSearchResultUnion` type will automatically inherit that change without
 * requiring manual updates in this library. This defensive programming practice
 * ensures long-term type safety and maintainability.
 *
 * @see {@link https://www.typescriptlang.org/docs/handbook/2/indexed-access-types.html | Indexed Access Types}
 */
export type NotionSDKSearchResultUnion = SearchResponse["results"][number];

/**
 * A precise type representing only Page objects from a Notion search result.
 *
 * @remarks
 * This type uses the `Extract<Type, Union>` utility type to filter the broad
 * `NotionSearchResultUnion`. It selects only those members of the union that have a
 * discriminator property `object` with the literal value `"page"`. This is the
 * canonical way to work with discriminated unions in TypeScript, providing a safer
 * and more declarative alternative to manual type casting or guards in many scenarios.
 *
 * This includes both full `PageObjectResponse` and `PartialPageObjectResponse`.
 *
 * @see {@link https://www.typescriptlang.org/docs/handbook/utility-types.html#extracttype-union | Extract Utility Type}
 * @see {@link https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions | Discriminated Unions}
 */
export type NotionSDKSearchResultPage = Extract<NotionSDKSearchResultUnion, { object: "page" }>;

/**
 * A precise type representing only Database objects from a Notion search result.
 *
 * @remarks
 * Similar to {@link NotionSDKSearchResultPage}, this type uses the `Extract` utility
 * to filter the `NotionSearchResultUnion`. It selects only those members of the
 * union where the `object` property is the literal value `"database"`.
 *
 * This includes both full `DatabaseObjectResponse` and `PartialDatabaseObjectResponse`.
 */
export type NotionSDKSearchResultDatabase = Extract<NotionSDKSearchResultUnion, { object: "database" }>;

/**
 * A type-level map that translates string literal identifiers to their corresponding
 * Notion object types.
 *
 * @remarks
 * This construct serves as a "dictionary" or "lookup table" at the type level. It
 * provides a clean, maintainable, and scalable way to associate the string values
 * used in the Notion API's filter parameters (e.g., `'page'`) with the complex
 * TypeScript types that represent them (e.g., {@link NotionSDKSearchResultPage}).
 *
 * Using a mapped type like this is a common pattern in advanced TypeScript to avoid
 * complex, nested conditional types, making the logic that uses it (like in
 * {@link FilteredSearchResult}) significantly more readable.
 *
 * @see {@link https://www.typescriptlang.org/docs/handbook/2/mapped-types.html | Mapped Types}
 */
export type NotionSDKObjectMap = {
  page: NotionSDKSearchResultPage;
  database: NotionSDKSearchResultDatabase;
};

/**
 * A conditional type that statically determines the resulting array type based on
 * a user-supplied string literal.
 *
 * @deprecated This type represents a less safe, older pattern. It requires the
 * developer to manually supply a generic argument (`'page'` or `'database'`) which
 * can become desynchronized from the actual runtime parameters. Prefer using
 * {@link FilteredSearchResult} which infers the result type directly from the
 * parameter object's structure for superior type safety.
 *
 * @typeParam T - The type of Notion object to search for. Must be either `'page'` or `'database'`.
 *
 * @example
 * ```typescript
 * // The developer must manually specify the generic, which can lead to errors.
 * const searchResults: SearchResultType<'page'> = someApiCall({ filter: { value: 'database' } });
 * // The type system would not catch the mismatch above!
 * ```
 */
export type NotionSDKSearchResultType<T extends "page" | "database"> = T extends "page"
  ? NotionSDKSearchResultPage[]
  : NotionSDKSearchResultDatabase[];

/**
 * A conditional type that inspects the structure of a `SearchParameters` object
 * and derives the precise type of the objects that will be returned in the `results` array.
 *
 * @remarks
 * This is the core of the type-safe search abstraction. It functions as follows:
 * 1. It checks if the `SearchParameters` type `T` contains a `filter` property
 *    structured as `{ property: 'object', value: ... }`.
 * 2. If it does, it uses the `infer` keyword to capture the type of the `value`
 *    property into a new type variable `V`.
 * 3. It then uses the captured type `V` as a key to look up the corresponding
 *    object type in the {@link NotionSDKObjectMap}.
 * 4. If no such filter is present, or if the `value` is not a recognized key,
 *    it defaults to the broad union of `NotionSearchResultPage | NotionSearchResultDatabase`,
 *    as the API could return either.
 *
 * This pattern allows for zero-runtime-cost type inference, where the return type
 * of a function is determined entirely by the static shape of its arguments.
 *
 * @typeParam T - The specific `SearchParameters` object type passed to the search function.
 *
 * @see {@link https://www.typescriptlang.org/docs/handbook/2/conditional-types.html#inferring-within-conditional-types | Conditional Types with `infer`}
 *
 * @example
 * ```typescript
 * // Scenario 1: The parameters object filters for pages.
 * const pageParams = { filter: { property: "object", value: "page" } as const };
 * // `FilteredSearchResult<typeof pageParams>` resolves to `NotionSearchResultPage`.
 *
 * // Scenario 2: The parameters object filters for databases.
 * const dbParams = { filter: { property: "object", value: "database" } as const };
 * // `FilteredSearchResult<typeof dbParams>` resolves to `NotionSearchResultDatabase`.
 *
 * // Scenario 3: The parameters object has no object filter.
 * const genericParams = { query: "My Project" };
 * // `FilteredSearchResult<typeof genericParams>` resolves to the union:
 * // `NotionSearchResultPage | NotionSearchResultDatabase`.
 * ```
 */
export type NotionFilteredSearchResult<T extends SearchParameters> = T extends {
  filter: { property: "object"; value: infer V };
}
  ? V extends keyof NotionSDKObjectMap
    ? NotionSDKObjectMap[V]
    : NotionSDKSearchResultPage | NotionSDKSearchResultDatabase
  : NotionSDKSearchResultPage | NotionSDKSearchResultDatabase;

/**
 * A fully type-safe `SearchResponse` whose `results` property is precisely tailored
 * to the search parameters provided.
 *
 * @remarks
 * This interface provides type-safe search responses that automatically infer
 * the correct result types based on the search parameters. It includes support
 * for pagination metadata and event dispatching capabilities.
 *
 * @typeParam T - The search parameters type used to infer the result types.
 */
export interface NotionSearchResponse<T extends SearchParameters> {
  results: Array<NotionFilteredSearchResult<T>>;
  hasMore: boolean;
  nextCursor?: string;

  // Event dispatching metadata
  readonly pageInfo?: {
    currentPage: number;
    totalPages?: number;
    pageSize: number;
  };
}

/**
 * Event payload for search result notifications.
 *
 * @remarks
 * This interface defines the structure of events dispatched during search operations.
 * It enables subscribers to receive real-time updates about search progress and results
 * without blocking the main search operation.
 */
export interface NotionSearchEvent<T extends SearchParameters> {
  readonly type: "result" | "page_complete" | "search_complete" | "error";
  readonly data: NotionFilteredSearchResult<T> | NotionFilteredSearchResult<T>[] | Error;
  readonly metadata: {
    readonly pageNumber: number;
    readonly totalResults: number;
    readonly hasMore: boolean;
    readonly cursor?: string;
    readonly timestamp: Date;
  };
}

/**
 * Configuration for search event dispatching.
 *
 * @remarks
 * This interface provides configuration options for controlling how search events
 * are dispatched to subscribers, including batching and throttling options.
 */
export interface NotionSearchEventConfig {
  readonly batchSize?: number;
  readonly throttleMs?: number;
  readonly enableMetrics?: boolean;
}
