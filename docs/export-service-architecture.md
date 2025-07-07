# Export Service Architecture

## Overview

The Export Service follows a Domain-Driven Design (DDD) approach with an event-driven architecture. It manages the lifecycle of exports while maintaining clean separation of concerns between domain logic, application services, and infrastructure.

## Architecture Components

### Domain Layer

#### Export Entity

- **Location**: `src/core/domain/export.ts`
- **Purpose**: Core business entity representing an export operation
- **Key Features**:
  - State management (PENDING, RUNNING, COMPLETED, FAILED, CANCELLED)
  - Progress tracking
  - Configuration validation
  - Error collection

#### Export Repository Interface

- **Location**: `src/core/domain/export.ts`
- **Purpose**: Abstract interface for persisting export entities
- **Implementations**:
  - `InMemoryExportRepository`: Simple in-memory storage
  - `EventSourcedExportRepository`: Event-sourced storage using EventStore

### Application Layer

#### ExportService

- **Location**: `src/lib/export/export-service.ts`
- **Purpose**: Orchestrates export operations and manages state transitions
- **Key Methods**:
  - `createExport()`: Creates new export with validation
  - `startExport()`: Transitions export to RUNNING state
  - `executeExport()`: Delegates to WorkspaceExporter for execution
  - `completeExport()`: Marks export as completed
  - `failExport()`: Handles export failures
  - `cancelExport()`: Cancels running exports

#### WorkspaceExporter

- **Location**: `src/lib/export/workspace-exporter.ts`
- **Purpose**: Executes the actual export operations
- **Key Features**:
  - Directory structure creation
  - Workspace metadata export
  - Progress event emission
  - Error collection and handling
  - OperationEventEmitter compatibility

### Infrastructure Layer

#### NotionClient

- **Location**: `src/infrastructure/notion/notion-client.ts`
- **Purpose**: Handles Notion API interactions

#### FileSystemManager

- **Location**: `src/infrastructure/filesystem/file-system-manager.ts`
- **Purpose**: Manages file writing and directory operations

#### Export Repositories

- **Location**: `src/infrastructure/repositories/export-repository.ts`
- **Purpose**: Concrete implementations of the repository interface

### Event System

#### Domain Events

- **Location**: `src/core/events/index.ts`
- **Event Types**:
  - `export.started`: Export operation initiated
  - `export.progress.updated`: Progress update
  - `export.completed`: Export finished successfully
  - `export.failed`: Export encountered fatal error
  - `export.cancelled`: Export cancelled by user

#### Event Flow

```
User Request → ExportService → Domain Event → Event Store
                    ↓
              WorkspaceExporter
                    ↓
          Progress/File System Events
```

## Migration from Previous Implementation

### Key Changes

1. **Separation of Concerns**

   - Domain logic isolated in Export entity
   - Service layer handles orchestration
   - Infrastructure handles external integrations
2. **Event-Driven Architecture**

   - All state changes emit domain events
   - Events can be persisted for audit/replay
   - Loose coupling between components
3. **Progress Tracking**

   - Centralized ProgressService
   - Section-based progress tracking
   - ETA calculation and statistics
4. **Error Handling**

   - Structured error types
   - Error collection and reporting
   - Graceful failure handling

### Preserved Features

1. **Directory Structure Creation**

   - Creates organized output directories
   - Emits FileSystem events
2. **Workspace Metadata Export**

   - Exports user and workspace information
   - Compatible with existing format
3. **OperationEventEmitter**

   - Maintains compatibility for progress tracking
   - Debug event emission

## Usage Example

```typescript
// Create services
const eventStore = new EventStore();
const exportRepository = new InMemoryExportRepository(eventStore);
const progressService = new ProgressService(eventPublisher);
const exportService = new ExportService(
  exportRepository,
  eventPublisher,
  progressService
);

// Create and start export
const configuration: ExportConfiguration = {
  outputPath: "/path/to/output",
  format: ExportFormat.JSON,
  databases: ["db-id-1", "db-id-2"],
  pages: ["page-id-1"],
  includeBlocks: true,
  includeComments: false,
  includeProperties: true
};

const export_ = await exportService.createExport(configuration);
await exportService.startExport(export_.id);

// Execute export
const exporterConfig = new ExporterConfig({
  token: process.env.NOTION_TOKEN,
  output: configuration.outputPath,
  // ... other config
});

const result = await exportService.executeExport(export_.id, exporterConfig);
console.log(`Export completed: ${result.pagesCount} pages, ${result.databasesCount} databases`);
```

## Testing Strategy

### Unit Tests

- Domain entities tested in isolation
- Service methods tested with mocks
- Repository implementations tested separately

### Integration Tests

- End-to-end export flow
- Event emission verification
- File system operations

### Test Coverage

- All public methods have tests
- Error scenarios covered
- Event emission verified

## Future Enhancements

1. **Resume Capability**

   - Persist export state for resumption
   - Handle partial exports
2. **Parallel Processing**

   - Export databases/pages concurrently
   - Configurable concurrency limits
3. **Export Formats**

   - Support additional formats (HTML, CSV)
   - Format-specific optimizations
4. **Monitoring**

   - Metrics collection
   - Performance tracking
   - Alert integration
