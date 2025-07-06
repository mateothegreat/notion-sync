# Control Plane

A centralized API control plane that serves as the primary communication and coordination mechanism for the Notion Sync application. This implementation eliminates EventEmitter daisy-chaining while providing scalable, fault-tolerant, and maintainable architecture for component communication.

## Features

- **Centralized Message Routing**: Type-safe message routing with RxJS-based channels
- **State Management**: Both mutable and immutable state containers with change notifications
- **Component Factory**: Dependency injection and lifecycle management for components
- **Circuit Breaker**: Fault tolerance with automatic failure detection and recovery
- **Middleware Pipeline**: Extensible message processing with middleware support
- **Plugin System**: Modular architecture with plugin-based extensibility
- **Hook System**: Lifecycle hooks for custom behavior injection
- **Zero Dependencies**: Runs locally without external message brokers
- **TypeScript First**: Full type safety with strict mode support

## Quick Start

```typescript
import {
  createControlPlane,
  BrokerBus
} from "@mateothegreat/notion-sync/control-plane";

// Basic usage following the pseudo-code pattern
const bus = new BrokerBus();

type UserEvent =
  | { type: "user-created"; id: number }
  | { type: "user-deleted"; id: number };

const channel = bus.channel<UserEvent>("user-events");

await channel.subscribe((event) => {
  if (event.type === "user-created") {
    console.log("User created", event.id);
  } else if (event.type === "user-deleted") {
    console.log("User deleted", event.id);
  }
});

channel.next({ type: "user-created", id: 1 });
```

## Core Components

### 1. Message Bus

The message bus provides centralized message routing with support for both RxJS Subjects and promise-based channels.

```typescript
import { createControlPlane } from "@mateothegreat/notion-sync/control-plane";

const controlPlane = createControlPlane();
await controlPlane.start();

// Create a typed channel
const channel = controlPlane.channel<string>("notifications");

// Subscribe to messages
const subscription = channel.subscribe((message) => {
  console.log("Received:", message);
});

// Publish messages
await channel.publish("Hello, World!");

subscription.unsubscribe();
```

### 2. State Management

Supports both mutable (performance-focused) and immutable (predictability-focused) state management.

```typescript
// Mutable state for performance-critical scenarios
const counterState = controlPlane.registerMutableState("counter", {
  value: 0
});

// Immutable state with structural sharing
const userListState = controlPlane.registerImmutableState("users", {
  users: [] as Array<{ id: number; name: string }>
});

// Subscribe to changes
counterState.subscribe((state) => {
  console.log("Counter:", state.value);
});

// Update state using Immer
counterState.update((draft) => {
  draft.value += 1;
});

userListState.update((draft) => {
  draft.users.push({ id: 1, name: "Alice" });
});
```

### 3. Component Factory

Manages component lifecycle with dependency injection.

```typescript
// Define a component
class ApiClient {
  id = "api-client";
  name = "ApiClient";
  state = "created";

  constructor(private apiKey: string) {}

  async initialize() {
    this.state = "initialized";
  }

  async start() {
    this.state = "started";
  }

  async stop() {
    this.state = "stopped";
  }
}

// Register component factory
controlPlane.registerComponent({
  name: "ApiClient",
  singleton: true,
  factory: (apiKey: string) => new ApiClient(apiKey)
});

// Create and manage component
const client = await controlPlane.createComponent("ApiClient", "secret-key");
await controlPlane.startComponent(client.id);
```

### 4. Circuit Breaker

Provides fault tolerance with automatic failure detection and recovery.

```typescript
// Get circuit breaker for API calls
const apiBreaker = controlPlane.getCircuitBreaker("external-api", {
  failureThreshold: 3,
  resetTimeout: 5000,
  monitoringPeriod: 10000
});

// Protected operation
async function makeApiCall() {
  return apiBreaker.execute(async () => {
    // Your API call here
    return fetch("/api/data");
  });
}

// Monitor circuit breaker state
apiBreaker.onStateChange().subscribe((state) => {
  console.log("Circuit breaker state:", state);
});
```

### 5. Middleware

Extensible middleware pipeline for message processing.

```typescript
// Add logging middleware
controlPlane.use(async (message, next) => {
  console.log(`Processing: ${message.type}`);
  const startTime = Date.now();

  await next();

  const duration = Date.now() - startTime;
  console.log(`Completed: ${message.type} in ${duration}ms`);
});

// Add validation middleware
controlPlane.use(async (message, next) => {
  if (!message.payload) {
    throw new Error("Payload required");
  }
  await next();
});
```

