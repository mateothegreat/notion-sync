/**
 * Unified Configuration System
 *
 * Type-safe configuration management with environment variables,
 * validation, and multiple source support
 */
import { promises as fs } from "fs";
import { join } from "path";
import { z } from "zod";

/**
 * Notion API Configuration Schema
 */
const NotionConfigSchema = z
  .object({
    apiKey: z.string().default(""),
    apiVersion: z.string().default("2022-06-28"),
    baseUrl: z.string().url().default("https://api.notion.com"),
    timeout: z.number().positive().default(30000),
    retryAttempts: z.number().min(0).max(10).default(3)
  })
  .refine(
    (data) => {
      // API key is required unless this is default configuration
      return data.apiKey.length > 0;
    },
    {
      message: "Notion API key is required",
      path: ["apiKey"]
    }
  );

/**
 * Export Configuration Schema
 */
const ExportConfigSchema = z.object({
  defaultOutputPath: z.string().default("./exports"),
  defaultFormat: z.enum(["json", "markdown", "html", "csv"]).default("json"),
  maxConcurrency: z.number().positive().max(50).default(5),
  chunkSize: z.number().positive().default(100),
  enableResume: z.boolean().default(true),
  maxDepth: z.number().min(0).max(10).default(3),
  includeArchived: z.boolean().default(false)
});

/**
 * Performance Configuration Schema
 */
const PerformanceConfigSchema = z.object({
  rateLimits: z.object({
    pages: z.number().positive().default(10),
    blocks: z.number().positive().default(15),
    databases: z.number().positive().default(5),
    comments: z.number().positive().default(8),
    users: z.number().positive().default(3),
    properties: z.number().positive().default(20)
  }),
  circuitBreaker: z.object({
    failureThreshold: z.number().positive().default(5),
    resetTimeout: z.number().positive().default(60000),
    monitoringPeriod: z.number().positive().default(60000)
  }),
  caching: z.object({
    enabled: z.boolean().default(false),
    ttl: z.number().positive().default(300000), // 5 minutes
    maxSize: z.number().positive().default(1000)
  }),
  memoryLimits: z.object({
    heapWarningThreshold: z
      .number()
      .positive()
      .default(200 * 1024 * 1024), // 200MB
    heapErrorThreshold: z
      .number()
      .positive()
      .default(400 * 1024 * 1024), // 400MB
    autoGcThreshold: z
      .number()
      .positive()
      .default(150 * 1024 * 1024) // 150MB
  })
});

/**
 * Monitoring Configuration Schema
 */
const MonitoringConfigSchema = z.object({
  enableMetrics: z.boolean().default(false),
  enableLogging: z.boolean().default(true),
  logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),
  enableHealthCheck: z.boolean().default(true),
  metricsPort: z.number().positive().default(3001),
  healthCheckPort: z.number().positive().default(3000),
  exportMetrics: z.boolean().default(false),
  prometheusEndpoint: z.string().default("/metrics")
});

/**
 * Security Configuration Schema
 */
const SecurityConfigSchema = z.object({
  enableApiKeyRotation: z.boolean().default(false),
  apiKeyRotationInterval: z
    .number()
    .positive()
    .default(24 * 60 * 60 * 1000), // 24 hours
  enableRequestSigning: z.boolean().default(false),
  maxRequestSize: z
    .number()
    .positive()
    .default(10 * 1024 * 1024), // 10MB
  allowedOrigins: z.array(z.string()).default([]),
  enableCors: z.boolean().default(false)
});

/**
 * Deployment Configuration Schema
 */
const DeploymentConfigSchema = z.object({
  environment: z.enum(["development", "staging", "production"]).default("development"),
  nodeEnv: z.string().default("development"),
  port: z.number().positive().default(3000),
  enableClusterMode: z.boolean().default(false),
  maxWorkers: z.number().positive().default(4),
  gracefulShutdownTimeout: z.number().positive().default(30000),
  pidFile: z.string().optional(),
  enableHotReload: z.boolean().default(false)
});

/**
 * Complete Application Configuration Schema
 */
export const AppConfigSchema = z.object({
  notion: NotionConfigSchema,
  export: ExportConfigSchema,
  performance: PerformanceConfigSchema,
  monitoring: MonitoringConfigSchema,
  security: SecurityConfigSchema,
  deployment: DeploymentConfigSchema
});

/**
 * Inferred TypeScript type from schema
 */
export type AppConfig = z.infer<typeof AppConfigSchema>;

