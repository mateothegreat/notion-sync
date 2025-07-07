/**
 * Core types for the Control Plane
 */

import { Observable } from "rxjs";

/**
 * Message types for the control plane
 */
export interface Message<T = any> {
  id: string;
  type: string;
  payload: T;
  timestamp: number;
  source?: string;
  target?: string;
  metadata?: Record<string, any>;
}

/**
 * Command interface for command pattern implementation
 */
export interface Command<T = any> {
  id: string;
  type: string;
  payload: T;
  timestamp: number;
  source?: string;
  metadata?: Record<string, any>;
}

/**
 * Event interface for event-driven patterns
 */
export interface Event<T = any> {
  id: string;
  type: string;
  payload: T;
  timestamp: number;
  source?: string;
  metadata?: Record<string, any>;
}

/**
 * Channel interface for typed message routing
 */
export interface Channel<T = any> {
  subscribe(observer: (message: T) => void): { unsubscribe: () => void };
  publish(message: T): Promise<void>;
  close(): void;
}

/**
 * Bus channel interface with promise-based operations
 */
export interface BusChannel<T = any> {
  subscribe(observer: (message: T) => void): Promise<{ unsubscribe: () => void }>;
  publish(message: T): Promise<void>;
  close(): Promise<void>;
}

/**
 * Message handler function type
 */
export type MessageHandler<T = any> = (message: Message<T>) => void | Promise<void>;

/**
 * Command handler function type
 */
export type CommandHandler<T = any> = (command: Command<T>) => void | Promise<void>;

/**
 * Event handler function type
 */
export type EventHandler<T = any> = (event: Event<T>) => void | Promise<void>;

/**
 * Middleware function type
 */
export type Middleware<T = any> = (message: Message<T>, next: () => void | Promise<void>) => void | Promise<void>;

/**
 * Plugin interface
 */
export interface Plugin {
  name: string;
  version: string;
  install(controlPlane: any): void | Promise<void>;
  uninstall?(controlPlane: any): void | Promise<void>;
}

/**
 * Hook types
 */
export type HookType =
  | "before-message"
  | "after-message"
  | "before-command"
  | "after-command"
  | "before-event"
  | "after-event"
  | "error";

/**
 * Hook function type
 */
export type HookFunction<T = any> = (context: T) => void | Promise<void>;

/**
 * State change notification
 */
export interface StateChange<T = any> {
  key: string;
  oldValue: T;
  newValue: T;
  timestamp: number;
}

/**
 * Component lifecycle states
 */
export type ComponentState = "created" | "initialized" | "started" | "stopped" | "destroyed";

/**
 * Component interface
 */
export interface Component {
  id: string;
  name: string;
  state: ComponentState;
  dependencies?: string[];
  initialize?(): Promise<void>;
  start?(): Promise<void>;
  stop?(): Promise<void>;
  destroy?(): Promise<void>;
}

/**
 * Component factory configuration
 */
export interface ComponentConfig {
  name: string;
  dependencies?: string[];
  singleton?: boolean;
  factory: (...args: any[]) => Component | Promise<Component>;
}

/**
 * Circuit breaker states
 */
export type CircuitBreakerState = "closed" | "open" | "half-open";

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  monitoringPeriod: number;
  expectedErrors?: string[];
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxAttempts: number;
  backoffMultiplier: number;
  maxBackoff: number;
  retryableErrors: string[];
}

/**
 * Rate limiter configuration
 */
export interface RateLimiterConfig {
  tokensPerInterval: number;
  interval: number;
  maxTokens?: number;
}

/**
 * Serializer interface
 */
export interface Serializer {
  serialize<T>(data: T): Buffer;
  deserialize<T>(buffer: Buffer): T;
}

/**
 * Error types
 */
export class ControlPlaneError extends Error {
  constructor(message: string, public code?: string, public cause?: Error) {
    super(message);
    this.name = "ControlPlaneError";
  }
}

export class MessageRoutingError extends ControlPlaneError {
  constructor(message: string, public messageId?: string, cause?: Error) {
    super(message, "MESSAGE_ROUTING_ERROR", cause);
    this.name = "MessageRoutingError";
  }
}

export class ComponentError extends ControlPlaneError {
  constructor(message: string, public componentId?: string, cause?: Error) {
    super(message, "COMPONENT_ERROR", cause);
    this.name = "ComponentError";
  }
}

export class CircuitBreakerError extends ControlPlaneError {
  constructor(message: string, public operation?: string, cause?: Error) {
    super(message, "CIRCUIT_BREAKER_ERROR", cause);
    this.name = "CircuitBreakerError";
  }
}

/**
 * Observable-based handler types
 */
export type ObservableMessageHandler<T = any> = (message: Message<T>) => Observable<void>;
export type ObservableCommandHandler<T = any> = (command: Command<T>) => Observable<void>;
export type ObservableEventHandler<T = any> = (event: Event<T>) => Observable<void>;

/**
 * Observable-based channel interface
 */
export interface ObservableChannel<T = any> {
  messages$: Observable<T>;
  send(message: T): void;
  close(): void;
}

/**
 * Event-driven operation result
 */
export interface OperationResult<T = any> {
  data?: T;
  error?: Error;
  metadata?: Record<string, any>;
}

/**
 * Stream processing options
 */
export interface StreamOptions {
  bufferSize?: number;
  bufferTime?: number;
  throttleTime?: number;
  debounceTime?: number;
}
