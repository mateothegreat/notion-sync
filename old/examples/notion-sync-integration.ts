/**
 * Notion Sync Integration Examples
 *
 * Shows how to integrate the control plane with the existing Notion Sync application
 */

import { createControlPlane } from "../index";
import { Subject } from "rxjs";
import { retry } from "../../operations";

// Example integration with existing Notion Sync components

// 1. Replace EventEmitter with Control Plane Channels
export class NotionExportManager {
  private progressChannel: Subject<{
    processed: number;
    total: number;
    currentSection: string;
  }>;

  private errorChannel: Subject<{
    operation: string;
    error: Error;
    objectId?: string;
  }>;

  constructor(
    private controlPlane: any,
    private notionClient: any
  ) {
    // Create typed channels for different event types
    this.progressChannel = controlPlane.brokerChannel("export-progress");
    this.errorChannel = controlPlane.brokerChannel("export-errors");
  }

  async exportDatabase(databaseId: string) {
    // Use circuit breaker for API calls
    const apiBreaker = this.controlPlane.getCircuitBreaker("notion-api", {
      failureThreshold: 5,
      resetTimeout: 30000,
      monitoringPeriod: 60000,
      expectedErrors: ["rate_limited", "timeout"]
    });

    try {
      // Get database info with circuit breaker protection
      const database = await apiBreaker.execute(async () => {
        return this.notionClient.databases.retrieve({ database_id: databaseId });
      });

      // Emit progress
      this.progressChannel.next({
        processed: 0,
        total: 1,
        currentSection: "database-info"
      });

      // Query database pages with retry logic
      const pages = await this.queryDatabasePages(databaseId);

      // Process pages
      for (let i = 0; i < pages.length; i++) {
        await this.processPage(pages[i]);

        this.progressChannel.next({
          processed: i + 1,
          total: pages.length,
          currentSection: "pages"
        });
      }

      return { database, pages };
    } catch (error) {
      this.errorChannel.next({
        operation: "exportDatabase",
        error: error as Error,
        objectId: databaseId
      });
      throw error;
    }
  }

  private async queryDatabasePages(databaseId: string) {
    // Use the existing retry logic with control plane integration
    return retry({
      fn: async () => {
        const response = await this.notionClient.databases.query({
          database_id: databaseId
        });
        return response.results;
      },
      operation: "queryDatabasePages",
      context: {
        op: "read",
        priority: "normal",
        circuitBreaker: this.controlPlane.getCircuitBreaker("notion-api"),
        objectId: databaseId
      },
      maxRetries: 3,
      baseDelay: 1000,
      emitter: {
        emit: (event: string, data: any) => {
          // Emit to control plane channels instead of EventEmitter
          if (event === "retry") {
            this.progressChannel.next({
              processed: 0,
              total: 0,
              currentSection: `retrying-${data.name}`
            });
          }
        }
      }
    });
  }

  private async processPage(page: any) {
    // Process individual page
    console.log(`Processing page: ${page.id}`);
  }

  // Subscribe to events
  onProgress(handler: (progress: any) => void) {
    return this.progressChannel.subscribe(handler);
  }

  onError(handler: (error: any) => void) {
    return this.errorChannel.subscribe(handler);
  }
}

// 2. State Management for Export Progress
export class ExportStateManager {
  private exportState: any;
  private progressState: any;

  constructor(private controlPlane: any) {
    // Register immutable state for export configuration
    this.exportState = controlPlane.registerImmutableState("export-config", {
      outputPath: "",
      format: "json",
      includeBlocks: true,
      databases: [] as string[],
      pages: [] as string[]
    });

    // Register mutable state for real-time progress tracking
    this.progressState = controlPlane.registerMutableState("export-progress", {
      isRunning: false,
      currentOperation: "",
      processed: 0,
      total: 0,
      errors: [] as any[],
      startTime: 0,
      estimatedCompletion: 0
    });
  }

  updateConfig(updates: any) {
    this.exportState.update((draft: any) => {
      Object.assign(draft, updates);
    });
  }

  startExport() {
    this.progressState.update((draft: any) => {
      draft.isRunning = true;
      draft.startTime = Date.now();
      draft.processed = 0;
      draft.errors = [];
    });
  }

  updateProgress(processed: number, total: number, operation: string) {
    this.progressState.update((draft: any) => {
      draft.processed = processed;
      draft.total = total;
      draft.currentOperation = operation;

      // Calculate ETA
      if (processed > 0) {
        const elapsed = Date.now() - draft.startTime;
        const rate = processed / elapsed;
        const remaining = total - processed;
        draft.estimatedCompletion = Date.now() + remaining / rate;
      }
    });
  }

  addError(error: any) {
    this.progressState.update((draft: any) => {
      draft.errors.push({
        ...error,
        timestamp: Date.now()
      });
    });
  }

  completeExport() {
    this.progressState.update((draft: any) => {
      draft.isRunning = false;
      draft.currentOperation = "completed";
    });
  }

  // Get current state
  getConfig() {
    return this.exportState.get();
  }

  getProgress() {
    return this.progressState.get();
  }

  // Subscribe to state changes
  onConfigChange(handler: (config: any) => void) {
    return this.exportState.subscribe(handler);
  }

  onProgressChange(handler: (progress: any) => void) {
    return this.progressState.subscribe(handler);
  }
}

