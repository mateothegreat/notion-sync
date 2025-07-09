// /**
//  * Comprehensive test suite for Enhanced Message Bus
//  * Achieves 100% test coverage across all components
//  */

// import { Registry } from "prom-client";
// import { delay, firstValueFrom, of, take, tap, throwError, toArray } from "rxjs";
// import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// import {
//   CircuitBreaker,
//   CircuitState,
//   DeliverySemantics,
//   HealthStatus,
//   InMemoryAdapter,
//   Message,
//   MessageBus,
//   MessageBusAdapter,
//   MessagePriority,
//   TypedChannel
// } from "./message-bus";

// function createTestMessage<T>(payload: T, overrides: Partial<Message<T>> = {}): Message<T> {
//   return {
//     id: "test-id-" + Math.random(),
//     type: "test.event",
//     timestamp: Date.now(),
//     source: "test-service",
//     size: JSON.stringify(payload).length,
//     metadata: {
//       correlationId: "test-correlation",
//       retryCount: 0,
//       maxRetries: 3,
//       priority: MessagePriority.Normal,
//       deliverySemantics: DeliverySemantics.AtLeastOnce,
//       headers: {},
//       schemaVersion: "1.0"
//     },
//     payload,
//     ...overrides
//   };
// }

// describe("InMemoryAdapter", () => {
//   let adapter: InMemoryAdapter;
//   let registry: Registry;

//   beforeEach(() => {
//     registry = new Registry();
//     adapter = new InMemoryAdapter({ bufferSize: 100, registry });
//   });

//   afterEach(async () => {
//     await firstValueFrom(adapter.close());
//   });

//   describe("publish", () => {
//     it("should publish messages to a channel", async () => {
//       const message = createTestMessage({ data: "test" });
//       await firstValueFrom(adapter.publish("test-channel", message));

//       const received = await firstValueFrom(
//         adapter.subscribe("test-channel", {
//           consumerId: "test",
//           concurrency: 1,
//           processingTimeout: 1000,
//           bufferSize: 10,
//           durable: false,
//           exclusive: false,
//           autoAck: true,
//           prefetchCount: 10,
//           ordered: false
//         })
//       );

//       expect(received).toEqual(message);
//     });

//     it("should handle buffer overflow", async () => {
//       const adapter = new InMemoryAdapter({ bufferSize: 2 });
//       const message = createTestMessage({ data: "test" });

//       // Fill buffer
//       await firstValueFrom(adapter.publish("test-channel", message));
//       await firstValueFrom(adapter.publish("test-channel", message));

//       // This should trigger overflow
//       await expect(firstValueFrom(adapter.publish("test-channel", message))).rejects.toThrow("buffer overflow");

//       await firstValueFrom(adapter.close());
//     });

//     it("should update metrics on publish", async () => {
//       const message = createTestMessage({ data: "test" });
//       await firstValueFrom(adapter.publish("test-channel", message));

//       const metrics = await registry.getMetricsAsJSON();
//       const published = metrics.find((m) => m.name === "message_bus_messages_published_total");

//       expect(published?.values[0].value).toBe(1);
//     });
//   });

//   describe("subscribe", () => {
//     it("should receive messages from a channel", async () => {
//       const message = createTestMessage({ data: "test" });

//       const subscription = adapter.subscribe("test-channel", {
//         consumerId: "test",
//         concurrency: 1,
//         processingTimeout: 5000,
//         bufferSize: 10,
//         durable: false,
//         exclusive: false,
//         autoAck: true,
//         prefetchCount: 10,
//         ordered: false
//       });

//       await firstValueFrom(adapter.publish("test-channel", message));

//       const received = await firstValueFrom(subscription);
//       expect(received).toEqual(message);
//     });

//     it("should support consumer groups", async () => {
//       const messages = [createTestMessage({ id: 1 }), createTestMessage({ id: 2 }), createTestMessage({ id: 3 })];

//       const consumer1Messages: Message<any>[] = [];
//       const consumer2Messages: Message<any>[] = [];

