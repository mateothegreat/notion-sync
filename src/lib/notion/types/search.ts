import type { SearchParameters, SearchResponse } from "@notionhq/client/build/src/api-endpoints";
import { NotionDatabase } from "./database";
import { NotionPage } from "./page";

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
 */
export interface NotionSearchResponse<T> {
  results: Array<NotionDatabase | NotionPage>;
  hasMore: boolean;
  nextCursor?: string;
}
