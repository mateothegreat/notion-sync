import { Flags } from "@oclif/core";
import { FlagProps } from "node_modules/@oclif/core/lib/interfaces/parser";
import path from "path";
import { dotEnvAdapter } from "zod-config/dotenv-adapter";
import { yamlAdapter } from "zod-config/yaml-adapter";
import * as z4 from "zod/v4";
import { log } from "./log";

/**
 * The config object.
 */
export type ParseableConfig = {
  NOTION_TOKEN: string;
  output?: string;
  concurrency?: number;
  depth?: number;
  retries?: number;
};

export type Parseable = {
  name: string;
  variants: string[];
  flag: FlagProps;
  schema: () => z4.ZodType<any>;
  debug?: boolean;
};

export const parseables: Record<string, Parseable> = {
  flush: {
    name: "flush",
    variants: ["FLUSH", "flush"],
    flag: Flags.boolean({
      description: "Flush stdout after each log instead of updating in place.",
      default: false
    }),
    schema: () => z4.boolean()
  },
  timeout: {
    name: "timeout",
    variants: ["TIMEOUT", "timeout"],
    flag: Flags.integer({
      description: "Max run time in seconds.",
      default: 0
    }),
    schema: () => z4.number()
  },
  token: {
    name: "token",
    variants: ["notion_token", "token"],
    flag: Flags.string({
      description: "Notion API integration token."
      // required: true
    }),
    schema: () =>
      z4.string().refine((value) => /^ntn_[a-zA-Z0-9]{46}$/.test(value), {
        message:
          "The notion api token must be a 50 character string (i.e. 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)"
      })
  },
  output: {
    name: "output",
    variants: ["OUTPUT", "output"],
    flag: Flags.string({
      description: "Output directory.",
      default: `./notion-export-${new Date().toISOString()}`
    }),
    schema: () => z4.string()
  },
  concurrency: {
    name: "concurrency",
    variants: ["CONCURRENCY", "concurrency"],
    flag: Flags.integer({
      description: "Maximum number of concurrent requests.",
      default: async () => config.concurrency || 10
    }),
    schema: () => z4.number()
  },
  depth: {
    name: "depth",
    variants: ["DEPTH", "depth"],
    flag: Flags.integer({
      description: "Maximum depth of the export.",
      default: async () => config.depth || 1
    }),
    schema: () => z4.number()
  },
  retries: {
    name: "retries",
    variants: ["RETRIES", "retries"],
    flag: Flags.integer({
      description: "Maximum number of retries.",
      default: async () => config.retries || 3
    }),
    schema: () => z4.number()
  },
  databases: {
    name: "databases",
    variants: ["databases"],
    flag: Flags.custom<Array<{ name: string; id: string }>>({
      char: "d",
      description:
        "Comma-separated list of database IDs to export. Can be provided as comma-separated IDs or configured in config file.",
      parse: async (input) => {
        // Parse comma-separated database IDs
        return input.split(",").map((id) => ({ name: "", id: id.trim() }));
      }
    }),
    schema: () =>
      z4.array(
        z4.object({
          name: z4.string().optional(),
          id: z4.string()
        })
      )
  }
};

export type ResolvedConfig = {
  token: string;
  output?: string;
  concurrency?: number;
  depth?: number;
  retries?: number;
  databases?: Array<{ name: string; id: string }>;
};

/**
 * Maps various input property names to standardized config properties.
 *
 * @param rawConfig - The raw config object with potentially varied property names
 * @returns A ResolvedConfig object with standardized property names
 */
export const mapConfigProperties = (rawConfig: Record<string, any>): ResolvedConfig => {
  const resolvedConfig: Partial<ResolvedConfig> = {};

  // Iterate through each property mapping.
  for (const [targetProperty, sourceVariations] of Object.entries(parseables)) {
    for (const sourceProperty of sourceVariations.variants) {
      if (rawConfig[sourceProperty] !== undefined) {
        const value = rawConfig[sourceProperty];

        // Handle type conversion and assignment with proper typing.
        switch (targetProperty) {
          case "token":
            resolvedConfig.token = value;
            break;
          case "output":
            resolvedConfig.output = value;
            break;
          case "concurrency":
            resolvedConfig.concurrency = typeof value === "string" ? parseInt(value) : value;
            break;
          case "depth":
            resolvedConfig.depth = typeof value === "string" ? parseInt(value) : value;
            break;
          case "retries":
            resolvedConfig.retries = typeof value === "string" ? parseInt(value) : value;
            break;
          case "databases":
            resolvedConfig.databases = value;
            break;
        }

        // Use the first found value (maintains precedence).
        break;
      }
    }
  }

  // Validate required fields.
  // if (!resolvedConfig.token) {
  //   throw new Error("NOTION_TOKEN or TOKEN environment variable is required");
  // }

  return resolvedConfig as ResolvedConfig;
};