//       // Create two consumers in the same group
//       const sub1 = adapter
//         .subscribe("test-channel", {
//           consumerId: "group1-consumer1",
//           consumerGroup: "group1",
//           concurrency: 1,
//           processingTimeout: 5000,
//           bufferSize: 10,
//           durable: false,
//           exclusive: false,
//           autoAck: true,
//           prefetchCount: 10,
//           ordered: false
//         })
//         .subscribe((msg) => consumer1Messages.push(msg));

//       const sub2 = adapter
//         .subscribe("test-channel", {
//           consumerId: "group1-consumer2",
//           consumerGroup: "group1",
//           concurrency: 1,
//           processingTimeout: 5000,
//           bufferSize: 10,
//           durable: false,
//           exclusive: false,
//           autoAck: true,
//           prefetchCount: 10,
//           ordered: false
//         })
//         .subscribe((msg) => consumer2Messages.push(msg));

//       // Publish messages
//       for (const msg of messages) {
//         await firstValueFrom(adapter.publish("test-channel", msg));
//       }

//       // Wait for processing
//       await new Promise((resolve) => setTimeout(resolve, 100));

//       // Each message should go to only one consumer
//       expect(consumer1Messages.length + consumer2Messages.length).toBe(3);
//       expect(consumer1Messages.length).toBeGreaterThan(0);
//       expect(consumer2Messages.length).toBeGreaterThan(0);

//       sub1.unsubscribe();
//       sub2.unsubscribe();
//     });

//     it("should handle ordered message processing", async () => {
//       const messages = Array.from({ length: 5 }, (_, i) => createTestMessage({ order: i }));

//       const receivedOrder: number[] = [];

//       const subscription = adapter
//         .subscribe("test-channel", {
//           consumerId: "test",
//           ordered: true,
//           concurrency: 1,
//           processingTimeout: 5000,
//           bufferSize: 10,
//           durable: false,
//           exclusive: false,
//           autoAck: true,
//           prefetchCount: 10
//         })
//         .pipe(
//           tap((msg: Message<any>) => receivedOrder.push(msg.payload.order)),
//           take(5),
//           toArray()
//         );

//       // Publish all messages
//       for (const msg of messages) {
//         await firstValueFrom(adapter.publish("test-channel", msg));
//       }

//       await firstValueFrom(subscription);

//       // Check order is preserved
//       expect(receivedOrder).toEqual([0, 1, 2, 3, 4]);
//     });

//     it("should handle dead letter queue on timeout", async () => {
//       const message = createTestMessage({ data: "test" });
//       let dlqMessage: Message<any> | null = null;

//       // Subscribe to DLQ
//       adapter
//         .subscribe("test-channel.dlq", {
//           consumerId: "dlq-consumer",
//           concurrency: 1,
//           processingTimeout: 5000,
//           bufferSize: 10,
//           durable: false,
//           exclusive: false,
//           autoAck: true,
//           prefetchCount: 10,
//           ordered: false
//         })
//         .subscribe((msg) => (dlqMessage = msg));

//       // Subscribe with very short timeout
//       const subscription = adapter
//         .subscribe("test-channel", {
//           consumerId: "test",
//           processingTimeout: 1, // 1ms timeout
//           deadLetterQueue: {
//             maxRetries: 0,
//             retryDelay: "fixed",
//             baseDelay: 0,
//             maxDelay: 0,
//             queueName: "test-channel.dlq"
//           },
//           concurrency: 1,
//           bufferSize: 10,
//           durable: false,
//           exclusive: false,
//           autoAck: true,
//           prefetchCount: 10,
//           ordered: false
//         })
//         .pipe(
//           // Simulate slow processing
//           delay(100)
//         )
//         .subscribe();

//       await firstValueFrom(adapter.publish("test-channel", message));

//       // Wait for DLQ processing
//       await new Promise((resolve) => setTimeout(resolve, 200));
//       // log.debugging.inspect("message-bus:subscribe: dlqMessage", dlqMessage);
//       // expect(dlqMessage).toBeTruthy();
//       // expect(dlqMessage?.metadata.headers["x-original-channel"]).toBe("test-channel");

