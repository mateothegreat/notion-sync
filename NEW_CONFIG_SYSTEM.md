# New Simplified Configuration System

## Overview

This document describes the new simplified configuration system that replaces the complex mapped types approach with a cleaner, more maintainable architecture.

## Problems with the Old System

The previous configuration system had several issues:
- Complex mapped types made type inference difficult
- Hard to add new commands
- Difficult to debug configuration issues
- Overly clever type system caused compilation problems

## New Architecture

The new system uses a simple, layered approach:

1. **Base Configuration** (`base-config.ts`) - Common properties for all commands
2. **Command-Specific Configuration** (`export-config.ts`) - Properties specific to each command
3. **Combined Configuration** (`combined-config.ts`) - Merges base and command-specific configs

## File Structure

```
src/lib/config/
├── base-config.ts          # Base configuration for all commands
├── export-config.ts        # Export-specific configuration  
├── combined-config.ts      # Combined configuration loader
├── base-config.test.ts     # Base configuration tests
├── export-config.test.ts   # Export configuration tests
└── combined-config.test.ts # Combined configuration tests
```

## Base Configuration

All commands share these common properties:

```typescript
interface BaseConfig {
  token: string;        // Notion API token
  concurrency: number;  // Max concurrent requests
  retries: number;      // Max retry attempts
  timeout: number;      // Request timeout
  verbose: boolean;     // Verbose logging
  flush: boolean;       // Flush stdout
}
```

## Export Configuration

The export command has these additional properties:

```typescript
interface ExportConfig {
  path: string;              // Output directory
  format: "json" | "markdown" | "html" | "csv";
  maxConcurrency: number;    // Export-specific concurrency
  includeBlocks: boolean;    // Include block content
  includeComments: boolean;  // Include comments
  includeProperties: boolean; // Include properties
  databases?: string;        // Database IDs (comma-separated)
  pages?: string;           // Page IDs (comma-separated)
}
```

## Combined Configuration

The combined configuration merges base and command-specific configs:

```typescript
type CombinedExportConfig = BaseConfig & ExportConfig;
```

## Configuration Loading

The system loads configuration from multiple sources with proper precedence:

1. **Config File** (lowest precedence)
2. **Environment Variables** (middle precedence)
3. **CLI Flags** (highest precedence)

### Config File Loading

Supports multiple file formats and locations:
- `notion-sync.yaml`
- `notion-sync.yml`
- `notion-sync.json`
- `.notion-sync.yaml`
- `.notion-sync.yml`
- `.notion-sync.json`

### Environment Variables

Environment variables use `NOTION_` prefix:
- `NOTION_TOKEN`
- `NOTION_CONCURRENCY`
- `NOTION_VERBOSE`
- `NOTION_PATH`
- `NOTION_FORMAT`
- etc.

## Usage Examples

### Basic Usage

```typescript
import { loadExportConfig } from "../lib/config/combined-config";

const flags = {
  token: "ntn_...",
  path: "./exports"
};

const config = await loadExportConfig(flags);
// config contains both base and export-specific properties
```

### Using Helper Functions

```typescript
import { getExportFlags, validateExportConfig } from "../lib/config/combined-config";

// Get all flags for export command
const flags = getExportFlags();

// Validate configuration
const validatedConfig = await validateExportConfig(config);
```

### Command Implementation

```typescript
import { SimpleExportCommand } from "../lib/commands/simple-base-command";
import { getExportFlags } from "../lib/config/combined-config";

export default class Export extends SimpleExportCommand {
  static flags = getExportFlags();

  public async run(): Promise<void> {
    const config = this.getConfig(); // Automatically loaded
    
    // Use configuration
    console.log(`Exporting to: ${config.path}`);
    console.log(`Format: ${config.format}`);
    console.log(`Token: ${config.token}`);
    console.log(`Concurrency: ${config.concurrency}`);
  }
}
```

## Adding New Commands

To add a new command (e.g., "import"), follow these steps:

### Step 1: Create Command-Specific Configuration

```typescript
// src/lib/config/import-config.ts
import { Flags } from "@oclif/core";
import { Flag } from "@oclif/core/lib/interfaces";
import * as z from "zod/v4";

export interface ImportConfig {
  source: string;
  dryRun: boolean;
  batchSize: number;
}

export const importConfigSchema = z.object({
  source: z.string(),
  dryRun: z.boolean().default(false),
  batchSize: z.number().min(1).max(100).default(10)
});

export const importFlags: Record<keyof ImportConfig, Flag<any>> = {
  source: Flags.string({
    char: "s",
    description: "Source file path",
    required: true
  }),
  dryRun: Flags.boolean({
    description: "Perform a dry run without making changes",
    default: false
  }),
  batchSize: Flags.integer({
    description: "Number of items to process in each batch",
    default: 10
  })
};

export class ImportConfigLoader {
  static async loadImportConfig(flags: Record<string, any>, configFile?: any): Promise<ImportConfig> {
    const mergedConfig = { ...configFile, ...flags };
    return importConfigSchema.parse(mergedConfig);
  }

  static getImportFlags(): Record<keyof ImportConfig, Flag<any>> {
    return importFlags;
  }

  static getImportSchema(): typeof importConfigSchema {
    return importConfigSchema;
  }
}
```

### Step 2: Update Command Registry

