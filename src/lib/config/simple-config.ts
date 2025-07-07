import { Flags } from "@oclif/core";
import { Flag } from "@oclif/core/lib/interfaces";
import * as z from "zod";

/**
 * Base configuration that applies to all commands.
 * These are the core properties like token, concurrency, etc.
 */
export interface BaseConfig {
  token: string;
  verbose: boolean;
  flush: boolean;
  timeout: number;
  concurrency: number;
  retries: number;
}

/**
 * Base flags definition for all commands.
 */
export const baseFlags = {
  token: Flags.string({
    description: "Notion API integration token",
    required: false,
    env: "NOTION_TOKEN"
  }),
  verbose: Flags.boolean({
    char: "v",
    description: "Enable verbose logging",
    default: false
  }),
  flush: Flags.boolean({
    description: "Flush stdout after each log instead of updating in place",
    default: false
  }),
  timeout: Flags.integer({
    description: "Max run time in seconds",
    default: 0
  }),
  concurrency: Flags.integer({
    description: "Maximum number of concurrent requests",
    default: 10
  }),
  retries: Flags.integer({
    description: "Maximum number of retries",
    default: 3
  })
} satisfies Record<string, Flag<any>>;

/**
 * Zod schema for base configuration validation.
 */
export const baseConfigSchema = z.object({
  token: z.string().regex(/^ntn_[a-zA-Z0-9]{46}$/, {
    message: "The notion api token must be a 50 character string (i.e. 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)"
  }),
  verbose: z.boolean(),
  flush: z.boolean(),
  timeout: z.number().min(0),
  concurrency: z.number().min(1),
  retries: z.number().min(0)
});

/**
 * Export command specific configuration.
 */
export interface ExportConfig {
  path: string;
  databases?: string;
  pages?: string;
  format: "json" | "markdown" | "html" | "csv";
  "max-concurrency": number;
  "include-blocks": boolean;
  "include-comments": boolean;
  "include-properties": boolean;
}

/**
 * Export command specific flags.
 */
export const exportFlags = {
  path: Flags.string({
    char: "p",
    description: "Output directory path for exported files",
    default: `./notion-export-${new Date().toISOString().split("T")[0]}`
  }),
  databases: Flags.string({
    char: "d",
    description: "Comma-separated list of database IDs to export"
  }),
  pages: Flags.string({
    description: "Comma-separated list of page IDs to export"
  }),
  format: Flags.string({
    char: "f",
    description: "Export format",
    options: ["json", "markdown", "html", "csv"],
    default: "json"
  }),
  "max-concurrency": Flags.integer({
    description: "Maximum number of concurrent requests for export",
    default: 10
  }),
  "include-blocks": Flags.boolean({
    description: "Include block content in export",
    default: true
  }),
  "include-comments": Flags.boolean({
    description: "Include comments in export",
    default: false
  }),
  "include-properties": Flags.boolean({
    description: "Include all properties in export",
    default: true
  })
} satisfies Record<string, Flag<any>>;

/**
 * Zod schema for export configuration validation.
 */
export const exportConfigSchema = z.object({
  path: z.string(),
  databases: z.string().optional(),
  pages: z.string().optional(),
  format: z.enum(["json", "markdown", "html", "csv"]),
  "max-concurrency": z.number().min(1),
  "include-blocks": z.boolean(),
  "include-comments": z.boolean(),
  "include-properties": z.boolean()
});

/**
 * Combined configuration type for a command.
 */
export type CommandConfig<TCommand extends keyof CommandConfigs> = BaseConfig & CommandConfigs[TCommand];

/**
 * Registry of command-specific configurations.
 */
export interface CommandConfigs {
  export: ExportConfig;
  // Add more commands here as needed
}

/**
 * Registry of command-specific flags.
 */
export const commandFlags: Record<keyof CommandConfigs, Record<string, Flag<any>>> = {
  export: exportFlags
  // Add more command flags here as needed
};

