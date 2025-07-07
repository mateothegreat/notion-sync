import { Flags } from "@oclif/core";
import { Flag } from "@oclif/core/lib/interfaces";
import * as z from "zod/v4";

/**
 * Export-specific configuration properties
 */
export interface ExportConfig {
  /** Output directory path for exported files */
  path: string;
  /** Export format */
  format: "json" | "markdown" | "html" | "csv";
  /** Maximum number of concurrent requests for export */
  maxConcurrency: number;
  /** Include block content in export */
  includeBlocks: boolean;
  /** Include comments in export */
  includeComments: boolean;
  /** Include all properties in export */
  includeProperties: boolean;
  /** Comma-separated list of database IDs to export */
  databases?: string;
  /** Comma-separated list of page IDs to export */
  pages?: string;
}

/**
 * Zod schema for export configuration validation
 */
export const exportConfigSchema = z.object({
  path: z.string().default(`./notion-export-${new Date().toISOString().split("T")[0]}`),
  format: z.enum(["json", "markdown", "html", "csv"]).default("json"),
  maxConcurrency: z.number().min(1).max(50).default(10),
  includeBlocks: z.boolean().default(true),
  includeComments: z.boolean().default(false),
  includeProperties: z.boolean().default(true),
  databases: z.string().optional(),
  pages: z.string().optional()
});

/**
 * Export-specific CLI flags
 */
export const exportFlags: Record<keyof ExportConfig, Flag<any>> = {
  path: Flags.string({
    char: "p",
    description: "Output directory path for exported files.",
    default: `./notion-export-${new Date().toISOString().split("T")[0]}`
  }),
  format: Flags.string({
    char: "f",
    description: "Export format.",
    options: ["json", "markdown", "html", "csv"],
    default: "json"
  }),
  maxConcurrency: Flags.integer({
    description: "Maximum number of concurrent requests for export.",
    default: 10
  }),
  includeBlocks: Flags.boolean({
    description: "Include block content in export.",
    default: true
  }),
  includeComments: Flags.boolean({
    description: "Include comments in export.",
    default: false
  }),
  includeProperties: Flags.boolean({
    description: "Include all properties in export.",
    default: true
  }),
  databases: Flags.string({
    char: "d",
    description: "Comma-separated list of database IDs to export.",
    required: false
  }),
  pages: Flags.string({
    description: "Comma-separated list of page IDs to export.",
    required: false
  })
};

/**
 * Export configuration loader
 */
export class ExportConfigLoader {
  /**
   * Load export-specific configuration
   */
  static async loadExportConfig(flags: Record<string, any>, configFile?: any): Promise<ExportConfig> {
    // Merge config sources with CLI flags taking precedence
    const mergedConfig = {
      ...configFile,
      ...flags
    };

    // Handle the kebab-case to camelCase conversion for CLI flags
    const normalizedConfig = {
      ...mergedConfig,
      maxConcurrency: mergedConfig["max-concurrency"] || mergedConfig.maxConcurrency,
      includeBlocks: mergedConfig["include-blocks"] || mergedConfig.includeBlocks,
      includeComments: mergedConfig["include-comments"] || mergedConfig.includeComments,
      includeProperties: mergedConfig["include-properties"] || mergedConfig.includeProperties
    };

    // Validate and parse with Zod
    const parsed = exportConfigSchema.parse(normalizedConfig);
    return parsed;
  }

  /**
   * Get export CLI flags
   */
  static getExportFlags(): Record<keyof ExportConfig, Flag<any>> {
    return exportFlags;
  }

  /**
   * Get export configuration schema
   */
  static getExportSchema(): typeof exportConfigSchema {
    return exportConfigSchema;
  }
}