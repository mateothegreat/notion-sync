/**
 * Message Bus Implementation
 *
 * Provides centralized message routing with RxJS-based channels
 */

import { EMPTY, merge, Observable, of, Subject, Subscription } from "rxjs";
import { catchError, map, mergeMap, share, takeUntil, tap } from "rxjs/operators";
import {
  Message,
  MessageRoutingError,
  Middleware,
  ObservableChannel,
  ObservableMessageHandler,
  OperationResult
} from "./types";

/**
 * Message bus adapter interface for different backends
 */
export interface MessageBusAdapter {
  publish<T>(channel: string, message: Message<T>): Observable<void>;
  subscribe<T>(channel: string): Observable<Message<T>>;
  close(): Observable<void>;
}

/**
 * In-memory message bus adapter
 */
export class InMemoryAdapter implements MessageBusAdapter {
  private channels = new Map<string, Subject<Message<any>>>();
  private destroy$ = new Subject<void>();

  publish<T>(channel: string, message: Message<T>): Observable<void> {
    return new Observable((observer) => {
      try {
        const subject = this.getOrCreateChannel(channel);
        subject.next(message);
        observer.next();
        observer.complete();
      } catch (error) {
        observer.error(error);
      }
    });
  }

  subscribe<T>(channel: string): Observable<Message<T>> {
    const subject = this.getOrCreateChannel(channel);
    return subject.asObservable().pipe(takeUntil(this.destroy$), share());
  }

  close(): Observable<void> {
    return new Observable((observer) => {
      try {
        for (const subject of this.channels.values()) {
          subject.complete();
        }
        this.channels.clear();
        this.destroy$.next();
        this.destroy$.complete();
        observer.next();
        observer.complete();
      } catch (error) {
        observer.error(error);
      }
    });
  }

  private getOrCreateChannel(channel: string): Subject<Message<any>> {
    if (!this.channels.has(channel)) {
      this.channels.set(channel, new Subject<Message<any>>());
    }
    return this.channels.get(channel)!;
  }
}

/**
 * Observable middleware function
 */
export type ObservableMiddleware = (message: Message<any>) => Observable<Message<any>>;

/**
 * Message bus implementation with middleware support
 */
export class MessageBus {
  private middleware: ObservableMiddleware[] = [];
  private messageCounter = 0;
  private destroy$ = new Subject<void>();

  constructor(private adapter: MessageBusAdapter) {}

  /**
   * Add middleware to the message processing pipeline
   */
  use(middleware: ObservableMiddleware): void {
    this.middleware.push(middleware);
  }

  /**
   * Create a typed observable channel for message communication
   */
  channel<T>(name: string): ObservableChannel<T> {
    return new MessageBusChannel<T>(name, this);
  }

  /**
   * Publish a message to a channel
   */
  publish<T>(channel: string, payload: T, metadata?: Record<string, any>): Observable<OperationResult<void>> {
    const message: Message<T> = {
      id: this.generateMessageId(),
      type: channel,
      payload,
      timestamp: Date.now(),
      metadata
    };

    return this.processMiddleware(message).pipe(
      mergeMap(() => this.adapter.publish(channel, message)),
      map(() => ({
        metadata: { messageId: message.id }
      })),
      catchError((error) => {
        const routingError = new MessageRoutingError(
          `Failed to publish message to channel ${channel}`,
          message.id,
          error as Error
        );
        return of({
          error: routingError,
          metadata: { messageId: message.id }
        });
      })
    );
  }

  /**
   * Subscribe to messages on a channel
   */
  subscribe<T>(channel: string): Observable<Message<T>> {
    return this.adapter.subscribe<T>(channel).pipe(
      mergeMap((message) =>
        this.processMiddleware(message).pipe(
          map(() => message),
          catchError((error) => {
            console.error(`Error processing message ${message.id}:`, error);
            return EMPTY;
          })
        )
      ),
      takeUntil(this.destroy$)
    );
  }

  /**
   * Subscribe with a handler function
   */
  subscribeHandler<T>(channel: string, handler: ObservableMessageHandler<T>): Subscription {
    return this.subscribe<T>(channel)
      .pipe(
        mergeMap((message) =>
          handler(message).pipe(
            catchError((error) => {
              console.error(`Handler error for message ${message.id}:`, error);
              return EMPTY;
            })
          )
        )
      )
      .subscribe();
  }

  /**
   * Close the message bus
   */
  close(): Observable<void> {
    return this.adapter.close().pipe(
      tap(() => {
        this.destroy$.next();
        this.destroy$.complete();
      })
    );
  }

