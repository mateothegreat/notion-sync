import { Observable, Subject } from "rxjs";
import type { BusAdapter } from "./broker";

export class MemoryAdapter implements BusAdapter {
  private channels: Map<string, Subject<unknown>> = new Map();

  publish(channel: string, message: unknown): Promise<void> {
    const subject = this.getOrCreateChannel(channel);
    subject.next(message);
    return Promise.resolve();
  }

  subscribe<T>(channel: string): Observable<T> {
    const subject = this.getOrCreateChannel<T>(channel);
    return subject.asObservable();
  }

  private getOrCreateChannel<T = unknown>(channel: string): Subject<T> {
    if (!this.channels.has(channel)) {
      this.channels.set(channel, new Subject<unknown>());
    }
    return this.channels.get(channel) as Subject<T>;
  }
}