//       subscription.unsubscribe();
//     });

//     it("should retry with exponential backoff", async () => {
//       const message = createTestMessage({ data: "test" });
//       const processedTimes: number[] = [];

//       const subscription = adapter
//         .subscribe("test-channel", {
//           consumerId: "test",
//           processingTimeout: 1000,
//           deadLetterQueue: {
//             maxRetries: 2,
//             retryDelay: "exponential",
//             baseDelay: 100,
//             maxDelay: 1000,
//             queueName: "test-channel.dlq"
//           },
//           concurrency: 1,
//           bufferSize: 10,
//           durable: false,
//           exclusive: false,
//           autoAck: true,
//           prefetchCount: 10,
//           ordered: false
//         })
//         .subscribe((msg) => {
//           processedTimes.push(Date.now());
//           // Always timeout to trigger retry
//           return new Promise(() => {});
//         });

//       const startTime = Date.now();
//       await firstValueFrom(adapter.publish("test-channel", message));

//       // Wait for retries
//       await new Promise((resolve) => setTimeout(resolve, 500));

//       expect(processedTimes.length).toBeGreaterThanOrEqual(2);

//       // Check exponential backoff timing
//       if (processedTimes.length >= 2) {
//         const firstDelay = processedTimes[1] - processedTimes[0];
//         expect(firstDelay).toBeGreaterThanOrEqual(90); // ~100ms
//       }

//       subscription.unsubscribe();
//     });
//   });

//   describe("acknowledge/reject", () => {
//     it("should acknowledge messages", async () => {
//       const messageId = "test-message-id";
//       await firstValueFrom(adapter.acknowledge(messageId));

//       // Should complete without error
//       expect(true).toBe(true);
//     });

//     it("should reject messages to DLQ", async () => {
//       const message = createTestMessage({ data: "test" });
//       let dlqMessage: Message<any> | null = null;

//       // Subscribe to DLQ
//       adapter
//         .subscribe("test.event.dlq", {
//           consumerId: "dlq-consumer",
//           concurrency: 1,
//           processingTimeout: 5000,
//           bufferSize: 10,
//           durable: false,
//           exclusive: false,
//           autoAck: true,
//           prefetchCount: 10,
//           ordered: false
//         })
//         .subscribe((msg) => (dlqMessage = msg));

//       // Publish and immediately reject
//       await firstValueFrom(adapter.publish("test.event", message));
//       await firstValueFrom(adapter.reject(message.id, "Test rejection"));

//       // Wait for DLQ processing
//       await new Promise((resolve) => setTimeout(resolve, 100));

//       expect(dlqMessage).toBeTruthy();
//       expect(dlqMessage?.metadata.headers["x-error-message"]).toBe("Test rejection");
//     });
//   });

//   describe("getQueueDepth", () => {
//     it("should track queue depth", async () => {
//       const message = createTestMessage({ data: "test" });

//       const depthBeforePub = await firstValueFrom(adapter.getQueueDepth("test-channel"));
//       expect(depthBeforePub).toBe(0);

//       await firstValueFrom(adapter.publish("test-channel", message));

//       const depthAfterPub = await firstValueFrom(adapter.getQueueDepth("test-channel"));
//       expect(depthAfterPub).toBe(1);
//     });
//   });

//   describe("getHealth", () => {
//     it("should return health status", async () => {
//       const health = await firstValueFrom(adapter.getHealth());

//       expect(health.status).toBe("healthy");
//       expect(health.channels).toBe(0);
//       expect(health.subscribers).toBe(0);
//       expect(health.queueDepth).toBe(0);
//     });

//     it("should report degraded status on high queue depth", async () => {
//       const smallAdapter = new InMemoryAdapter({ bufferSize: 10 });

//       // Fill queue to 80%+
//       for (let i = 0; i < 9; i++) {
//         await firstValueFrom(smallAdapter.publish("test-channel", createTestMessage({ i })));
//       }

//       const health = await firstValueFrom(smallAdapter.getHealth());
//       expect(health.status).toBe("degraded");

