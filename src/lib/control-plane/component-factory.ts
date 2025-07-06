/**
 * Component Factory Implementation
 *
 * Provides component creation, lifecycle management, and dependency injection
 */

import { Component, ComponentConfig, ComponentState, ComponentError } from "./types";

/**
 * Dependency injection container
 */
export class DIContainer {
  private providers = new Map<string, any>();
  private singletons = new Map<string, any>();

  /**
   * Register a provider
   */
  register<T>(token: string, provider: T | (() => T), singleton = false): void {
    this.providers.set(token, { provider, singleton });
  }

  /**
   * Resolve a dependency
   */
  resolve<T>(token: string): T {
    const entry = this.providers.get(token);
    if (!entry) {
      throw new Error(`No provider registered for token: ${token}`);
    }

    const { provider, singleton } = entry;

    if (singleton) {
      if (!this.singletons.has(token)) {
        const instance = typeof provider === "function" ? provider() : provider;
        this.singletons.set(token, instance);
      }
      return this.singletons.get(token);
    }

    return typeof provider === "function" ? provider() : provider;
  }

  /**
   * Check if a provider is registered
   */
  has(token: string): boolean {
    return this.providers.has(token);
  }

  /**
   * Clear all providers
   */
  clear(): void {
    this.providers.clear();
    this.singletons.clear();
  }
}

/**
 * Component wrapper for lifecycle management
 */
class ComponentWrapper {
  public state: ComponentState = "created";
  private dependencies: ComponentWrapper[] = [];

  constructor(
    public component: Component,
    public config: ComponentConfig
  ) {}

  /**
   * Add a dependency
   */
  addDependency(dependency: ComponentWrapper): void {
    this.dependencies.push(dependency);
  }

  /**
   * Get all dependencies
   */
  getDependencies(): ComponentWrapper[] {
    return [...this.dependencies];
  }

  /**
   * Initialize the component
   */
  async initialize(): Promise<void> {
    if (this.state !== "created") {
      throw new ComponentError(
        `Cannot initialize component ${this.component.name} in state ${this.state}`,
        this.component.id
      );
    }

    try {
      // Initialize dependencies first
      for (const dep of this.dependencies) {
        if (dep.state === "created") {
          await dep.initialize();
        }
      }

      if (this.component.initialize) {
        await this.component.initialize();
      }

      this.state = "initialized";
      this.component.state = "initialized";
    } catch (error) {
      throw new ComponentError(
        `Failed to initialize component ${this.component.name}`,
        this.component.id,
        error as Error
      );
    }
  }

  /**
   * Start the component
   */
  async start(): Promise<void> {
    if (this.state !== "initialized") {
      throw new ComponentError(
        `Cannot start component ${this.component.name} in state ${this.state}`,
        this.component.id
      );
    }

    try {
      // Start dependencies first
      for (const dep of this.dependencies) {
        if (dep.state === "initialized") {
          await dep.start();
        }
      }

      if (this.component.start) {
        await this.component.start();
      }

      this.state = "started";
      this.component.state = "started";
    } catch (error) {
      throw new ComponentError(`Failed to start component ${this.component.name}`, this.component.id, error as Error);
    }
  }

  /**
   * Stop the component
   */
  async stop(): Promise<void> {
    if (this.state !== "started") {
      return; // Already stopped or not started
    }

    try {
      if (this.component.stop) {
        await this.component.stop();
      }

      // Stop dependencies in reverse order
      for (const dep of this.dependencies.reverse()) {
        if (dep.state === "started") {
          await dep.stop();
        }
      }

      this.state = "stopped";
      this.component.state = "stopped";
    } catch (error) {
      throw new ComponentError(`Failed to stop component ${this.component.name}`, this.component.id, error as Error);
    }
  }

  /**
   * Destroy the component
   */
  async destroy(): Promise<void> {
    if (this.state === "destroyed") {
      return; // Already destroyed
    }

    try {
      if (this.state === "started") {
        await this.stop();
      }

      if (this.component.destroy) {
        await this.component.destroy();
      }

      // Destroy dependencies in reverse order
      for (const dep of this.dependencies.reverse()) {
        if (dep.state !== "destroyed") {
          await dep.destroy();
        }
      }

      this.state = "destroyed";
      this.component.state = "destroyed";
    } catch (error) {
      throw new ComponentError(`Failed to destroy component ${this.component.name}`, this.component.id, error as Error);
    }
  }
}

/**
 * Component factory for creating and managing components
 */
export class ComponentFactory {
  private configs = new Map<string, ComponentConfig>();
  private components = new Map<string, ComponentWrapper>();
  private container = new DIContainer();
  private componentCounter = 0;

  /**
   * Register a component configuration
   */
  register(config: ComponentConfig): void {
    if (this.configs.has(config.name)) {
      throw new Error(`Component ${config.name} is already registered`);
    }

    this.configs.set(config.name, config);
  }

