/**
 * Message Bus Implementation
 * 
 * Provides centralized message routing with RxJS-based channels
 */

import { Observable, Subject, BehaviorSubject, filter, map, catchError, of, EMPTY } from 'rxjs';
import { 
  Message, 
  Channel, 
  BusChannel, 
  MessageHandler, 
  MessageRoutingError,
  Middleware 
} from './types';

/**
 * Message bus adapter interface for different backends
 */
export interface MessageBusAdapter {
  publish<T>(channel: string, message: Message<T>): Promise<void>;
  subscribe<T>(channel: string, handler: MessageHandler<T>): Promise<() => void>;
  close(): Promise<void>;
}

/**
 * In-memory message bus adapter
 */
export class InMemoryAdapter implements MessageBusAdapter {
  private channels = new Map<string, Subject<Message<any>>>();

  async publish<T>(channel: string, message: Message<T>): Promise<void> {
    const subject = this.getOrCreateChannel(channel);
    subject.next(message);
  }

  async subscribe<T>(channel: string, handler: MessageHandler<T>): Promise<() => void> {
    const subject = this.getOrCreateChannel(channel);
    const subscription = subject.subscribe({
      next: handler,
      error: (error) => console.error(`Error in channel ${channel}:`, error)
    });

    return () => subscription.unsubscribe();
  }

  async close(): Promise<void> {
    for (const subject of this.channels.values()) {
      subject.complete();
    }
    this.channels.clear();
  }

  private getOrCreateChannel(channel: string): Subject<Message<any>> {
    if (!this.channels.has(channel)) {
      this.channels.set(channel, new Subject<Message<any>>());
    }
    return this.channels.get(channel)!;
  }
}

/**
 * Message bus implementation with middleware support
 */
export class MessageBus {
  private middleware: Middleware[] = [];
  private messageCounter = 0;

  constructor(private adapter: MessageBusAdapter) {}

  /**
   * Add middleware to the message processing pipeline
   */
  use(middleware: Middleware): void {
    this.middleware.push(middleware);
  }

  /**
   * Create a typed channel for message communication
   */
  channel<T>(name: string): Channel<T> {
    return new MessageBusChannel<T>(name, this);
  }

  /**
   * Create a bus channel with promise-based operations
   */
  busChannel<T>(name: string): BusChannel<T> {
    return new PromiseBusChannel<T>(name, this);
  }

  /**
   * Publish a message to a channel
   */
  async publish<T>(channel: string, payload: T, metadata?: Record<string, any>): Promise<void> {
    const message: Message<T> = {
      id: this.generateMessageId(),
      type: channel,
      payload,
      timestamp: Date.now(),
      metadata
    };

    try {
      await this.processMiddleware(message);
      await this.adapter.publish(channel, message);
    } catch (error) {
      throw new MessageRoutingError(
        `Failed to publish message to channel ${channel}`,
        message.id,
        error as Error
      );
    }
  }

  /**
   * Subscribe to messages on a channel
   */
  async subscribe<T>(
    channel: string, 
    handler: MessageHandler<T>
  ): Promise<() => void> {
    const wrappedHandler: MessageHandler<T> = async (message) => {
      try {
        await this.processMiddleware(message);
        await handler(message);
      } catch (error) {
        console.error(`Error processing message ${message.id}:`, error);
      }
    };

    return this.adapter.subscribe(channel, wrappedHandler);
  }

  /**
   * Close the message bus
   */
  async close(): Promise<void> {
    await this.adapter.close();
  }

