import { Flags } from "@oclif/core";
import { Flag } from "@oclif/core/interfaces";
import path from "path";
import { dotEnvAdapter } from "zod-config/dotenv-adapter";
import { yamlAdapter } from "zod-config/yaml-adapter";
import * as z4 from "zod/v4";
import { log } from "./log";

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

// ================================================================
// Command-Specific Flag Extraction Types and Functions
// ================================================================

/**
 * Extract flag names that are available for a specific command.
 */
type ExtractFlagKeysForCommand<TCommand extends string> = {
  [K in keyof typeof parseables]: (typeof parseables)[K]["commands"] extends readonly string[]
    ? "*" extends (typeof parseables)[K]["commands"][number]
      ? K
      : TCommand extends (typeof parseables)[K]["commands"][number]
      ? K
      : never
    : never;
}[keyof typeof parseables];

/**
 * Type for command-specific flags object.
 */
export type CommandFlags<TCommand extends string> = {
  [K in ExtractFlagKeysForCommand<TCommand>]: (typeof parseables)[K]["flag"];
};

/**
 * Type for inferring the keys that will be available for a command.
 */
export type CommandFlagKeys<TCommand extends string> = ExtractFlagKeysForCommand<TCommand>;

/**
 * Extracts flags available for a specific command.
 *
 * @param commandName - The name of the command to extract flags for
 * @returns Object containing only the flags available for the specified command
 */
export function extractFlagsForCommand<TCommand extends string>(commandName: TCommand): CommandFlags<TCommand> {
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
 * Gets all available flag keys for a command (includes global flags).
 *
 * @param commandName - The name of the command
 * @returns Array of flag keys available for the command
 */
export function getCommandFlagKeys<TCommand extends string>(commandName: TCommand): CommandFlagKeys<TCommand>[] {
  const flagKeys: string[] = [];

  for (const [flagKey, flagConfig] of Object.entries(parseables)) {
    const isGlobalFlag = flagConfig.commands.includes("*");
    const isCommandFlag = flagConfig.commands.includes(commandName);

    if (isGlobalFlag || isCommandFlag) {
      flagKeys.push(flagKey);
    }
  }

  return flagKeys as CommandFlagKeys<TCommand>[];
}

/**
 * Helper function to create typed flags for a command.
 * This is the main function commands should use.
 *
 * @param commandName - The name of the command
 * @returns Typed flags object for the command
 */
export function createCommandFlags<TCommand extends string>(commandName: TCommand) {
  return extractFlagsForCommand(commandName);
}

// ================================================================
// Schema and Config Functions (Existing)
// ================================================================

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
