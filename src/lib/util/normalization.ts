import { log } from "$lib/log";
import { NotionObject, NotionSDKSearchResultDatabase, NotionSDKSearchResultPage } from "$lib/notion/types";
import { getTitle } from "$lib/util/typing";

export enum NamingStrategy {
  ID = "id",
  TITLE = "title",
  TITLE_AND_ID = "title-and-id",
  SLUG = "slug",
  TIMESTAMP = "timestamp"
}

export const sanitize = (filename: string): string => {
  return filename
    .replace(/[<>:"/\\|?*]/g, "_") // Replace invalid characters
    .replace(/\s+/g, "_") // Replace spaces with underscores
    .replace(/_{2,}/g, "_") // Replace multiple underscores with single
    .replace(/^_|_$/g, "") // Remove leading/trailing underscores
    .replace(/^-|-$/g, "") // Remove leading/trailing hyphens
    .substring(0, 255); // Limit length
};

/**
 * Create URL-friendly slug from title
 */
export const slug = (title: string): string => {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, "") // Remove special characters
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-{2,}/g, "-") // Replace multiple hyphens with single
    .replace(/^-|-$/g, ""); // Remove leading/trailing hyphens
};

/**
 * Normalizes a Notion object to a string based on a naming strategy.
 * It can handle different types of Notion objects, including pages and databases from API responses.
 *
 * @param item - The Notion object to normalize.
 * @param namingStrategy - The strategy to use for naming.
 * @returns The normalized string.
 */
export const normalize = (
  item: NotionObject | NotionSDKSearchResultDatabase | NotionSDKSearchResultPage,
  namingStrategy: NamingStrategy
): string => {
  const title = getTitle(item) || item.id;

  switch (namingStrategy) {
    case NamingStrategy.ID:
      return item.id;
    case NamingStrategy.TITLE:
      return sanitize(title);
    case NamingStrategy.TITLE_AND_ID:
      log.debugging.inspect("item", { item, santized: sanitize(title) });
      return `${sanitize(title)}-${item.id}`;
    case NamingStrategy.SLUG:
      return slug(title);
    case NamingStrategy.TIMESTAMP:
      return `${Date.now()}_${sanitize(title)}`;
    default:
      return item.id;
  }
};

export const normalizeDatabase = (database: NotionSDKSearchResultDatabase, namingStrategy: NamingStrategy): string => {
  return normalize(database, namingStrategy);
};

export const normalizePage = (page: NotionSDKSearchResultPage, namingStrategy: NamingStrategy): string => {
  return normalize(page, namingStrategy);
};
