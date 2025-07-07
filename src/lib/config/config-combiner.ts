import { BaseConfig, baseConfigSchema, loadBaseConfig } from "./base-config";
import { ExportConfig, exportConfigSchema, loadExportConfig } from "./export-config";
import { z } from "zod";

/**
 * Combined configuration for export command
 */
export type ExportCommandConfig = BaseConfig & ExportConfig;

/**
 * Create a combined schema for export command
 */
export const exportCommandConfigSchema = baseConfigSchema.merge(exportConfigSchema);

/**
 * Load combined configuration for export command
 * This merges base configuration with export-specific configuration
 */
export async function loadExportCommandConfig(flags?: Partial<ExportCommandConfig>): Promise<ExportCommandConfig> {
  // Separate base flags from export flags
  const baseFlags: Partial<BaseConfig> = {};
  const exportFlags: Partial<ExportConfig> = {};

  if (flags) {
    // Extract base flags
    if ('token' in flags) baseFlags.token = flags.token;
    if ('concurrency' in flags) baseFlags.concurrency = flags.concurrency;
    if ('retries' in flags) baseFlags.retries = flags.retries;
    if ('timeout' in flags) baseFlags.timeout = flags.timeout;
    if ('verbose' in flags) baseFlags.verbose = flags.verbose;
    if ('flush' in flags) baseFlags.flush = flags.flush;

    // Extract export flags
    if ('path' in flags) exportFlags.path = flags.path;
    if ('databases' in flags) exportFlags.databases = flags.databases;
    if ('pages' in flags) exportFlags.pages = flags.pages;
    if ('format' in flags) exportFlags.format = flags.format;
    if ('max-concurrency' in flags) exportFlags['max-concurrency'] = flags['max-concurrency'];
    if ('include-blocks' in flags) exportFlags['include-blocks'] = flags['include-blocks'];
    if ('include-comments' in flags) exportFlags['include-comments'] = flags['include-comments'];
    if ('include-properties' in flags) exportFlags['include-properties'] = flags['include-properties'];
    if ('output' in flags) exportFlags.output = flags.output;
  }

  // Load configurations separately
  const baseConfig = await loadBaseConfig(baseFlags);
  const exportConfig = await loadExportConfig(exportFlags);

  // Combine and return
  return {
    ...baseConfig,
    ...exportConfig
  };
}

/**
 * Generic command configuration loader interface
 * This allows for easy extension to other commands
 */
export interface CommandConfigLoader<TConfig> {
  load(flags?: Partial<TConfig>): Promise<TConfig>;
  schema: z.ZodType<TConfig>;
}

/**
 * Registry of command configuration loaders
 * Add new commands here as they are implemented
 */
export const commandConfigLoaders = {
  export: {
    load: loadExportCommandConfig,
    schema: exportCommandConfigSchema
  } as CommandConfigLoader<ExportCommandConfig>
  // Add more commands here as needed
  // e.g., import: { load: loadImportCommandConfig, schema: importCommandConfigSchema }
};

/**
 * Get configuration loader for a specific command
 */
export function getCommandConfigLoader<TCommand extends keyof typeof commandConfigLoaders>(
  command: TCommand
): typeof commandConfigLoaders[TCommand] {
  return commandConfigLoaders[command];
}