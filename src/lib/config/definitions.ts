import { Exporter } from "$export/exporters/exporter";
import { normalization } from "$util/normalization";
import { organization } from "$util/organization";
import { Flags } from "@oclif/core";
import { Flag } from "@oclif/core/lib/interfaces";
import { z } from "zod";

// @mark Command Configuration Definitions

export interface Database {
  name: string;
  id: string;
}

export interface Page {
  name: string;
  id: string;
}

/**
 * Configuration options for command-line flags and configuration parsing.
 */
export interface ConfigOption {
  /** The name of the configuration option. */
  name: string;
  /** Alternative names that can be used for this configuration option. */
  variants: string[];
  /** List of commands that this configuration option applies to. Use "*" for all commands. */
  commands: string[];
  /** The oclif flag definition for this configuration option. */
  flag: Flag<any>;
  /** A function that returns the Zod schema for validating this configuration option. */
  schema: () => z.ZodType<any>;
  /** Whether to enable debug logging for this configuration option. */
  debug?: boolean;
}

// Helper to ensure each definition conforms to ConfigOption while preserving exact keys
const createDefinitions = <T extends Record<string, ConfigOption>>(defs: T): T => defs;

export const definitions = createDefinitions({
  /**
   * Flags that are available to all commands.
   */
  flush: {
    name: "flush",
    variants: ["FLUSH", "flush"],
    commands: ["*"],
    flag: Flags.boolean({
      description: "Flush stdout after each log instead of updating in place.",
      default: false
    }),
    schema: () => z.boolean()
  },
  timeout: {
    name: "timeout",
    variants: ["TIMEOUT", "timeout"],
    commands: ["*"],
    flag: Flags.integer({
      description: "Max run time in seconds.",
      default: 0
    }),
    schema: () => z.number()
  },
  token: {
    name: "token",
    variants: ["NOTION_TOKEN", "token"],
    commands: ["*"],
    flag: Flags.string({
      description: "Notion API integration token."
    }),
    schema: () =>
      z.string().refine((value) => /^secret_[a-zA-Z0-9]{43}$/.test(value) || /^ntn_[a-zA-Z0-9]{46}$/.test(value), {
        message: "Invalid Notion API token format."
      })
  },
  verbose: {
    name: "verbose",
    variants: ["VERBOSE", "verbose"],
    commands: ["*"],
    flag: Flags.boolean({
      char: "v",
      description: "Enable verbose logging.",
      default: false
    }),
    schema: () => z.boolean()
  },
  concurrency: {
    name: "concurrency",
    variants: ["CONCURRENCY", "concurrency"],
    commands: ["*"],
    flag: Flags.integer({
      description: "Maximum number of concurrent requests.",
      default: 10
    }),
    schema: () => z.number()
  },
  retries: {
    name: "retries",
    variants: ["RETRIES", "retries"],
    commands: ["*"],
    flag: Flags.integer({
      description: "Maximum number of retries.",
      default: 3
    }),
    schema: () => z.number()
  },
  "naming-strategy": {
    name: "naming-strategy",
    variants: ["NAMING_STRATEGY", "naming-strategy"],
    commands: ["export"],
    flag: Flags.string({
      description: "Naming strategy for exported files.",
      default: normalization.strategy.ID
    }),
    schema: () => z.nativeEnum(normalization.strategy)
  },
  "organization-strategy": {
    name: "organization-strategy",
    variants: ["ORGANIZATION_STRATEGY", "organization-strategy"],
    commands: ["export"],
    flag: Flags.string({
      description: "Organization strategy for exported files.",
      default: organization.strategy.TYPE
    }),
    schema: () => z.nativeEnum(organization.strategy)
  },

  /**
   * Export specific flags.
   */
  path: {
    name: "path",
    variants: ["PATH", "path"],
    commands: ["export"],
    flag: Flags.string({
      char: "p",
      description: "Output directory path for exported files.",
      default: `./notion-export-${new Date().toISOString().split("T")[0]}`
    }),
    schema: () => z.string()
  },
  databases: {
    name: "databases",
    variants: ["DATABASES", "databases"],
    commands: ["export"],
    flag: Flags.custom<Array<Database>>({
      char: "d",
      description:
        "Comma-separated list of database IDs to export. Can be provided as comma-separated IDs or configured in config file.",
      parse: async (input) => {
        return input.split(",").map((id) => ({ name: "", id: id.trim() }));
      }
    })(),
    schema: () => z.array(z.object({ name: z.string(), id: z.string() }))
  },
  pages: {
    name: "pages",
    variants: ["PAGES", "pages"],
    commands: ["export"],
    flag: Flags.custom<Array<Page>>({
      char: "p",
      description: "Comma-separated list of page IDs to export.",
      parse: async (input) => {
        return input.split(",").map((id) => ({ name: "", id: id.trim() }));
      }
    })(),
    schema: () => z.array(z.object({ name: z.string(), id: z.string() })).optional()
  },
  format: {
    name: "format",
    variants: ["FORMAT", "format"],
    commands: ["export"],
    flag: Flags.custom<Exporter>({
      char: "f",
      description: "Export format.",
      options: Object.values(Exporter)
    })(),
    schema: () => z.nativeEnum(Exporter)
  },
  "max-concurrency": {
    name: "max-concurrency",
    variants: ["MAX_CONCURRENCY", "max-concurrency"],
    commands: ["export"],
    flag: Flags.integer({
      description: "Maximum number of concurrent requests for export.",
      default: 10
    }),
    schema: () => z.number()
  },
  "include-archived": {
    name: "include-archived",
    variants: ["INCLUDE_ARCHIVED", "include-archived"],
    commands: ["export"],
    flag: Flags.boolean({
      description: "Include archived content in export.",
      default: false
    }),
    schema: () => z.boolean()
  },
  "include-blocks": {
    name: "include-blocks",
    variants: ["INCLUDE_BLOCKS", "include-blocks"],
    commands: ["export"],
    flag: Flags.boolean({
      description: "Include block content in export.",
      default: true
    }),
    schema: () => z.boolean()
  },
  "include-comments": {
    name: "include-comments",
    variants: ["INCLUDE_COMMENTS", "include-comments"],
    commands: ["export"],
    flag: Flags.boolean({
      description: "Include comments in export.",
      default: false
    }),
    schema: () => z.boolean()
  },
  "include-properties": {
    name: "include-properties",
    variants: ["INCLUDE_PROPERTIES", "include-properties"],
    commands: ["export"],
    flag: Flags.boolean({
      description: "Include all properties in export.",
      default: true
    }),
    schema: () => z.boolean()
  },
  exporters: {
    name: "exporters",
    variants: ["EXPORTERS", "exporters"],
    commands: ["export"],
    flag: Flags.custom<Array<Exporter>>({
      char: "e",
      description: "Comma-separated list of exporters to use for export.",
      parse: async (input) => {
        return input.split(",").map((id) => id.trim());
      }
    })(),
    schema: () => z.array(z.nativeEnum(Exporter))
  }
});
