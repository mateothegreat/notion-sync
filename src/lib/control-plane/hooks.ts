/**
 * Hooks System
 *
 * Provides lifecycle hooks for extensible behavior
 */

import { Observable, Subject } from "rxjs";
import { HookType, HookFunction } from "./types";

/**
 * Hook context for passing data to hook functions
 */
export interface HookContext {
  [key: string]: any;
}

/**
 * Hook registration information
 */
interface HookRegistration {
  id: string;
  type: HookType;
  fn: HookFunction;
  priority: number;
  once: boolean;
}

/**
 * Hook manager for registering and executing hooks
 */
export class HookManager {
  private hooks = new Map<HookType, HookRegistration[]>();
  private hookCounter = 0;
  private hookSubject = new Subject<{ type: HookType; context: HookContext }>();

  /**
   * Register a hook function
   */
  register(
    type: HookType,
    fn: HookFunction,
    options: {
      priority?: number;
      once?: boolean;
      id?: string;
    } = {}
  ): string {
    const registration: HookRegistration = {
      id: options.id || this.generateHookId(),
      type,
      fn,
      priority: options.priority || 0,
      once: options.once || false
    };

    if (!this.hooks.has(type)) {
      this.hooks.set(type, []);
    }

    const hooks = this.hooks.get(type)!;
    hooks.push(registration);

    // Sort by priority (higher priority first)
    hooks.sort((a, b) => b.priority - a.priority);

    return registration.id;
  }

  /**
   * Unregister a hook by ID
   */
  unregister(id: string): boolean {
    for (const [type, hooks] of this.hooks) {
      const index = hooks.findIndex((h) => h.id === id);
      if (index !== -1) {
        hooks.splice(index, 1);
        return true;
      }
    }
    return false;
  }

  /**
   * Execute all hooks of a specific type
   */
  async execute(type: HookType, context: HookContext = {}): Promise<void> {
    const hooks = this.hooks.get(type);
    if (!hooks || hooks.length === 0) {
      return;
    }

    // Emit hook execution event
    this.hookSubject.next({ type, context });

    const hooksToRemove: string[] = [];

    for (const hook of hooks) {
      try {
        await hook.fn(context);

        // Mark for removal if it's a one-time hook
        if (hook.once) {
          hooksToRemove.push(hook.id);
        }
      } catch (error) {
        console.error(`Error executing hook ${hook.id} for type ${type}:`, error);

        // Execute error hooks
        if (type !== "error") {
          await this.execute("error", {
            ...context,
            error,
            hookId: hook.id,
            hookType: type
          });
        }
      }
    }

    // Remove one-time hooks
    for (const id of hooksToRemove) {
      this.unregister(id);
    }
  }

  /**
   * Get all hooks of a specific type
   */
  getHooks(type: HookType): HookRegistration[] {
    return [...(this.hooks.get(type) || [])];
  }

  /**
   * Get all registered hook types
   */
  getTypes(): HookType[] {
    return Array.from(this.hooks.keys());
  }

  /**
   * Clear all hooks of a specific type
   */
  clear(type?: HookType): void {
    if (type) {
      this.hooks.delete(type);
    } else {
      this.hooks.clear();
    }
  }

  /**
   * Get observable for hook execution events
   */
  onHookExecution(): Observable<{ type: HookType; context: HookContext }> {
    return this.hookSubject.asObservable();
  }

  /**
   * Get the number of hooks registered for a type
   */
  count(type: HookType): number {
    return this.hooks.get(type)?.length || 0;
  }

  /**
   * Check if any hooks are registered for a type
   */
  hasHooks(type: HookType): boolean {
    return this.count(type) > 0;
  }

  /**
   * Generate unique hook ID
   */
  private generateHookId(): string {
    return `hook_${Date.now()}_${++this.hookCounter}`;
  }
}

/**
 * Hook decorator for automatic hook registration
 */
export function hook(type: HookType, options: { priority?: number; once?: boolean } = {}) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    // Store hook information for later registration
    if (!target._hooks) {
      target._hooks = [];
    }

    target._hooks.push({
      type,
      method: originalMethod,
      options
    });

    return descriptor;
  };
}

/**
 * Built-in hooks for common scenarios
 */

/**
 * Hook for before message processing
 */
export function beforeMessage(
  fn: (context: { message: any }) => void | Promise<void>,
  options: { priority?: number; once?: boolean } = {}
): string {
  const hookManager = getGlobalHookManager();
  return hookManager.register("before-message", fn, options);
}

