/**
 * Example: Adding a New Command to the Configuration System
 * 
 * This file demonstrates how to add a new command (e.g., "sync") to the 
 * simplified configuration system.
 */

import { Flags } from "@oclif/core";
import { Flag } from "@oclif/core/lib/interfaces";
import * as z from "zod";

// Step 1: Define the command-specific configuration interface
export interface SyncConfig {
  direction: "push" | "pull" | "bidirectional";
  "dry-run": boolean;
  "conflict-resolution": "local-wins" | "remote-wins" | "manual";
  "sync-interval": number;
  filter?: string;
}

// Step 2: Define the command-specific flags
export const syncFlags = {
  direction: Flags.string({
    char: "d",
    description: "Sync direction",
    options: ["push", "pull", "bidirectional"],
    default: "bidirectional"
  }),
  "dry-run": Flags.boolean({
    description: "Perform a dry run without making changes",
    default: false
  }),
  "conflict-resolution": Flags.string({
    description: "How to resolve conflicts",
    options: ["local-wins", "remote-wins", "manual"],
    default: "manual"
  }),
  "sync-interval": Flags.integer({
    description: "Sync interval in seconds (0 for one-time sync)",
    default: 0
  }),
  filter: Flags.string({
    description: "Filter pattern for items to sync"
  })
} satisfies Record<string, Flag<any>>;

// Step 3: Define the Zod schema for validation
export const syncConfigSchema = z.object({
  direction: z.enum(["push", "pull", "bidirectional"]),
  "dry-run": z.boolean(),
  "conflict-resolution": z.enum(["local-wins", "remote-wins", "manual"]),
  "sync-interval": z.number().min(0),
  filter: z.string().optional()
});

// Step 4: Update the main configuration file (simple-config.ts)
// Add the following to the appropriate sections:

/*
// In CommandConfigs interface:
export interface CommandConfigs {
  export: ExportConfig;
  sync: SyncConfig;  // <-- Add this line
}

// In commandFlags registry:
export const commandFlags: Record<keyof CommandConfigs, Record<string, Flag<any>>> = {
  export: exportFlags,
  sync: syncFlags  // <-- Add this line
};

// In commandSchemas registry:
export const commandSchemas: Record<keyof CommandConfigs, z.ZodSchema<any>> = {
  export: exportConfigSchema,
  sync: syncConfigSchema  // <-- Add this line
};
*/

// Step 5: Create the command implementation
import { BaseCommand } from "../../commands/base-command";
import { CommandConfig, loadCommandConfig } from "./simple-config";

export default class Sync extends BaseCommand<typeof Sync> {
  static override description = "Synchronize Notion content";
  
  static override examples = [
    "<%= config.bin %> <%= command.id %> --direction push",
    "<%= config.bin %> <%= command.id %> --dry-run",
    "<%= config.bin %> <%= command.id %> --conflict-resolution local-wins"
  ];

  // Use the sync-specific flags
  static override flags = syncFlags;

  private resolvedConfig: CommandConfig<"sync">;

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(Sync);

    // Load configuration with proper typing
    this.resolvedConfig = await loadCommandConfig("sync", flags);

    // Now you have access to both base and sync-specific configuration
    this.log(`Token: ${this.resolvedConfig.token}`);
    this.log(`Sync Direction: ${this.resolvedConfig.direction}`);
    this.log(`Dry Run: ${this.resolvedConfig["dry-run"]}`);
    
    // Implement your command logic here...
  }
}

// Step 6: Add environment variable mappings (optional)
// In ConfigLoader.loadFromEnv(), add mappings for your new flags:
/*
const envMappings: Record<string, string> = {
  // ... existing mappings ...
  SYNC_DIRECTION: "direction",
  DRY_RUN: "dry-run",
  CONFLICT_RESOLUTION: "conflict-resolution",
  SYNC_INTERVAL: "sync-interval"
};
*/

// Step 7: Write tests for your new command configuration
import { describe, it, expect } from "vitest";

describe("Sync Command Configuration", () => {
  it("should validate sync configuration correctly", () => {
    const validConfig = {
      direction: "push" as const,
      "dry-run": true,
      "conflict-resolution": "local-wins" as const,
      "sync-interval": 300,
      filter: "*.md"
    };

    const result = syncConfigSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
  });

  it("should reject invalid direction", () => {
    const invalidConfig = {
      direction: "invalid",
      "dry-run": false,
      "conflict-resolution": "local-wins",
      "sync-interval": 0
    };

    const result = syncConfigSchema.safeParse(invalidConfig);
    expect(result.success).toBe(false);
  });
});

/**
 * Summary: Adding a New Command
 * 
 * 1. Define the command-specific configuration interface
 * 2. Create the command flags object
 * 3. Create the Zod validation schema
 * 4. Register in CommandConfigs, commandFlags, and commandSchemas
 * 5. Implement the command using BaseCommand
 * 6. (Optional) Add environment variable mappings
 * 7. Write comprehensive tests
 * 
 * The system automatically handles:
 * - Merging base and command-specific configurations
 * - Configuration precedence (CLI > ENV > File > Defaults)
 * - Type safety throughout the command
 * - Validation with helpful error messages
 */