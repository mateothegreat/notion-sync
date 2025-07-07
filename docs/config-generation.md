# Configuration File Generation

The Notion Sync CLI provides built-in functionality to generate configuration files with intelligent example values. This feature helps users get started quickly by creating well-structured YAML configuration files.

## Overview

The config generation system offers two approaches:
1. **Minimal Configuration** - Essential settings only for quick start
2. **Full Configuration** - All available options with helpful comments

## Using the CLI Command

### Generate a Minimal Config (Default)

```bash
notion-sync config init
```

This creates a `notion-sync.yaml` file with essential settings:
- Authentication token placeholder
- Default export path
- Basic database configuration example
- Essential performance settings

### Generate a Full Config

```bash
notion-sync config init --full
```

This creates a comprehensive configuration file with:
- All available configuration options
- Detailed comments for each setting
- Intelligent example values based on option type
- Clear separation between global and command-specific settings

### Additional Options

```bash
# Specify custom output path
notion-sync config init --output ./config/my-config.yaml

# Overwrite existing config file
notion-sync config init --force

# Generate full config at custom location
notion-sync config init --full --output ./config/full-config.yaml --force
```

## Configuration Structure

### Global Settings
Settings that apply to all commands:
- `token` - Notion API integration token
- `verbose` - Enable verbose logging
- `concurrency` - Maximum concurrent requests
- `retries` - Maximum retry attempts
- `timeout` - Maximum execution time
- `flush` - Flush stdout after each log

### Export Command Settings
Settings specific to the export command:
- `path` - Output directory for exported files
- `databases` - List of databases to export
- `pages` - List of pages to export
- `format` - Export format (json, markdown, html, csv)
- `include-blocks` - Include block content
- `include-comments` - Include comments
- `include-properties` - Include all properties

## Example Generated Files

### Minimal Configuration

```yaml
# Notion Sync Configuration
# Replace the example values with your actual Notion workspace details
# For more options, run: notion-sync config init --full

token: ntn_YOUR_NOTION_INTEGRATION_TOKEN_HERE
path: ./exports/notion-workspace
format: markdown
databases:
  - name: Example Database
    id: YOUR_DATABASE_ID_HERE
concurrency: 5
retries: 3
timeout: 300
```

### Full Configuration (Excerpt)

```yaml
# Notion Sync Configuration
# This file contains configuration options for the Notion Sync CLI
# Environment variables and command-line flags will override these values

# Global Settings
# These settings apply to all commands
flush: false
timeout: 300
token: ntn_abc123... # Example token format
verbose: true
concurrency: 5
retries: 3

# Export Command Settings
# Settings specific to the 'export' command
# Output directory path for exported files.
path: ./exports/notion-workspace
# Comma-separated list of database IDs to export.
databases:
  - name: Project Tasks
    id: 110e8400-e29b-41d4-a716-446655440001
  - name: Team Members
    id: 220e8400-e29b-41d4-a716-446655440002
# ... more options
```

## Programmatic Usage

The config generation functions can also be used programmatically:

```typescript
import { generateConfigYaml, generateConfigYaml } from "@mateothegreat/notion-sync";

// Generate minimal config
const config = await generateConfigYaml("./my-config.yaml");

// Generate full config with comments
await generateConfigYaml("./full-config.yaml", true);

// Generate full config without comments
await generateConfigYaml("./clean-config.yaml", false);
```

## Smart Example Values

The generator creates intelligent example values based on the option type and purpose:

- **Tokens**: Valid-looking Notion token format (`ntn_` followed by 46 random characters)
- **Paths**: Sensible directory paths (`./exports/notion-workspace`)
- **Booleans**: Intelligent defaults (e.g., `verbose: true`, `include-blocks: true`)
- **Numbers**: Reasonable defaults for performance settings
- **Arrays**: Multiple example entries for databases
- **Enums**: Popular choices (e.g., `format: markdown`)

## Configuration Precedence

Configuration values are loaded in the following order (highest precedence first):
1. Command-line flags
2. Environment variables
3. `.env` file
4. `notion-sync.yaml` file

This allows for flexible configuration management across different environments. 