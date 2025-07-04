/**
 * State Registry Implementation
 * 
 * Provides both mutable and immutable state management with notifications
 */

import { produce, Draft } from 'immer';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { StateChange } from './types';

/**
 * State container interface
 */
export interface StateContainer<T> {
  get(): T;
  set(value: T): void;
  update(updater: (draft: Draft<T>) => void): void;
  subscribe(observer: (value: T) => void): { unsubscribe: () => void };
  onChange(): Observable<StateChange<T>>;
}

/**
 * Mutable state container for performance-critical scenarios
 */
export class MutableStateContainer<T> implements StateContainer<T> {
  private subject: BehaviorSubject<T>;
  private changeSubject = new Subject<StateChange<T>>();

  constructor(
    private key: string,
    initialValue: T
  ) {
    this.subject = new BehaviorSubject<T>(initialValue);
  }

  get(): T {
    return this.subject.value;
  }

  set(value: T): void {
    const oldValue = this.subject.value;
    this.subject.next(value);
    this.emitChange(oldValue, value);
  }

  update(updater: (draft: Draft<T>) => void): void {
    const oldValue = this.subject.value;
    const newValue = produce(oldValue, updater);
    this.subject.next(newValue);
    this.emitChange(oldValue, newValue);
  }

  subscribe(observer: (value: T) => void): { unsubscribe: () => void } {
    const subscription = this.subject.subscribe(observer);
    return {
      unsubscribe: () => subscription.unsubscribe()
    };
  }

  onChange(): Observable<StateChange<T>> {
    return this.changeSubject.asObservable();
  }

  private emitChange(oldValue: T, newValue: T): void {
    this.changeSubject.next({
      key: this.key,
      oldValue,
      newValue,
      timestamp: Date.now()
    });
  }
}

/**
 * Immutable state container using Immer for structural sharing
 */
export class ImmutableStateContainer<T> implements StateContainer<T> {
  private subject: BehaviorSubject<T>;
  private changeSubject = new Subject<StateChange<T>>();

  constructor(
    private key: string,
    initialValue: T
  ) {
    this.subject = new BehaviorSubject<T>(initialValue);
  }

  get(): T {
    return this.subject.value;
  }

  set(value: T): void {
    const oldValue = this.subject.value;
    // Ensure immutability by creating a new object
    const newValue = produce(value, (draft) => {
      // Force a new object creation even if no changes
      return draft;
    });
    this.subject.next(newValue);
    this.emitChange(oldValue, newValue);
  }

  update(updater: (draft: Draft<T>) => void): void {
    const oldValue = this.subject.value;
    const newValue = produce(oldValue, updater);
    this.subject.next(newValue);
    this.emitChange(oldValue, newValue);
  }

  subscribe(observer: (value: T) => void): { unsubscribe: () => void } {
    const subscription = this.subject.subscribe(observer);
    return {
      unsubscribe: () => subscription.unsubscribe()
    };
  }

  onChange(): Observable<StateChange<T>> {
    return this.changeSubject.asObservable();
  }

  private emitChange(oldValue: T, newValue: T): void {
    this.changeSubject.next({
      key: this.key,
      oldValue,
      newValue,
      timestamp: Date.now()
    });
  }
}

/**
 * State registry for managing application state
 */
export class StateRegistry {
  private containers = new Map<string, StateContainer<any>>();
  private globalChangeSubject = new Subject<StateChange<any>>();

  /**
   * Register a mutable state container
   */
  registerMutable<T>(key: string, initialValue: T): StateContainer<T> {
    if (this.containers.has(key)) {
      throw new Error(`State container with key '${key}' already exists`);
    }

    const container = new MutableStateContainer(key, initialValue);
    this.containers.set(key, container);

    // Subscribe to changes for global notifications
    container.onChange().subscribe(change => {
      this.globalChangeSubject.next(change);
    });

    return container;
  }

  /**
   * Register an immutable state container
   */
  registerImmutable<T>(key: string, initialValue: T): StateContainer<T> {
    if (this.containers.has(key)) {
      throw new Error(`State container with key '${key}' already exists`);
    }

    const container = new ImmutableStateContainer(key, initialValue);
    this.containers.set(key, container);

    // Subscribe to changes for global notifications
    container.onChange().subscribe(change => {
      this.globalChangeSubject.next(change);
    });

    return container;
  }

  /**
   * Get a state container by key
   */
  get<T>(key: string): StateContainer<T> | undefined {
    return this.containers.get(key);
  }

  /**
   * Check if a state container exists
   */
  has(key: string): boolean {
    return this.containers.has(key);
  }

  /**
   * Remove a state container
   */
  remove(key: string): boolean {
    return this.containers.delete(key);
  }

  /**
   * Get all registered keys
   */
  keys(): string[] {
    return Array.from(this.containers.keys());
  }

  /**
   * Subscribe to all state changes
   */
  onAnyChange(): Observable<StateChange<any>> {
    return this.globalChangeSubject.asObservable();
  }

  /**
   * Create a snapshot of all state
   */
  snapshot(): Record<string, any> {
    const snapshot: Record<string, any> = {};
    for (const [key, container] of this.containers) {
      snapshot[key] = container.get();
    }
    return snapshot;
  }

  /**
   * Restore state from a snapshot
   */
  restore(snapshot: Record<string, any>): void {
    for (const [key, value] of Object.entries(snapshot)) {
      const container = this.containers.get(key);
      if (container) {
        container.set(value);
      }
    }
  }

  /**
   * Clear all state containers
   */
  clear(): void {
    this.containers.clear();
  }
}

/**
 * State selector utility for derived state
 */
export class StateSelector<T, R> {
  private resultSubject = new BehaviorSubject<R | undefined>(undefined);

  constructor(
    private container: StateContainer<T>,
    private selector: (state: T) => R,
    private equalityFn?: (a: R, b: R) => boolean
  ) {
    // Initialize with current value
    const initialResult = this.selector(this.container.get());
    this.resultSubject.next(initialResult);

    this.container.subscribe(state => {
      const newResult = this.selector(state);
      const currentResult = this.resultSubject.value;

      if (this.shouldUpdate(currentResult, newResult)) {
        this.resultSubject.next(newResult);
      }
    });
  }

  subscribe(observer: (value: R) => void): { unsubscribe: () => void } {
    const subscription = this.resultSubject.subscribe(value => {
      if (value !== undefined) {
        observer(value);
      }
    });

    return {
      unsubscribe: () => subscription.unsubscribe()
    };
  }

  get(): R | undefined {
    return this.resultSubject.value;
  }

  private shouldUpdate(current: R | undefined, next: R): boolean {
    if (current === undefined) return true;
    
    if (this.equalityFn) {
      return !this.equalityFn(current, next);
    }

    return current !== next;
  }
}

/**
 * Utility function to create state selectors
 */
export function createSelector<T, R>(
  container: StateContainer<T>,
  selector: (state: T) => R,
  equalityFn?: (a: R, b: R) => boolean
): StateSelector<T, R> {
  return new StateSelector(container, selector, equalityFn);
}