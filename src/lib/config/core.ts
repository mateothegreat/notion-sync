import { Flags } from "@oclif/core";
import { z } from "zod";

/**
 * The Zod schema for the core configuration options.
 * These options are available to all commands.
 */
export const baseConfigSchema = z.object({
  token: z.string().refine((value) => /^secret_[a-zA-Z0-9]{43}$/.test(value) || /^ntn_[a-zA-Z0-9]{46}$/.test(value), {
    message: "Invalid Notion API token format."
  }),
  verbose: z.boolean().default(false),
  concurrency: z.number().int().positive().default(10),
  retries: z.number().int().min(0).default(3),
  timeout: z.number().int().min(0).default(30000),
  flush: z.boolean().default(false)
});

/**
 * The inferred type from the baseConfigSchema.
 */
export type BaseConfig = z.infer<typeof baseConfigSchema>;

/**
 * The oclif flags corresponding to the baseConfigSchema.
 * These flags are available to all commands.
 */
export const baseFlags = {
  token: Flags.string({
    description: "Notion API integration token. Also configurable via NOTION_TOKEN environment variable.",
    env: "NOTION_TOKEN"
  }),
  verbose: Flags.boolean({
    char: "v",
    description: "Enable verbose logging.",
    env: "NOTION_VERBOSE"
  }),
  concurrency: Flags.integer({
    description: "Maximum number of concurrent requests.",
    env: "NOTION_CONCURRENCY"
  }),
  retries: Flags.integer({
    description: "Maximum number of retries for failed requests.",
    env: "NOTION_RETRIES"
  }),
  timeout: Flags.integer({
    description: "Request timeout in milliseconds.",
    env: "NOTION_TIMEOUT"
  }),
  flush: Flags.boolean({
    description: "Flush stdout after each log instead of updating in place.",
    env: "NOTION_FLUSH"
  })
};
