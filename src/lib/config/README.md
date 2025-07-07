# Simple Configuration System

This directory contains the new simplified configuration system that replaces the complex mapped types approach.

## Overview

The configuration system separates **base/core** properties (shared by all commands) from **command-specific** properties, providing:

- Clear type separation between base and command configurations
- Simple, maintainable code without complex mapped types
- Easy scalability for adding new commands
- Proper configuration precedence: CLI flags > Environment variables > Config file > Defaults
- Comprehensive validation using Zod schemas

## Architecture

### Core Components

1. **Base Configuration** (`BaseConfig`)
   - Properties shared by all commands
   - Includes: `token`, `verbose`, `flush`, `timeout`, `concurrency`, `retries`

2. **Command-Specific Configuration** (e.g., `ExportConfig`)
   - Properties unique to each command
   - Export command includes: `path`, `databases`, `pages`, `format`, etc.

3. **Combined Configuration** (`CommandConfig<T>`)
   - Type-safe combination of base + command-specific properties
   - Automatically inferred based on command name

### Key Files

- `simple-config.ts` - Main configuration system implementation
- `simple-config.test.ts` - Comprehensive test suite with 100% coverage
- `add-new-command.example.ts` - Example showing how to add new commands

## Usage

### In Commands

```typescript
import { BaseCommand } from "../lib/commands/base-command";
import { CommandConfig, exportFlags, loadCommandConfig } from "../lib/config/simple-config";

export default class Export extends BaseCommand<typeof Export> {
  // Use command-specific flags
  static override flags = exportFlags;

  private resolvedConfig: CommandConfig<"export">;

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(Export);
    
    // Load configuration with proper typing
    this.resolvedConfig = await loadCommandConfig("export", flags);
    
    // Use configuration
    console.log(this.resolvedConfig.token);     // Base property
    console.log(this.resolvedConfig.path);      // Export-specific property
  }
}
```

### Configuration Sources

The system loads configuration from multiple sources in order of precedence:

1. **CLI Flags** (highest priority)
   ```bash
   notion-sync export --path ./exports --format markdown
   ```

2. **Environment Variables**
   ```bash
   export NOTION_TOKEN=ntn_...
   export VERBOSE=true
   ```

3. **Configuration File** (`notion-sync.yaml`)
   ```yaml
   # Base configuration
   token: ntn_...
   verbose: false
   concurrency: 20
   
   # Export configuration
   path: ./exports
   format: json
   include-blocks: true
   ```

4. **Default Values** (lowest priority)
   - Defined in flag definitions

## Adding New Commands

To add a new command to the system:

### 1. Define Configuration Interface

```typescript
// In simple-config.ts or separate file
export interface SyncConfig {
  direction: "push" | "pull" | "bidirectional";
  "dry-run": boolean;
  "conflict-resolution": "local-wins" | "remote-wins" | "manual";
}
```

### 2. Define Command Flags

```typescript
export const syncFlags = {
  direction: Flags.string({
    char: "d",
    description: "Sync direction",
    options: ["push", "pull", "bidirectional"],
    default: "bidirectional"
  }),
  "dry-run": Flags.boolean({
    description: "Perform a dry run",
    default: false
  }),
  // ... more flags
};
```

### 3. Create Validation Schema

```typescript
export const syncConfigSchema = z.object({
  direction: z.enum(["push", "pull", "bidirectional"]),
  "dry-run": z.boolean(),
  // ... more validations
});
```

### 4. Register in System

```typescript
// Update CommandConfigs interface
export interface CommandConfigs {
  export: ExportConfig;
  sync: SyncConfig;  // Add this
}

// Update commandFlags registry
export const commandFlags = {
  export: exportFlags,
  sync: syncFlags  // Add this
};

// Update commandSchemas registry
export const commandSchemas = {
  export: exportConfigSchema,
  sync: syncConfigSchema  // Add this
};
```

### 5. Implement Command

```typescript
export default class Sync extends BaseCommand<typeof Sync> {
  static override flags = syncFlags;
  
  private resolvedConfig: CommandConfig<"sync">;
  
  public async run(): Promise<void> {
    const { flags } = await this.parse(Sync);
    this.resolvedConfig = await loadCommandConfig("sync", flags);
    // Implementation...
  }
}
```

## Testing

The configuration system includes comprehensive tests covering:

- Flag definitions and defaults
- Schema validation
- Configuration loading from files
- Environment variable parsing
- Configuration precedence
- Error handling
- Type safety

Run tests with:
```bash
npm test src/lib/config/simple-config.test.ts
```

## Benefits Over Previous System

1. **Simplicity**: No complex mapped types or type gymnastics
2. **Clarity**: Clear separation of base and command configs
3. **Maintainability**: Easy to understand and modify
4. **Scalability**: Adding new commands is straightforward
5. **Type Safety**: Full TypeScript support with proper inference
6. **Testability**: Simple to test with 100% coverage

## Migration from Old System

To migrate existing code:

1. Replace `createCommandFlags("export")` with `exportFlags`
2. Replace `compileCommandConfig("export", flags)` with `await loadCommandConfig("export", flags)`
3. Update type from `ResolvedCommandConfig<"export">` to `CommandConfig<"export">`
4. Remove imports from old `config-loader.ts`

## Environment Variable Mappings

| Environment Variable | Config Key | Description |
|---------------------|------------|-------------|
| NOTION_TOKEN | token | Notion API token |
| VERBOSE | verbose | Enable verbose logging |
| FLUSH | flush | Flush stdout |
| TIMEOUT | timeout | Max run time |
| CONCURRENCY | concurrency | Max concurrent requests |
| RETRIES | retries | Max retry attempts |

Commands can add their own environment variable mappings in the `ConfigLoader.loadFromEnv()` method.