import { ObjectType } from "$lib/objects/types";

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