### 6. Plugin System

Modular architecture with plugin-based extensibility.

```typescript
const customPlugin = {
  name: "metrics-collector",
  version: "1.0.0",

  async install(context) {
    // Add metrics collection
    context.messageBus.use(async (message, next) => {
      const startTime = Date.now();
      await next();
      const duration = Date.now() - startTime;
      console.log(`Metric: ${message.type} - ${duration}ms`);
    });
  },

  async uninstall(context) {
    // Cleanup
  }
};

controlPlane.registerPlugin(customPlugin);
await controlPlane.installPlugin("metrics-collector");
```

### 7. Hook System

Lifecycle hooks for custom behavior injection.

```typescript
// Register hooks for different events
controlPlane.registerHook("before-message", async (context) => {
  console.log("Before processing:", context);
});

controlPlane.registerHook("after-message", async (context) => {
  console.log("After processing:", context);
});

controlPlane.registerHook("error", async (context) => {
  console.error("Error occurred:", context.error);
});
```

## Advanced Usage

### Service with Dependency Injection

```typescript
class UserService {
  constructor(private channel: Subject<{ id: number; name: string }>) {
    this.channel.subscribe((message) => {
      console.log("UserService received:", message);
    });
  }

  update() {
    this.channel.next({ id: 1, name: "Peter" });
  }
}

// Register as component
controlPlane.registerComponent({
  name: "UserService",
  factory: () => {
    const channel = controlPlane.brokerChannel("user-updates");
    return new UserService(channel);
  }
});
```

### State Selectors

```typescript
import { createSelector } from "@mateothegreat/notion-sync/control-plane";

const userState = controlPlane.registerImmutableState("users", {
  users: [],
  loading: false
});

// Create derived state selector
const userCountSelector = createSelector(
  userState,
  (state) => state.users.length
);

userCountSelector.subscribe((count) => {
  console.log("User count:", count);
});
```

### Error Handling

```typescript
// Global error handling
controlPlane.registerHook("error", async (context) => {
  const { error, operation } = context;

  // Log error
  console.error(`Error in ${operation}:`, error);

  // Send to error tracking service
  await errorTracker.report(error, { operation });

  // Update error state
  const errorState = controlPlane.getState("errors");
  errorState?.update((draft) => {
    draft.errors.push({
      error: error.message,
      operation,
      timestamp: Date.now()
    });
  });
});
```

## Integration with Notion Sync

### Replacing EventEmitter

```typescript
// Before: EventEmitter daisy-chaining
class OldExportManager extends EventEmitter {
  async export() {
    this.emit("progress", { processed: 0, total: 100 });
    // ... export logic
    this.emit("complete", { success: true });
  }
}

// After: Control Plane channels
class NewExportManager {
  private progressChannel: Subject<{ processed: number; total: number }>;

  constructor(private controlPlane: ControlPlane) {
    this.progressChannel = controlPlane.brokerChannel("export-progress");
  }

  async export() {
    this.progressChannel.next({ processed: 0, total: 100 });
    // ... export logic
    this.progressChannel.next({ processed: 100, total: 100 });
  }

  onProgress(handler: (progress: any) => void) {
    return this.progressChannel.subscribe(handler);
  }
}
```

### Circuit Breaker for Notion API

```typescript
// Protect Notion API calls
const notionBreaker = controlPlane.getCircuitBreaker("notion-api", {
  failureThreshold: 5,
  resetTimeout: 30000,
  expectedErrors: ["rate_limited", "timeout"]
});

async function fetchNotionPage(pageId: string) {
  return notionBreaker.execute(async () => {
    return notion.pages.retrieve({ page_id: pageId });
  });
}
```

### State Management for Export Progress

```typescript
// Export configuration state
const exportConfig = controlPlane.registerImmutableState("export-config", {
  outputPath: "",
  format: "json",
  databases: [] as string[]
});

// Real-time progress state
const exportProgress = controlPlane.registerMutableState("export-progress", {
  isRunning: false,
  processed: 0,
  total: 0,
  currentOperation: ""
});

// Update progress efficiently
exportProgress.update((draft) => {
  draft.processed += 1;
  draft.currentOperation = "processing-pages";
});
```

## Performance

The control plane is designed to meet the following performance requirements:

- **Throughput**: 10,000+ messages per second
- **Latency**: p99 < 10ms, p50 < 1ms
- **Memory**: < 100MB baseline usage
- **Scalability**: Linear scaling up to 10 nodes

### Benchmarks

```typescript
// Message throughput test
const messageCount = 10000;
const startTime = Date.now();

for (let i = 0; i < messageCount; i++) {
  await controlPlane.publish("perf-test", { id: i });
}

const duration = Date.now() - startTime;
const throughput = messageCount / (duration / 1000);
console.log(`Throughput: ${throughput} messages/second`);
```

## Testing

The control plane includes comprehensive test coverage:

```bash
npm test                    # Run all tests
npm run test:coverage      # Run with coverage report
npm run test:watch         # Watch mode for development
```

### Test Structure

- **Unit Tests**: Individual component testing
- **Integration Tests**: Component interaction testing
- **Performance Tests**: Throughput and latency validation
- **Error Handling Tests**: Fault tolerance validation

## Migration Guide

### From EventEmitter

1. **Identify EventEmitter usage**:

   ```bash
   grep -r "EventEmitter\|\.emit\|\.on(" src/
   ```

2. **Replace with channels**:

   ```typescript
   // Before
   this.emit("progress", data);

   // After
   this.progressChannel.next(data);
   ```

3. **Update subscribers**:

   ```typescript
   // Before
   emitter.on("progress", handler);

   // After
   channel.subscribe(handler);
   ```

### Gradual Migration

Use the compatibility layer for gradual migration:

```typescript
import { EventEmitterMigrationHelper } from "./examples/notion-sync-integration";

const migrationHelper = new EventEmitterMigrationHelper(controlPlane);

// Create backward-compatible interface
const compatEmitter =
  migrationHelper.createCompatibilityLayer("legacy-events");

// Use like EventEmitter
compatEmitter.emit("event", data);
compatEmitter.on("event", handler);
```

## Configuration

### Control Plane Options

```typescript
const controlPlane = createControlPlane({
  adapter: new InMemoryAdapter(), // Message bus adapter
  enableLogging: true, // Built-in logging plugin
  enableMetrics: true, // Built-in metrics plugin
  enableHealthCheck: true, // Built-in health check plugin
  autoStartComponents: true // Auto-start registered components
});
```

### Circuit Breaker Configuration

```typescript
const breakerConfig = {
  failureThreshold: 5, // Failures before opening
  resetTimeout: 30000, // Time before retry (ms)
  monitoringPeriod: 60000, // Monitoring window (ms)
  expectedErrors: [
    // Errors that don't count as failures
    "ValidationError",
    "rate_limited"
  ]
};
```

## API Reference

### ControlPlane

- `initialize()`: Initialize the control plane
- `start()`: Start the control plane
- `stop()`: Stop the control plane
- `destroy()`: Destroy and cleanup resources
- `channel<T>(name)`: Create typed channel
- `brokerChannel<T>(name)`: Create RxJS Subject channel
- `publish<T>(channel, payload)`: Publish message
- `subscribe<T>(channel, handler)`: Subscribe to messages
- `registerMutableState<T>(key, initial)`: Register mutable state
- `registerImmutableState<T>(key, initial)`: Register immutable state
- `registerComponent(config)`: Register component factory
- `getCircuitBreaker(name, config)`: Get/create circuit breaker
- `use(middleware)`: Add middleware
- `registerPlugin(plugin)`: Register plugin
- `registerHook(type, fn)`: Register hook

### BrokerBus

- `channel<T>(name)`: Create RxJS Subject channel
- `use(middleware)`: Add middleware
- `close()`: Close the bus

### StateContainer

- `get()`: Get current value
- `set(value)`: Set new value
- `update(updater)`: Update using Immer
- `subscribe(observer)`: Subscribe to changes
- `onChange()`: Observable of state changes

### CircuitBreaker

- `execute<T>(operation)`: Execute protected operation
- `canProceed()`: Check if requests are allowed
- `getState()`: Get current state
- `getStats()`: Get statistics
- `reset()`: Manually reset
- `open()`: Manually open

## Examples

See the [examples directory](./examples/) for complete usage examples:

- [Basic Usage](./examples/basic-usage.ts)
- [Notion Sync Integration](./examples/notion-sync-integration.ts)

## Contributing

1. Follow TypeScript strict mode
2. Maintain 100% test coverage
3. Use semantic versioning
4. Document all public APIs
5. Include performance benchmarks

## License

ISC License - see package.json for details.
