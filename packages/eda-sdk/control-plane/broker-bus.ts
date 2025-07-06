import { EMPTY, Observable, of, Subject, throwError, timer } from "rxjs";
import { catchError, concatMap, retry, tap } from "rxjs/operators";
import { v4 as uuidv4 } from "uuid";
import { CircuitBreaker } from "./circuit-breaker";
import { RateLimiter } from "./rate-limiter";
import type { BrokerAdapter, BrokerBus, BrokerBusChannel, BrokerConfig, Message, Middleware, Plugin } from "./types";

export class DefaultBrokerBus implements BrokerBus {
  private adapter: BrokerAdapter;
  private middleware: Middleware[] = [];
  private plugins = new Map<string, Plugin>();
  private channels = new Map<string, BrokerBusChannel<unknown>>();
  private circuitBreaker?: CircuitBreaker;
  private rateLimiter?: RateLimiter;
  private retryConfig = {
    maxAttempts: 3,
    backoffMultiplier: 2,
    maxBackoff: 5000,
    retryableErrors: ["ECONNREFUSED", "ETIMEDOUT"]
  };

  constructor(config: BrokerConfig) {
    this.adapter = config.adapter;

    if (config.middleware) {
      this.middleware = [...config.middleware].sort((a, b) => (b.priority || 0) - (a.priority || 0));
    }

    if (config.retryConfig) {
      this.retryConfig = { ...this.retryConfig, ...config.retryConfig };
    }

    if (config.circuitBreakerConfig) {
      this.circuitBreaker = new CircuitBreaker(config.circuitBreakerConfig);
    }

    if (config.rateLimitConfig) {
      this.rateLimiter = new RateLimiter(config.rateLimitConfig);
    }

    if (config.plugins) {
      config.plugins.forEach((plugin) => this.install(plugin));
    }
  }

  channel<T>(name: string): BrokerBusChannel<T> {
    if (!this.channels.has(name)) {
      const channel = new DefaultBrokerBusChannel<T>(
        name,
        this.adapter,
        this.middleware,
        this.circuitBreaker,
        this.rateLimiter,
        this.retryConfig
      );
      this.channels.set(name, channel as BrokerBusChannel<unknown>);
    }
    return this.channels.get(name) as BrokerBusChannel<T>;
  }

  use(middleware: Middleware): void {
    this.middleware.push(middleware);
    this.middleware.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  install(plugin: Plugin): void {
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin ${plugin.name} is already installed`);
    }
    plugin.install(this);
    this.plugins.set(plugin.name, plugin);
  }

  uninstall(pluginName: string): void {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) {
      throw new Error(`Plugin ${pluginName} is not installed`);
    }
    if (plugin.uninstall) {
      plugin.uninstall(this);
    }
    this.plugins.delete(pluginName);
  }

  connect(): Observable<void> {
    return this.adapter.connect();
  }

  disconnect(): Observable<void> {
    return this.adapter.disconnect();
  }

  isConnected(): boolean {
    return this.adapter.isConnected();
  }
}

class DefaultBrokerBusChannel<T> implements BrokerBusChannel<T> {
  private subject = new Subject<T>();

  constructor(
    private name: string,
    private adapter: BrokerAdapter,
    private middleware: Middleware[],
    private circuitBreaker?: CircuitBreaker,
    private rateLimiter?: RateLimiter,
    private retryConfig = {
      maxAttempts: 3,
      backoffMultiplier: 2,
      maxBackoff: 5000,
      retryableErrors: ["ECONNREFUSED", "ETIMEDOUT"]
    }
  ) {
    // Set up subscription from adapter to internal subject
    this.setupAdapterSubscription();
  }

  private setupAdapterSubscription(): void {
    // Only set up subscription if adapter is connected
    if (typeof this.adapter.isConnected === "function" && this.adapter.isConnected()) {
      this.adapter
        .subscribe<T>(this.name)
        .pipe(
          tap((message) => this.subject.next(message)),
          catchError((error) => {
            console.error(`Error in channel ${this.name}:`, error);
            return EMPTY;
          })
        )
        .subscribe();
    }
  }

  publish(payload: T): Observable<void> {
    const message: Message<T> = {
      id: uuidv4(),
      type: this.name,
      payload,
      timestamp: Date.now()
    };

    // Apply rate limiting if configured
    if (this.rateLimiter && !this.rateLimiter.tryConsume(this.name)) {
      return throwError(() => new Error("Rate limit exceeded"));
    }

    // Apply circuit breaker if configured
    const publishFn = () => this.executePublish(message);

    if (this.circuitBreaker) {
      return this.circuitBreaker.execute(publishFn);
    }

    return publishFn();
  }

  private executePublish(message: Message<T>): Observable<void> {
    // Apply pre-middleware
    let messageObs = of(message);

    for (const mw of this.middleware) {
      if (mw.pre) {
        messageObs = messageObs.pipe(
          concatMap((msg) =>
            mw.pre!(msg).pipe(
              catchError((error) => {
                if (mw.error) {
                  return mw.error(error, msg).pipe(concatMap(() => throwError(() => error)));
                }
                return throwError(() => error);
              })
            )
          )
        );
      }
    }

    return messageObs.pipe(
      concatMap((processedMessage) =>
        this.adapter.publish(this.name, processedMessage.payload).pipe(
          // Also emit to internal subject for local subscribers
          tap(() => this.subject.next(processedMessage.payload)),
          retry({
            count: this.retryConfig.maxAttempts - 1,
            delay: (error, retryCount) => {
              const isRetryable = this.retryConfig.retryableErrors?.some((retryableError) =>
                error.message.includes(retryableError)
              );

              if (!isRetryable) {
                return throwError(() => error);
              }

              const delayMs = Math.min(
                Math.pow(this.retryConfig.backoffMultiplier, retryCount) * 1000,
                this.retryConfig.maxBackoff
              );

              return timer(delayMs);
            }
          })
        )
      ),
      tap(() => {
        // Apply post-middleware
        for (const mw of this.middleware) {
          if (mw.post) {
            mw.post(message).subscribe({
              error: (error) => {
                if (mw.error) {
                  mw.error(error, message).subscribe();
                }
              }
            });
          }
        }
      }),
      catchError((error) => {
        // Apply error middleware
        for (const mw of this.middleware) {
          if (mw.error) {
            mw.error(error, message).subscribe();
          }
        }
        return throwError(() => error);
      })
    );
  }

  subscribe(handler: (message: T) => void): Observable<void> {
    const subscription = this.subject.subscribe({
      next: handler,
      error: (error) => console.error(`Channel ${this.name} error:`, error)
    });

    return new Observable<void>((observer) => {
      observer.next();
      observer.complete();

      return () => subscription.unsubscribe();
    });
  }

  asSubject(): Subject<T> {
    return this.subject;
  }
}
