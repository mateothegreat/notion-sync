/**
 * Notion Sync Application
 * 
 * Main application orchestrator using the control plane
 */

import { createControlPlane, ControlPlane } from '../lib/control-plane';
import { ExportService } from '../core/services/export-service';
import { ProgressService } from '../core/services/progress-service';
import { ExportCommandHandlers } from './commands/export-commands';
import { NotionClient } from '../infrastructure/notion/notion-client';
import { ApplicationConfig } from '../shared/types';
import { DefaultErrorHandler } from '../shared/errors';

export class NotionSyncApp {
  private controlPlane: ControlPlane;
  private exportService: ExportService;
  private progressService: ProgressService;
  private commandHandlers: ExportCommandHandlers;
  private notionClient: NotionClient;
  private exportServiceComponent: any;
  private progressServiceComponent: any;
  private notionClientComponent: any;
  private isInitialized = false;
  private isStarted = false;

  constructor(private config: ApplicationConfig) {
    this.controlPlane = createControlPlane({
      enableLogging: true,
      enableMetrics: true,
      enableHealthCheck: true,
      autoStartComponents: true
    });
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    console.log('Initializing Notion Sync Application...');

    // Initialize control plane
    await this.controlPlane.initialize();

    // Set up error handling
    this.setupErrorHandling();

    // Set up middleware
    this.setupMiddleware();

    // Create services
    await this.createServices();

    // Register components
    await this.registerComponents();

    // Set up event handlers
    this.setupEventHandlers();

    this.isInitialized = true;
    console.log('Application initialized successfully');
  }

  async start(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.isStarted) {
      return;
    }

    console.log('Starting Notion Sync Application...');

    // Start control plane
    await this.controlPlane.start();

    // Start all registered components
    await this.startComponents();

