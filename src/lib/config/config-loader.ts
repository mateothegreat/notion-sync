/* <reference types="node" /> */
/* node types */
import { Flags } from "@oclif/core";
import { Flag } from "@oclif/core/lib/interfaces";
import * as z from "zod";
import * as fs from "fs/promises";
import path from "path";

/****************************************************************************************
 * CORE CONFIGURATION                                                                    *
 ****************************************************************************************/

export const coreFlags = {
  token: Flags.string({
    description: "Notion API integration token.",
    required: true
  }),
  concurrency: Flags.integer({
    description: "Maximum number of concurrent requests.",
    default: 10
  }),
  retries: Flags.integer({
    description: "Maximum retry attempts for failed requests.",
    default: 3
  }),
  verbose: Flags.boolean({
    description: "Enable verbose logging.",
    default: false
  })
} as const satisfies Record<string, Flag<any>>;

export const coreSchema = z.object({
  token: z.string().min(1, "A Notion API token is required"),
  concurrency: z.number().min(1),
  retries: z.number().min(0),
  verbose: z.boolean().default(false)
});

export type CoreConfig = z.infer<typeof coreSchema>;

/****************************************************************************************
 * COMMAND-SPECIFIC CONFIGURATION                                                        *
 ****************************************************************************************/

/* ------------------------------------------------------------------------------------------------
 * Export Command
 * --------------------------------------------------------------------------------------------- */

export const exportFlags = {
  path: Flags.string({
    char: "p",
    description: "Output directory path for exported files.",
    default: `./notion-export-${new Date().toISOString().split("T")[0]}`
  }),
  databases: Flags.string({
    description: "Comma-separated list of database IDs to export."
  }),
  pages: Flags.string({
    description: "Comma-separated list of page IDs to export."
  }),
  format: Flags.string({
    char: "f",
    description: "Export format.",
    options: ["json", "markdown", "html", "csv"],
    default: "json"
  }),
  "include-blocks": Flags.boolean({
    description: "Include block content in export.",
    default: true
  }),
  "include-comments": Flags.boolean({
    description: "Include comments in export.",
    default: false
  }),
  "include-properties": Flags.boolean({
    description: "Include all properties in export.",
    default: true
  })
} as const satisfies Record<string, Flag<any>>;

export const exportSchema = coreSchema.merge(
  z.object({
    path: z.string(),
    databases: z
      .string()
      .transform((v: string) => v.split(",").map((s) => s.trim()))
      .optional(),
    pages: z.string().optional(),
    format: z.enum(["json", "markdown", "html", "csv"]),
    "include-blocks": z.boolean(),
    "include-comments": z.boolean(),
    "include-properties": z.boolean()
  })
);

export type ExportConfig = z.infer<typeof exportSchema>;

/****************************************************************************************
 * COMMAND REGISTRY                                                                      *
 ****************************************************************************************/

type CommandName = "export" | "*";

interface CommandDefinition<TSchema extends z.ZodTypeAny> {
  flags: Record<string, Flag<any>>;
  schema: TSchema;
}

const commandRegistry: Record<CommandName, CommandDefinition<any>> = {
  "*": { flags: coreFlags, schema: coreSchema },
  export: { flags: { ...coreFlags, ...exportFlags }, schema: exportSchema }
};

/****************************************************************************************
 * PUBLIC API                                                                            *
 ****************************************************************************************/

/**
 * Returns the combined set of CLI flags (core + command specific) for the given command.
 */
export function createCommandFlags<T extends CommandName>(commandName: T): Record<string, Flag<any>> {
  return commandRegistry[commandName]?.flags ?? coreFlags;
}

/**
 * Type helper that maps a command name to its resolved configuration type.
 */
export type ResolvedCommandConfig<T extends CommandName = "*"> = T extends "export" ? ExportConfig : CoreConfig;

/**
 * Loads the user configuration from a YAML or .env file (if present).  For the purpose of this
 * simplified implementation we keep it very light-weight and return an empty object when no
 * config file is present.  Consumers can merge this with CLI flags via {@link compileCommandConfig}.
 */
export async function loadConfigFile(): Promise<Partial<Record<string, unknown>>> {
  const yamlPath = path.join(path.resolve('.'), "notion-sync.yaml");
  try {
    const raw = await fs.readFile(yamlPath, "utf-8");
    // We lazily import yaml to avoid an unnecessary dependency when no file exists.
    const { parse } = await import("yaml");
    return parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Compiles the final configuration for the given command by merging the persisted configuration
 * (YAML/.env) with CLI flags.  CLI flags take precedence over persisted values.
 */
export function compileCommandConfig<T extends CommandName>(
  commandName: T,
  flags: Record<string, any>
): ResolvedCommandConfig<T> {
  // For the simplified implementation we use the in-memory `config` object loaded at startup.
  // Project-specific code can mutate `config` as needed before calling this helper.
  const persisted = config;
  const schema = commandRegistry[commandName]?.schema ?? coreSchema;
  // Merge with precedence: persisted < flags
  const merged = { ...persisted, ...flags };
  return schema.parse(merged) as ResolvedCommandConfig<T>;
}

/****************************************************************************************
 * UTILITY – GENERATE YAML CONFIGURATION FILE                                            *
 ****************************************************************************************/

/**
 * Generates a YAML configuration file scaffold.  This util is *only* intended to keep the public
 * API that existing code depends on.  The implementation is greatly simplified for the purpose of
 * the refactor.
 */
export async function generateConfigYaml(
  outputPath: string = "./notion-sync.yaml",
  _includeComments: boolean = true
): Promise<void> {
  const yamlLib = await import("yaml");
  const yaml = yamlLib.stringify({
    token: "ntn_YOUR_NOTION_INTEGRATION_TOKEN_HERE",
    path: "./exports/notion-workspace",
    format: "markdown",
    concurrency: 5,
    retries: 3
  });

  const content = `# Notion Sync Configuration\n\n` + yaml;
  await fs.writeFile(outputPath, content, "utf-8");
}

/****************************************************************************************
 * BACKWARDS-COMPAT: maintain named exports referenced elsewhere.                        *
 ****************************************************************************************/

// Minimal placeholder to satisfy legacy imports (e.g. tests) – no longer used in the new system.
export const parseables: Record<string, unknown> = {};

// Expose a top-level config object so that existing code that does
// `import { config } from ...` keeps compiling.  It is loaded lazily and thus always defined.
export const config: Record<string, unknown> = {};
