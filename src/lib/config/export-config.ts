import { Flags } from "@oclif/core";
import { z } from "zod";

/**
 * Export command specific configuration schema
 */
export const exportConfigSchema = z.object({
  path: z.string().default(`./notion-export-${new Date().toISOString().split("T")[0]}`),
  databases: z.array(z.object({
    name: z.string(),
    id: z.string()
  })).optional(),
  pages: z.string().optional(),
  format: z.enum(["json", "markdown", "html", "csv"] as const).default("json"),
  "max-concurrency": z.number().int().positive().default(10),
  "include-blocks": z.boolean().default(true),
  "include-comments": z.boolean().default(false),
  "include-properties": z.boolean().default(true),
  output: z.string().optional() // Legacy alias for path
});

/**
 * Export configuration type inferred from the schema
 */
export type ExportConfig = z.infer<typeof exportConfigSchema>;

/**
 * Export-specific flags for oclif
 */
export const exportFlags = {
  path: Flags.string({
    char: "p",
    description: "Output directory path for exported files.",
    default: `./notion-export-${new Date().toISOString().split("T")[0]}`,
    env: "EXPORT_PATH"
  }),
  databases: Flags.custom<Array<{ name: string; id: string }>>({
    char: "d",
    description: "Comma-separated list of database IDs to export. Can be provided as comma-separated IDs or configured in config file.",
    parse: async (input: string) => {
      // Parse comma-separated database IDs
      return input.split(",").map((id: string) => ({ name: "", id: id.trim() }));
    },
    env: "EXPORT_DATABASES"
  })(),
  pages: Flags.string({
    description: "Comma-separated list of page IDs to export.",
    parse: async (input: string) => input,
    env: "EXPORT_PAGES"
  }),
  format: Flags.custom<"json" | "markdown" | "html" | "csv">({
    char: "f",
    description: "Export format.",
    options: ["json", "markdown", "html", "csv"],
    default: "json",
    env: "EXPORT_FORMAT",
    parse: async (input: string) => {
      const validFormats = ["json", "markdown", "html", "csv"];
      if (!validFormats.includes(input)) {
        throw new Error(`Invalid format: ${input}. Must be one of: ${validFormats.join(", ")}`);
      }
      return input as "json" | "markdown" | "html" | "csv";
    }
  })(),
  "max-concurrency": Flags.integer({
    description: "Maximum number of concurrent requests for export.",
    default: 10,
    env: "EXPORT_MAX_CONCURRENCY"
  }),
  "include-blocks": Flags.boolean({
    description: "Include block content in export.",
    default: true,
    env: "EXPORT_INCLUDE_BLOCKS"
  }),
  "include-comments": Flags.boolean({
    description: "Include comments in export.",
    default: false,
    env: "EXPORT_INCLUDE_COMMENTS"
  }),
  "include-properties": Flags.boolean({
    description: "Include all properties in export.",
    default: true,
    env: "EXPORT_INCLUDE_PROPERTIES"
  }),
  output: Flags.string({
    description: "Output directory (alias for --path).",
    default: `./notion-export-${new Date().toISOString().split("T")[0]}`,
    env: "EXPORT_OUTPUT"
  })
};

/**
 * Load export-specific configuration from various sources
 * Priority: CLI flags > Environment variables > Config file
 */
export async function loadExportConfig(flags?: Partial<ExportConfig>): Promise<ExportConfig> {
  let config: Partial<ExportConfig> = {};

  // Load from YAML config file if available (handled by base config loader)
  // For now, we'll just use flags and environment variables
  
  // Apply defaults from schema
  const defaultConfig = exportConfigSchema.parse({});
  config = { ...defaultConfig };

  // Override with environment variables
  const envConfig: Partial<ExportConfig> = {};
  if (process.env.EXPORT_PATH) envConfig.path = process.env.EXPORT_PATH;
  if (process.env.EXPORT_PAGES) envConfig.pages = process.env.EXPORT_PAGES;
  if (process.env.EXPORT_FORMAT) envConfig.format = process.env.EXPORT_FORMAT as any;
  if (process.env.EXPORT_MAX_CONCURRENCY) envConfig["max-concurrency"] = parseInt(process.env.EXPORT_MAX_CONCURRENCY, 10);
  if (process.env.EXPORT_INCLUDE_BLOCKS) envConfig["include-blocks"] = process.env.EXPORT_INCLUDE_BLOCKS === 'true';
  if (process.env.EXPORT_INCLUDE_COMMENTS) envConfig["include-comments"] = process.env.EXPORT_INCLUDE_COMMENTS === 'true';
  if (process.env.EXPORT_INCLUDE_PROPERTIES) envConfig["include-properties"] = process.env.EXPORT_INCLUDE_PROPERTIES === 'true';
  if (process.env.EXPORT_OUTPUT) envConfig.output = process.env.EXPORT_OUTPUT;

  config = { ...config, ...envConfig };

  // Override with CLI flags
  if (flags) {
    config = { ...config, ...flags };
  }

  // If output is provided but not path (and path wasn't set from environment), use output as path
  if (config.output && !flags?.path && !process.env.EXPORT_PATH) {
    config.path = config.output;
  }

  // Validate and return
  return exportConfigSchema.parse(config);
}