  /**
   * Create a component instance
   */
  async create(name: string, ...args: any[]): Promise<Component> {
    const config = this.configs.get(name);
    if (!config) {
      throw new Error(`No configuration found for component: ${name}`);
    }

    // Check if singleton and already exists
    if (config.singleton && this.components.has(name)) {
      return this.components.get(name)!.component;
    }

    try {
      // Create the component
      const component = await config.factory(...args);
      component.id = component.id || this.generateComponentId();
      component.name = name;
      component.state = "created";

      const wrapper = new ComponentWrapper(component, config);

      // Resolve dependencies
      if (config.dependencies) {
        for (const depName of config.dependencies) {
          const depComponent = await this.create(depName);
          const depWrapper = this.components.get(depName);
          if (depWrapper) {
            wrapper.addDependency(depWrapper);
          }
        }
      }

      // Store the component
      const key = config.singleton ? name : `${name}_${component.id}`;
      this.components.set(key, wrapper);

      return component;
    } catch (error) {
      throw new ComponentError(`Failed to create component ${name}`, undefined, error as Error);
    }
  }

  /**
   * Get a component by name (for singletons) or ID
   */
  get(nameOrId: string): Component | undefined {
    const wrapper = this.components.get(nameOrId);
    return wrapper?.component;
  }

  /**
   * Initialize a component and its dependencies
   */
  async initialize(nameOrId: string): Promise<void> {
    const wrapper = this.components.get(nameOrId);
    if (!wrapper) {
      throw new Error(`Component not found: ${nameOrId}`);
    }

    await wrapper.initialize();
  }

  /**
   * Start a component and its dependencies
   */
  async start(nameOrId: string): Promise<void> {
    const wrapper = this.components.get(nameOrId);
    if (!wrapper) {
      throw new Error(`Component not found: ${nameOrId}`);
    }

    await wrapper.start();
  }

  /**
   * Stop a component
   */
  async stop(nameOrId: string): Promise<void> {
    const wrapper = this.components.get(nameOrId);
    if (!wrapper) {
      throw new Error(`Component not found: ${nameOrId}`);
    }

    await wrapper.stop();
  }

  /**
   * Destroy a component
   */
  async destroy(nameOrId: string): Promise<void> {
    const wrapper = this.components.get(nameOrId);
    if (!wrapper) {
      throw new Error(`Component not found: ${nameOrId}`);
    }

    await wrapper.destroy();
    this.components.delete(nameOrId);
  }

  /**
   * Initialize all components
   */
  async initializeAll(): Promise<void> {
    const wrappers = Array.from(this.components.values());

    // Sort by dependency order
    const sorted = this.topologicalSort(wrappers);

    for (const wrapper of sorted) {
      if (wrapper.state === "created") {
        await wrapper.initialize();
      }
    }
  }

  /**
   * Start all components
   */
  async startAll(): Promise<void> {
    const wrappers = Array.from(this.components.values());

    // Sort by dependency order
    const sorted = this.topologicalSort(wrappers);

    for (const wrapper of sorted) {
      if (wrapper.state === "initialized") {
        await wrapper.start();
      }
    }
  }

  /**
   * Stop all components
   */
  async stopAll(): Promise<void> {
    const wrappers = Array.from(this.components.values());

    // Sort by reverse dependency order
    const sorted = this.topologicalSort(wrappers).reverse();

    for (const wrapper of sorted) {
      if (wrapper.state === "started") {
        await wrapper.stop();
      }
    }
  }

  /**
   * Destroy all components
   */
  async destroyAll(): Promise<void> {
    const wrappers = Array.from(this.components.values());

    // Sort by reverse dependency order
    const sorted = this.topologicalSort(wrappers).reverse();

    for (const wrapper of sorted) {
      if (wrapper.state !== "destroyed") {
        await wrapper.destroy();
      }
    }

    this.components.clear();
  }

  /**
   * Get all component names
   */
  getRegisteredNames(): string[] {
    return Array.from(this.configs.keys());
  }

  /**
   * Get all active components
   */
  getActiveComponents(): Component[] {
    return Array.from(this.components.values()).map((w) => w.component);
  }

  /**
   * Register a dependency in the DI container
   */
  registerDependency<T>(token: string, provider: T | (() => T), singleton = false): void {
    this.container.register(token, provider, singleton);
  }

  /**
   * Resolve a dependency from the DI container
   */
  resolveDependency<T>(token: string): T {
    return this.container.resolve<T>(token);
  }

  /**
   * Topological sort for dependency resolution
   */
  private topologicalSort(wrappers: ComponentWrapper[]): ComponentWrapper[] {
    const visited = new Set<ComponentWrapper>();
    const result: ComponentWrapper[] = [];

    const visit = (wrapper: ComponentWrapper) => {
      if (visited.has(wrapper)) {
        return;
      }

      visited.add(wrapper);

      // Visit dependencies first
      for (const dep of wrapper.getDependencies()) {
        visit(dep);
      }

      result.push(wrapper);
    };

    for (const wrapper of wrappers) {
      visit(wrapper);
    }

    return result;
  }

  /**
   * Generate unique component ID
   */
  private generateComponentId(): string {
    return `comp_${Date.now()}_${++this.componentCounter}`;
  }
}