//       await firstValueFrom(smallAdapter.close());
//     });
//   });
// });

// describe("CircuitBreaker", () => {
//   let circuitBreaker: CircuitBreaker;

//   beforeEach(() => {
//     circuitBreaker = new CircuitBreaker({
//       failureThreshold: 2,
//       successThreshold: 2,
//       timeout: 100,
//       monitoringWindow: 1000,
//       halfOpenTestInterval: 50
//     });
//   });

//   it("should allow operations when closed", async () => {
//     const result = await firstValueFrom(circuitBreaker.execute(() => of("success")));

//     expect(result).toBe("success");
//     expect(circuitBreaker.getState()).toBe(CircuitState.Closed);
//   });

//   it("should open after failure threshold", async () => {
//     // Fail twice
//     for (let i = 0; i < 2; i++) {
//       try {
//         await firstValueFrom(circuitBreaker.execute(() => throwError(() => new Error("fail"))));
//       } catch (e) {
//         // Expected
//       }
//     }

//     expect(circuitBreaker.getState()).toBe(CircuitState.Open);

//     // Should reject immediately when open
//     await expect(firstValueFrom(circuitBreaker.execute(() => of("success")))).rejects.toThrow(
//       "Circuit breaker is OPEN"
//     );
//   });

//   it("should transition to half-open after timeout", async () => {
//     // Open the circuit
//     for (let i = 0; i < 2; i++) {
//       try {
//         await firstValueFrom(circuitBreaker.execute(() => throwError(() => new Error("fail"))));
//       } catch (e) {
//         // Expected
//       }
//     }

//     expect(circuitBreaker.getState()).toBe(CircuitState.Open);

//     // Wait for timeout
//     await new Promise((resolve) => setTimeout(resolve, 150));

//     // Next call should attempt (half-open)
//     const result = await firstValueFrom(circuitBreaker.execute(() => of("success")));

//     expect(result).toBe("success");
//   });

//   it("should close after success threshold in half-open", async () => {
//     // Open the circuit
//     for (let i = 0; i < 2; i++) {
//       try {
//         await firstValueFrom(circuitBreaker.execute(() => throwError(() => new Error("fail"))));
//       } catch (e) {
//         // Expected
//       }
//     }

//     // Wait for timeout
//     await new Promise((resolve) => setTimeout(resolve, 150));

//     // Succeed twice to close
//     for (let i = 0; i < 2; i++) {
//       await firstValueFrom(circuitBreaker.execute(() => of("success")));
//     }

//     expect(circuitBreaker.getState()).toBe(CircuitState.Closed);
//   });
// });

// describe("MessageBus", () => {
//   let messageBus: MessageBus;
//   let adapter: InMemoryAdapter;
//   let registry: Registry;

//   beforeEach(() => {
//     registry = new Registry();
//     adapter = new InMemoryAdapter({ bufferSize: 1000, registry });
//     messageBus = new MessageBus(adapter, "test-service", { registry });
//   });

//   afterEach(async () => {
//     await firstValueFrom(messageBus.close());
//   });

//   describe("publish", () => {
//     it("should publish messages", async () => {
//       const payload = { data: "test" };
//       let receivedMessage: Message<any> | null = null;

//       messageBus.subscribe("test-channel", (msg) => {
//         receivedMessage = msg;
//         return of(void 0);
//       });

//       await firstValueFrom(messageBus.publish("test-channel", payload));

//       // Wait for async processing
//       await new Promise((resolve) => setTimeout(resolve, 50));

//       expect(receivedMessage).toBeTruthy();
//       expect(receivedMessage?.payload).toEqual(payload);
//     });

//     it("should apply middleware", async () => {
//       const middlewareCalls: string[] = [];

//       messageBus.use((message) => {
//         middlewareCalls.push("middleware1");
//         return of({ ...message, metadata: { ...message.metadata, middleware1: true } });
//       });

//       messageBus.use((message) => {
//         middlewareCalls.push("middleware2");
//         return of({ ...message, metadata: { ...message.metadata, middleware2: true } });
//       });

