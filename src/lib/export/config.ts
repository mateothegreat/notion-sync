import { BaseConfig } from "../config/config";

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
