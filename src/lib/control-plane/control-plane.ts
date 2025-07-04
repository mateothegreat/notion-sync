/**
 * Main Control Plane Implementation
 * 
 * Orchestrates all control plane components and provides the main API
 */

import { Subject } from 'rxjs';
import { MessageBus, BrokerBus, InMemoryAdapter, MessageBusAdapter } from './message-bus';
import { StateRegistry } from './state-registry';
import { ComponentFactory } from './component-factory';
import { CircuitBreakerRegistry } from './circuit-breaker';
import { MiddlewarePipeline } from './middleware';
import { PluginRegistry, PluginContext } from './plugins';
import { HookManager } from './hooks';
import { 
  Message, 
  Command, 
  Event, 
  Channel, 
  BusChannel, 
  Component,
  ComponentConfig,
  Middleware,
  Plugin,
  HookType,
  HookFunction
} from './types';

/**
 * Control plane configuration
 */
export interface ControlPlaneConfig {
  adapter?: MessageBusAdapter;
  enableLogging?: boolean;
  enableMetrics?: boolean;
  enableHealthCheck?: boolean;
  autoStartComponents?: boolean;
}

/**
 * Main control plane class that orchestrates all components
 */
export class ControlPlane {
  private messageBus: MessageBus;
  private brokerBus: BrokerBus;
  private stateRegistry: StateRegistry;
  private componentFactory: ComponentFactory;
  private circuitBreakerRegistry: CircuitBreakerRegistry;
  private middlewarePipeline: MiddlewarePipeline;
  private pluginRegistry: PluginRegistry;
  private hookManager: HookManager;
  private initialized = false;
  private started = false;

  constructor(private config: ControlPlaneConfig = {}) {
    // Initialize core components
    const adapter = config.adapter || new InMemoryAdapter();
    this.messageBus = new MessageBus(adapter);
    this.brokerBus = new BrokerBus(adapter);
    this.stateRegistry = new StateRegistry();
    this.componentFactory = new ComponentFactory();
    this.circuitBreakerRegistry = new CircuitBreakerRegistry();
    this.middlewarePipeline = new MiddlewarePipeline();
    this.hookManager = new HookManager();

    // Create plugin context
    const pluginContext: PluginContext = {
      messageBus: this.messageBus,
      stateRegistry: this.stateRegistry,
      componentFactory: this.componentFactory,
      circuitBreakerRegistry: this.circuitBreakerRegistry,
      middlewarePipeline: this.middlewarePipeline,
      hookManager: this.hookManager,
      controlPlane: this
    };

    this.pluginRegistry = new PluginRegistry(pluginContext);

    // Set up middleware pipeline integration
    this.messageBus.use(async (message, next) => {
      try {
        await this.middlewarePipeline.execute(message);
        await next();
      } catch (error) {
        await this.hookManager.execute('error', { error, message });
        throw error;
      }
    });
  }

  /**
   * Initialize the control plane
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      await this.hookManager.execute('before-message', { phase: 'initialize' });

      // Install built-in plugins if enabled
      if (this.config.enableLogging) {
        const { LoggingPlugin } = await import('./plugins');
        this.pluginRegistry.register(new LoggingPlugin());
        await this.pluginRegistry.install('logging');
      }

      if (this.config.enableMetrics) {
        const { MetricsPlugin } = await import('./plugins');
        this.pluginRegistry.register(new MetricsPlugin());
        await this.pluginRegistry.install('metrics');
      }

      if (this.config.enableHealthCheck) {
        const { HealthCheckPlugin } = await import('./plugins');
        this.pluginRegistry.register(new HealthCheckPlugin());
        await this.pluginRegistry.install('health-check');
      }

      // Initialize all components if auto-start is enabled
      if (this.config.autoStartComponents) {
        await this.componentFactory.initializeAll();
      }

      this.initialized = true;

      await this.hookManager.execute('after-message', { phase: 'initialize' });
    } catch (error) {
      await this.hookManager.execute('error', { error, phase: 'initialize' });
      throw error;
    }
  }

  /**
   * Start the control plane
   */
  async start(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (this.started) {
      return;
    }

    try {
      await this.hookManager.execute('before-message', { phase: 'start' });

      // Start all components if auto-start is enabled
      if (this.config.autoStartComponents) {
        await this.componentFactory.startAll();
      }

      this.started = true;

      await this.hookManager.execute('after-message', { phase: 'start' });
    } catch (error) {
      await this.hookManager.execute('error', { error, phase: 'start' });
      throw error;
    }
  }

