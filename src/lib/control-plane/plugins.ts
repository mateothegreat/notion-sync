/**
 * Plugin System
 *
 * Provides extensible plugin architecture for the control plane
 */

import { Plugin } from "./types";

/**
 * Plugin context for accessing control plane features
 */
export interface PluginContext {
  messageBus: any;
  stateRegistry: any;
  componentFactory: any;
  circuitBreakerRegistry: any;
  [key: string]: any;
}

/**
 * Plugin metadata
 */
export interface PluginMetadata {
  name: string;
  version: string;
  description?: string;
  author?: string;
  dependencies?: string[];
  tags?: string[];
}

/**
 * Enhanced plugin interface with lifecycle hooks
 */
export interface EnhancedPlugin extends Plugin {
  metadata?: PluginMetadata;
  beforeInstall?(context: PluginContext): void | Promise<void>;
  afterInstall?(context: PluginContext): void | Promise<void>;
  beforeUninstall?(context: PluginContext): void | Promise<void>;
  afterUninstall?(context: PluginContext): void | Promise<void>;
  onError?(error: Error, context: PluginContext): void | Promise<void>;
}

/**
 * Plugin registry for managing plugins
 */
export class PluginRegistry {
  private plugins = new Map<string, EnhancedPlugin>();
  private installedPlugins = new Set<string>();
  private context: PluginContext;

  constructor(context: PluginContext) {
    this.context = context;
  }