// 3. Component Factory for Notion Services
export function registerNotionComponents(controlPlane: any) {
  // Register Notion API Client
  controlPlane.registerComponent({
    name: "NotionApiClient",
    singleton: true,
    dependencies: [],
    factory: (apiKey: string) => {
      return {
        id: "notion-api-client",
        name: "NotionApiClient",
        state: "created",
        client: null as any,

        async initialize() {
          const { Client } = await import("@notionhq/client");
          this.client = new Client({ auth: apiKey });
          this.state = "initialized";
        },

        async start() {
          // Test connection
          await this.client.users.me();
          this.state = "started";
        },

        async stop() {
          this.state = "stopped";
        }
      };
    }
  });

  // Register Export Manager
  controlPlane.registerComponent({
    name: "ExportManager",
    dependencies: ["NotionApiClient"],
    factory: () => {
      return {
        id: "export-manager",
        name: "ExportManager",
        state: "created",

        async initialize() {
          this.state = "initialized";
        },

        async start() {
          this.state = "started";
        },

        async stop() {
          this.state = "stopped";
        }
      };
    }
  });

  // Register Progress Tracker
  controlPlane.registerComponent({
    name: "ProgressTracker",
    factory: () => {
      return {
        id: "progress-tracker",
        name: "ProgressTracker",
        state: "created",

        async initialize() {
          this.state = "initialized";
        },

        async start() {
          this.state = "started";
        },

        async stop() {
          this.state = "stopped";
        }
      };
    }
  });
}

// 4. Middleware for Notion API Rate Limiting
export function createNotionApiMiddleware() {
  return async (message: any, next: any) => {
    // Add rate limiting for Notion API calls
    if (message.type.startsWith("notion-api-")) {
      // Implement rate limiting logic
      const rateLimiter = message.metadata?.rateLimiter;
      if (rateLimiter) {
        await rateLimiter.waitIfNeeded();
      }
    }

    await next();
  };
}

// 5. Plugin for Notion Sync Features
export const NotionSyncPlugin = {
  name: "notion-sync",
  version: "1.0.0",

  async install(context: any) {
    console.log("Installing Notion Sync plugin...");

    // Register Notion-specific components
    registerNotionComponents(context.controlPlane);

    // Add Notion API middleware
    context.messageBus.use(createNotionApiMiddleware());

    // Set up error handling for Notion API errors
    context.hookManager.register("error", async (hookContext: any) => {
      const error = hookContext.error;
      if (error?.code === "rate_limited") {
        console.log("Rate limit hit, backing off...");
        // Implement backoff logic
      }
    });

    console.log("Notion Sync plugin installed successfully");
  },

  async uninstall(context: any) {
    console.log("Uninstalling Notion Sync plugin...");
    // Cleanup logic
  }
};

// 6. Complete Integration Example
export async function integratedNotionSyncExample() {
  console.log("=== Integrated Notion Sync Example ===");

  // Create control plane with built-in features
  const controlPlane = createControlPlane({
    enableLogging: true,
    enableMetrics: true,
    enableHealthCheck: true,
    autoStartComponents: true
  });

  // Install Notion Sync plugin
  controlPlane.registerPlugin(NotionSyncPlugin);

  await controlPlane.start();
  await controlPlane.installPlugin("notion-sync");

  // Create state manager
  const stateManager = new ExportStateManager(controlPlane);

  // Configure export
  stateManager.updateConfig({
    outputPath: "./exports",
    format: "json",
    databases: ["database-id-1", "database-id-2"]
  });

  // Create Notion API client component
  const apiClient = await controlPlane.createComponent("NotionApiClient", "your-api-key");

  // Create export manager
  const exportManager = new NotionExportManager(controlPlane, apiClient);

  // Subscribe to progress updates
  const progressSub = exportManager.onProgress((progress) => {
    console.log(`Progress: ${progress.processed}/${progress.total} - ${progress.currentSection}`);
    stateManager.updateProgress(progress.processed, progress.total, progress.currentSection);
  });

  // Subscribe to errors
  const errorSub = exportManager.onError((error) => {
    console.error(`Export error: ${error.operation} - ${error.error.message}`);
    stateManager.addError(error);
  });

  try {
    // Start export
    stateManager.startExport();

    // Export databases
    const config = stateManager.getConfig();
    for (const databaseId of config.databases) {
      await exportManager.exportDatabase(databaseId);
    }

    stateManager.completeExport();
    console.log("Export completed successfully!");
  } catch (error) {
    console.error("Export failed:", error);
    stateManager.addError({
      operation: "export",
      error: error as Error
    });
  } finally {
    // Cleanup subscriptions
    progressSub.unsubscribe();
    errorSub.unsubscribe();

    // Get final state
    const finalProgress = stateManager.getProgress();
    console.log("Final state:", finalProgress);

    await controlPlane.destroy();
  }
}

// 7. Migration Helper
export class EventEmitterMigrationHelper {
  constructor(private controlPlane: any) {}

  // Helper to migrate from EventEmitter to Control Plane
  migrateEventEmitter(eventEmitter: any, channelName: string) {
    const channel = this.controlPlane.brokerChannel(channelName);

    // Forward EventEmitter events to channel
    const originalEmit = eventEmitter.emit.bind(eventEmitter);
    eventEmitter.emit = (event: string, ...args: any[]) => {
      // Emit to original EventEmitter
      originalEmit(event, ...args);

      // Also emit to control plane channel
      channel.next({
        event,
        args,
        timestamp: Date.now()
      });
    };

    return channel;
  }

  // Helper to create backward-compatible EventEmitter interface
  createCompatibilityLayer(channelName: string) {
    const channel = this.controlPlane.brokerChannel(channelName);

    return {
      emit: (event: string, ...args: any[]) => {
        channel.next({ event, args, timestamp: Date.now() });
      },

      on: (event: string, handler: (...args: any[]) => void) => {
        const subscription = channel.subscribe((message: any) => {
          if (message.event === event) {
            handler(...message.args);
          }
        });

        return {
          off: () => subscription.unsubscribe()
        };
      }
    };
  }
}

export { NotionExportManager, ExportStateManager };
