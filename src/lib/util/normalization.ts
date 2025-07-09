import { title } from "$notion/transformers";
import { NotionExportableObject } from "$notion/types";
import type { NotionSDKObjectUnion } from "$notion/types/search";
import { log } from "$util/log";

export namespace normalization {
  export enum strategy {
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
  export const normalize = (item: NotionExportableObject, namingStrategy: strategy): string => {
    // Cast to SDK object union type for the title function
    const t = title(item as unknown as NotionSDKObjectUnion);

    log.debug("normalizing", { title: t, item: { id: item.id, title: t }, namingStrategy });

    switch (namingStrategy) {
      case strategy.ID:
        return item.id;
      case strategy.TITLE:
        return sanitize(t);
      case strategy.TITLE_AND_ID:
        log.debugging.inspect("item", { item, santized: sanitize(t) });
        return `${sanitize(t)}-${item.id}`;
      case strategy.SLUG:
        return slug(t);
      case strategy.TIMESTAMP:
        return `${Date.now()}_${sanitize(t)}`;
      default:
        return item.id;
    }
  };
}
