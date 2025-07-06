/**
 * Simple test to verify control plane functionality
 */

import { createControlPlane, BrokerBus } from "../index";

async function simpleTest() {
  console.log("Testing basic control plane functionality...");

  // Test 1: Basic BrokerBus
  console.log("\n1. Testing BrokerBus...");
  const bus = new BrokerBus();

  type UserEvent = { type: "user-created"; id: number } | { type: "user-deleted"; id: number };
  const channel = bus.channel<UserEvent>("user-events");

  const events: UserEvent[] = [];
  channel.subscribe((event) => {
    events.push(event);
    console.log("Received event:", event);
  });

  channel.next({ type: "user-created", id: 1 });
  channel.next({ type: "user-deleted", id: 2 });

  // Allow async operations to complete
  await new Promise((resolve) => setTimeout(resolve, 100));

  console.log("Events received:", events.length);
  await bus.close();

  // Test 2: Control Plane
  console.log("\n2. Testing Control Plane...");
  const controlPlane = createControlPlane();
  await controlPlane.start();

  // Test state management
  const counterState = controlPlane.registerMutableState("counter", { value: 0 });
  counterState.update((draft) => {
    draft.value = 42;
  });

  console.log("Counter value:", counterState.get().value);

  // Test circuit breaker
  const breaker = controlPlane.getCircuitBreaker("test-breaker", {
    failureThreshold: 2,
    resetTimeout: 1000,
    monitoringPeriod: 5000
  });

  const result = await breaker.execute(() => Promise.resolve("success"));
  console.log("Circuit breaker result:", result);

  await controlPlane.destroy();
  console.log("\nAll tests completed successfully!");
}

// Run the test
simpleTest().catch(console.error);
