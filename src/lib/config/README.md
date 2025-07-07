# Configuration System

This directory contains the configuration system for notion-sync, providing type-safe configuration management across multiple sources.

## Overview

The configuration system loads and validates configuration from three sources in order of precedence:
1. **CLI flags** (highest precedence)
2. **Environment variables**
3. **YAML configuration file** (`notion-sync.yaml`)

## Key Components

### `definitions.ts`
Contains all configuration option definitions. Each option specifies:
- Name and environment variable variants
- Commands it applies to (or `"*"` for all commands)
- oclif flag definition
- Zod schema for validation

### `loader.ts`
Handles loading, merging, and validating configuration:
- `loadCommandConfig()`: Main function to load configuration for a specific command
- `createCommandFlags()`: Generates oclif flag definitions for a command
- `createCommandSchema()`: Creates Zod validation schema for a command

### `config.ts`
Wrapper class for validated configuration with utility methods.

## Type Safety

The configuration system provides strong TypeScript type safety:

```typescript
// This will compile - all properties are valid
const validConfig: ResolvedCommandConfig<"export"> = {
  path: "./export",
  format: "json",
  databases: [],
  // ... other valid properties
};

// This will NOT compile - badProperty doesn't exist
const invalidConfig: ResolvedCommandConfig<"export"> = {
  badProperty: "error", // TypeScript error!
};
```

### How It Works

1. **No Index Signatures**: The `definitions` object is defined without an index signature, allowing TypeScript to know the exact keys.
2. **Type Extraction**: `ExtractFlagKeys<TCommand>` extracts only the keys that apply to a specific command.
3. **Mapped Types**: `ResolvedCommandConfig<TCommand>` maps the extracted keys to their validated types.

### Type Definitions

```typescript
// Extract keys for a specific command
export type ExtractFlagKeys<TCommand extends string> = {
  [K in keyof typeof definitions]: TCommand extends (typeof definitions)[K]["commands"][number]
    ? K
    : "*" extends (typeof definitions)[K]["commands"][number]
    ? K
    : never;
}[keyof typeof definitions];

// Resolved configuration type for a command
export type ResolvedCommandConfig<TCommand extends string> = {
  [K in ExtractFlagKeys<TCommand>]: z.infer<ReturnType<(typeof definitions)[K]["schema"]>>;
};
```

## Usage

```typescript
import { loadCommandConfig } from "./lib/config/loader";

// Load configuration for the "export" command
const config = await loadCommandConfig("export", cliFlags);

// Access validated configuration
console.log(config.rendered.path);
console.log(config.rendered.format);

// Convert to YAML
console.log(config.toYaml());
```

## Adding New Configuration Options

1. Add the option to `definitions.ts`:
```typescript
export const definitions = createDefinitions({
  // ... existing options
  myNewOption: {
    name: "myNewOption",
    variants: ["MY_NEW_OPTION", "myNewOption"],
    commands: ["export"], // or ["*"] for all commands
    flag: Flags.string({
      description: "My new option",
      default: "default-value"
    }),
    schema: () => z.string()
  }
});
```

2. The TypeScript types will automatically update to include the new option.

## Testing

The configuration system includes comprehensive tests in `loader.test.ts` that verify:
- Configuration loading from all sources
- Precedence rules
- Type coercion
- Validation
- TypeScript type safety 