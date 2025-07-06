/**
 * Basic Usage Examples for the Control Plane
 */

import { createControlPlane, BrokerBus } from "../index";
import { Subject } from "rxjs";

// Example 1: Basic Message Bus Usage (following the pseudo-code pattern)
export async function basicMessageBusExample() {
  console.log("=== Basic Message Bus Example ===");

  const bus = new BrokerBus();

  // Define event types
  type UserEvent = { type: "user-created"; id: number } | { type: "user-deleted"; id: number };

  const channel = bus.channel<UserEvent>("user-events");

  // Subscribe to events
  channel.subscribe((event) => {
    if (event.type === "user-created") {
      console.log("User created", event.id);
    } else if (event.type === "user-deleted") {
      console.log("User deleted", event.id);
    }
  });

  // Publish events
  channel.next({ type: "user-created", id: 1 });
  channel.next({ type: "user-deleted", id: 2 });

  await bus.close();
}

// Example 2: Service with Channel Dependency Injection Pattern
export class UserService {
  constructor(private channel: Subject<{ id: number; name: string }>) {
    this.channel.subscribe((message) => {
      console.log("UserService received message", message);
    });
  }

  update() {
    this.channel.next({ id: 1, name: "Peter" });
  }
}

// Example 3: Control Plane with State Management
export async function stateManagementExample() {
  console.log("=== State Management Example ===");

  const controlPlane = createControlPlane();
  await controlPlane.start();

  // Register mutable state for performance-critical data
  const counterState = controlPlane.registerMutableState("counter", { value: 0 });

  // Register immutable state for predictable updates
  const userListState = controlPlane.registerImmutableState("users", {
    users: [] as Array<{ id: number; name: string }>
  });

  // Subscribe to state changes
  counterState.subscribe((state) => {
    console.log("Counter updated:", state.value);
  });

  userListState.subscribe((state) => {
    console.log("User list updated:", state.users.length, "users");
  });

  // Update states
  counterState.update((draft) => {
    draft.value += 1;
  });

  userListState.update((draft) => {
    draft.users.push({ id: 1, name: "Alice" });
    draft.users.push({ id: 2, name: "Bob" });
  });

  // Create snapshot
  const snapshot = controlPlane.createSnapshot();
  console.log("Snapshot created:", snapshot);

  await controlPlane.destroy();
}

// Example 4: Component Factory Pattern
export async function componentFactoryExample() {
  console.log("=== Component Factory Example ===");

  const controlPlane = createControlPlane();
  await controlPlane.start();

  // Define a component
  class NotionApiClient {
    id = "notion-api-client";
    name = "NotionApiClient";
    state: any = "created";

    constructor(private apiKey: string) {}

    async initialize() {
      console.log("Initializing Notion API client...");
      this.state = "initialized";
    }

    async start() {
      console.log("Starting Notion API client...");
      this.state = "started";
    }

    async stop() {
      console.log("Stopping Notion API client...");
      this.state = "stopped";
    }

    async fetchPage(pageId: string) {
      console.log(`Fetching page ${pageId}`);
      return { id: pageId, title: "Sample Page" };
    }
  }

  // Register component factory
  controlPlane.registerComponent({
    name: "NotionApiClient",
    singleton: true,
    factory: (apiKey: string) => new NotionApiClient(apiKey)
  });

  // Create and manage component
  const apiClient = await controlPlane.createComponent("NotionApiClient", "secret-api-key");
  await controlPlane.startComponent(apiClient.id);

  console.log("Component status:", apiClient.state);

  await controlPlane.destroy();
}

