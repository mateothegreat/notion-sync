/**
 * Main Control Plane Implementation
 *
 * Orchestrates all control plane components and provides the main API
 */

import { EMPTY, Observable, Subject, from, of, throwError } from "rxjs";
import { catchError, map, mergeMap, tap } from "rxjs/operators";
import { CircuitBreakerRegistry } from "./circuit-breaker";
import { ComponentFactory } from "./component-factory";
import { HookManager } from "./hooks";
import {
  BrokerBus,
  InMemoryAdapter,
  MessageBus,
  MessageBusAdapter,
  ObservableMiddleware,
  adaptLegacyMiddleware
} from "./message-bus";
import { MiddlewarePipeline } from "./middleware";
import { PluginContext, PluginRegistry } from "./plugins";
import { StateRegistry } from "./state-registry";
import {
  Component,
  ComponentConfig,
  HookFunction,
  HookType,
  Message,
  Middleware,
  ObservableChannel,
  ObservableMessageHandler,
  OperationResult,
  Plugin
} from "./types";

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

    // Set up middleware pipeline integration with Observable middleware
    const observableMiddleware: ObservableMiddleware = (message) => {
      return from(this.middlewarePipeline.execute(message)).pipe(
        map(() => message),
        catchError((error): Observable<never> => {
          // Execute error hook asynchronously
          this.hookManager.execute("error", { error, message }).catch(console.error);
          return throwError(() => error);
        })
      );
    };

    this.messageBus.use(observableMiddleware);
  }

  /**
   * Initialize the control plane
   */
  initialize(): Observable<void> {
    if (this.initialized) {
      return of(undefined);
    }

    return from(this.hookManager.execute("before-message", { phase: "initialize" })).pipe(
      mergeMap(() => {
        const initTasks: Observable<any>[] = [];

        // Install built-in plugins if enabled
        if (this.config.enableLogging) {
          initTasks.push(
            from(import("./plugins")).pipe(
              mergeMap(({ LoggingPlugin }): Observable<void> => {
                this.pluginRegistry.register(new LoggingPlugin());
                return from(this.pluginRegistry.install("logging"));
              })
            )
          );
        }

        if (this.config.enableMetrics) {
          initTasks.push(
            from(import("./plugins")).pipe(
              mergeMap(({ MetricsPlugin }) => {
                this.pluginRegistry.register(new MetricsPlugin());
                return from(this.pluginRegistry.install("metrics"));
              })
            )
          );
        }

        if (this.config.enableHealthCheck) {
          initTasks.push(
            from(import("./plugins")).pipe(
              mergeMap(({ HealthCheckPlugin }) => {
                this.pluginRegistry.register(new HealthCheckPlugin());
                return from(this.pluginRegistry.install("health-check"));
              })
            )
          );
        }

        // Initialize all components if auto-start is enabled
        if (this.config.autoStartComponents) {
          initTasks.push(from(this.componentFactory.initializeAll()));
        }

        return initTasks.length > 0 ? from(Promise.all(initTasks)) : of(undefined);
      }),
      tap(() => {
        this.initialized = true;
      }),
      mergeMap(() => from(this.hookManager.execute("after-message", { phase: "initialize" }))),
      catchError((error): Observable<never> => {
        this.hookManager.execute("error", { error, phase: "initialize" }).catch(console.error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Start the control plane
   */
  start(): Observable<void> {
    return (!this.initialized ? this.initialize() : of(undefined)).pipe(
      mergeMap(() => {
        if (this.started) {
          return of(undefined);
        }

        return from(this.hookManager.execute("before-message", { phase: "start" })).pipe(
          mergeMap(() => {
            if (this.config.autoStartComponents) {
              return from(this.componentFactory.startAll());
            }
            return of(undefined);
          }),
          tap(() => {
            this.started = true;
          }),
          mergeMap(() => from(this.hookManager.execute("after-message", { phase: "start" }))),
          catchError((error) => {
            this.hookManager.execute("error", { error, phase: "start" }).catch(console.error);
            return throwError(() => error);
          }),
          map(() => undefined)
        );
      })
    );
  }

  /**
   * Stop the control plane
   */
  stop(): Observable<void> {
    if (!this.started) {
      return of(undefined);
    }

    return from(this.hookManager.execute("before-message", { phase: "stop" })).pipe(
      mergeMap(() => from(this.componentFactory.stopAll())),
      mergeMap(() => this.messageBus.close()),
      mergeMap(() => this.brokerBus.close()),
      tap(() => {
        this.started = false;
      }),
      mergeMap(() => from(this.hookManager.execute("after-message", { phase: "stop" }))),
      catchError((error) => {
        this.hookManager.execute("error", { error, phase: "stop" }).catch(console.error);
        return throwError(() => error);
      }),
      map(() => undefined)
    );
  }

  /**
   * Destroy the control plane
   */
  destroy(): Observable<void> {
    return (this.started ? this.stop() : of(undefined)).pipe(
      mergeMap(() => from(this.hookManager.execute("before-message", { phase: "destroy" }))),
      mergeMap(() => from(this.componentFactory.destroyAll())),
      mergeMap(() => from(this.pluginRegistry.uninstallAll())),
      tap(() => {
        // Clear all state
        this.stateRegistry.clear();
        this.middlewarePipeline.clear();
        this.hookManager.clear();
        this.initialized = false;
      }),
      mergeMap(() => from(this.hookManager.execute("after-message", { phase: "destroy" }))),
      catchError((error) => {
        this.hookManager.execute("error", { error, phase: "destroy" }).catch(console.error);
        return throwError(() => error);
      }),
      map(() => undefined)
    );
  }

  // Message Bus API

  /**
   * Create a typed observable channel
   */
  channel<T>(name: string): ObservableChannel<T> {
    return this.messageBus.channel<T>(name);
  }

  /**
   * Create a broker bus channel (RxJS Subject)
   */
  brokerChannel<T>(name: string): Subject<T> {
    return this.brokerBus.subject<T>(name);
  }

  /**
   * Publish a message
   */
  publish<T>(channel: string, payload: T, metadata?: Record<string, any>): Observable<OperationResult<void>> {
    return from(this.hookManager.execute("before-message", { channel, payload, metadata })).pipe(
      mergeMap(() => this.messageBus.publish(channel, payload, metadata)),
      tap((result) => {
        if (!result.error) {
          this.hookManager.execute("after-message", { channel, payload, metadata }).catch(console.error);
        }
      }),
      catchError((error) => {
        this.hookManager.execute("error", { error, channel, payload, metadata }).catch(console.error);
        return of({ error, metadata: { channel } });
      })
    );
  }

  /**
   * Subscribe to messages
   */
  subscribe<T>(channel: string): Observable<Message<T>> {
    return this.messageBus.subscribe<T>(channel).pipe(
      mergeMap((message) =>
        from(this.hookManager.execute("before-message", { message })).pipe(
          map(() => message),
          catchError((error) => {
            console.error("Hook error:", error);
            return of(message);
          })
        )
      ),
      tap((message) => {
        this.hookManager.execute("after-message", { message }).catch(console.error);
      }),
      catchError((error) => {
        this.hookManager.execute("error", { error }).catch(console.error);
        return EMPTY;
      })
    );
  }

  /**
   * Subscribe with a handler
   */
  subscribeWithHandler<T>(channel: string, handler: ObservableMessageHandler<T>) {
    return this.messageBus.subscribeHandler(channel, handler);
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
  createComponent(name: string, ...args: any[]): Observable<Component> {
    return from(this.componentFactory.create(name, ...args));
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
  startComponent(nameOrId: string): Observable<void> {
    return from(this.componentFactory.start(nameOrId));
  }

  /**
   * Stop a component
   */
  stopComponent(nameOrId: string): Observable<void> {
    return from(this.componentFactory.stop(nameOrId));
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
  use(middleware: Middleware | ObservableMiddleware): void {
    // Check if it's an Observable middleware
    if (middleware.length === 1) {
      this.messageBus.use(middleware as ObservableMiddleware);
    } else {
      // Convert legacy middleware to Observable middleware
      this.messageBus.use(adaptLegacyMiddleware(middleware as Middleware));
    }

    // Also add to middleware pipeline for backward compatibility
    if (middleware.length === 2) {
      const enhancedMiddleware = async (
        message: Message,
        context: any,
        next: () => void | Promise<void>
      ): Promise<void> => {
        await (middleware as Middleware)(message, next);
      };
      this.middlewarePipeline.use(enhancedMiddleware);
    }
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
  installPlugin(name: string): Observable<void> {
    return from(this.pluginRegistry.install(name));
  }

  /**
   * Uninstall a plugin
   */
  uninstallPlugin(name: string): Observable<void> {
    return from(this.pluginRegistry.uninstall(name));
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
  executeHooks(type: HookType, context?: any): Observable<void> {
    return from(this.hookManager.execute(type, context));
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
      status: this.started ? "healthy" : "stopped",
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
