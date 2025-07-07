import { Flag } from "@oclif/core/lib/interfaces";
import * as fs from "fs/promises";
import path from "path";
import * as yaml from "yaml";
import { z } from "zod";
import { log } from "../log";
import { Config } from "./config";
import { definitions } from "./definitions";

/**
 * Loads, merges, and validates configuration for a specific command from multiple sources.
 *
 * The configuration is loaded from the following sources, with later sources taking precedence:
 * 1. YAML file (`notion-sync.yaml`)
 * 2. Environment variables
 * 3. CLI flags
 *
 * NOTE: This function does NOT load .env files. That should be handled by the application's entry point.
 *
 * @param commandName The name of the command.
 * @param cliFlags The raw CLI flags from oclif's `this.parse()`.
 * @returns A validated configuration object.
 * @template TCommand
 */
export async function loadCommandConfig<TCommand extends string>(
  commandName: TCommand,
  cliFlags: Record<string, any>
): Promise<Config<TCommand>> {
  const commandSchema = createCommandSchema(commandName);

  // 1. Load from YAML file
  let yamlConfig = {};
  try {
    const yamlPath = path.join(process.cwd(), "notion-sync.yaml");
    const fileContents = await fs.readFile(yamlPath, "utf8");
    yamlConfig = yaml.parse(fileContents);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      log.error("Could not read or parse notion-sync.yaml:", error);
    }
  }

  // 2. Load from environment variables
  const envConfig: Record<string, any> = {};
  const commandParseables = getCommandParseables(commandName);
  for (const p of commandParseables) {
    for (const variant of p.variants) {
      if (process.env[variant]) {
        envConfig[p.name] = process.env[variant];
      }
    }
  }

  // 3. Clean up CLI flags (remove undefined)
  const cleanedFlags: Record<string, any> = {};
  for (const [key, value] of Object.entries(cliFlags)) {
    if (value !== undefined) {
      cleanedFlags[key] = value;
    }
  }

  // 4. Merge all sources
  const mergedConfig: any = {
    ...yamlConfig,
    ...envConfig,
    ...cleanedFlags
  };

  // Handle aliases
  if (mergedConfig.output && !mergedConfig.path) {
    mergedConfig.path = mergedConfig.output;
  }

  // 5. Validate and return
  try {
    return new Config(commandSchema.parse(mergedConfig) as ResolvedCommandConfig<TCommand>);
  } catch (error) {
    if (error instanceof z.ZodError) {
      log.error("Configuration validation failed:");
      for (const issue of error.issues) {
        log.error(`- ${issue.path.join(".")}: ${issue.message}`);
      }
    } else {
      log.error("An unknown error occurred during configuration loading:", error);
    }
    throw new Error("Configuration loading failed.");
  }
}

/**
 * Type Generation
 */

export type ExtractFlagKeys<TCommand extends string> = {
  [K in keyof typeof definitions]: TCommand extends (typeof definitions)[K]["commands"][number]
    ? K
    : "*" extends (typeof definitions)[K]["commands"][number]
    ? K
    : never;
}[keyof typeof definitions];

export type CommandFlags<TCommand extends string> = {
  [K in ExtractFlagKeys<TCommand>]: (typeof definitions)[K]["flag"];
};

export type ResolvedCommandConfig<TCommand extends string> = {
  [K in ExtractFlagKeys<TCommand>]: z.infer<ReturnType<(typeof definitions)[K]["schema"]>>;
};

/**
 * Factory Functions
 */

export const getCommandParseables = (commandName: string) => {
  return Object.values(definitions).filter((p) => p.commands.includes(commandName) || p.commands.includes("*"));
};

export const createCommandFlags = <TCommand extends string>(commandName: TCommand): CommandFlags<TCommand> => {
  const flags: Record<string, Flag<any>> = {};
  const commandParseables = getCommandParseables(commandName);
  for (const p of commandParseables) {
    flags[p.name] = p.flag;
  }
  return flags as CommandFlags<TCommand>;
};

/**
 * Create a Zod schema for a command.
 *
 * This is used to validate the configuration object.
 *
 * @param commandName The name of the command.
 * @returns A Zod schema for the command.
 *
 * @template TCommand
 */
export const createCommandSchema = <TCommand extends string>(commandName: TCommand) => {
  type CommandSchemaShape = {
    [K in ExtractFlagKeys<TCommand>]: ReturnType<(typeof definitions)[K]["schema"]>;
  };

  const commandParseables = getCommandParseables(commandName);

  const schemaShape = commandParseables.reduce((shape, p) => {
    const schema = p.schema();
    const typeName = (schema._def as any).typeName;

    // Only add properties that are actually part of this command's config
    if (p.name in shape || p.commands.includes(commandName) || p.commands.includes("*")) {
      switch (typeName) {
        case "ZodBoolean":
          (shape as any)[p.name] = z.coerce.boolean(schema);
          break;
        case "ZodNumber":
          (shape as any)[p.name] = z.coerce.number(schema);
          break;
        default:
          (shape as any)[p.name] = schema;
          break;
      }
    }
    return shape;
  }, {} as CommandSchemaShape);

  return z.object(schemaShape);
};
