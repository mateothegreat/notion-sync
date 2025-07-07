import { Flags } from "@oclif/core";
import { Flag } from "@oclif/core/lib/interfaces";
import * as fs from "fs/promises";
import path from "path";
import * as yaml from "yaml";
import { dotEnvAdapter } from "zod-config/dotenv-adapter";
import { yamlAdapter } from "zod-config/yaml-adapter";
import * as z4 from "zod/v4";
import { log } from "../log";

/**
 * Configuration options for command-line flags and configuration parsing.
 */
export type ConfigOptions = {
  /** The name of the configuration option. */
  name: string;
  /** Alternative names that can be used for this configuration option. */
  variants: string[];
  /** List of commands that this configuration option applies to. Use "*" for all commands. */
  commands: string[];
  /** The oclif flag definition for this configuration option. */
  flag: Flag<any>;
  /** A function that returns the Zod schema for validating this configuration option. */
  schema: () => z4.ZodType<any>;
  /** Whether to enable debug logging for this configuration option. */
  debug?: boolean;
};

export type Config = z4.infer<ReturnType<typeof createConfigSchema>>;

export type ConfigType = CommandFlagKeys<"export">;

export const parseables: { [key: string]: ConfigOptions } = {
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
    schema: () => z4.boolean()
  },
  timeout: {
    name: "timeout",
    variants: ["TIMEOUT", "timeout"],
    commands: ["*"],
    flag: Flags.integer({
      description: "Max run time in seconds.",
      default: 0
    }),
    schema: () => z4.number()
  },
  token: {
    name: "token",
    variants: ["notion_token", "token"],
    commands: ["*"],
    flag: Flags.string({
      description: "Notion API integration token."
      // required: true
    }),
    schema: () =>
      z4.string().refine((value) => /^ntn_[a-zA-Z0-9]{46}$/.test(value), {
        message:
          "The notion api token must be a 50 character string (i.e. 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)"
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
    schema: () => z4.boolean()
  },
  concurrency: {
    name: "concurrency",
    variants: ["CONCURRENCY", "concurrency"],
    commands: ["*"],
    flag: Flags.integer({
      description: "Maximum number of concurrent requests.",
      default: 10
    }),
    schema: () => z4.number()
  },
  retries: {
    name: "retries",
    variants: ["RETRIES", "retries"],
    commands: ["*"],
    flag: Flags.integer({
      description: "Maximum number of retries.",
      default: 3
    }),
    schema: () => z4.number()
  },

  /**
   * Export specific flags.
   */
  path: {
    name: "path",
    variants: ["path"],
    commands: ["export"],
    flag: Flags.string({
      char: "p",
      description: "Output directory path for exported files.",
      default: `./notion-export-${new Date().toISOString().split("T")[0]}`
    }),
    schema: () => z4.string()
  },
  databases: {
    name: "databases",
    variants: ["databases"],
    commands: ["export"],
    flag: Flags.custom<Array<{ name: string; id: string }>>({
      char: "d",
      description:
        "Comma-separated list of database IDs to export. Can be provided as comma-separated IDs or configured in config file.",
      parse: async (input) => {
        // Parse comma-separated database IDs
        return input.split(",").map((id) => ({ name: "", id: id.trim() }));
      }
    })(),
    schema: () => z4.array(z4.object({ name: z4.string(), id: z4.string() })).optional()
  },
  pages: {
    name: "pages",
    variants: ["pages"],
    commands: ["export"],
    flag: Flags.string({
      description: "Comma-separated list of page IDs to export.",
      parse: async (input) => input
    }),
    schema: () => z4.string().optional()
  },
  format: {
    name: "format",
    variants: ["format"],
    commands: ["export"],
    flag: Flags.string({
      char: "f",
      description: "Export format.",
      options: ["json", "markdown", "html", "csv"],
      default: "json"
    }),
    schema: () => z4.enum(["json", "markdown", "html", "csv"])
  },
  "max-concurrency": {
    name: "max-concurrency",
    variants: ["max-concurrency"],
    commands: ["export"],
    flag: Flags.integer({
      description: "Maximum number of concurrent requests for export.",
      default: 10
    }),
    schema: () => z4.number()
  },
  "include-blocks": {
    name: "include-blocks",
    variants: ["include-blocks"],
    commands: ["export"],
    flag: Flags.boolean({
      description: "Include block content in export.",
      default: true
    }),
    schema: () => z4.boolean()
  },
  "include-comments": {
    name: "include-comments",
    variants: ["include-comments"],
    commands: ["export"],
    flag: Flags.boolean({
      description: "Include comments in export.",
      default: false
    }),
    schema: () => z4.boolean()
  },
  "include-properties": {
    name: "include-properties",
    variants: ["include-properties"],
    commands: ["export"],
    flag: Flags.boolean({
      description: "Include all properties in export.",
      default: true
    }),
    schema: () => z4.boolean()
  },

  /**
   * Legacy output flag (maps to path for export command).
   */
  output: {
    name: "output",
    variants: ["OUTPUT", "output"],
    commands: ["export"],
    flag: Flags.string({
      description: "Output directory (alias for --path).",
      default: `./notion-export-${new Date().toISOString().split("T")[0]}`
    }),
    schema: () => z4.string()
  }
};

export type ExportConfig = ResolvedCommandConfig<"export">;
export const exportConfigSchema = createCommandConfigSchema("export");

export type ExportPropertyTypes = {
  [K in keyof ExportConfig]: ExportConfig[K];
};

const a: ExportConfig = {
  // format: "string",
  // "max-concurrency": "number",
  // "include-blocks": "boolean",
  // "include-comments": "boolean",
  // "include-properties": "boolean"
};

// ================================================================
// Command-Specific Flag Extraction Types and Functions
// ================================================================

/**
 * Extract flag names that are available for a specific command.
 * This creates a proper mapped type instead of a string union.
 */
type ExtractFlagKeysForCommand<TCommand extends string> = {
  [K in keyof typeof parseables]: (typeof parseables)[K]["commands"] extends readonly string[]
    ? "*" extends (typeof parseables)[K]["commands"][number]
      ? K
      : TCommand extends (typeof parseables)[K]["commands"][number]
      ? K
      : never
    : never;
};

/**
 * Type for command-specific flags object.
 * This creates a proper mapped type using the extracted keys.
 */
export type CommandFlags<TCommand extends string> = {
  [K in keyof ExtractFlagKeysForCommand<TCommand> as ExtractFlagKeysForCommand<TCommand>[K] extends never
    ? never
    : K]: (typeof parseables)[K]["flag"];
};

/**
 * Type for inferring the keys that will be available for a command.
 * This extracts only the non-never keys from the mapped type.
 */
export type CommandFlagKeys<TCommand extends string> = keyof {
  [K in keyof ExtractFlagKeysForCommand<TCommand> as ExtractFlagKeysForCommand<TCommand>[K] extends never
    ? never
    : K]: true;
};

/**
 * Type for the resolved configuration that combines all available flags for a command.
 * This creates a proper object type with all the flag values.
 */
export type ResolvedCommandConfig<TCommand extends string> = {
  [K in CommandFlagKeys<TCommand>]: K extends keyof typeof parseables
    ? z4.infer<ReturnType<(typeof parseables)[K]["schema"]>>
    : never;
};

/**
 * Extracts flags available for a specific command.
 *
 * @param commandName - The name of the command to extract flags for
 * @returns Object containing only the flags available for the specified command
 */
export function createCommandFlags<TCommand extends string>(commandName: TCommand): CommandFlags<TCommand> {
  const commandFlags: Record<string, Flag<any>> = {};

  for (const [flagKey, flagConfig] of Object.entries(parseables)) {
    const isGlobalFlag = flagConfig.commands.includes("*");
    const isCommandFlag = flagConfig.commands.includes(commandName);

    if (isGlobalFlag || isCommandFlag) {
      commandFlags[flagKey] = flagConfig.flag;
    }
  }

  return commandFlags as CommandFlags<TCommand>;
}

/**
 * Creates a command-specific configuration schema.
 *
 * @param commandName - The name of the command to create the schema for
 * @returns A Zod schema that includes only the flags available for the specified command
 */
export function createCommandConfigSchema<TCommand extends string>(commandName: TCommand) {
  const schema: Record<string, z4.ZodType<any>> = {};

  for (const [flagKey, flagConfig] of Object.entries(parseables)) {
    const isGlobalFlag = flagConfig.commands.includes("*");
    const isCommandFlag = flagConfig.commands.includes(commandName);

    if (isGlobalFlag || isCommandFlag) {
      if (flagConfig.debug) {
        schema[flagKey] = z4.preprocess((value) => {
          log.debug("Config inspection", { name: flagKey, value });
          return value;
        }, flagConfig.schema().optional());
      } else {
        schema[flagKey] = flagConfig.schema().optional();
      }
    }
  }

  return z4.object(schema);
}

/**
 * Compiles configuration for a specific command, combining config file, environment variables, and CLI flags.
 *
 * @param commandName - The name of the command
 * @param flags - CLI flags provided by the user
 * @returns Compiled configuration object with proper typing
 */
export function compileCommandConfig<TCommand extends string>(
  commandName: TCommand,
  flags: Record<string, any>
): ResolvedCommandConfig<TCommand> {
  const commandSchema = createCommandConfigSchema(commandName);

  // Merge config sources with proper precedence
  const mergedConfig = {
    ...config,
    ...flags
  };

  // Validate and parse the configuration
  const validatedConfig = commandSchema.parse(mergedConfig);

  return validatedConfig as ResolvedCommandConfig<TCommand>;
}

/**
 * Creates a complete schema object based on the parseables configuration.
 *
 * @returns A Zod schema that includes all possible input variations
 */
export const createConfigSchema = () => {
  const schema: Record<string, z4.ZodType<any>> = {};

  // Create schema entries for ALL possible input variations.
  for (const name in parseables) {
    for (const variant of parseables[name].variants) {
      if (parseables[name].debug) {
        schema[name] = z4.preprocess((value) => {
          log.debug("Config inspection", { name, value });
          return value;
        }, parseables[name].schema().optional());
      } else {
        schema[name] = parseables[name].schema().optional();
      }
    }
  }

  return z4.object(schema);
};

/**
 * Loads the config from the environment variables or the config file.
 *
 * @remarks
 * This is a workaround to load the config from the environment variables
 * or the config file.
 *
 * The root cause is:
 * - ESM Module Type: This project is configured as "type": "module" in
 *   package.json, which means everything is treated as ESM modules.
 * - Hook Compilation Path: The oclif configuration points to "./dist/hooks/preparse"
 *   but hooks need to be compiled to JavaScript first, and the compiled version may have module resolution issues.
 * - External Package Import: The zod-config package may not be fully compatible with ESM or may have circular
 *   dependencies that cause issues during hook execution.
 * - Hooks are not compiled to JavaScript: The hooks are not compiled to JavaScript, so the import statements are
 *   not resolved correctly.
 *
 * @returns The config object.
 */
export const loadConfig = async (): Promise<Config> => {
  try {
    const { loadConfigSync } = await import("zod-config");
    const { envAdapter } = await import("zod-config/env-adapter");

    const schema = createConfigSchema();

    const loadedConfig = loadConfigSync({
      schema,
      adapters: [
        // YAML file is read first.
        // .env file is read second.
        yamlAdapter({
          path: path.join(process.cwd(), "notion-sync.yaml")
        }),
        dotEnvAdapter({
          path: path.join(process.cwd(), ".env")
        }),
        // Environment variables are read last (highest precedence - will override YAML and .env)
        envAdapter({
          customEnv: process.env
        })
      ]
    });

    return loadedConfig;
  } catch (error) {
    log.error("Config loading failed, falling back to environment variables:", error);
    throw error;
  }
};

export const config = await loadConfig();

/**
 * Creates a flag that uses config values as defaults when the flag is not provided.
 *
 * @param flag - The key in the resolved config object
 * @param value - The default value
 * @returns The configured flag
 */
export function resolveFlags(flags: Record<string, any>): Record<string, any> {
  return flags;
}

export const compileConfig = (flags: Record<string, any>) => {
  return {
    ...config,
    ...flags
  };
};

/**
 * Generates example values based on the Zod schema type.
 *
 * This function intelligently creates realistic example values based on the schema type
 * and the flag name. It handles various Zod types including boolean, number, string,
 * enum, and array types.
 *
 * @param schema - The Zod schema to generate an example for.
 * @param flagConfig - The flag configuration containing metadata about the flag.
 * @returns An example value appropriate for the schema type and flag purpose.
 *
 * @example
 * // For a boolean flag named "verbose"
 * generateExampleValue(z.boolean(), { name: "verbose", ... }) // returns true
 *
 * // For a string flag named "token"
 * generateExampleValue(z.string(), { name: "token", ... }) // returns "ntn_abc123..."
 */
function generateExampleValue(schema: z4.ZodType<any>, flagConfig: ConfigOptions): any {
  // Get the inner type if it's optional
  const innerSchema = schema instanceof z4.ZodOptional ? schema._def.innerType : schema;

  if (innerSchema instanceof z4.ZodBoolean) {
    // Return true for features that are typically enabled
    return flagConfig.name.includes("include") || flagConfig.name === "verbose" ? true : false;
  }

  if (innerSchema instanceof z4.ZodNumber) {
    // Generate meaningful numbers based on the flag name
    if (flagConfig.name.includes("concurrency")) {
      return 5; // Reasonable concurrency for most use cases
    }
    if (flagConfig.name === "timeout") {
      return 300; // 5 minutes in seconds
    }
    if (flagConfig.name === "retries") {
      return 3; // Standard retry count
    }
    return 10; // Default for other numbers
  }

  if (innerSchema instanceof z4.ZodString) {
    // Generate meaningful strings based on the flag name
    if (flagConfig.name === "token") {
      // Generate a valid-looking Notion token
      const randomChars = Array.from({ length: 46 }, () => Math.random().toString(36).charAt(2)).join("");
      return `ntn_${randomChars}`;
    }
    if (flagConfig.name === "path" || flagConfig.name === "output") {
      return "./exports/notion-workspace";
    }
    if (flagConfig.name === "pages") {
      return "550e8400-e29b-41d4-a716-446655440000,6ba7b810-9dad-11d1-80b4-00c04fd430c8";
    }
    return "example-value";
  }

  if (innerSchema instanceof z4.ZodEnum) {
    // Return a meaningful enum value based on the flag name
    if (flagConfig.name === "format") {
      return "markdown"; // Popular export format
    }
    // For other enums, return a default based on the schema definition
    try {
      // Try to parse a sample value to get the allowed values
      const allowedValues = (innerSchema as any).options || [];
      return allowedValues[0] || "default";
    } catch {
      return "default";
    }
  }

  if (innerSchema instanceof z4.ZodArray) {
    // Generate array examples
    if (flagConfig.name === "databases") {
      return [
        { name: "Project Tasks", id: "110e8400-e29b-41d4-a716-446655440001" },
        { name: "Team Members", id: "220e8400-e29b-41d4-a716-446655440002" },
        { name: "Documentation", id: "330e8400-e29b-41d4-a716-446655440003" }
      ];
    }
    return [];
  }

  // Fallback for unknown types.
  return null;
}

/**
 * Generates a comprehensive YAML configuration file with example values based on the parseables schema.
 *
 * This function creates a well-structured configuration file that includes:
 * - All available configuration options organized by command
 * - Intelligent example values based on the option type and purpose
 * - Helpful comments describing each option (when includeComments is true)
 * - Clear separation between global and command-specific settings
 *
 * @param outputPath - The path where the YAML file should be written. Defaults to "./notion-sync.yaml".
 * @param includeComments - Whether to include helpful comments in the YAML. Defaults to true.
 * @returns A promise that resolves when the file is successfully written.
 *
 * @throws Will throw an error if the file cannot be written due to permissions or other I/O issues.
 *
 */
export async function generateConfigYaml(
  outputPath: string = "./notion-sync.yaml",
  includeComments: boolean = true
): Promise<void> {
  const configExample: Record<string, any> = {};
  const doc = new yaml.Document();

  // Group flags by command for better organization
  const globalFlags: Record<string, any> = {};
  const commandFlags: Record<string, Record<string, any>> = {};

  for (const [key, flagConfig] of Object.entries(parseables)) {
    const schema = flagConfig.schema();
    const exampleValue = generateExampleValue(schema, flagConfig);

    if (flagConfig.commands.includes("*")) {
      // Global flag
      globalFlags[key] = exampleValue;
    } else {
      // Command-specific flag
      for (const command of flagConfig.commands) {
        if (!commandFlags[command]) {
          commandFlags[command] = {};
        }
        commandFlags[command][key] = exampleValue;
      }
    }
  }

  // Build the YAML structure with comments
  const yamlContent: any = {
    "# Notion Sync Configuration": null,
    "# This file contains configuration options for the Notion Sync CLI": null,
    "# Environment variables and command-line flags will override these values": null,
    "#EMPTY_LINE_1": null,

    "# Global Settings": null,
    "# These settings apply to all commands": null,
    ...globalFlags,
    "#EMPTY_LINE_2": null
  };

  // Add command-specific sections
  for (const [command, flags] of Object.entries(commandFlags)) {
    yamlContent[`# ${command.charAt(0).toUpperCase() + command.slice(1)} Command Settings`] = null;
    yamlContent[`# Settings specific to the '${command}' command`] = null;

    // Add flags with their descriptions as comments
    for (const [flagKey, value] of Object.entries(flags)) {
      const flagConfig = parseables[flagKey];
      if (flagConfig && includeComments) {
        yamlContent[`# ${flagConfig.flag.description || "No description available"}`] = null;
      }
      yamlContent[flagKey] = value;
    }
    yamlContent[`#EMPTY_LINE_${command}`] = null;
  }

  // Convert to YAML string with custom formatting
  let yamlString = "";
  let emptyLineCounter = 100; // Start counter for unique empty line keys

  for (const [key, value] of Object.entries(yamlContent)) {
    if (key.startsWith("#EMPTY_LINE")) {
      // Empty line marker
      yamlString += "\n";
    } else if (key.startsWith("#")) {
      // It's a comment
      yamlString += `${key}\n`;
    } else {
      // Regular key-value pair
      if (value !== null && value !== undefined) {
        yamlString += yaml.stringify({ [key]: value });
      }
    }
  }

  // Write the file
  await fs.writeFile(outputPath, yamlString, "utf-8");

  log.info(`Configuration file generated at: ${outputPath}`);
}