/**
 * Hook for after message processing
 */
export function afterMessage(
  fn: (context: { message: any; result?: any; error?: Error }) => void | Promise<void>,
  options: { priority?: number; once?: boolean } = {}
): string {
  const hookManager = getGlobalHookManager();
  return hookManager.register("after-message", fn, options);
}

/**
 * Hook for before command execution
 */
export function beforeCommand(
  fn: (context: { command: any }) => void | Promise<void>,
  options: { priority?: number; once?: boolean } = {}
): string {
  const hookManager = getGlobalHookManager();
  return hookManager.register("before-command", fn, options);
}

/**
 * Hook for after command execution
 */
export function afterCommand(
  fn: (context: { command: any; result?: any; error?: Error }) => void | Promise<void>,
  options: { priority?: number; once?: boolean } = {}
): string {
  const hookManager = getGlobalHookManager();
  return hookManager.register("after-command", fn, options);
}

/**
 * Hook for before event emission
 */
export function beforeEvent(
  fn: (context: { event: any }) => void | Promise<void>,
  options: { priority?: number; once?: boolean } = {}
): string {
  const hookManager = getGlobalHookManager();
  return hookManager.register("before-event", fn, options);
}

/**
 * Hook for after event emission
 */
export function afterEvent(
  fn: (context: { event: any; result?: any; error?: Error }) => void | Promise<void>,
  options: { priority?: number; once?: boolean } = {}
): string {
  const hookManager = getGlobalHookManager();
  return hookManager.register("after-event", fn, options);
}

/**
 * Hook for error handling
 */
export function onError(
  fn: (context: { error: Error; [key: string]: any }) => void | Promise<void>,
  options: { priority?: number; once?: boolean } = {}
): string {
  const hookManager = getGlobalHookManager();
  return hookManager.register("error", fn, options);
}

/**
 * Global hook manager instance
 */
let globalHookManager: HookManager | undefined;

/**
 * Get or create global hook manager
 */
export function getGlobalHookManager(): HookManager {
  if (!globalHookManager) {
    globalHookManager = new HookManager();
  }
  return globalHookManager;
}

/**
 * Set global hook manager
 */
export function setGlobalHookManager(manager: HookManager): void {
  globalHookManager = manager;
}

/**
 * Hook composition utility
 */
export class HookComposer {
  private hooks: Array<{ type: HookType; fn: HookFunction; options?: any }> = [];

  /**
   * Add a hook to the composition
   */
  add(type: HookType, fn: HookFunction, options?: any): this {
    this.hooks.push({ type, fn, options });
    return this;
  }

  /**
   * Register all hooks with a hook manager
   */
  register(manager: HookManager): string[] {
    const ids: string[] = [];

    for (const hook of this.hooks) {
      const id = manager.register(hook.type, hook.fn, hook.options);
      ids.push(id);
    }

    return ids;
  }

  /**
   * Clear all hooks from the composition
   */
  clear(): this {
    this.hooks.length = 0;
    return this;
  }

  /**
   * Get the number of hooks in the composition
   */
  size(): number {
    return this.hooks.length;
  }
}

/**
 * Utility function to create a hook composer
 */
export function createHookComposer(): HookComposer {
  return new HookComposer();
}

/**
 * Conditional hook execution
 */
export function conditionalHook(
  condition: (context: HookContext) => boolean | Promise<boolean>,
  fn: HookFunction
): HookFunction {
  return async (context: HookContext) => {
    const shouldExecute = await condition(context);
    if (shouldExecute) {
      await fn(context);
    }
  };
}

/**
 * Debounced hook execution
 */
export function debouncedHook(fn: HookFunction, delayMs: number): HookFunction {
  let timeoutId: NodeJS.Timeout | undefined;

  return async (context: HookContext) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    return new Promise<void>((resolve, reject) => {
      timeoutId = setTimeout(async () => {
        try {
          await fn(context);
          resolve();
        } catch (error) {
          reject(error);
        }
      }, delayMs);
    });
  };
}

/**
 * Throttled hook execution
 */
export function throttledHook(fn: HookFunction, intervalMs: number): HookFunction {
  let lastExecution = 0;

  return async (context: HookContext) => {
    const now = Date.now();

    if (now - lastExecution >= intervalMs) {
      lastExecution = now;
      await fn(context);
    }
  };
}
