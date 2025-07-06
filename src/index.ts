/**
 * Notion Sync - Event-Driven Architecture
 *
 * Main entry point for the refactored Notion Sync application
 */

// Control Plane exports
export { BrokerBus, ControlPlane, createControlPlane, InMemoryAdapter, MessageBus } from "./lib/control-plane";

// Domain exports
export { Export, ExportFactory } from "./core/domain/export";
export { Block, Database, NotionObjectFactory, Page } from "./core/domain/notion-objects";

// Service exports
export { ExportService } from "./core/services/export-service";
export { ProgressService } from "./core/services/progress-service";

// Infrastructure exports
export { NotionClient } from "./infrastructure/notion/notion-client";

// Event exports
export {
  CircuitBreakerEvents,
  ExportEvents,
  FileSystemEvents,
  NotionEvents,
  PerformanceEvents,
  ProgressEvents
} from "./core/events";

// Type exports
export * from "./shared/types";

// Error exports
export * from "./shared/errors";

// Library exports
export * from "./lib";

// New Exporter
import { config } from "./lib/config-loader";
import { ExporterConfig } from "./lib/export/config";
import { NewExporter } from "./lib/export/new_exporter";

async function testExport() {
  const exporterConfig: ExporterConfig = {
    token: config.token || "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",
    output: "./exports",
    concurrency: 5,
    rate: 3,
    timeout: 30000,
    retries: 3,
    depth: 2,
    comments: false,
    archived: false,
    properties: false
  };

  const exporter = new NewExporter(exporterConfig);
  const result = await exporter.export();
  console.log("Export Result:", result);
}

testExport();

// Default configuration factory
export function createDefaultConfig(apiKey: string, outputPath: string = "./exports") {
  return {
    notion: {
      apiKey,
      apiVersion: "2022-06-28",
      baseUrl: "https://api.notion.com",
      timeout: 30000,
      retryAttempts: 3
    },
    export: {
      defaultOutputPath: outputPath,
      defaultFormat: "json" as any,
      maxConcurrency: 10,
      chunkSize: 100,
      enableResume: true
    },
    performance: {
      rateLimits: {
        pages: 10,
        blocks: 20,
        databases: 5,
        comments: 15,
        users: 5,
        properties: 10
      },
      circuitBreaker: {
        failureThreshold: 5,
        resetTimeout: 30000,
        monitoringPeriod: 60000
      },
      caching: {
        enabled: true,
        ttl: 300000, // 5 minutes
        maxSize: 1000
      }
    },
    logging: {
      level: "info" as any,
      format: "text" as any,
      outputs: ["console" as any]
    }
  };
}
