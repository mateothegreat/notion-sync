import { log } from "$lib/log";
import { readFileSync } from "fs";
import path, { join } from "path";
import { parse } from "yaml";
import { dotEnvAdapter } from "zod-config/dotenv-adapter";
import { yamlAdapter } from "zod-config/yaml-adapter";
import z4 from "zod/v4";

/**
 * Test timeout configuration mapping test names to timeout values in milliseconds.
 */
export type TestTimeouts = {
  [key: string]: number;
};

/**
 * Default test timeouts for various test categories.
 */
export const testTimeouts: TestTimeouts = {
  "notion-client": 60_000,
  "notion-api": 60_000,
  "notion-api-rate-limit": 60_000,
  "notion-api-rate-limit-hit": 60_000,
  "notion-api-rate-limit-hit-rate": 60_000,
  "config-validation": 10_000,
  "export-service": 30_000,
  "progress-service": 15_000,
  "control-plane": 20_000,
  integration: 120_000
};

/**
 * Individual test configuration with environment variables and custom config.
 */
export type Test = {
  name: string;
  timeout: number;
  env: Record<string, string>;
  config: Record<string, any>;
  skip?: boolean;
  only?: boolean;
  tags?: string[];
};

/**
 * Test group containing related tests with shared configuration.
 */
export type TestGroup = {
  name: string;
  description?: string;
  setup?: Record<string, any>;
  teardown?: Record<string, any>;
  tests: Record<string, Test>;
};

/**
 * Complete test configuration structure for YAML loading.
 */
export type TestConfig = {
  timeouts: TestTimeouts;
  env: Record<string, string>;
  config: Record<string, any>;
  groups: Record<string, TestGroup>;
};

/**
 * YAML test configuration loader with fallback to default values.
 */
export class TestConfigLoader {
  private static instance: TestConfigLoader;
  private config: TestConfig | null = null;

  private constructor() {}

  /**
   * Get singleton instance of the test configuration loader.
   */
  public static getInstance(): TestConfigLoader {
    if (!TestConfigLoader.instance) {
      TestConfigLoader.instance = new TestConfigLoader();
    }
    return TestConfigLoader.instance;
  }

  /**
   * Load test configuration from YAML file with fallback to defaults.
   *
   * @param configPath - Path to the YAML configuration file
   * @returns Parsed test configuration
   */
  public loadConfig(configPath?: string): TestConfig {
    if (this.config) {
      return this.config;
    }

    const defaultConfigPath = join(process.cwd(), "test", "config.yaml");
    const yamlPath = configPath || defaultConfigPath;

    try {
      const yamlContent = readFileSync(yamlPath, "utf8");
      const yamlConfig = parse(yamlContent) as Partial<TestConfig>;

      this.config = this.mergeWithDefaults(yamlConfig);
    } catch (error) {
      console.warn(`Failed to load test config from ${yamlPath}, using defaults:`, error);
      this.config = this.getDefaultConfig();
    }

    return this.config;
  }

  /**
   * Merge YAML configuration with default values.
   */
  private mergeWithDefaults(yamlConfig: Partial<TestConfig>): TestConfig {
    const defaultConfig = this.getDefaultConfig();

    return {
      timeouts: { ...defaultConfig.timeouts, ...yamlConfig.timeouts },
      env: { ...defaultConfig.env, ...yamlConfig.env },
      config: { ...defaultConfig.config, ...yamlConfig.config },
      groups: { ...defaultConfig.groups, ...yamlConfig.groups }
    };
  }

  /**
   * Get default test configuration.
   */
  private getDefaultConfig(): TestConfig {
    return {
      timeouts: testTimeouts,
      env: {
        NODE_ENV: "test",
        LOG_LEVEL: "error"
      },
      config: {
        notion: {
          apiKey: "test-key",
          apiVersion: "2022-06-28",
          baseUrl: "https://api.notion.com",
          timeout: 30000,
          retryAttempts: 3
        },
        export: {
          defaultOutputPath: "./test-exports",
          defaultFormat: "json" as const,
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
          }
        }
      },
      groups: {
        notion: {
          name: "Notion API Tests",
          description: "Tests for Notion API client and related functionality",
          tests: {
            config: {
              name: "Configuration validation",
              timeout: testTimeouts["config-validation"],
              env: {},
              config: {},
              tags: ["config", "validation"]
            },
            client: {
              name: "Notion client operations",
              timeout: testTimeouts["notion-client"],
              env: {},
              config: {},
              tags: ["notion", "client"]
            }
          }
        },
        export: {
          name: "Export Service Tests",
          description: "Tests for export functionality and services",
          tests: {
            service: {
              name: "Export service operations",
              timeout: testTimeouts["export-service"],
              env: {},
              config: {},
              tags: ["export", "service"]
            },
            progress: {
              name: "Progress tracking",
              timeout: testTimeouts["progress-service"],
              env: {},
              config: {},
              tags: ["progress", "tracking"]
            }
          }
        },
        integration: {
          name: "Integration Tests",
          description: "End-to-end integration tests",
          tests: {
            fullExport: {
              name: "Complete export workflow",
              timeout: testTimeouts["integration"],
              env: {
                INTEGRATION_TEST: "true"
              },
              config: {},
              tags: ["integration", "e2e"]
            }
          }
        }
      }
    };
  }

  /**
   * Reset the configuration cache.
   */
  public reset(): void {
    this.config = null;
  }
}

/**
 * Global test configuration instance.
 */
export const testConfigLoader = TestConfigLoader.getInstance();

/**
 * Load and get the current test configuration.
 */
export function getTestConfig(configPath?: string): TestConfig {
  return testConfigLoader.loadConfig(configPath);
}

/**
 * Get a specific test group configuration.
 */
export function getTestGroup(groupName: string, configPath?: string): TestGroup | undefined {
  const config = getTestConfig(configPath);
  return config.groups[groupName];
}

/**
 * Get a specific test configuration from a group.
 */
export function getTest(groupName: string, testName: string, configPath?: string): Test | undefined {
  const group = getTestGroup(groupName, configPath);
  return group?.tests[testName];
}

/**
 * Legacy export for backward compatibility.
 */
export const testConfigs: Record<string, TestGroup> = getTestConfig().groups;

export const loadConfig = async (): Promise<TestConfig> => {
  try {
    const { loadConfigSync } = await import("zod-config");
    const { envAdapter } = await import("zod-config/env-adapter");

    const loadedConfig = loadConfigSync({
      schema: z4.object({
        timeouts: z4.record(z4.string(), z4.number()),
        env: z4.record(z4.string(), z4.string()),
        config: z4.record(z4.string(), z4.any()),
        groups: z4.record(z4.string(), z4.any()),
        tests: z4.record(z4.string(), z4.any())
      }),
      adapters: [
        // YAML file is read first.
        // .env file is read second.
        yamlAdapter({
          path: path.join(process.cwd(), "test", "config", "defaults.yaml")
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

    return loadedConfig;
  } catch (error) {
    log.error("Config loading failed, falling back to environment variables:", error);
    throw error;
  }
};