/**
 * Configuration loading options
 */
export interface ConfigOptions {
  configFile?: string;
  envPrefix?: string;
  validate?: boolean;
  allowUnknown?: boolean;
  schema?: z.ZodSchema;
}

/**
 * Default configuration values
 */
export const defaultConfig: AppConfig = {
  notion: {
    apiKey: "",
    apiVersion: "2022-06-28",
    baseUrl: "https://api.notion.com",
    timeout: 30000,
    retryAttempts: 3
  },
  export: {
    defaultOutputPath: "./exports",
    defaultFormat: "json",
    maxConcurrency: 5,
    chunkSize: 100,
    enableResume: true,
    maxDepth: 3,
    includeArchived: false
  },
  performance: {
    rateLimits: {
      pages: 10,
      blocks: 15,
      databases: 5,
      comments: 8,
      users: 3,
      properties: 20
    },
    circuitBreaker: {
      failureThreshold: 5,
      resetTimeout: 60000,
      monitoringPeriod: 60000
    },
    caching: {
      enabled: false,
      ttl: 300000,
      maxSize: 1000
    },
    memoryLimits: {
      heapWarningThreshold: 200 * 1024 * 1024,
      heapErrorThreshold: 400 * 1024 * 1024,
      autoGcThreshold: 150 * 1024 * 1024
    }
  },
  monitoring: {
    enableMetrics: false,
    enableLogging: true,
    logLevel: "info",
    enableHealthCheck: true,
    metricsPort: 3001,
    healthCheckPort: 3000,
    exportMetrics: false,
    prometheusEndpoint: "/metrics"
  },
  security: {
    enableApiKeyRotation: false,
    apiKeyRotationInterval: 24 * 60 * 60 * 1000,
    enableRequestSigning: false,
    maxRequestSize: 10 * 1024 * 1024,
    allowedOrigins: [],
    enableCors: false
  },
  deployment: {
    environment: "development",
    nodeEnv: "development",
    port: 3000,
    enableClusterMode: false,
    maxWorkers: 4,
    gracefulShutdownTimeout: 30000,
    enableHotReload: false
  }
};

/**
 * Environment variable mapping
 */
const ENV_MAPPING = {
  NOTION_SYNC_NOTION_API_KEY: "notion.apiKey",
  NOTION_SYNC_NOTION_API_VERSION: "notion.apiVersion",
  NOTION_SYNC_NOTION_BASE_URL: "notion.baseUrl",
  NOTION_SYNC_NOTION_TIMEOUT: "notion.timeout",
  NOTION_SYNC_NOTION_RETRY_ATTEMPTS: "notion.retryAttempts",

  NOTION_SYNC_EXPORT_OUTPUT_PATH: "export.defaultOutputPath",
  NOTION_SYNC_EXPORT_FORMAT: "export.defaultFormat",
  NOTION_SYNC_EXPORT_MAX_CONCURRENCY: "export.maxConcurrency",
  NOTION_SYNC_EXPORT_CHUNK_SIZE: "export.chunkSize",
  NOTION_SYNC_EXPORT_ENABLE_RESUME: "export.enableResume",
  NOTION_SYNC_EXPORT_MAX_DEPTH: "export.maxDepth",
  NOTION_SYNC_EXPORT_INCLUDE_ARCHIVED: "export.includeArchived",

  NOTION_SYNC_PERF_RATE_LIMIT_PAGES: "performance.rateLimits.pages",
  NOTION_SYNC_PERF_RATE_LIMIT_BLOCKS: "performance.rateLimits.blocks",
  NOTION_SYNC_PERF_RATE_LIMIT_DATABASES: "performance.rateLimits.databases",
  NOTION_SYNC_PERF_CIRCUIT_BREAKER_THRESHOLD: "performance.circuitBreaker.failureThreshold",
  NOTION_SYNC_PERF_CIRCUIT_BREAKER_RESET_TIMEOUT: "performance.circuitBreaker.resetTimeout",

  NOTION_SYNC_MONITORING_ENABLE_METRICS: "monitoring.enableMetrics",
  NOTION_SYNC_MONITORING_ENABLE_LOGGING: "monitoring.enableLogging",
  NOTION_SYNC_MONITORING_LOG_LEVEL: "monitoring.logLevel",
  NOTION_SYNC_MONITORING_ENABLE_HEALTH_CHECK: "monitoring.enableHealthCheck",
  NOTION_SYNC_MONITORING_METRICS_PORT: "monitoring.metricsPort",
  NOTION_SYNC_MONITORING_HEALTH_CHECK_PORT: "monitoring.healthCheckPort",

  NOTION_SYNC_SECURITY_ENABLE_API_KEY_ROTATION: "security.enableApiKeyRotation",
  NOTION_SYNC_SECURITY_API_KEY_ROTATION_INTERVAL: "security.apiKeyRotationInterval",
  NOTION_SYNC_SECURITY_MAX_REQUEST_SIZE: "security.maxRequestSize",
  NOTION_SYNC_SECURITY_ENABLE_CORS: "security.enableCors",

  NOTION_SYNC_DEPLOYMENT_ENVIRONMENT: "deployment.environment",
  NOTION_SYNC_DEPLOYMENT_NODE_ENV: "deployment.nodeEnv",
  NOTION_SYNC_DEPLOYMENT_PORT: "deployment.port",
  NOTION_SYNC_DEPLOYMENT_ENABLE_CLUSTER_MODE: "deployment.enableClusterMode",
  NOTION_SYNC_DEPLOYMENT_MAX_WORKERS: "deployment.maxWorkers",
  NOTION_SYNC_DEPLOYMENT_GRACEFUL_SHUTDOWN_TIMEOUT: "deployment.gracefulShutdownTimeout"
};

