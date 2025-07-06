import { ObjectType } from "../objects/types";

export class BaseConfig {
  /**
   * Notion API integration token.
   */
  token?: string;

  /**
   * Directory where exported data will be saved.
   */
  output?: string;

  /**
   * Number of concurrent operations (default: 10).
   */
  concurrency?: number;

  /**
   * Maximum depth for recursive block fetching (default: 10).
   */
  depth?: number;

  /**
   * Maximum number of retries for failed operations (default: 3).
   */
  retries?: number;

  /**
   * Operation timeout in milliseconds (default: 30000).
   */
  timeout?: number;

  /**
   * Custom rate limit delay in milliseconds (default: 100).
   */
  rate?: number;

  /**
   * Objects to export.
   */
  objects?: ObjectType[];

  constructor(config: BaseConfig) {
    this.token = config.token;
    this.output = config.output;
    this.concurrency = config.concurrency;
    this.depth = config.depth;
    this.retries = config.retries;
    this.timeout = config.timeout;
    this.rate = config.rate;
    this.objects = config.objects as ObjectType[];
  }
}

/**
 * Configuration options for the workspace exporter.
 */
export class ExporterConfig extends BaseConfig {
  /**
   * Whether to include archived pages and databases.
   */
  archived?: boolean;

  /**
   * Whether to include comments on pages.
   */
  comments?: boolean;

  /**
   * Page size for pagination (default: 10).
   */
  size?: number;

  /**
   * Whether to export page properties separately (default: true).
   */
  properties?: boolean;

  /**
   * Constructor for the ExporterConfig class.
   *
   * @param config - The configuration object.
   */
  constructor(config: ExporterConfig) {
    super(config);
    this.archived = config.archived;
    this.comments = config.comments;
    this.properties = config.properties;
    this.size = config.size;
  }
}
