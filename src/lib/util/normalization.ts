import { NotionDatabase, NotionObject, NotionPage } from "$lib/notion/types";

export enum NamingStrategy {
  ID = "id",
  TITLE = "title",
  SLUG = "slug",
  TIMESTAMP = "timestamp"
}

export const sanitize = (filename: string): string => {
  return filename
    .replace(/[<>:"/\\|?*]/g, "_") // Replace invalid characters
    .replace(/\s+/g, "_") // Replace spaces with underscores
    .replace(/_{2,}/g, "_") // Replace multiple underscores with single
    .replace(/^_|_$/g, "") // Remove leading/trailing underscores
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

export const normalize = (item: NotionObject, namingStrategy: NamingStrategy): string => {
  switch (namingStrategy) {
    case NamingStrategy.ID:
      if (item.type === "database") {
        return (item as NotionDatabase).id;
      } else if (item.type === "page") {
        return (item as NotionPage).id;
      } else {
        return item.id;
      }
    case NamingStrategy.TITLE:
      if (item.type === "database") {
        return sanitize((item as NotionDatabase).title || item.id);
      } else if (item.type === "page") {
        return sanitize((item as NotionPage).title || item.id);
      } else {
        return item.id;
      }
    case NamingStrategy.SLUG:
      if (item.type === "database") {
        return slug((item as NotionDatabase).title || item.id);
      } else if (item.type === "page") {
        return slug((item as NotionPage).title || item.id);
      } else {
        return item.id;
      }
    case NamingStrategy.TIMESTAMP:
      if (item.type === "database") {
        return `${Date.now()}_${sanitize((item as NotionDatabase).title || item.id)}`;
      } else if (item.type === "page") {
        return `${Date.now()}_${sanitize((item as NotionPage).title || item.id)}`;
      } else {
        return item.id;
      }
    default:
      return item.id;
  }
};

export const normalizeDatabase = (database: NotionDatabase, namingStrategy: NamingStrategy): string => {
  return normalize(database, namingStrategy);
};

export const normalizePage = (page: NotionPage, namingStrategy: NamingStrategy): string => {
  return normalize(page, namingStrategy);
};