```typescript
// src/lib/config/combined-config.ts
import { ImportConfigLoader } from "./import-config";

export const commandRegistry = {
  export: {
    loader: ExportConfigLoader,
    schema: ExportConfigLoader.getExportSchema()
  },
  import: {
    loader: ImportConfigLoader,
    schema: ImportConfigLoader.getImportSchema()
  }
} as const;

export type CombinedImportConfig = BaseConfig & ImportConfig;

export type CombinedConfig<TCommand extends CommandName> = TCommand extends "export"
  ? CombinedExportConfig
  : TCommand extends "import"
  ? CombinedImportConfig
  : never;
```

### Step 3: Add Helper Functions

```typescript
// src/lib/config/combined-config.ts
export const loadImportConfig = async (
  flags: Record<string, any>,
  configPath?: string
): Promise<CombinedImportConfig> => {
  return CombinedConfigLoader.loadCombinedConfig("import", flags, configPath);
};

export const getImportFlags = () => {
  return CombinedConfigLoader.getCombinedFlags("import");
};
```

### Step 4: Create Command Implementation

```typescript
// src/commands/import.ts
import { SimpleBaseCommand } from "../lib/commands/simple-base-command";
import { getImportFlags } from "../lib/config/combined-config";

export default class Import extends SimpleBaseCommand<"import"> {
  static flags = getImportFlags();

  public async run(): Promise<void> {
    const config = this.getConfig();
    
    // Implementation here
    console.log(`Importing from: ${config.source}`);
    console.log(`Dry run: ${config.dryRun}`);
    console.log(`Batch size: ${config.batchSize}`);
  }
}
```

### Step 5: Write Tests

```typescript
// src/lib/config/import-config.test.ts
import { describe, it, expect } from "vitest";
import { ImportConfigLoader } from "./import-config";

describe("ImportConfig", () => {
  it("should load import configuration", async () => {
    const flags = {
      source: "./import-data.json",
      dryRun: true,
      batchSize: 5
    };

    const config = await ImportConfigLoader.loadImportConfig(flags);
    
    expect(config).toEqual({
      source: "./import-data.json",
      dryRun: true,
      batchSize: 5
    });
  });
});
```

## Configuration Validation

The system uses Zod for runtime validation:

```typescript
// Validation happens automatically in loaders
const config = await loadExportConfig(flags); // Throws if invalid

// Manual validation
const validatedConfig = await validateExportConfig(rawConfig);
```

## Environment Variable Mapping

The system automatically maps environment variables:

```typescript
const envMappings = {
  NOTION_TOKEN: "token",
  NOTION_CONCURRENCY: "concurrency",
  NOTION_VERBOSE: "verbose",
  NOTION_PATH: "path",
  NOTION_FORMAT: "format",
  // Add new mappings here for new commands
};
```

## Type Safety

The new system provides full type safety:

```typescript
// TypeScript knows all available properties
const config: CombinedExportConfig = await loadExportConfig(flags);

config.token;              // ✅ Base property
config.concurrency;        // ✅ Base property  
config.path;               // ✅ Export property
config.format;             // ✅ Export property
config.nonExistentProp;    // ❌ TypeScript error
```

## Benefits

1. **Simple Architecture**: Easy to understand and maintain
2. **Type Safety**: Full TypeScript support without complex mapped types
3. **Scalable**: Easy to add new commands
4. **Testable**: Each component can be tested independently
5. **Flexible**: Multiple configuration sources with proper precedence
6. **Validated**: Runtime validation with Zod schemas

## Testing

The system includes 100% test coverage:

- `base-config.test.ts` - Tests base configuration loading and validation
- `export-config.test.ts` - Tests export-specific configuration
- `combined-config.test.ts` - Tests configuration merging and file loading

Run tests with:
```bash
npm test
```

## Migration Guide

To migrate from the old system:

1. Replace `BaseCommand` with `SimpleBaseCommand`
2. Replace `createCommandFlags()` with `getExportFlags()`
3. Replace `compileCommandConfig()` with `loadExportConfig()`
4. Update command implementations to use `this.getConfig()`

## Configuration Examples

### YAML Configuration

```yaml
# notion-sync.yaml
token: ntn_abc123def456ghi789jkl012mno345pqr678stu901vwx234yz5
concurrency: 10
verbose: true
path: ./exports
format: markdown
includeComments: true
databases:
  - id: db1
    name: "Project Tasks"
  - id: db2
    name: "Meeting Notes"
```

### JSON Configuration

```json
{
  "token": "ntn_abc123def456ghi789jkl012mno345pqr678stu901vwx234yz5",
  "concurrency": 10,
  "verbose": true,
  "path": "./exports",
  "format": "markdown",
  "includeComments": true,
  "databases": "db1,db2"
}
```

### Environment Variables

```bash
export NOTION_TOKEN=ntn_abc123def456ghi789jkl012mno345pqr678stu901vwx234yz5
export NOTION_CONCURRENCY=10
export NOTION_VERBOSE=true
export NOTION_PATH=./exports
export NOTION_FORMAT=markdown
```

## Troubleshooting

### Common Issues

1. **Invalid Token**: Ensure token follows `ntn_[46 chars]` format
2. **Missing Configuration**: Check file paths and environment variables
3. **Validation Errors**: Review Zod schema requirements
4. **Type Errors**: Ensure you're using the correct combined config type

### Debug Mode

Enable verbose logging:
```bash
notion-sync export --verbose
```

Or set environment variable:
```bash
export NOTION_VERBOSE=true
```