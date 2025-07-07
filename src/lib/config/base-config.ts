import { Flags } from "@oclif/core";
import { z } from "zod";
import { promises as fs } from "fs";
import path from "path";
import * as yaml from "yaml";

/**
 * Base configuration schema that applies to all commands
 */
export const baseConfigSchema = z.object({
  token: z.string().regex(/^ntn_[a-zA-Z0-9]{46}$/, {
    message: "The notion api token must be a 50 character string (i.e. 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)"
  }).optional(),
  concurrency: z.number().int().positive().default(10),
  retries: z.number().int().min(0).default(3),
  timeout: z.number().int().min(0).default(0),
  verbose: z.boolean().default(false),
  flush: z.boolean().default(false)
});

/**
 * Base configuration type inferred from the schema
 */
export type BaseConfig = z.infer<typeof baseConfigSchema>;

/**
 * Base flags for oclif that are available to all commands
 */
export const baseFlags = {
  token: Flags.string({
    description: "Notion API integration token.",
    env: "NOTION_TOKEN"
  }),
  concurrency: Flags.integer({
    description: "Maximum number of concurrent requests.",
    default: 10,
    env: "CONCURRENCY"
  }),
  retries: Flags.integer({
    description: "Maximum number of retries.",
    default: 3,
    env: "RETRIES"
  }),
  timeout: Flags.integer({
    description: "Max run time in seconds.",
    default: 0,
    env: "TIMEOUT"
  }),
  verbose: Flags.boolean({
    char: "v",
    description: "Enable verbose logging.",
    default: false,
    env: "VERBOSE"
  }),
  flush: Flags.boolean({
    description: "Flush stdout after each log instead of updating in place.",
    default: false,
    env: "FLUSH"
  })
};

/**
 * Load base configuration from various sources
 * Priority: CLI flags > Environment variables > Config file
 */
export async function loadBaseConfig(flags?: Partial<BaseConfig>): Promise<BaseConfig> {
  let config: Partial<BaseConfig> = {};

  // 1. Try to load from config file
  try {
    const configPath = path.join(process.cwd(), "notion-sync.yaml");
    const fileContent = await fs.readFile(configPath, 'utf-8');
    const yamlConfig = yaml.parse(fileContent);
    config = { ...config, ...yamlConfig };
  } catch (error) {
    // Config file is optional, so we ignore if it doesn't exist
  }

  // 2. Override with environment variables
  const envConfig: Partial<BaseConfig> = {};
  if (process.env.NOTION_TOKEN) envConfig.token = process.env.NOTION_TOKEN;
  if (process.env.CONCURRENCY) envConfig.concurrency = parseInt(process.env.CONCURRENCY, 10);
  if (process.env.RETRIES) envConfig.retries = parseInt(process.env.RETRIES, 10);
  if (process.env.TIMEOUT) envConfig.timeout = parseInt(process.env.TIMEOUT, 10);
  if (process.env.VERBOSE) envConfig.verbose = process.env.VERBOSE === 'true';
  if (process.env.FLUSH) envConfig.flush = process.env.FLUSH === 'true';

  config = { ...config, ...envConfig };

  // 3. Override with CLI flags
  if (flags) {
    config = { ...config, ...flags };
  }

  // 4. Validate and return
  return baseConfigSchema.parse(config);
}