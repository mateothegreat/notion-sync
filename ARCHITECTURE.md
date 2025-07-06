# Notion Sync - Event-Driven Architecture Documentation

## Overview

Notion Sync is designed as an event-driven system for exporting entire Notion workspaces at scale efficiently and stable. The architecture follows Domain-Driven Design (DDD) principles with event sourcing and CQRS patterns to ensure scalability, reliability, and maintainability.

## Architecture Diagram

```mermaid
graph TB
    subgraph "Presentation Layer"
        CLI[CLI Commands]
        API[REST API - Future]
    end

    subgraph "Application Layer"
        CMD[Command Handlers]
        QRY[Query Handlers]
        COORD[Export Coordinator]
    end

    subgraph "Domain Layer"
        AGG[Aggregates]
        DOM_SVC[Domain Services]
        DOM_EVT[Domain Events]
        
        subgraph "Export Aggregate"
            EXPORT[Export Entity]
            EXPORT_SVC[Export Service]
        end
        
        subgraph "Progress Aggregate"
            PROGRESS[Progress Entity]
            PROGRESS_SVC[Progress Service]
        end
    end

    subgraph "Infrastructure Layer"
        NOTION[Notion Client]
        FS[File System]
        REPO[Repositories]
        EVT_STORE[Event Store]
    end

    subgraph "Control Plane"
        MSG_BUS[Message Bus]
        CB[Circuit Breakers]
        RL[Rate Limiters]
        MW[Middleware Pipeline]
        STATE[State Registry]
        COMP[Component Factory]
    end

    subgraph "Cross-Cutting Concerns"
        LOG[Logging]
        METRICS[Metrics]
        CONFIG[Configuration]
        ERROR[Error Handling]
    end

    CLI --> CMD
    CLI --> QRY
    CMD --> COORD
    COORD --> EXPORT_SVC
    COORD --> PROGRESS_SVC
    
    EXPORT_SVC --> DOM_EVT
    PROGRESS_SVC --> DOM_EVT
    
    DOM_EVT --> MSG_BUS
    MSG_BUS --> EVT_STORE
    
    EXPORT_SVC --> REPO
    PROGRESS_SVC --> REPO
    
    COORD --> NOTION
    COORD --> FS
    
    NOTION --> CB
    NOTION --> RL
    
    MSG_BUS --> MW
    MW --> LOG
    MW --> METRICS
    
    STATE --> COMP
```

## Component Dependencies

### Core Domain Components

#### 1. Export Aggregate
- **Location**: `/src/core/domain/export.ts`
- **Dependencies**: 
  - IN: ExportConfiguration, ProgressInfo, ErrorInfo
  - OUT: Domain Events (ExportStarted, ExportCompleted, etc.)
- **Responsibilities**: 
  - Export lifecycle management
  - Business rule enforcement
  - State transitions

#### 2. Export Service
- **Location**: `/src/core/services/export-service.ts`
- **Dependencies**:
  - IN: ExportRepository, EventPublisher
  - OUT: Export entities, Domain events
- **Responsibilities**:
  - Export orchestration
  - Conflict detection
  - Progress coordination

#### 3. Progress Service
- **Location**: `/src/core/services/progress-service.ts`
- **Dependencies**:
  - IN: EventPublisher
  - OUT: Progress events
- **Responsibilities**:
  - Progress tracking
  - ETA calculation
  - Section management

### Infrastructure Components

#### 4. Notion Client
- **Location**: `/src/infrastructure/notion/notion-client.ts`
- **Dependencies**:
  - IN: NotionConfig, EventPublisher, CircuitBreaker
  - OUT: NotionPage, NotionDatabase, NotionBlock, API events
- **Responsibilities**:
  - Notion API integration
  - Rate limit handling
  - Error transformation

#### 5. Control Plane
- **Location**: `/src/lib/control-plane/`
- **Dependencies**:
  - IN: Configuration, Plugins, Middleware
  - OUT: Message routing, Component lifecycle
- **Responsibilities**:
  - Event routing
  - Component orchestration
  - Cross-cutting concerns

### Event Flow

```mermaid
sequenceDiagram
    participant CLI
    participant ExportService
    participant MessageBus
    participant NotionClient
    participant ProgressService
    participant FileSystem

    CLI->>ExportService: createExport(config)
    ExportService->>MessageBus: publish(ExportStarted)
    
    CLI->>ExportService: startExport(id)
    ExportService->>MessageBus: publish(ExportProgressUpdated)
    
    loop For each database/page
        ExportService->>NotionClient: getDatabase/Page(id)
        NotionClient->>MessageBus: publish(NotionObjectFetched)
        NotionClient-->>ExportService: return data
        ExportService->>FileSystem: writeToOutput(data)
        ExportService->>ProgressService: updateProgress()
        ProgressService->>MessageBus: publish(ProgressUpdated)
    end
    
    ExportService->>MessageBus: publish(ExportCompleted)
```