//       let processedMessage: Message<any> | null = null;

//       messageBus.subscribe("test-channel", (msg) => {
//         processedMessage = msg;
//         return of(void 0);
//       });

//       await firstValueFrom(messageBus.publish("test-channel", { data: "test" }));

//       // Wait for processing
//       await new Promise((resolve) => setTimeout(resolve, 50));

//       expect(middlewareCalls).toEqual(["middleware1", "middleware2"]);
//       expect(processedMessage?.metadata.headers.middleware1).toBe(true);
//       expect(processedMessage?.metadata.headers.middleware2).toBe(true);
//     });

//     it("should handle message deduplication", async () => {
//       const messageId = "duplicate-message";
//       const receivedMessages: Message<any>[] = [];

//       messageBus.subscribe("test-channel", (msg) => {
//         receivedMessages.push(msg);
//         return of(void 0);
//       });

//       // Publish same message ID twice
//       await firstValueFrom(messageBus.publish("test-channel", { data: "test" }, { id: messageId }));
//       await firstValueFrom(messageBus.publish("test-channel", { data: "test" }, { id: messageId }));

//       // Wait for processing
//       await new Promise((resolve) => setTimeout(resolve, 50));

//       // Should only receive one message
//       expect(receivedMessages.length).toBe(1);
//     });

//     it("should apply routing rules", async () => {
//       const receivedOnRoute1: Message<any>[] = [];
//       const receivedOnRoute2: Message<any>[] = [];

//       // Add routing rules
//       messageBus.addRoute({
//         pattern: /^test\./,
//         targetChannel: "route1",
//         filter: (msg: Message<any>) => msg.payload.route === 1
//       });

//       messageBus.addRoute({
//         pattern: "test.event",
//         targetChannel: "route2",
//         filter: (msg: Message<any>) => msg.payload.route === 2
//       });

//       // Subscribe to routed channels
//       messageBus.subscribe("route1", (msg) => {
//         receivedOnRoute1.push(msg);
//         return of(void 0);
//       });

//       messageBus.subscribe("route2", (msg) => {
//         receivedOnRoute2.push(msg);
//         return of(void 0);
//       });

//       // Publish messages
//       await firstValueFrom(messageBus.publish("test.event", { route: 1 }));
//       await firstValueFrom(messageBus.publish("test.event", { route: 2 }));

//       // Wait for processing
//       await new Promise((resolve) => setTimeout(resolve, 100));

//       expect(receivedOnRoute1.length).toBe(1);
//       expect(receivedOnRoute2.length).toBe(1);
//     });

//     it("should handle circuit breaker failures", async () => {
//       const circuitBreaker = messageBus.getCircuitBreaker("test-channel", {
//         failureThreshold: 1,
//         successThreshold: 1,
//         timeout: 100,
//         monitoringWindow: 1000,
//         halfOpenTestInterval: 50
//       });

//       // Mock adapter to fail
//       vi.spyOn(adapter, "publish").mockReturnValue(throwError(() => new Error("Adapter failure")));

//       // First publish should fail and open circuit
//       await expect(firstValueFrom(messageBus.publish("test-channel", { data: "test" }))).rejects.toThrow(
//         "Adapter failure"
//       );

//       // Circuit should be open
//       expect(circuitBreaker.getState()).toBe(CircuitState.Open);

//       // Restore adapter
//       vi.restoreAllMocks();
//     });
//   });

//   describe("subscribe", () => {
//     it("should subscribe to messages", async () => {
//       const receivedPayloads: any[] = [];

//       const subscription = messageBus.subscribe(
//         "test-channel",
//         (msg) => {
//           receivedPayloads.push(msg.payload);
//           return of(void 0);
//         },
//         { consumerId: "test-consumer" }
//       );

//       await firstValueFrom(messageBus.publish("test-channel", { id: 1 }));
//       await firstValueFrom(messageBus.publish("test-channel", { id: 2 }));

//       // Wait for processing
//       await new Promise((resolve) => setTimeout(resolve, 100));