  /**
   * Register a plugin
   */
  register(plugin: EnhancedPlugin): void {
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin ${plugin.name} is already registered`);
    }

    this.plugins.set(plugin.name, plugin);
  }

  /**
   * Install a plugin
   */
  async install(name: string): Promise<void> {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      throw new Error(`Plugin ${name} is not registered`);
    }

    if (this.installedPlugins.has(name)) {
      throw new Error(`Plugin ${name} is already installed`);
    }

    try {
      // Check dependencies
      if (plugin.metadata?.dependencies) {
        for (const dep of plugin.metadata.dependencies) {
          if (!this.installedPlugins.has(dep)) {
            throw new Error(`Plugin ${name} requires dependency ${dep} to be installed first`);
          }
        }
      }

      // Run before install hook
      if (plugin.beforeInstall) {
        await plugin.beforeInstall(this.context);
      }

      // Install the plugin
      await plugin.install(this.context);

      // Mark as installed
      this.installedPlugins.add(name);

      // Run after install hook
      if (plugin.afterInstall) {
        await plugin.afterInstall(this.context);
      }

      console.log(`Plugin ${name} installed successfully`);
    } catch (error) {
      // Handle error
      if (plugin.onError) {
        await plugin.onError(error as Error, this.context);
      }
      throw new Error(`Failed to install plugin ${name}: ${(error as Error).message}`);
    }
  }

  /**
   * Uninstall a plugin
   */
  async uninstall(name: string): Promise<void> {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      throw new Error(`Plugin ${name} is not registered`);
    }

    if (!this.installedPlugins.has(name)) {
      throw new Error(`Plugin ${name} is not installed`);
    }

    try {
      // Check if other plugins depend on this one
      for (const [pluginName, installedPlugin] of this.plugins) {
        if (this.installedPlugins.has(pluginName) && installedPlugin.metadata?.dependencies?.includes(name)) {
          throw new Error(`Cannot uninstall plugin ${name}: plugin ${pluginName} depends on it`);
        }
      }

      // Run before uninstall hook
      if (plugin.beforeUninstall) {
        await plugin.beforeUninstall(this.context);
      }

      // Uninstall the plugin
      if (plugin.uninstall) {
        await plugin.uninstall(this.context);
      }

      // Mark as uninstalled
      this.installedPlugins.delete(name);

      // Run after uninstall hook
      if (plugin.afterUninstall) {
        await plugin.afterUninstall(this.context);
      }

      console.log(`Plugin ${name} uninstalled successfully`);
    } catch (error) {
      // Handle error
      if (plugin.onError) {
        await plugin.onError(error as Error, this.context);
      }
      throw new Error(`Failed to uninstall plugin ${name}: ${(error as Error).message}`);
    }
  }

  /**
   * Check if a plugin is installed
   */
  isInstalled(name: string): boolean {
    return this.installedPlugins.has(name);
  }

  /**
   * Get a registered plugin
   */
  get(name: string): EnhancedPlugin | undefined {
    return this.plugins.get(name);
  }

  /**
   * Get all registered plugin names
   */
  getRegisteredNames(): string[] {
    return Array.from(this.plugins.keys());
  }

  /**
   * Get all installed plugin names
   */
  getInstalledNames(): string[] {
    return Array.from(this.installedPlugins);
  }

  /**
   * Get plugin metadata
   */
  getMetadata(name: string): PluginMetadata | undefined {
    const plugin = this.plugins.get(name);
    return plugin?.metadata;
  }

  /**
   * Install all registered plugins
   */
  async installAll(): Promise<void> {
    const plugins = Array.from(this.plugins.keys());

    // Sort by dependencies
    const sorted = this.topologicalSort(plugins);

    for (const name of sorted) {
      if (!this.installedPlugins.has(name)) {
        await this.install(name);
      }
    }
  }

  /**
   * Uninstall all installed plugins
   */
  async uninstallAll(): Promise<void> {
    const plugins = Array.from(this.installedPlugins);

    // Sort by reverse dependencies
    const sorted = this.topologicalSort(plugins).reverse();

    for (const name of sorted) {
      await this.uninstall(name);
    }
  }

  /**
   * Update plugin context
   */
  updateContext(newContext: Partial<PluginContext>): void {
    this.context = { ...this.context, ...newContext };
  }

  /**
   * Topological sort for dependency resolution
   */
  private topologicalSort(pluginNames: string[]): string[] {
    const visited = new Set<string>();
    const result: string[] = [];

    const visit = (name: string) => {
      if (visited.has(name)) {
        return;
      }

      visited.add(name);

      const plugin = this.plugins.get(name);
      if (plugin?.metadata?.dependencies) {
        for (const dep of plugin.metadata.dependencies) {
          if (pluginNames.includes(dep)) {
            visit(dep);
          }
        }
      }

      result.push(name);
    };

    for (const name of pluginNames) {
      visit(name);
    }

    return result;
  }
}

/**
 * Built-in logging plugin
 */
export class LoggingPlugin implements EnhancedPlugin {
  name = "logging";
  version = "1.0.0";
  metadata: PluginMetadata = {
    name: "logging",
    version: "1.0.0",
    description: "Provides logging capabilities for the control plane",
    author: "Control Plane Team"
  };

  async install(context: PluginContext): Promise<void> {
    // Add logging middleware to message bus
    if (context.messageBus && context.messageBus.use) {
      const loggingMiddleware = async (message: any, next: any) => {
        console.log(`[${new Date().toISOString()}] Processing message: ${message.type}`);
        await next();
      };

      context.messageBus.use(loggingMiddleware);
    }
  }

  async uninstall(context: PluginContext): Promise<void> {
    // Remove logging middleware (implementation depends on message bus API)
    console.log("Logging plugin uninstalled");
  }
}

/**
 * Built-in metrics plugin
 */
export class MetricsPlugin implements EnhancedPlugin {
  name = "metrics";
  version = "1.0.0";
  metadata: PluginMetadata = {
    name: "metrics",
    version: "1.0.0",
    description: "Provides metrics collection for the control plane",
    author: "Control Plane Team"
  };

  private metrics = new Map<string, number>();

  async install(context: PluginContext): Promise<void> {
    // Add metrics collection
    if (context.messageBus && context.messageBus.use) {
      const metricsMiddleware = async (message: any, next: any) => {
        const startTime = Date.now();

        try {
          await next();
          this.recordMetric(`${message.type}.success`, 1);
          this.recordMetric(`${message.type}.duration`, Date.now() - startTime);
        } catch (error) {
          this.recordMetric(`${message.type}.error`, 1);
          throw error;
        }
      };

      context.messageBus.use(metricsMiddleware);
    }

    // Expose metrics endpoint
    context.getMetrics = () => Object.fromEntries(this.metrics);
  }

  async uninstall(context: PluginContext): Promise<void> {
    // Clean up metrics
    this.metrics.clear();
    delete context.getMetrics;
  }

  private recordMetric(name: string, value: number): void {
    const current = this.metrics.get(name) || 0;
    this.metrics.set(name, current + value);
  }
}

/**
 * Built-in health check plugin
 */
export class HealthCheckPlugin implements EnhancedPlugin {
  name = "health-check";
  version = "1.0.0";
  metadata: PluginMetadata = {
    name: "health-check",
    version: "1.0.0",
    description: "Provides health check capabilities for the control plane",
    author: "Control Plane Team"
  };

  async install(context: PluginContext): Promise<void> {
    // Add health check endpoint
    context.healthCheck = () => {
      return {
        status: "healthy",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        components: this.checkComponents(context)
      };
    };
  }

  async uninstall(context: PluginContext): Promise<void> {
    delete context.healthCheck;
  }

  private checkComponents(context: PluginContext): Record<string, string> {
    const components: Record<string, string> = {};

    if (context.messageBus) {
      components.messageBus = "healthy";
    }

    if (context.stateRegistry) {
      components.stateRegistry = "healthy";
    }

    if (context.componentFactory) {
      components.componentFactory = "healthy";
    }

    return components;
  }
}

/**
 * Plugin builder for creating plugins with fluent API
 */
export class PluginBuilder {
  private plugin: Partial<EnhancedPlugin> = {};

  static create(name: string, version: string): PluginBuilder {
    const builder = new PluginBuilder();
    builder.plugin.name = name;
    builder.plugin.version = version;
    return builder;
  }

  description(description: string): this {
    if (!this.plugin.metadata) {
      this.plugin.metadata = { name: this.plugin.name!, version: this.plugin.version! };
    }
    this.plugin.metadata.description = description;
    return this;
  }

  author(author: string): this {
    if (!this.plugin.metadata) {
      this.plugin.metadata = { name: this.plugin.name!, version: this.plugin.version! };
    }
    this.plugin.metadata.author = author;
    return this;
  }

  dependencies(deps: string[]): this {
    if (!this.plugin.metadata) {
      this.plugin.metadata = { name: this.plugin.name!, version: this.plugin.version! };
    }
    this.plugin.metadata.dependencies = deps;
    return this;
  }

  tags(tags: string[]): this {
    if (!this.plugin.metadata) {
      this.plugin.metadata = { name: this.plugin.name!, version: this.plugin.version! };
    }
    this.plugin.metadata.tags = tags;
    return this;
  }

  install(installFn: (context: PluginContext) => void | Promise<void>): this {
    this.plugin.install = installFn;
    return this;
  }

  uninstall(uninstallFn: (context: PluginContext) => void | Promise<void>): this {
    this.plugin.uninstall = uninstallFn;
    return this;
  }

  beforeInstall(beforeInstallFn: (context: PluginContext) => void | Promise<void>): this {
    this.plugin.beforeInstall = beforeInstallFn;
    return this;
  }

  afterInstall(afterInstallFn: (context: PluginContext) => void | Promise<void>): this {
    this.plugin.afterInstall = afterInstallFn;
    return this;
  }

  beforeUninstall(beforeUninstallFn: (context: PluginContext) => void | Promise<void>): this {
    this.plugin.beforeUninstall = beforeUninstallFn;
    return this;
  }

  afterUninstall(afterUninstallFn: (context: PluginContext) => void | Promise<void>): this {
    this.plugin.afterUninstall = afterUninstallFn;
    return this;
  }

  onError(onErrorFn: (error: Error, context: PluginContext) => void | Promise<void>): this {
    this.plugin.onError = onErrorFn;
    return this;
  }

  build(): EnhancedPlugin {
    if (!this.plugin.name || !this.plugin.version || !this.plugin.install) {
      throw new Error("Plugin must have name, version, and install function");
    }

    return this.plugin as EnhancedPlugin;
  }
}