/**
 * Set nested object value using dot notation
 */
function setNestedValue(obj: any, path: string, value: any): void {
  const keys = path.split(".");
  let current = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!(key in current)) {
      current[key] = {};
    }
    current = current[key];
  }

  const finalKey = keys[keys.length - 1];

  // Type conversion based on schema
  if (typeof value === "string") {
    // Try to parse as number or boolean
    if (value === "true") {
      current[finalKey] = true;
    } else if (value === "false") {
      current[finalKey] = false;
    } else if (!isNaN(Number(value))) {
      current[finalKey] = Number(value);
    } else {
      current[finalKey] = value;
    }
  } else {
    current[finalKey] = value;
  }
}

/**
 * Load configuration from environment variables
 */
function loadFromEnvironment(envPrefix: string = "NOTION_SYNC_"): Partial<AppConfig> {
  const config: any = {};

  // Load from predefined mapping
  for (const [envKey, configPath] of Object.entries(ENV_MAPPING)) {
    const value = process.env[envKey];
    if (value !== undefined) {
      setNestedValue(config, configPath, value);
    }
  }

  // Load additional environment variables with prefix
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith(envPrefix) && !(key in ENV_MAPPING) && value !== undefined) {
      // Convert NOTION_SYNC_SOME_VALUE to some.value
      const configKey = key.replace(envPrefix, "").toLowerCase().replace(/_/g, ".");

      setNestedValue(config, configKey, value);
    }
  }

  return config;
}

/**
 * Load configuration from file
 */
async function loadFromFile(filePath: string): Promise<Partial<AppConfig>> {
  try {
    const content = await fs.readFile(filePath, "utf-8");

    if (filePath.endsWith(".json")) {
      return JSON.parse(content);
    } else if (filePath.endsWith(".js")) {
      // Dynamic import for JS config files
      const configModule = await import(filePath);
      return configModule.default || configModule;
    } else {
      throw new Error(`Unsupported config file format: ${filePath}`);
    }
  } catch (error) {
    if ((error as any).code === "ENOENT") {
      return {}; // File doesn't exist, return empty config
    }
    throw error;
  }
}

/**
 * Merge configuration objects with deep merging
 */
function mergeConfigs(...configs: Partial<AppConfig>[]): Partial<AppConfig> {
  const result: any = {};

  for (const config of configs) {
    for (const [key, value] of Object.entries(config)) {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        result[key] = { ...result[key], ...value };
      } else {
        result[key] = value;
      }
    }
  }

  return result;
}

/**
 * Load and validate configuration from multiple sources
 */