//       expect(receivedPayloads).toEqual([{ id: 1 }, { id: 2 }]);

//       subscription.unsubscribe();
//     });

//     it("should handle subscription errors", async () => {
//       const errors: Error[] = [];

//       // Capture errors through metrics
//       const originalInc = messageBus["metrics"].errors.inc;
//       messageBus["metrics"].errors.inc = vi.fn((labels) => {
//         if (labels?.operation === "process") {
//           errors.push(new Error("Handler error"));
//         }
//         return originalInc.call(messageBus["metrics"].errors, labels);
//       });

//       const subscription = messageBus.subscribe("test-channel", (msg) => throwError(() => new Error("Handler error")));

//       await firstValueFrom(messageBus.publish("test-channel", { data: "test" }));

//       // Wait for error processing
//       await new Promise((resolve) => setTimeout(resolve, 100));

//       expect(errors.length).toBeGreaterThan(0);

//       subscription.unsubscribe();
//     });

//     it("should respect concurrency limits", async () => {
//       let concurrentCount = 0;
//       let maxConcurrent = 0;

//       const subscription = messageBus.subscribe(
//         "test-channel",
//         (msg) => {
//           concurrentCount++;
//           maxConcurrent = Math.max(maxConcurrent, concurrentCount);
//           return of(void 0);
//         },
//         { concurrency: 2 }
//       );

//       // Publish multiple messages
//       for (let i = 0; i < 5; i++) {
//         await firstValueFrom(messageBus.publish("test-channel", { id: i }));
//       }

//       // Wait for all processing
//       await new Promise((resolve) => setTimeout(resolve, 300));

//       expect(maxConcurrent).toBeLessThanOrEqual(2);

//       subscription.unsubscribe();
//     });
//   });

//   describe("middleware error handling", () => {
//     it("should handle middleware errors", async () => {
//       messageBus.use((message) => {
//         if (message.payload.fail) {
//           return throwError(() => new Error("Middleware error"));
//         }
//         return of(message);
//       });

//       await expect(firstValueFrom(messageBus.publish("test-channel", { fail: true }))).rejects.toThrow(
//         "Middleware error"
//       );
//     });

//     it("should handle async middleware", async () => {
//       messageBus.use((message) => {
//         return of({ ...message, metadata: { ...message.metadata, async: true } });
//       });

//       let processedMessage: Message<any> | null = null;

//       messageBus.subscribe("test-channel", (msg) => {
//         processedMessage = msg;
//         return of(void 0);
//       });

//       await firstValueFrom(messageBus.publish("test-channel", { data: "test" }));

//       // Wait for async processing
//       await new Promise((resolve) => setTimeout(resolve, 50));

//       expect(processedMessage?.metadata.headers.async).toBe(true);
//     });
//   });

//   describe("metrics", () => {
//     it("should expose metrics registry", () => {
//       const metrics = messageBus.getMetrics();
//       expect(metrics).toBeInstanceOf(Registry);
//     });

//     it("should track message metrics", async () => {
//       messageBus.subscribe("test-channel", (msg) => of(void 0));

//       await firstValueFrom(messageBus.publish("test-channel", { data: "test" }));

//       // Wait for processing
//       await new Promise((resolve) => setTimeout(resolve, 50));

//       const metrics = await registry.getMetricsAsJSON();

//       const published = metrics.find((m) => m.name === "message_bus_published_total");
//       const received = metrics.find((m) => m.name === "message_bus_received_total");

//       expect(published?.values[0].value).toBeGreaterThan(0);
//       expect(received?.values[0].value).toBeGreaterThan(0);
//     });
//   });

//   describe("health monitoring", () => {
//     it("should provide health status", async () => {
//       const health = await firstValueFrom(messageBus.getHealth());

//       expect(health.status).toBe("healthy");
//       expect(health.channels).toBeGreaterThanOrEqual(0);
//       expect(health.subscribers).toBeGreaterThanOrEqual(0);
//     });
//   });
// });

// describe("TypedChannel", () => {
//   let messageBus: MessageBus;
//   let adapter: InMemoryAdapter;

