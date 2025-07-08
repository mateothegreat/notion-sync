/**
 * Generic query result interface for paginated responses.
 *
 * @typeParam T - The type of objects in the results array
 */
export interface NotionQueryResult<T> {
  results: T[];
  hasMore: boolean;
  nextCursor?: string;
}
