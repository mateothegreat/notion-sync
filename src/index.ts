/**
 * Notion Sync - Event-Driven Architecture
 * 
 * Main entry point for the refactored Notion Sync application
 */

// Core exports
export { NotionSyncApp } from './application/notion-sync-app';

// Control Plane exports
export { 
  createControlPlane, 
  ControlPlane, 
  BrokerBus,
  MessageBus,
  InMemoryAdapter
} from './lib/control-plane';

// Domain exports
export { Export, ExportFactory } from './core/domain/export';
export { Page, Database, Block, NotionObjectFactory } from './core/domain/notion-objects';

// Service exports
export { ExportService } from './core/services/export-service';
export { ProgressService } from './core/services/progress-service';

// Command exports
export { 
  ExportCommandHandlers,
  ExportCommandFactory
} from './application/commands/export-commands';

// Infrastructure exports
export { NotionClient } from './infrastructure/notion/notion-client';

// Event exports
export { 
  ExportEvents,
  NotionEvents,
  CircuitBreakerEvents,
  ProgressEvents,
  FileSystemEvents,
  PerformanceEvents
} from './core/events';

// Type exports
export * from './shared/types';

// Error exports
export * from './shared/errors';

// Utility function to create a configured application
export function createNotionSyncApp(config: any) {
  return new NotionSyncApp(config);
}

// Default configuration factory
export function createDefaultConfig(apiKey: string, outputPath: string = './exports') {
  return {
    notion: {
      apiKey,
      apiVersion: '2022-06-28',
      baseUrl: 'https://api.notion.com',
      timeout: 30000,
      retryAttempts: 3
    },
    export: {
      defaultOutputPath: outputPath,
      defaultFormat: 'json' as any,
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
      level: 'info' as any,
      format: 'text' as any,
      outputs: ['console' as any]
    }
  };
}

// Quick start function
export async function quickStart(apiKey: string, databases: string[], outputPath?: string) {
  const config = createDefaultConfig(apiKey, outputPath);
  const app = createNotionSyncApp(config);
  
  await app.start();
  
  const exportService = app.getExportService();
  const export_ = await exportService.createExport({
    outputPath: config.export.defaultOutputPath,
    format: config.export.defaultFormat,
    includeBlocks: true,
    includeComments: false,
    includeProperties: true,
    databases,
    pages: []
  });
  
  await exportService.startExport(export_.id);
  
  return {
    app,
    exportId: export_.id,
    async waitForCompletion() {
      return new Promise((resolve, reject) => {
        const controlPlane = app.getControlPlane();
        
        controlPlane.subscribe('domain-events', async (message) => {
          const event = message.payload;
          
          if (event.aggregateId === export_.id) {
            switch (event.type) {
              case 'export.completed':
                resolve(event.payload);
                break;
              case 'export.failed':
              case 'export.cancelled':
                reject(new Error(`Export ${event.type.split('.')[1]}: ${event.payload.error?.message || event.payload.reason}`));
                break;
            }
          }
        });
      });
    }
  };
}