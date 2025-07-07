/**
 * Notion Utilities
 *
 * Helper functions for working with Notion API data and identifiers.
 */

/**
 * Formats a Notion ID into the standard UUID format (8-4-4-4-12).
 *
 * This utility ensures the input is a valid 32-character hexadecimal string (with or without hyphens)
 * and returns it in canonical UUID form. Throws if the input is not valid.
 *
 * @param notionId - The Notion ID to format (with or without hyphens).
 */
export function toNotionID(notionId: string): string {
  const cleanId = notionId.replace(/-/g, "");
  if (cleanId.length !== 32) {
    throw new Error(`Invalid Notion ID: expected 32 characters, got ${cleanId.length}`);
  }
  return cleanId.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
}