  /**
   * Stop the control plane
   */
  async stop(): Promise<void> {
    if (!this.started) {
      return;
    }

    try {
      await this.hookManager.execute('before-message', { phase: 'stop' });

      // Stop all components
      await this.componentFactory.stopAll();

      // Close message bus
      await this.messageBus.close();
      await this.brokerBus.close();

      this.started = false;

      await this.hookManager.execute('after-message', { phase: 'stop' });
    } catch (error) {
      await this.hookManager.execute('error', { error, phase: 'stop' });
      throw error;
    }
  }

  /**
   * Destroy the control plane
   */
  async destroy(): Promise<void> {
    if (this.started) {
      await this.stop();
    }

    try {
      await this.hookManager.execute('before-message', { phase: 'destroy' });

      // Destroy all components
      await this.componentFactory.destroyAll();

      // Uninstall all plugins
      await this.pluginRegistry.uninstallAll();

      // Clear all state
      this.stateRegistry.clear();
      this.middlewarePipeline.clear();
      this.hookManager.clear();

      this.initialized = false;

      await this.hookManager.execute('after-message', { phase: 'destroy' });
    } catch (error) {
      await this.hookManager.execute('error', { error, phase: 'destroy' });
      throw error;
    }
  }

  // Message Bus API

  /**
   * Create a typed channel
   */
  channel<T>(name: string): Channel<T> {
    return this.messageBus.channel<T>(name);
  }

  /**
   * Create a bus channel with promise-based operations
   */
  busChannel<T>(name: string): BusChannel<T> {
    return this.messageBus.busChannel<T>(name);
  }

  /**
   * Create a broker bus channel (RxJS Subject)
   */
  brokerChannel<T>(name: string): Subject<T> {
    return this.brokerBus.channel<T>(name);
  }

  /**
   * Publish a message
   */
  async publish<T>(channel: string, payload: T, metadata?: Record<string, any>): Promise<void> {
    await this.hookManager.execute('before-message', { channel, payload, metadata });
    
    try {
      await this.messageBus.publish(channel, payload, metadata);
      await this.hookManager.execute('after-message', { channel, payload, metadata });
    } catch (error) {
      await this.hookManager.execute('error', { error, channel, payload, metadata });
      throw error;
    }
  }

  /**
   * Subscribe to messages
   */
  async subscribe<T>(
    channel: string,
    handler: (message: Message<T>) => void | Promise<void>
  ): Promise<() => void> {
    const wrappedHandler = async (message: Message<T>) => {
      try {
        await this.hookManager.execute('before-message', { message });
        await handler(message);
        await this.hookManager.execute('after-message', { message });
      } catch (error) {
        await this.hookManager.execute('error', { error, message });
        throw error;
      }
    };
    
    return this.messageBus.subscribe(channel, wrappedHandler);
  }

  // State Management API

  /**
   * Register mutable state
   */
  registerMutableState<T>(key: string, initialValue: T) {
    return this.stateRegistry.registerMutable(key, initialValue);
  }

  /**
   * Register immutable state
   */
  registerImmutableState<T>(key: string, initialValue: T) {
    return this.stateRegistry.registerImmutable(key, initialValue);
  }

  /**
   * Get state container
   */
  getState<T>(key: string) {
    return this.stateRegistry.get<T>(key);
  }

  /**
   * Create state snapshot
   */
  createSnapshot() {
    return this.stateRegistry.snapshot();
  }

