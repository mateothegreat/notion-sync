import { NotionObject, NotionSDKSearchResultDatabase } from "$lib/notion/types";
import { tskit } from "@mateothegreat/ts-kit";
import path from "path";
import { FileSystemConfig } from "../../infrastructure/filesystem/types";

/**
 * Generate hierarchical path for an object.
 *
 * @TODO: Add naming strategy, etc.
 *
 * @param {NotionObject} obj - The Notion object to generate a path for.
 * @param {string} base - The base path to use.
 *
 * @returns The hierarchical path for the object.
 */
export const hierarchical = ({ obj, base }: { obj: NotionObject; base: string }): string => {
  const parts = obj.type === "database" ? ["databases"] : ["pages"];

  parts.push(obj.id);

  return path.join(base, ...parts);
};

/**
 * Get date-based path
 */
export const dated = ({ date, base, type }: { date: string; base: string; type: string }): string => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");

  return path.join(base, type, year.toString(), month, day);
};

/**
 * Create type-based directory structure
 */
export const typed = async (basePath: string): Promise<void> => {
  const directories = ["databases", "pages", "blocks", "users", "comments"];

  for (const dir of directories) {
    await tskit.fs.ensure(path.join(basePath, dir));
  }
};

export const database = ({
  database,
  basePath,
  config
}: {
  database: NotionSDKSearchResultDatabase;
  basePath: string;
  config: FileSystemConfig;
}): string => {
  switch (config.organizationStrategy) {
    case "flat":
      return basePath;
    case "hierarchical":
      return hierarchical({ obj: database, base: basePath });
    case "by-type":
      return path.join(basePath, "databases");
    case "by-date":
      return dated({ date: database.createdTime, base: basePath, type: "databases" });
    default:
      return path.join(basePath, "databases");
  }
};