// Example 5: Circuit Breaker Protection
export async function circuitBreakerExample() {
  console.log("=== Circuit Breaker Example ===");

  const controlPlane = createControlPlane();
  await controlPlane.start();

  // Get circuit breaker for API calls
  const apiBreaker = controlPlane.getCircuitBreaker("notion-api", {
    failureThreshold: 3,
    resetTimeout: 5000,
    monitoringPeriod: 10000
  });

  // Simulate API calls with circuit breaker protection
  async function makeApiCall(shouldFail: boolean = false) {
    return apiBreaker.execute(async () => {
      if (shouldFail) {
        throw new Error("API call failed");
      }
      return { data: "success" };
    });
  }

  try {
    // Successful calls
    console.log("Result 1:", await makeApiCall(false));
    console.log("Result 2:", await makeApiCall(false));

    // Simulate failures to open circuit
    for (let i = 0; i < 3; i++) {
      try {
        await makeApiCall(true);
      } catch (error) {
        console.log(`Failure ${i + 1}:`, (error as Error).message);
      }
    }

    // Circuit should be open now
    try {
      await makeApiCall(false);
    } catch (error) {
      console.log("Circuit breaker blocked call:", (error as Error).message);
    }

    // Check circuit breaker stats
    const stats = controlPlane.getCircuitBreakerStats();
    console.log("Circuit breaker stats:", stats["notion-api"]);
  } catch (error) {
    console.error("Error:", error);
  }

  await controlPlane.destroy();
}

// Example 6: Middleware Pipeline
export async function middlewareExample() {
  console.log("=== Middleware Example ===");

  const controlPlane = createControlPlane();

  // Add logging middleware
  controlPlane.use(async (message, next) => {
    console.log(`[LOG] Processing message: ${message.type}`);
    const startTime = Date.now();

    await next();

    const duration = Date.now() - startTime;
    console.log(`[LOG] Completed message: ${message.type} in ${duration}ms`);
  });

  // Add validation middleware
  controlPlane.use(async (message, next) => {
    if (!message.payload) {
      throw new Error("Message payload is required");
    }
    await next();
  });

  await controlPlane.start();

  // Subscribe to messages
  await controlPlane.subscribe("test-topic", (message) => {
    console.log("Handler received:", message.payload);
  });

  // Send messages through middleware pipeline
  await controlPlane.publish("test-topic", { data: "valid message" });

  try {
    await controlPlane.publish("test-topic", null); // Should fail validation
  } catch (error) {
    console.log("Validation error:", (error as Error).message);
  }

  await controlPlane.destroy();
}

// Example 7: Plugin System
export async function pluginExample() {
  console.log("=== Plugin Example ===");

  const controlPlane = createControlPlane();

  // Create a custom plugin
  const metricsPlugin = {
    name: "custom-metrics",
    version: "1.0.0",
    install: async (context: any) => {
      console.log("Installing custom metrics plugin...");

      // Add metrics collection middleware
      context.messageBus.use(async (message: any, next: any) => {
        const startTime = Date.now();
        await next();
        const duration = Date.now() - startTime;
        console.log(`Metric: ${message.type} processed in ${duration}ms`);
      });
    },
    uninstall: async (context: any) => {
      console.log("Uninstalling custom metrics plugin...");
    }
  };

  // Register and install plugin
  controlPlane.registerPlugin(metricsPlugin);

  await controlPlane.start();
  await controlPlane.installPlugin("custom-metrics");

  // Test plugin functionality
  await controlPlane.subscribe("metric-test", () => {
    console.log("Message processed");
  });

  await controlPlane.publish("metric-test", "test data");

  console.log("Installed plugins:", controlPlane.getInstalledPlugins());

  await controlPlane.destroy();
}

// Example 8: Hooks System
export async function hooksExample() {
  console.log("=== Hooks Example ===");

  const controlPlane = createControlPlane();

  // Register hooks for different lifecycle events
  controlPlane.registerHook("before-message", async (context) => {
    console.log("Before message hook:", context);
  });

  controlPlane.registerHook("after-message", async (context) => {
    console.log("After message hook:", context);
  });

  controlPlane.registerHook("error", async (context) => {
    console.log("Error hook:", context.error?.message);
  });

  await controlPlane.start();

  // Hooks will be executed during message processing
  await controlPlane.publish("hook-test", "test data");

  await controlPlane.destroy();
}

// Run all examples
export async function runAllExamples() {
  console.log("Running Control Plane Examples...\n");

  try {
    await basicMessageBusExample();
    console.log("\n");

    await stateManagementExample();
    console.log("\n");

    await componentFactoryExample();
    console.log("\n");

    await circuitBreakerExample();
    console.log("\n");

    await middlewareExample();
    console.log("\n");

    await pluginExample();
    console.log("\n");

    await hooksExample();
    console.log("\n");

    console.log("All examples completed successfully!");
  } catch (error) {
    console.error("Example failed:", error);
  }
}

// Export for use in other files
export { UserService };