export async function loadConfig(options: ConfigOptions = {}): Promise<AppConfig> {
  const {
    configFile = "notion-sync.config.json",
    envPrefix = "NOTION_SYNC_",
    validate = true,
    schema = AppConfigSchema
  } = options;

  // Load configuration from multiple sources in order of precedence
  const configs: Partial<AppConfig>[] = [];

  // 1. Default configuration
  configs.push(defaultConfig);

  // 2. Configuration file(s)
  const configFiles = [
    configFile,
    "notion-sync.config.js",
    "notion-sync.config.json",
    join(process.cwd(), ".notion-sync.json"),
    join(process.cwd(), "config/notion-sync.json")
  ];

  for (const file of configFiles) {
    try {
      const fileConfig = await loadFromFile(file);
      if (Object.keys(fileConfig).length > 0) {
        configs.push(fileConfig);
        break; // Use first found config file
      }
    } catch {
      // Continue to next file
    }
  }

  // 3. Environment variables
  configs.push(loadFromEnvironment(envPrefix));

  // 4. Process arguments (simple key=value pairs)
  const argConfig: any = {};
  for (const arg of process.argv.slice(2)) {
    if (arg.includes("=")) {
      const [key, value] = arg.split("=", 2);
      if (key.startsWith("--")) {
        const configKey = key.replace("--", "").replace(/-/g, ".");
        setNestedValue(argConfig, configKey, value);
      }
    }
  }
  configs.push(argConfig);

  // Merge all configurations
  const mergedConfig = mergeConfigs(...configs);

  // Validate configuration
  if (validate) {
    try {
      return schema.parse(mergedConfig);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const issues = error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("\n");
        throw new Error(`Configuration validation failed:\n${issues}`);
      }
      throw error;
    }
  }

  return mergedConfig as AppConfig;
}

/**
 * Create a configuration loader with custom schema
 */
export function createConfigLoader<T>(schema: z.ZodSchema<T>) {
  return async (options: ConfigOptions = {}): Promise<T> => {
    return loadConfig({ ...options, schema }) as Promise<T>;
  };
}

/**
 * Get configuration for specific section
 */
export function getConfigSection<K extends keyof AppConfig>(config: AppConfig, section: K): AppConfig[K] {
  return config[section];
}

/**
 * Validate partial configuration
 */
export function validateConfig(config: unknown): AppConfig {
  return AppConfigSchema.parse(config);
}

/**
 * Export configuration to file
 */
export async function exportConfig(config: AppConfig, filePath: string): Promise<void> {
  const content = JSON.stringify(config, null, 2);
  await fs.writeFile(filePath, content, "utf-8");
}

/**
 * Watch configuration file for changes
 */
export function watchConfig(filePath: string, callback: (config: AppConfig) => void): { stop: () => void } {
  // Use standard fs.watch for Node.js
  const fs_watch = require("fs").watch;

  if (typeof fs_watch !== "function") {
    throw new Error("File watching not supported in this environment");
  }

  const watcher = fs_watch(filePath, async () => {
    try {
      const config = await loadConfig({ configFile: filePath });
      callback(config);
    } catch (error) {
      console.error("Error reloading configuration:", error);
    }
  });

  return {
    stop: () => {
      if (watcher && typeof watcher.close === "function") {
        watcher.close();
      }
    }
  };
}

/**
 * Create environment-specific configuration
 */
export function createEnvironmentConfig(environment: string): Partial<AppConfig> {
  const envConfigs: Record<string, Partial<AppConfig>> = {
    development: {
      monitoring: {
        enableMetrics: true,
        logLevel: "debug"
      },
      performance: {
        rateLimits: {
          pages: 5,
          blocks: 10,
          databases: 3
        }
      }
    },
    staging: {
      monitoring: {
        enableMetrics: true,
        logLevel: "info"
      },
      performance: {
        rateLimits: {
          pages: 8,
          blocks: 12,
          databases: 4
        }
      }
    },
    production: {
      monitoring: {
        enableMetrics: true,
        enableHealthCheck: true,
        logLevel: "warn"
      },
      performance: {
        rateLimits: {
          pages: 10,
          blocks: 15,
          databases: 5
        }
      },
      security: {
        enableApiKeyRotation: true,
        enableRequestSigning: true
      }
    }
  };

  return envConfigs[environment] || {};
}

/**
 * Global configuration instance
 */
let globalConfig: AppConfig | null = null;

/**
 * Initialize global configuration
 */
export async function initializeGlobalConfig(options?: ConfigOptions): Promise<AppConfig> {
  globalConfig = await loadConfig(options);
  return globalConfig;
}

/**
 * Get global configuration
 */
export function getGlobalConfig(): AppConfig {
  if (!globalConfig) {
    throw new Error("Global configuration not initialized. Call initializeGlobalConfig() first.");
  }
  return globalConfig;
}

/**
 * Check if global configuration is initialized
 */
export function isConfigInitialized(): boolean {
  return globalConfig !== null;
}
