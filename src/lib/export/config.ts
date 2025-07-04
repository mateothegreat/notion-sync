import { InferredFlags } from "@oclif/core/interfaces";
import Export from "src/commands/export";
import { getDateString } from "../util";

/**
 * Configuration options for the workspace exporter.
 */
export class ExporterConfig {
  /**
   * Notion API integration token.
   */
  token?: string;

  /**
   * Directory where exported data will be saved.
   */
  output?: string;

  /**
   * Whether to include archived pages and databases.
   */
  archived?: boolean;

  /**
   * Number of concurrent operations (default: 10).
   */
  concurrency?: number;

  /**
   * Maximum depth for recursive block fetching (default: 10).
   */
  depth?: number;

  /**
   * Whether to include comments on pages.
   */
  comments?: boolean;

  /**
   * Custom rate limit delay in milliseconds (default: 100).
   */
  rate?: number;

  /**
   * Page size for pagination (default: 10).
   */
  size?: number;

  /**
   * Maximum number of retries for failed operations (default: 3).
   */
  retries?: number;

  /**
   * Whether to export page properties separately (default: true).
   */
  properties?: boolean;

  /**
   * Operation timeout in milliseconds (default: 30000).
   */
  timeout?: number;

  constructor(config: InferredFlags<typeof Export.flags> | Partial<ExporterConfig>) {
    this.token = config.token ?? process.env.NOTION_TOKEN;
    this.output = config.output ?? `./notion-export-${getDateString()}`;
    this.archived = config.archived ?? true;
    this.concurrency = config.concurrency ?? 10;
    this.comments = config.comments ?? true;
    this.depth = config.depth ?? 10;
    this.rate = config.rate ?? 100;
    this.size = config.size ?? 10;
    this.retries = config.retries ?? 3;
    this.properties = config.properties ?? true;
    this.timeout = config.timeout ?? 30_000;
  }
}