  /**
   * Restore from snapshot
   */
  restoreSnapshot(snapshot: Record<string, any>) {
    this.stateRegistry.restore(snapshot);
  }

  // Component Management API

  /**
   * Register a component
   */
  registerComponent(config: ComponentConfig): void {
    this.componentFactory.register(config);
  }

  /**
   * Create a component
   */
  async createComponent(name: string, ...args: any[]): Promise<Component> {
    return this.componentFactory.create(name, ...args);
  }

  /**
   * Get a component
   */
  getComponent(nameOrId: string): Component | undefined {
    return this.componentFactory.get(nameOrId);
  }

  /**
   * Start a component
   */
  async startComponent(nameOrId: string): Promise<void> {
    await this.componentFactory.start(nameOrId);
  }

  /**
   * Stop a component
   */
  async stopComponent(nameOrId: string): Promise<void> {
    await this.componentFactory.stop(nameOrId);
  }

  // Circuit Breaker API

  /**
   * Get or create a circuit breaker
   */
  getCircuitBreaker(name: string, config?: any) {
    return this.circuitBreakerRegistry.getOrCreate(name, config);
  }

  /**
   * Get circuit breaker statistics
   */
  getCircuitBreakerStats() {
    return this.circuitBreakerRegistry.getAllStats();
  }

  // Middleware API

  /**
   * Add middleware
   */
  use(middleware: Middleware): void {
    this.middlewarePipeline.use(middleware);
  }

  // Plugin API

  /**
   * Register a plugin
   */
  registerPlugin(plugin: Plugin): void {
    this.pluginRegistry.register(plugin);
  }

  /**
   * Install a plugin
   */
  async installPlugin(name: string): Promise<void> {
    await this.pluginRegistry.install(name);
  }

  /**
   * Uninstall a plugin
   */
  async uninstallPlugin(name: string): Promise<void> {
    await this.pluginRegistry.uninstall(name);
  }

  /**
   * Get installed plugins
   */
  getInstalledPlugins(): string[] {
    return this.pluginRegistry.getInstalledNames();
  }

  // Hook API

  /**
   * Register a hook
   */
  registerHook(type: HookType, fn: HookFunction, options?: any): string {
    return this.hookManager.register(type, fn, options);
  }

  /**
   * Unregister a hook
   */
  unregisterHook(id: string): boolean {
    return this.hookManager.unregister(id);
  }

  /**
   * Execute hooks
   */
  async executeHooks(type: HookType, context?: any): Promise<void> {
    await this.hookManager.execute(type, context);
  }

  // Utility API

  /**
   * Check if the control plane is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Check if the control plane is started
   */
  isStarted(): boolean {
    return this.started;
  }

  /**
   * Get control plane status
   */
  getStatus() {
    return {
      initialized: this.initialized,
      started: this.started,
      components: this.componentFactory.getActiveComponents().length,
      plugins: this.pluginRegistry.getInstalledNames().length,
      hooks: this.hookManager.getTypes().length,
      circuitBreakers: this.circuitBreakerRegistry.getNames().length
    };
  }

  /**
   * Get health check information
   */
  getHealth() {
    return {
      status: this.started ? 'healthy' : 'stopped',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      controlPlane: this.getStatus()
    };
  }
}

/**
 * Factory function to create a control plane instance
 */
export function createControlPlane(config: ControlPlaneConfig = {}): ControlPlane {
  return new ControlPlane(config);
}

/**
 * Global control plane instance
 */
let globalControlPlane: ControlPlane | undefined;

/**
 * Get or create global control plane
 */
export function getGlobalControlPlane(config?: ControlPlaneConfig): ControlPlane {
  if (!globalControlPlane) {
    globalControlPlane = createControlPlane(config);
  }
  return globalControlPlane;
}

/**
 * Set global control plane
 */
export function setGlobalControlPlane(controlPlane: ControlPlane): void {
  globalControlPlane = controlPlane;
}