  /**
   * Process middleware pipeline
   */
  private processMiddleware<T>(message: Message<T>): Observable<Message<T>> {
    if (this.middleware.length === 0) {
      return of(message);
    }

    return this.middleware.reduce((acc, middleware) => acc.pipe(mergeMap((msg) => middleware(msg))), of(message));
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${++this.messageCounter}`;
  }
}

/**
 * RxJS Observable-based channel implementation
 */
export class MessageBusChannel<T> implements ObservableChannel<T> {
  private payloadSubject = new Subject<T>();
  public messages$: Observable<T>;
  private destroy$ = new Subject<void>();
  private subscription?: Subscription;

  constructor(private name: string, private bus: MessageBus) {
    // Set up the message stream
    this.messages$ = merge(
      // Messages from the bus
      this.bus.subscribe<T>(this.name).pipe(
        map((message) => message.payload),
        tap((payload) => this.payloadSubject.next(payload))
      ),
      // Local messages
      this.payloadSubject.asObservable()
    ).pipe(takeUntil(this.destroy$), share());

    // Subscribe to keep the stream active
    this.subscription = this.messages$.subscribe({
      error: (error) => console.error(`Error in channel ${this.name}:`, error)
    });
  }

  send(message: T): void {
    // Publish to bus and emit locally
    this.bus
      .publish(this.name, message)
      .pipe(
        tap((result) => {
          if (!result.error) {
            this.payloadSubject.next(message);
          }
        }),
        catchError((error) => {
          console.error(`Error sending message to channel ${this.name}:`, error);
          return EMPTY;
        })
      )
      .subscribe();
  }

  close(): void {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
    this.destroy$.next();
    this.destroy$.complete();
    this.payloadSubject.complete();
  }
}

/**
 * Broker bus implementation with pure RxJS
 */
export class BrokerBus {
  private bus: MessageBus;
  private channels = new Map<string, Subject<any>>();
  private destroy$ = new Subject<void>();

  constructor(adapter?: MessageBusAdapter) {
    this.bus = new MessageBus(adapter || new InMemoryAdapter());
  }

  /**
   * Create a typed observable channel
   */
  channel<T>(name: string): ObservableChannel<T> {
    return this.bus.channel<T>(name);
  }

  /**
   * Create a Subject that's connected to the bus
   */
  subject<T>(name: string): Subject<T> {
    if (this.channels.has(name)) {
      return this.channels.get(name)!;
    }

    const subject = new Subject<T>();

    // Subscribe to bus messages
    this.bus
      .subscribe<T>(name)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (message) => subject.next(message.payload),
        error: (error) => console.error(`Error in channel ${name}:`, error)
      });

    // Override next to publish to bus
    const originalNext = subject.next.bind(subject);
    subject.next = (value: T) => {
      this.bus
        .publish(name, value)
        .pipe(
          catchError((error) => {
            console.error(`Error publishing to channel ${name}:`, error);
            return EMPTY;
          })
        )
        .subscribe();
    };

    this.channels.set(name, subject);
    return subject;
  }

  /**
   * Add middleware to the bus
   */
  use(middleware: ObservableMiddleware): void {
    this.bus.use(middleware);
  }

  /**
   * Close the broker bus
   */
  close(): Observable<void> {
    return this.bus.close().pipe(
      tap(() => {
        for (const subject of this.channels.values()) {
          subject.complete();
        }
        this.channels.clear();
        this.destroy$.next();
        this.destroy$.complete();
      })
    );
  }
}

/**
 * Utility function to create a channel provider for dependency injection
 */
export function provideChannel<T>(channelName: string) {
  return {
    provide: channelName,
    useFactory: (bus: BrokerBus) => bus.channel<T>(channelName),
    deps: [BrokerBus]
  };
}

/**
 * Utility function to create a subject provider for dependency injection
 */
export function provideSubject<T>(channelName: string) {
  return {
    provide: channelName,
    useFactory: (bus: BrokerBus) => bus.subject<T>(channelName),
    deps: [BrokerBus]
  };
}

/**
 * Legacy middleware adapter (converts old middleware to observable)
 */
export function adaptLegacyMiddleware(middleware: Middleware): ObservableMiddleware {
  return (message: Message<any>) => {
    return new Observable<Message<any>>((observer) => {
      let completed = false;

      const next = () => {
        if (!completed) {
          completed = true;
          observer.next(message);
          observer.complete();
        }
      };

      Promise.resolve(middleware(message, next)).catch((error) => observer.error(error));
    });
  };
}
