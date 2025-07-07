import * as fs from "fs/promises";
import path from "path";
import * as yaml from "yaml";
import { z } from "zod";
import { log } from "../log";

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
 * @param baseSchema The Zod schema for the base configuration.
 * @param commandSchema The Zod schema for the command-specific configuration.
 * @param cliFlags The raw CLI flags from oclif's `this.parse()`.
 * @returns A validated configuration object.
 * @template TBase, TCommand
 */
export async function loadCommandConfig<TBase extends z.ZodObject<any>, TCommand extends z.ZodObject<any>>(
  baseSchema: TBase,
  commandSchema: TCommand,
  cliFlags: Record<string, any>
): Promise<z.infer<TBase> & z.infer<TCommand>> {
  const finalSchema = baseSchema.merge(commandSchema);

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

  // 2. Clean up CLI flags (remove undefined values)
  const cleanedFlags: Record<string, any> = {};
  for (const [key, value] of Object.entries(cliFlags)) {
    if (value !== undefined) {
      cleanedFlags[key] = value;
    }
  }

  // 3. Merge all sources with correct precedence
  const mergedConfig: any = {
    ...yamlConfig,
    ...process.env,
    ...cleanedFlags
  };

  // Handle aliases, like 'output' for 'path'.
  if (mergedConfig.output && !mergedConfig.path) {
    mergedConfig.path = mergedConfig.output;
  }

  // 4. Validate the final configuration
  try {
    return finalSchema.parse(mergedConfig);
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