## Current State Analysis

### ✅ Implemented Components

1. **Domain Layer**
   - Export aggregate with proper state management
   - Domain events with factory methods
   - Export and Progress services

2. **Control Plane**
   - Message bus with RxJS and Promise-based channels
   - Circuit breaker implementation
   - Middleware pipeline
   - Plugin system
   - State registry

3. **Infrastructure**
   - Notion API client with error handling
   - Basic file operations
   - Rate limiting and concurrency management

4. **CLI Interface**
   - Export command with event-driven integration
   - Progress monitoring
   - Error handling

### ❌ Missing/Incomplete Components

1. **Persistence Layer**
   - No persistent event store
   - Only in-memory repositories
   - No checkpoint persistence for large exports

2. **File System Operations**
   - Incomplete export format implementations
   - No structured file organization
   - Missing resume capability for file operations

3. **Error Recovery**
   - No dead letter queue
   - Limited retry mechanisms
   - No compensation actions

4. **Monitoring & Observability**
   - Basic logging only
   - No metrics collection
   - No health checks
   - No distributed tracing

5. **Testing Infrastructure**
   - Limited unit tests
   - No integration tests
   - No performance tests

### 🔄 Architectural Issues

1. **Mixed Patterns**
   - Old streaming export manager alongside new event-driven architecture
   - Direct dependencies in some components
   - Inconsistent error handling patterns

2. **Scalability Concerns**
   - In-memory state management
   - No horizontal scaling support
   - Limited concurrency control

3. **Production Readiness**
   - No environment-specific configuration
   - Missing deployment artifacts
   - No monitoring integration

## Event Catalog

### Export Events
- `export.started` - Export process initiated
- `export.progress.updated` - Progress information updated
- `export.completed` - Export finished successfully
- `export.failed` - Export failed with error
- `export.cancelled` - Export cancelled by user

### Notion API Events
- `notion.object.fetched` - Object retrieved from API
- `notion.rate_limit.hit` - Rate limit encountered
- `notion.api.error` - API error occurred

### Progress Events
- `progress.section.started` - New section processing started
- `progress.section.completed` - Section processing completed
- `progress.item.processed` - Individual item processed

### File System Events
- `file.created` - File written to disk
- `file.updated` - File modified
- `directory.created` - Directory created

### Performance Events
- `performance.metric` - Performance metric recorded
- `concurrency.adjusted` - Concurrency limits adjusted

### Circuit Breaker Events
- `circuit_breaker.opened` - Circuit breaker opened
- `circuit_breaker.closed` - Circuit breaker closed
- `circuit_breaker.half_open` - Circuit breaker in half-open state

## Data Flow

### Export Process Flow
1. **Initialization**: CLI creates export configuration
2. **Validation**: Export service validates configuration
3. **Planning**: System estimates total work and creates execution plan
4. **Execution**: Parallel processing of databases and pages
5. **Monitoring**: Continuous progress tracking and error handling
6. **Completion**: Final aggregation and cleanup

### Error Handling Flow
1. **Detection**: Errors caught at component boundaries
2. **Classification**: Errors categorized (retryable, fatal, etc.)
3. **Recovery**: Automatic retry with exponential backoff
4. **Escalation**: Circuit breaker activation for repeated failures
5. **Reporting**: Error events published for monitoring

### State Management Flow
1. **Event Generation**: Domain operations generate events
2. **Event Publishing**: Events published to message bus
3. **Event Processing**: Event handlers update read models
4. **State Persistence**: State changes persisted to storage
5. **State Recovery**: System can rebuild state from events

## Performance Characteristics

### Current Limitations
- **Memory Usage**: Unbounded for large workspaces
- **Concurrency**: Limited by in-memory state management
- **Throughput**: Constrained by Notion API rate limits
- **Reliability**: No persistent state for recovery

### Target Performance
- **Memory**: Bounded usage regardless of workspace size
- **Concurrency**: Configurable per operation type
- **Throughput**: Maximum sustainable rate within API limits
- **Reliability**: 99.9% success rate with automatic recovery

## Security Considerations

### Current Implementation
- API key stored in configuration
- No encryption at rest
- Basic input validation

### Required Enhancements
- Secure credential management
- Data encryption in transit and at rest
- Comprehensive input validation
- Audit logging
- Access control for multi-tenant scenarios