  /**
   * Process middleware pipeline
   */
  private async processMiddleware<T>(message: Message<T>): Promise<void> {
    let index = 0;

    const next = async (): Promise<void> => {
      if (index < this.middleware.length) {
        const middleware = this.middleware[index++];
        await middleware(message, next);
      }
    };

    await next();
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${++this.messageCounter}`;
  }
}

/**
 * RxJS Subject-based channel implementation
 */
export class MessageBusChannel<T> implements Channel<T> {
  private subject = new Subject<T>();
  private closed = false;

  private busSubscription?: () => void;
  private setupPromise?: Promise<void>;

  constructor(
    private name: string,
    private bus: MessageBus
  ) {
    // Subscribe to the message bus once
    this.setupPromise = this.setupBusSubscription();
  }

  private async setupBusSubscription() {
    try {
      this.busSubscription = await this.bus.subscribe(this.name, (message) => {
        this.subject.next(message.payload);
      });
    } catch (error) {
      console.error(`Error setting up bus subscription for ${this.name}:`, error);
    }
  }

  subscribe(observer: (message: T) => void): { unsubscribe: () => void } {
    if (this.closed) {
      throw new Error(`Channel ${this.name} is closed`);
    }

    const subscription = this.subject.subscribe({
      next: observer,
      error: (error) => console.error(`Error in channel ${this.name}:`, error)
    });

    return {
      unsubscribe: () => subscription.unsubscribe()
    };
  }

  async publish(message: T): Promise<void> {
    if (this.closed) {
      throw new Error(`Channel ${this.name} is closed`);
    }

    // Wait for setup to complete
    if (this.setupPromise) {
      await this.setupPromise;
    }

    await this.bus.publish(this.name, message);
    this.subject.next(message);
  }

  close(): void {
    this.closed = true;
    this.subject.complete();
    if (this.busSubscription) {
      this.busSubscription();
    }
  }
}

/**
 * Promise-based bus channel implementation
 */
export class PromiseBusChannel<T> implements BusChannel<T> {
  private subject = new Subject<T>();
  private closed = false;
  private unsubscribeFromBus?: () => void;

  constructor(
    private name: string,
    private bus: MessageBus
  ) {}

  async subscribe(observer: (message: T) => void): Promise<{ unsubscribe: () => void }> {
    if (this.closed) {
      throw new Error(`Channel ${this.name} is closed`);
    }

    const subscription = this.subject.subscribe({
      next: observer,
      error: (error) => console.error(`Error in channel ${this.name}:`, error)
    });

    // Subscribe to the message bus
    this.unsubscribeFromBus = await this.bus.subscribe(this.name, (message) => {
      this.subject.next(message.payload);
    });

    return {
      unsubscribe: () => {
        subscription.unsubscribe();
        if (this.unsubscribeFromBus) {
          this.unsubscribeFromBus();
        }
      }
    };
  }

  async publish(message: T): Promise<void> {
    if (this.closed) {
      throw new Error(`Channel ${this.name} is closed`);
    }

    await this.bus.publish(this.name, message);
  }

  async close(): Promise<void> {
    this.closed = true;
    this.subject.complete();
    if (this.unsubscribeFromBus) {
      this.unsubscribeFromBus();
    }
  }
}

/**
 * Broker bus implementation following the pseudo-code pattern
 */
export class BrokerBus {
  private bus: MessageBus;

  constructor(adapter?: MessageBusAdapter) {
    this.bus = new MessageBus(adapter || new InMemoryAdapter());
  }

  /**
   * Create a typed channel
   */
  channel<T>(name: string): Subject<T> {
    const subject = new Subject<T>();
    
    // Set up bidirectional communication
    this.bus.subscribe(name, (message) => {
      subject.next(message.payload);
    }).catch(error => {
      console.error(`Error setting up channel subscription for ${name}:`, error);
    });

    // Override next to publish to bus
    const originalNext = subject.next.bind(subject);
    subject.next = (value: T) => {
      this.bus.publish(name, value).catch(error => {
        console.error(`Error publishing to channel ${name}:`, error);
      });
      originalNext(value);
    };

    return subject;
  }

  /**
   * Add middleware to the bus
   */
  use(middleware: Middleware): void {
    this.bus.use(middleware);
  }

  /**
   * Close the broker bus
   */
  async close(): Promise<void> {
    await this.bus.close();
  }
}

/**
 * Utility function to provide bus subjects for dependency injection
 */
export function provideBusSubject<T extends Subject<any>>(channelName: string) {
  return {
    provide: channelName,
    useFactory: (bus: BrokerBus) => bus.channel<T>(channelName),
    deps: [BrokerBus]
  };
}

/**
 * Utility function to provide bus channels for dependency injection
 */
export function provideBusChannel<T extends BusChannel<any>>(channelName: string) {
  return {
    provide: channelName,
    useFactory: (bus: MessageBus) => bus.busChannel<T>(channelName),
    deps: [MessageBus]
  };
}