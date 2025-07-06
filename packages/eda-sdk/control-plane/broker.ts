import { Observable, Subject } from "rxjs";

export interface BusAdapter {
  publish(channel: string, message: unknown): Promise<void>;
  subscribe<T>(channel: string): Observable<T>;
}

export class BrokerBus {
  constructor(private adapter: BusAdapter) {}

  channel<T>(name: string): BrokerBusChannel<T> {
    return new BrokerBusChannel<T>(name, this.adapter);
  }
}

export class BrokerBusChannel<T> {
  private subject: Subject<T>;

  constructor(
    private name: string,
    private adapter: BusAdapter
  ) {
    this.subject = new Subject<T>();
    this.adapter.subscribe<T>(this.name).subscribe(this.subject);
  }

  async publish(message: T): Promise<void> {
    await this.adapter.publish(this.name, message);
  }

  subscribe(next?: (value: T) => void, error?: (error: unknown) => void, complete?: () => void) {
    return this.subject.subscribe(next, error, complete);
  }
}