    this.isStarted = true;
    console.log('Application started successfully');
  }

  async stop(): Promise<void> {
    if (!this.isStarted) {
      return;
    }

    console.log('Stopping Notion Sync Application...');

    // Stop all components
    await this.stopComponents();

    // Stop control plane
    await this.controlPlane.stop();

    this.isStarted = false;
    console.log('Application stopped successfully');
  }

  async destroy(): Promise<void> {
    if (this.isStarted) {
      await this.stop();
    }

    console.log('Destroying Notion Sync Application...');

    // Destroy control plane
    await this.controlPlane.destroy();

    console.log('Application destroyed successfully');
  }

  // Public API methods
  getControlPlane(): ControlPlane {
    return this.controlPlane;
  }

  getExportService(): ExportService {
    return this.exportService;
  }

  getProgressService(): ProgressService {
    return this.progressService;
  }

  getCommandHandlers(): ExportCommandHandlers {
    return this.commandHandlers;
  }

  getNotionClient(): NotionClient {
    return this.notionClient;
  }

  // Health check
  async getHealthStatus(): Promise<any> {
    return {
      status: this.isStarted ? 'healthy' : 'stopped',
      initialized: this.isInitialized,
      started: this.isStarted,
      controlPlane: this.controlPlane.getStatus(),
      components: await this.getComponentsStatus(),
      timestamp: new Date()
    };
  }

  private setupErrorHandling(): void {
    // Global error handler
    this.controlPlane.registerHook('error', async (context) => {
      const errorHandler = new DefaultErrorHandler();
      await errorHandler.handle(context.error);
    });

    // Unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });

    // Uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      process.exit(1);
    });
  }

  private setupMiddleware(): void {
    // Logging middleware
    this.controlPlane.use(async (message, next) => {
      const startTime = Date.now();
      console.log(`[${new Date().toISOString()}] Processing message: ${message.type}`);
      
      try {
        await next();
        const duration = Date.now() - startTime;
        console.log(`[${new Date().toISOString()}] Completed message: ${message.type} in ${duration}ms`);
      } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`[${new Date().toISOString()}] Failed message: ${message.type} in ${duration}ms`, error);
        throw error;
      }
    });

    // Metrics middleware
    this.controlPlane.use(async (message, next) => {
      const startTime = Date.now();
      
      try {
        await next();
        const duration = Date.now() - startTime;
        
        // Publish performance metric
        await this.controlPlane.publish('metrics', {
          type: 'message_processed',
          messageType: message.type,
          duration,
          success: true,
          timestamp: new Date()
        });
      } catch (error) {
        const duration = Date.now() - startTime;
        
        // Publish error metric
        await this.controlPlane.publish('metrics', {
          type: 'message_failed',
          messageType: message.type,
          duration,
          success: false,
          error: error.message,
          timestamp: new Date()
        });
        
        throw error;
      }
    });
  }

  private async createServices(): Promise<void> {
    // Event publisher function
    const eventPublisher = async (event: any) => {
      await this.controlPlane.publish('domain-events', event);
    };

    // Create progress service
    this.progressService = new ProgressService(eventPublisher);

    // Create export repository (in-memory for now)
    const exportRepository = new InMemoryExportRepository();

    // Create export service
    this.exportService = new ExportService(exportRepository, eventPublisher);

    // Create command handlers
    this.commandHandlers = new ExportCommandHandlers(
      this.exportService,
      this.progressService
    );

    // Create circuit breaker for Notion API
    const notionCircuitBreaker = this.controlPlane.getCircuitBreaker('notion-api', {
      failureThreshold: 5,
      resetTimeout: 30000,
      monitoringPeriod: 60000
    });

    // Create Notion client
    this.notionClient = new NotionClient(
      this.config.notion,
      eventPublisher,
      notionCircuitBreaker
    );
  }

  private async registerComponents(): Promise<void> {
    // Register export service
    this.controlPlane.registerComponent({
      name: 'ExportService',
      singleton: true,
      factory: () => ({
        id: 'export-service',
        name: 'ExportService',
        state: 'created',
        service: this.exportService,
        
        async initialize() {
          this.state = 'initialized';
        },
        
        async start() {
          this.state = 'started';
        },
        
        async stop() {
          this.state = 'stopped';
        }
      })
    });

    // Register progress service
    this.controlPlane.registerComponent({
      name: 'ProgressService',
      singleton: true,
      factory: () => ({
        id: 'progress-service',
        name: 'ProgressService',
        state: 'created',
        service: this.progressService,
        
        async initialize() {
          this.state = 'initialized';
        },
        
        async start() {
          this.state = 'started';
        },
        
        async stop() {
          this.state = 'stopped';
        }
      })
    });

    // Register Notion client
    this.controlPlane.registerComponent({
      name: 'NotionClient',
      singleton: true,
      factory: () => ({
        id: 'notion-client',
        name: 'NotionClient',
        state: 'created',
        client: this.notionClient,
        
        async initialize() {
          this.state = 'initialized';
        },
        
        async start() {
          this.state = 'started';
        },
        
        async stop() {
          this.state = 'stopped';
        }
      })
    });

    // Create the components immediately after registration
    this.exportServiceComponent = await this.controlPlane.createComponent('ExportService');
    this.progressServiceComponent = await this.controlPlane.createComponent('ProgressService');
    this.notionClientComponent = await this.controlPlane.createComponent('NotionClient');
  }

  private setupEventHandlers(): void {
    // Handle domain events
    this.controlPlane.subscribe('domain-events', async (message) => {
      console.log('Domain event received:', message.payload.type);
      
      // You can add specific event handlers here
      switch (message.payload.type) {
        case 'export.started':
          console.log('Export started:', message.payload.aggregateId);
          break;
        case 'export.completed':
          console.log('Export completed:', message.payload.aggregateId);
          break;
        case 'export.failed':
          console.log('Export failed:', message.payload.aggregateId);
          break;
        // Add more event handlers as needed
      }
    });

    // Handle metrics
    this.controlPlane.subscribe('metrics', async (message) => {
      // In a real application, you might send these to a monitoring system
      console.log('Metric:', message.payload);
    });

    // Handle command processing
    this.controlPlane.subscribe('commands', async (message) => {
      const command = message.payload;
      let result;

      switch (command.type) {
        case 'export.create':
          result = await this.commandHandlers.handleCreateExport(command);
          break;
        case 'export.start':
          result = await this.commandHandlers.handleStartExport(command);
          break;
        case 'export.cancel':
          result = await this.commandHandlers.handleCancelExport(command);
          break;
        case 'export.delete':
          result = await this.commandHandlers.handleDeleteExport(command);
          break;
        case 'export.restart':
          result = await this.commandHandlers.handleRestartExport(command);
          break;
        default:
          console.warn('Unknown command type:', command.type);
          return;
      }

      // Publish command result
      await this.controlPlane.publish('command-results', {
        commandId: command.id,
        result
      });
    });
  }

  private async startComponents(): Promise<void> {
    const components = [
      { name: 'ExportService', component: this.exportServiceComponent },
      { name: 'ProgressService', component: this.progressServiceComponent },
      { name: 'NotionClient', component: this.notionClientComponent }
    ];
    
    for (const { name, component } of components) {
      try {
        if (component) {
          await this.controlPlane.startComponent(component.id);
          console.log(`Started component: ${name}`);
        }
      } catch (error) {
        console.error(`Failed to start component ${name}:`, error);
        throw error;
      }
    }
  }

  private async stopComponents(): Promise<void> {
    const components = [
      { name: 'NotionClient', component: this.notionClientComponent },
      { name: 'ProgressService', component: this.progressServiceComponent },
      { name: 'ExportService', component: this.exportServiceComponent }
    ];
    
    for (const { name, component } of components) {
      try {
        if (component) {
          await this.controlPlane.stopComponent(component.id);
          console.log(`Stopped component: ${name}`);
        }
      } catch (error) {
        console.error(`Failed to stop component ${name}:`, error);
      }
    }
  }

  private async getComponentsStatus(): Promise<any> {
    // Return status of all components
    return {
      exportService: this.exportService ? 'running' : 'stopped',
      progressService: this.progressService ? 'running' : 'stopped',
      notionClient: this.notionClient ? 'running' : 'stopped'
    };
  }
}

// Simple in-memory export repository for demonstration
class InMemoryExportRepository {
  private exports = new Map();

  async save(export_: any): Promise<void> {
    this.exports.set(export_.id, export_);
  }

  async findById(id: string): Promise<any> {
    return this.exports.get(id) || null;
  }

  async findByStatus(status: any): Promise<any[]> {
    return Array.from(this.exports.values()).filter(exp => exp.status === status);
  }

  async findRunning(): Promise<any[]> {
    return Array.from(this.exports.values()).filter(exp => exp.status === 'running');
  }

  async delete(id: string): Promise<void> {
    this.exports.delete(id);
  }

  async list(limit?: number, offset?: number): Promise<any[]> {
    const all = Array.from(this.exports.values());
    const start = offset || 0;
    const end = limit ? start + limit : undefined;
    return all.slice(start, end);
  }
}