// const injectInspection = (schema: () => z4.ZodType<any>) => {
//   console.log("🔍 Injecting inspection for:", schema, schema().description, schema().meta);
//   return z4.preprocess((value) => {
//     console.log("🔍 Inspecting:", value);
//     return value;
//   }, schema());
// };

/**
 * Creates a complete schema object based on the parseables configuration.
 *
 * @returns A Zod schema that includes all possible input variations
 */
export const createConfigSchema = () => {
  const schema: Record<string, z4.ZodType<any>> = {};

  // Create schema entries for ALL possible input variations.
  for (const name in parseables) {
    for (const variant of parseables[name].variants) {
      // schema[name] = injectInspection(parseables[name].schema);

      if (parseables[name].debug) {
        schema[name] = z4.preprocess((value) => {
          console.log("🔍 Inspecting:", name, value);
          return value;
        }, parseables[name].schema().optional());
      } else {
        schema[name] = parseables[name].schema().optional();
      }
    }

    // for (const sourceName of sourceVariations.names) {
    //   // Add preprocessing to inspect values BEFORE validation.
    //   const baseSchema = sourceVariations.schema();
    //   const schemaWithInspection = z4.preprocess((value) => {
    //     console.log(
    //       `🔍 Inspecting ${sourceName} (target: ${targetProperty}):`,
    //       typeof value,
    //       Array.isArray(value) ? `Array[${value.length}]` : value
    //     );
    //     return value;
    //   }, baseSchema);

    //   // For string/number properties that come from env vars, we need to handle them as strings initially
    //   // since environment variables are always strings.
    //   if (targetProperty === "token") {
    //     schemaObject[sourceName] = schemaWithInspection.optional();
    //   } else if (["concurrency", "depth", "retries"].includes(targetProperty)) {
    //     // Numbers can come as strings from env vars, so accept both
    //     schemaObject[sourceName] = z4.union([z4.string(), z4.number()]).optional();
    //   } else if (targetProperty === "databases") {
    //     // Use the custom array schema for databases.
    //     schemaObject[sourceName] = schemaWithInspection.optional();
    //   } else {
    //     // String properties.
    //     schemaObject[sourceName] = z4.string().optional();
    //   }

    //     schemaObject[sourceName] = sourceVariations[sourceName].schema;
    // }
  }

  return z4.object(schema);
};

/**
 * Loads the config from the environment variables or the config file.
 *
 * @remarks
 * This is a workaround to load the config from the environment variables
 * or the config file.
 *
 * The root cause is:
 * - ESM Module Type: This project is configured as "type": "module" in
 *   package.json, which means everything is treated as ESM modules.
 * - Hook Compilation Path: The oclif configuration points to "./dist/hooks/preparse"
 *   but hooks need to be compiled to JavaScript first, and the compiled version may have module resolution issues.
 * - External Package Import: The zod-config package may not be fully compatible with ESM or may have circular
 *   dependencies that cause issues during hook execution.
 * - Hooks are not compiled to JavaScript: The hooks are not compiled to JavaScript, so the import statements are
 *   not resolved correctly.
 *
 * @returns The config object.
 */
export const loadConfig = async (): Promise<ResolvedConfig> => {
  try {
    const { loadConfigSync } = await import("zod-config");
    const { envAdapter } = await import("zod-config/env-adapter");

    const schema = createConfigSchema();

    const rawConfig = loadConfigSync({
      schema,
      adapters: [
        // YAML file is read first.
        // .env file is read second.
        yamlAdapter({
          path: path.join(process.cwd(), "notion-sync.yaml")
        }),
        dotEnvAdapter({
          path: path.join(process.cwd(), ".env")
        }),
        // Environment variables are read last (highest precedence - will override YAML and .env)
        envAdapter({
          customEnv: process.env
        })
      ]
    });

    // log.debug.inspect("rawConfig", rawConfig);

    // Use the central mapping method.
    const resolvedConfig = mapConfigProperties(rawConfig);

    // log.debug.inspect("resolvedConfig", resolvedConfig);
    log.debug.inspect("fallbackConfig", resolvedConfig);

    return resolvedConfig;
  } catch (error) {
    log.error("Config loading failed, falling back to environment variables:", error);

    // Use the central mapping method for fallback as well.
    const fallbackConfig = mapConfigProperties(process.env);

    return fallbackConfig;
  }
};

export const config = await loadConfig();

log.debug.inspect("final config", config);

/**
 * Creates a flag that uses config values as defaults when the flag is not provided.
 *
 * @param flag - The key in the resolved config object
 * @param value - The default value
 * @returns The configured flag
 */
export function resolveFlags(flags: Record<string, any>): Record<string, any> {
  return flags;
}
