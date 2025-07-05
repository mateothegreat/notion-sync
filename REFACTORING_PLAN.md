# Comprehensive Refactoring Plan

## Current Issues Identified

1. **EventEmitter Daisy-Chaining**: Multiple components use EventEmitter patterns that create tight coupling
2. **Inconsistent Error Handling**: Different error handling patterns across components
3. **Mixed Concerns**: Business logic mixed with infrastructure concerns
4. **Duplicate Code**: Similar patterns repeated across different modules
5. **Testing Gaps**: Incomplete test coverage and inconsistent testing patterns
6. **Legacy Patterns**: Old patterns that don't leverage the new control plane

## New Architecture

### Core Principles
1. **Event-Driven Architecture**: All communication through the control plane
2. **Domain-Driven Design**: Clear separation of business domains
3. **Dependency Injection**: Components receive dependencies through the control plane
4. **Circuit Breaker Pattern**: All external calls protected
5. **Immutable State**: Predictable state management
6. **Type Safety**: Strict TypeScript throughout

### Domain Structure
```
src/
├── core/                    # Core business logic
│   ├── domain/             # Domain models and entities
│   ├── services/           # Business services
│   └── events/             # Domain events
├── infrastructure/         # External concerns
│   ├── notion/             # Notion API integration
│   ├── filesystem/         # File system operations
│   └── cli/                # CLI interface
├── application/            # Application services
│   ├── commands/           # Command handlers
│   ├── queries/            # Query handlers
│   └── workflows/          # Complex business workflows
└── shared/                 # Shared utilities
    ├── types/              # Shared types
    ├── utils/              # Utility functions
    └── errors/             # Error definitions
```

## Refactoring Steps

### Phase 1: Core Infrastructure
1. ✅ Fix control plane infinite loop
2. ✅ Complete control plane implementation
3. 🔄 Create domain events and types
4. 🔄 Implement error hierarchy
5. 🔄 Create base services and repositories

### Phase 2: Domain Refactoring
1. 🔄 Extract Notion domain models
2. 🔄 Create export domain services
3. 🔄 Implement progress tracking domain
4. 🔄 Create rate limiting domain

### Phase 3: Application Layer
1. 🔄 Refactor CLI commands to use control plane
2. 🔄 Create command/query handlers
3. 🔄 Implement workflows
4. 🔄 Add comprehensive error handling

### Phase 4: Infrastructure
1. 🔄 Refactor Notion API client
2. 🔄 Implement filesystem abstraction
3. 🔄 Add monitoring and observability
4. 🔄 Create configuration management

### Phase 5: Testing & Quality
1. 🔄 Achieve 100% test coverage
2. 🔄 Add integration tests
3. 🔄 Performance testing
4. 🔄 Documentation updates

## Files to Delete/Refactor

### Delete (Legacy/Unused)
- Old EventEmitter implementations
- Duplicate utility functions
- Unused test fixtures
- Legacy configuration files

### Refactor (Major Changes)
- All export managers → Use control plane
- Rate limiting → Domain service
- Progress tracking → Domain service
- CLI commands → Command handlers
- Error handling → Centralized error system

### Keep (Minor Changes)
- Core types (with enhancements)
- Utility functions (with improvements)
- Test infrastructure (with standardization)