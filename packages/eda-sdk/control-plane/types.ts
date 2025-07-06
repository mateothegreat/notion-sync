// Core types for the control plane
import type { Observable, Subject } from "rxjs";

export interface Message<T = unknown> {
  id: string;
  type: string;
  payload: T;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface Channel<T> {
  name: string;
  subject: Subject<T>;
}

export interface BrokerAdapter {
  connect(): Observable<void>;
  disconnect(): Observable<void>;
  publish<T>(channel: string, message: T): Observable<void>;
  subscribe<T>(channel: string): Observable<T>;
  isConnected(): boolean;
}

export interface Middleware {
  name: string;
  priority?: number;
  pre?<T>(message: Message<T>): Observable<Message<T>>;
  post?<T>(message: Message<T>): Observable<void>;
  error?(error: Error, message?: Message): Observable<void>;
}

export interface Plugin {
  name: string;
  version: string;
  install(bus: BrokerBus): void;
  uninstall?(bus: BrokerBus): void;
}

export interface BrokerConfig {
  adapter: BrokerAdapter;
  middleware?: Middleware[];
  plugins?: Plugin[];
  retryConfig?: RetryConfig;
  rateLimitConfig?: RateLimitConfig;
  circuitBreakerConfig?: CircuitBreakerConfig;
}

export interface RetryConfig {
  maxAttempts: number;
  backoffMultiplier: number;
  maxBackoff: number;
  retryableErrors?: string[];
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  halfOpenRequests: number;
  expectedErrors?: string[];
}

export interface BrokerBus {
  channel<T>(name: string): BrokerBusChannel<T>;
  use(middleware: Middleware): void;
  install(plugin: Plugin): void;
  uninstall(pluginName: string): void;
  connect(): Observable<void>;
  disconnect(): Observable<void>;
  isConnected(): boolean;
}

export interface BrokerBusChannel<T> {
  publish(message: T): Observable<void>;
  subscribe(handler: (message: T) => void): Observable<void>;
  asSubject(): Subject<T>;
}

export type EventHandler<T> = (payload: T) => void;

export interface EventEmitter {
  emit<T>(eventName: string, payload: T): void;
  on<T>(eventName: string, handler: EventHandler<T>): () => void;
  off<T>(eventName: string, handler: EventHandler<T>): void;
  once<T>(eventName: string, handler: EventHandler<T>): () => void;
}

export enum CircuitBreakerState {
  CLOSED = "CLOSED",
  OPEN = "OPEN",
  HALF_OPEN = "HALF_OPEN"
}

export interface StateContainer<T> {
  get(): T;
  set(value: T): void;
  update(updater: (current: T) => T): void;
  subscribe(handler: (value: T) => void): () => void;
}

export interface CommandHandler<TCommand, TResult = void> {
  execute(command: TCommand): Observable<TResult>;
  canExecute?(command: TCommand): boolean;
  validate?(command: TCommand): string[];
}

export interface Command {
  id: string;
  type: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}
