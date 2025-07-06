import { Observable, Subject, of, throwError } from "rxjs";
import { delay, map } from "rxjs/operators";
import type { BrokerAdapter } from "../types";

export class InMemoryAdapter implements BrokerAdapter {
  private channels = new Map<string, Subject<unknown>>();
  private connected = false;

  connect(): Observable<void> {
    return of(undefined).pipe(
      delay(10), // Simulate connection delay
      map(() => {
        this.connected = true;
      })
    );
  }

  disconnect(): Observable<void> {
    return of(undefined).pipe(
      delay(10), // Simulate disconnection delay
      map(() => {
        this.connected = false;
        this.channels.clear();
      })
    );
  }

  publish<T>(channel: string, message: T): Observable<void> {
    if (!this.connected) {
      return throwError(() => new Error("Adapter not connected"));
    }

    const channelSubject = this.getOrCreateChannel<T>(channel);
    channelSubject.next(message);
    return of(undefined);
  }

  subscribe<T>(channel: string): Observable<T> {
    if (!this.connected) {
      return throwError(() => new Error("Adapter not connected"));
    }

    const channelSubject = this.getOrCreateChannel<T>(channel);
    return channelSubject.asObservable();
  }

  isConnected(): boolean {
    return this.connected;
  }

  private getOrCreateChannel<T>(channel: string): Subject<T> {
    if (!this.channels.has(channel)) {
      this.channels.set(channel, new Subject<unknown>());
    }
    return this.channels.get(channel) as Subject<T>;
  }
}