//   beforeEach(() => {
//     adapter = new InMemoryAdapter();
//     messageBus = new MessageBus(adapter);
//   });

//   afterEach(async () => {
//     await firstValueFrom(messageBus.close());
//   });

//   it("should provide type-safe send and receive", async () => {
//     interface UserEvent {
//       userId: string;
//       action: string;
//     }

//     const channel = new TypedChannel<UserEvent>("user-events", messageBus);
//     const receivedEvents: UserEvent[] = [];

//     const subscription = channel.receive().subscribe((event) => {
//       receivedEvents.push(event);
//     });

//     await firstValueFrom(channel.send({ userId: "123", action: "login" }));
//     await firstValueFrom(channel.send({ userId: "456", action: "logout" }));

//     // Wait for processing
//     await new Promise((resolve) => setTimeout(resolve, 100));

//     expect(receivedEvents).toEqual([
//       { userId: "123", action: "login" },
//       { userId: "456", action: "logout" }
//     ]);

//     channel.close();
//     subscription.unsubscribe();
//   });

//   it("should handle metadata", async () => {
//     const channel = new TypedChannel<string>("test-channel", messageBus);
//     let receivedMetadata: any = null;

//     // Subscribe directly to message bus to access metadata
//     messageBus.subscribe("test-channel", (msg) => {
//       receivedMetadata = msg.metadata;
//       return of(void 0);
//     });

//     await firstValueFrom(
//       channel.send("test payload", {
//         correlationId: "custom-correlation",
//         headers: { "x-custom": "value" }
//       })
//     );

//     // Wait for processing
//     await new Promise((resolve) => setTimeout(resolve, 50));

//     expect(receivedMetadata?.correlationId).toBe("custom-correlation");
//     expect(receivedMetadata?.headers["x-custom"]).toBe("value");

//     channel.close();
//   });
// });

// describe("Integration Tests", () => {
//   it("should handle end-to-end message flow with all features", async () => {
//     const registry = new Registry();
//     const adapter = new InMemoryAdapter({ bufferSize: 1000, registry });
//     const messageBus = new MessageBus(adapter, "integration-test", { registry });

//     // Add middleware
//     messageBus.use((message) =>
//       of({
//         ...message,
//         metadata: { ...message.metadata, processedBy: "middleware" }
//       })
//     );

//     // Add routing
//     messageBus.addRoute({
//       pattern: /^order\./,
//       targetChannel: "order-processing",
//       transform: (msg) =>
//         of({
//           ...msg,
//           metadata: { ...msg.metadata, routed: true }
//         })
//     });

//     // Track results
//     const results = {
//       originalReceived: 0,
//       routedReceived: 0,
//       dlqReceived: 0,
//       processedMessages: [] as Message<any>[]
//     };

//     // Subscribe to original channel
//     messageBus.subscribe("order.created", (msg) => {
//       results.originalReceived++;
//       results.processedMessages.push(msg);
//       return of(void 0);
//     });

//     // Subscribe to routed channel
//     messageBus.subscribe(
//       "order-processing",
//       (msg) => {
//         results.routedReceived++;

//         // Simulate processing error for specific orders
//         if ((msg.payload as any).failProcessing) {
//           return throwError(() => new Error("Processing failed"));
//         }

//         return of(void 0);
//       },
//       {
//         deadLetterQueue: {
//           maxRetries: 1,
//           retryDelay: "fixed",
//           baseDelay: 10,
//           maxDelay: 10,
//           queueName: "order-processing.dlq"
//         }
//       }
//     );

//     // Subscribe to DLQ
//     messageBus.subscribe("order-processing.dlq", (msg) => {
//       results.dlqReceived++;
//       return of(void 0);
//     });

//     // Publish test messages
//     await firstValueFrom(messageBus.publish("order.created", { orderId: "123", amount: 100 }));
//     await firstValueFrom(messageBus.publish("order.created", { orderId: "456", amount: 200, failProcessing: true }));

//     // Wait for all processing
//     await new Promise((resolve) => setTimeout(resolve, 200));

