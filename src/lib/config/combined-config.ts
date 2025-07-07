import { BaseConfig, BaseConfigLoader } from "./base-config";
import { ExportConfig, ExportConfigLoader } from "./export-config";
import * as fs from "fs/promises";
import * as path from "path";
import * as yaml from "yaml";
import * as z from "zod/v4";

/**
 * Combined configuration for the export command
 */
export type CombinedExportConfig = BaseConfig & ExportConfig;

/**
 * Registry of available commands and their config loaders
 */
export const commandRegistry = {
  export: {
    loader: ExportConfigLoader,
    schema: ExportConfigLoader.getExportSchema()
  }
} as const;

/**
 * Command names available in the registry
 */
export type CommandName = keyof typeof commandRegistry;

/**
 * Combined configuration type for any command
 */
export type CombinedConfig<TCommand extends CommandName> = TCommand extends "export" 
  ? CombinedExportConfig
  : never;

/**
 * Combined configuration loader that merges base and command-specific configurations
 */
export class CombinedConfigLoader {
  /**
   * Load configuration from file (YAML or JSON)
   */
  static async loadConfigFile(configPath?: string): Promise<any> {
    const possiblePaths = [
      configPath,
      path.join(process.cwd(), "notion-sync.yaml"),
      path.join(process.cwd(), "notion-sync.yml"),
      path.join(process.cwd(), "notion-sync.json"),
      path.join(process.cwd(), ".notion-sync.yaml"),
      path.join(process.cwd(), ".notion-sync.yml"),
      path.join(process.cwd(), ".notion-sync.json")
    ].filter(Boolean);

    for (const filePath of possiblePaths) {
      try {
        const content = await fs.readFile(filePath!, "utf-8");
        
        if (filePath!.endsWith(".json")) {
          return JSON.parse(content);
        } else {
          return yaml.parse(content);
        }
      } catch (error) {
        // Continue to next file if current one doesn't exist or can't be read
        continue;
      }
    }

    // Return empty config if no file found
    return {};
  }

  /**
   * Load environment variables with proper naming
   */
  static loadEnvConfig(): Record<string, any> {
    const envConfig: Record<string, any> = {};

    // Map environment variables to config keys
    const envMappings = {
      NOTION_TOKEN: "token",
      NOTION_CONCURRENCY: "concurrency",
      NOTION_RETRIES: "retries",
      NOTION_TIMEOUT: "timeout",
      NOTION_VERBOSE: "verbose",
      NOTION_FLUSH: "flush",
      NOTION_PATH: "path",
      NOTION_FORMAT: "format",
      NOTION_MAX_CONCURRENCY: "maxConcurrency",
      NOTION_INCLUDE_BLOCKS: "includeBlocks",
      NOTION_INCLUDE_COMMENTS: "includeComments",
      NOTION_INCLUDE_PROPERTIES: "includeProperties",
      NOTION_DATABASES: "databases",
      NOTION_PAGES: "pages"
    };

    for (const [envKey, configKey] of Object.entries(envMappings)) {
      const envValue = process.env[envKey];
      if (envValue !== undefined) {
        // Convert string values to appropriate types
        if (envValue === "true") {
          envConfig[configKey] = true;
        } else if (envValue === "false") {
          envConfig[configKey] = false;
        } else if (!isNaN(Number(envValue))) {
          envConfig[configKey] = Number(envValue);
        } else {
          envConfig[configKey] = envValue;
        }
      }
    }

    return envConfig;
  }

  /**
   * Load and combine configuration for a specific command
   */
  static async loadCombinedConfig<TCommand extends CommandName>(
    command: TCommand,
    flags: Record<string, any>,
    configPath?: string
  ): Promise<CombinedConfig<TCommand>> {
    // Load configuration from various sources
    const configFile = await this.loadConfigFile(configPath);
    const envConfig = this.loadEnvConfig();

    // Merge configurations with proper precedence: file < env < flags
    const mergedConfig = {
      ...configFile,
      ...envConfig,
      ...flags
    };

    // Load base configuration
    const baseConfig = await BaseConfigLoader.loadBaseConfig(mergedConfig, configFile);

    // Load command-specific configuration
    const commandConfig = await commandRegistry[command].loader.loadExportConfig(mergedConfig, configFile);

    // Combine both configurations
    const combinedConfig = {
      ...baseConfig,
      ...commandConfig
    };

    return combinedConfig as CombinedConfig<TCommand>;
  }

  /**
   * Get combined flags for a command (base + command-specific)
   */
  static getCombinedFlags<TCommand extends CommandName>(command: TCommand): Record<string, any> {
    const baseFlags = BaseConfigLoader.getBaseFlags();
    
    if (command === "export") {
      const exportFlags = ExportConfigLoader.getExportFlags();
      return {
        ...baseFlags,
        ...exportFlags
      };
    }

    return baseFlags;
  }

  /**
   * Get combined schema for a command
   */
  static getCombinedSchema<TCommand extends CommandName>(command: TCommand): z.ZodObject<any> {
    const baseSchema = BaseConfigLoader.getBaseSchema();
    const commandSchema = commandRegistry[command].schema;

    return baseSchema.merge(commandSchema);
  }

  /**
   * Validate configuration for a command
   */
  static async validateConfig<TCommand extends CommandName>(
    command: TCommand,
    config: any
  ): Promise<CombinedConfig<TCommand>> {
    const schema = this.getCombinedSchema(command);
    const validatedConfig = schema.parse(config);
    return validatedConfig as CombinedConfig<TCommand>;
  }
}

/**
 * Helper function to easily load configuration for export command
 */
export const loadExportConfig = async (
  flags: Record<string, any>,
  configPath?: string
): Promise<CombinedExportConfig> => {
  return CombinedConfigLoader.loadCombinedConfig("export", flags, configPath);
};

/**
 * Helper function to get export flags
 */
export const getExportFlags = () => {
  return CombinedConfigLoader.getCombinedFlags("export");
};

/**
 * Helper function to validate export configuration
 */
export const validateExportConfig = async (config: any): Promise<CombinedExportConfig> => {
  return CombinedConfigLoader.validateConfig("export", config);
};