/**
 * Registry of command-specific schemas.
 */
export const commandSchemas: Record<keyof CommandConfigs, z.ZodSchema<any>> = {
  export: exportConfigSchema
  // Add more command schemas here as needed
};

/**
 * Get flags for a specific command (base + command-specific).
 */
export function getCommandFlags<TCommand extends keyof CommandConfigs>(
  command: TCommand
): Record<string, Flag<any>> {
  return {
    ...baseFlags,
    ...(commandFlags[command] || {})
  };
}

/**
 * Configuration loader that combines base and command-specific configs.
 */
export class ConfigLoader {
  private fileConfig: Record<string, any> = {};
  private envConfig: Record<string, any> = {};

  /**
   * Load configuration from file.
   */
  async loadFromFile(filePath: string): Promise<void> {
    try {
      const fs = await import("fs/promises");
      const yaml = await import("yaml");
      const content = await fs.readFile(filePath, "utf-8");
      this.fileConfig = yaml.parse(content) || {};
    } catch (error) {
      // File doesn't exist or is invalid, that's okay
      this.fileConfig = {};
    }
  }

  /**
   * Load configuration from environment variables.
   */
  loadFromEnv(): void {
    this.envConfig = {};
    
    // Map environment variables to config keys
    const envMappings: Record<string, string> = {
      NOTION_TOKEN: "token",
      VERBOSE: "verbose",
      FLUSH: "flush",
      TIMEOUT: "timeout",
      CONCURRENCY: "concurrency",
      RETRIES: "retries",
      // Add more mappings as needed
    };

    for (const [envKey, configKey] of Object.entries(envMappings)) {
      if (process.env[envKey]) {
        this.envConfig[configKey] = process.env[envKey];
      }
    }
  }

  /**
   * Load and merge configuration for a specific command.
   * Priority: CLI flags > Environment variables > Config file > Defaults
   */
  loadCommandConfig<TCommand extends keyof CommandConfigs>(
    command: TCommand,
    cliFlags: Record<string, any>
  ): CommandConfig<TCommand> {
    // Get the appropriate schema
    const fullSchema = baseConfigSchema.merge(commandSchemas[command]);

    // Merge configurations with proper precedence
    const merged = {
      ...this.getDefaults(command),
      ...this.fileConfig,
      ...this.envConfig,
      ...cliFlags
    };

    // Parse and validate
    const result = fullSchema.safeParse(merged);
    
    if (!result.success) {
      const errors = result.error.errors.map(e => `${e.path.join(".")}: ${e.message}`).join(", ");
      throw new Error(`Configuration validation failed: ${errors}`);
    }

    return result.data as CommandConfig<TCommand>;
  }

  /**
   * Get default values for a command.
   */
  private getDefaults(command: keyof CommandConfigs): Record<string, any> {
    const defaults: Record<string, any> = {};
    
    // Extract defaults from base flags
    for (const [key, flag] of Object.entries(baseFlags)) {
      if (flag.default !== undefined) {
        defaults[key] = flag.default;
      }
    }

    // Extract defaults from command-specific flags
    const cmdFlags = commandFlags[command];
    if (cmdFlags) {
      for (const [key, flag] of Object.entries(cmdFlags)) {
        if (flag.default !== undefined) {
          defaults[key] = flag.default;
        }
      }
    }

    return defaults;
  }
}

/**
 * Singleton instance of the config loader.
 */
export const configLoader = new ConfigLoader();

/**
 * Helper function to load configuration for a command.
 */
export async function loadCommandConfig<TCommand extends keyof CommandConfigs>(
  command: TCommand,
  cliFlags: Record<string, any>,
  configPath = "./notion-sync.yaml"
): Promise<CommandConfig<TCommand>> {
  await configLoader.loadFromFile(configPath);
  configLoader.loadFromEnv();
  return configLoader.loadCommandConfig(command, cliFlags);
}