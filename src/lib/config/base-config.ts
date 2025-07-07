import { Flags } from "@oclif/core";
import { Flag } from "@oclif/core/lib/interfaces";
import * as z from "zod/v4";

/**
 * Base configuration properties that are available to all commands
 */
export interface BaseConfig {
  /** Notion API integration token */
  token: string;
  /** Maximum number of concurrent requests */
  concurrency: number;
  /** Maximum number of retries */
  retries: number;
  /** Max run time in seconds */
  timeout: number;
  /** Enable verbose logging */
  verbose: boolean;
  /** Flush stdout after each log instead of updating in place */
  flush: boolean;
}

/**
 * Zod schema for base configuration validation
 */
export const baseConfigSchema = z.object({
  token: z.string().refine((value) => /^ntn_[a-zA-Z0-9]{46}$/.test(value), {
    message: "The notion api token must be a 50 character string (i.e. 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)"
  }),
  concurrency: z.number().min(1).max(100).default(10),
  retries: z.number().min(0).max(10).default(3),
  timeout: z.number().min(0).default(0),
  verbose: z.boolean().default(false),
  flush: z.boolean().default(false)
});

/**
 * Base CLI flags that are available to all commands
 */
export const baseFlags: Record<keyof BaseConfig, Flag<any>> = {
  token: Flags.string({
    description: "Notion API integration token.",
    required: true
  }),
  concurrency: Flags.integer({
    description: "Maximum number of concurrent requests.",
    default: 10
  }),
  retries: Flags.integer({
    description: "Maximum number of retries.",
    default: 3
  }),
  timeout: Flags.integer({
    description: "Max run time in seconds.",
    default: 0
  }),
  verbose: Flags.boolean({
    char: "v",
    description: "Enable verbose logging.",
    default: false
  }),
  flush: Flags.boolean({
    description: "Flush stdout after each log instead of updating in place.",
    default: false
  })
};

/**
 * Base configuration loader that handles common properties
 */
export class BaseConfigLoader {
  /**
   * Load base configuration from various sources
   */
  static async loadBaseConfig(flags: Record<string, any>, configFile?: any): Promise<BaseConfig> {
    // Merge config sources with CLI flags taking precedence
    const mergedConfig = {
      ...configFile,
      ...flags
    };

    // Validate and parse with Zod
    const parsed = baseConfigSchema.parse(mergedConfig);
    return parsed;
  }

  /**
   * Get base CLI flags
   */
  static getBaseFlags(): Record<keyof BaseConfig, Flag<any>> {
    return baseFlags;
  }

  /**
   * Get base configuration schema
   */
  static getBaseSchema(): typeof baseConfigSchema {
    return baseConfigSchema;
  }
}