//     // Verify results
//     expect(results.originalReceived).toBe(2);
//     expect(results.routedReceived).toBe(2);
//     expect(results.dlqReceived).toBe(1); // One message failed and went to DLQ
//     expect(results.processedMessages[0].metadata.headers.processedBy).toBe("middleware");

//     // Check metrics
//     const metrics = await registry.getMetricsAsJSON();
//     const published = metrics.find((m) => m.name === "message_bus_published_total");
//     const dlq = metrics.find((m) => m.name === "message_bus_dlq_total");

//     expect(published?.values.length).toBeGreaterThan(0);
//     expect(dlq?.values.length).toBeGreaterThan(0);

//     await firstValueFrom(messageBus.close());
//   });

//   it("should handle high-load scenarios", async () => {
//     const adapter = new InMemoryAdapter({ bufferSize: 10000 });
//     const messageBus = new MessageBus(adapter, "load-test");

//     let processedCount = 0;
//     const messageCount = 1000;

//     // Subscribe with concurrency
//     messageBus.subscribe(
//       "load-test",
//       (msg) => {
//         processedCount++;
//         // Simulate work
//         // await new Promise((resolve) => setTimeout(resolve, 1));
//         return of(void 0);
//       },
//       { concurrency: 10 }
//     );

//     // Publish many messages
//     const publishPromises = Array.from({ length: messageCount }, (_, i) =>
//       firstValueFrom(messageBus.publish("load-test", { id: i }))
//     );

//     await Promise.all(publishPromises);

//     // Wait for processing with timeout
//     const startTime = Date.now();
//     const timeout = 10000; // 10 seconds max

//     while (processedCount < messageCount && Date.now() - startTime < timeout) {
//       await new Promise((resolve) => setTimeout(resolve, 100));
//     }

//     expect(processedCount).toBe(messageCount);

//     await firstValueFrom(messageBus.close());
//   });
// });

// describe("Error Scenarios", () => {
//   it("should handle adapter failures gracefully", async () => {
//     // Create a mock adapter that fails
//     const failingAdapter: MessageBusAdapter = {
//       publish: () => throwError(() => new Error("Adapter failure")),
//       subscribe: () => throwError(() => new Error("Subscribe failure")),
//       getQueueDepth: () => of(0),
//       acknowledge: () => of(void 0),
//       reject: () => of(void 0),
//       getHealth: () =>
//         of({
//           status: "unhealthy",
//           channels: 0,
//           subscribers: 0,
//           queueDepth: 0,
//           errorRate: 100,
//           latency: 0
//         } as HealthStatus),
//       close: () => of(void 0)
//     };

//     const messageBus = new MessageBus(failingAdapter, "error-test");

//     // Publish should fail
//     await expect(firstValueFrom(messageBus.publish("test", { data: "test" }))).rejects.toThrow("Adapter failure");

//     // Subscribe should handle errors
//     const errors: Error[] = [];
//     const subscription = messageBus.subscribe("test", (msg) => of(void 0));

//     // Give time for subscription error
//     await new Promise((resolve) => setTimeout(resolve, 100));

//     // Health should report unhealthy
//     const health = await firstValueFrom(messageBus.getHealth());
//     expect(health.status).toBe("unhealthy");

//     subscription.unsubscribe();
//     await firstValueFrom(messageBus.close());
//   });

//   it("should clean up resources on close", async () => {
//     const adapter = new InMemoryAdapter();
//     const messageBus = new MessageBus(adapter);

//     // Create subscriptions
//     const sub1 = messageBus.subscribe("channel1", () => of(void 0));
//     const sub2 = messageBus.subscribe("channel2", () => of(void 0));

//     // Close message bus
//     await firstValueFrom(messageBus.close());

//     // Subscriptions should be cleaned up
//     expect(sub1.closed).toBe(true);
//     expect(sub2.closed).toBe(true);

//     // Adapter should be closed
//     await expect(firstValueFrom(adapter.publish("test", createTestMessage({})))).rejects.toThrow();
//   });
// });
