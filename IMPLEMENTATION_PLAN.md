# Production Implementation Plan - Notion Sync

## 🎯 **Phase 1: Critical Fixes & Foundation (Week 1)**

### **Day 1-2: Code Cleanup & Dead Code Removal**

#### **1. Remove Dead References**
```bash
# Files to clean up:
- Remove references to deleted exporters in old/ directories
- Clean up unused imports in existing files
- Remove old test files that reference deleted code
```

#### **2. Standardize Import Paths**
```typescript
// Current: Inconsistent import paths
// Target: Standardized barrel exports

// Create barrel exports in key directories:
// src/core/index.ts
export * from './domain/export';
export * from './domain/notion-objects';
export * from './services/export-service';
export * from './services/progress-service';
export * from './events';

// src/lib/index.ts
export * from './control-plane';
export * from './export';
export * from './operations';
```

### **Day 3-5: Comprehensive Testing Infrastructure**

#### **3. Test Structure Setup**
```bash
# Create test structure:
src/
├── core/
│   ├── domain/__tests__/
│   │   ├── export.test.ts
│   │   └── notion-objects.test.ts
│   ├── services/__tests__/
│   │   ├── export-service.test.ts (✅ exists)
│   │   └── progress-service.test.ts
│   └── events/__tests__/
│       └── events.test.ts
├── infrastructure/
│   └── notion/__tests__/
│       └── notion-client.test.ts
├── lib/
│   ├── export/__tests__/
│   │   ├── exporter.test.ts
│   │   ├── manager.test.ts
│   │   └── util.test.ts
│   └── control-plane/__tests__/ (✅ exists)
└── commands/__tests__/
    └── export.test.ts
```

#### **4. Essential Test Files to Create**

**A. Domain Tests (`src/core/domain/__tests__/export.test.ts`)**
```typescript
/**
 * Export Domain Model Tests
 *
 * Tests core business logic and state transitions
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Export, ExportFactory } from '../export';
import { ExportStatus, ExportFormat } from '../../../shared/types';

describe('Export Domain Model', () => {
  let export_: Export;
  
  beforeEach(() => {
    const config = {
      outputPath: '/test/path',
      format: ExportFormat.JSON,
      includeBlocks: true,
      includeComments: true,
      includeProperties: true,
      databases: ['db1', 'db2'],
      pages: ['page1']
    };
    export_ = ExportFactory.create(config);
  });

  describe('creation and validation', () => {
    it('should create export with valid configuration', () => {
      expect(export_.id).toBeDefined();
      expect(export_.status).toBe(ExportStatus.PENDING);
    });

    it('should validate required fields', () => {
      expect(() => {
        ExportFactory.create({} as any);
      }).toThrow('Output path is required');
    });
  });

  describe('state transitions', () => {
    it('should transition from PENDING to RUNNING', () => {
      export_.start();
      expect(export_.status).toBe(ExportStatus.RUNNING);
      expect(export_.startedAt).toBeDefined();
    });

    it('should prevent invalid state transitions', () => {
      export_.start();
      expect(() => export_.start()).toThrow();
    });
  });

  describe('progress tracking', () => {
    it('should update progress correctly', () => {
      export_.start();
      export_.updateProgress({
        processed: 50,
        total: 100,
        currentOperation: 'processing'
      });
      
      expect(export_.progress.percentage).toBe(50);
    });

    it('should calculate ETA', () => {
      export_.start();
      export_.updateProgress({
        processed: 25,
        total: 100,
        currentOperation: 'processing'
      });
      
      expect(export_.progress.estimatedCompletion).toBeDefined();
    });
  });
});
```

**B. Service Tests (`src/core/services/__tests__/progress-service.test.ts`)**
```typescript
/**
 * Progress Service Tests
 *
 * Tests progress tracking functionality
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProgressService } from '../progress-service';

describe('ProgressService', () => {
  let progressService: ProgressService;
  let mockEventPublisher: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockEventPublisher = vi.fn();
    progressService = new ProgressService(mockEventPublisher);
  });

  describe('tracking lifecycle', () => {
    it('should start tracking for export', async () => {
      await progressService.startTracking('export-1');
      
      const progress = progressService.getProgress('export-1');
      expect(progress.processed).toBe(0);
      expect(progress.total).toBe(0);
    });

    it('should track section progress', async () => {
      await progressService.startTracking('export-1');
      await progressService.startSection('export-1', 'pages', 100);
      
      expect(mockEventPublisher).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'progress.section.started'
        })
      );
    });
  });

  describe('progress calculations', () => {
    it('should calculate percentage correctly', async () => {
      await progressService.startTracking('export-1');
      await progressService.startSection('export-1', 'pages', 100);
      await progressService.updateSectionProgress('export-1', 'pages', 50);
      
      const progress = progressService.getProgress('export-1');
      expect(progress.percentage).toBe(50);
    });
  });
});
```

**C. Infrastructure Tests (`src/infrastructure/notion/__tests__/notion-client.test.ts`)**
```typescript
/**
 * Notion Client Tests
 *
 * Tests API integration and error handling
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotionClient } from '../notion-client';
import { NotionConfig } from '../../../shared/types';

// Mock the @notionhq/client
vi.mock('@notionhq/client', () => ({
  Client: vi.fn().mockImplementation(() => ({
    pages: {
      retrieve: vi.fn()
    },
    databases: {
      retrieve: vi.fn(),
      query: vi.fn()
    },
    blocks: {
      children: {
        list: vi.fn()
      }
    },
    users: {
      list: vi.fn()
    }
  }))
}));

describe('NotionClient', () => {
  let notionClient: NotionClient;
  let mockEventPublisher: ReturnType<typeof vi.fn>;
  let mockCircuitBreaker: any;

  beforeEach(() => {
    mockEventPublisher = vi.fn();
    mockCircuitBreaker = {
      execute: vi.fn().mockImplementation((fn) => fn()),
      canProceed: vi.fn().mockReturnValue(true)
    };

    const config: NotionConfig = {
      apiKey: 'test-key',
      apiVersion: '2022-06-28',
      baseUrl: 'https://api.notion.com',
      timeout: 30000,
      retryAttempts: 3
    };

    notionClient = new NotionClient(config, mockEventPublisher, mockCircuitBreaker);
  });

  describe('page operations', () => {
    it('should fetch page successfully', async () => {
      const mockPage = {
        id: 'page-1',
        properties: {},
        url: 'https://notion.so/page-1'
      };

      // Setup mock response
      const mockClient = (notionClient as any).client;
      mockClient.pages.retrieve.mockResolvedValue(mockPage);

      const result = await notionClient.getPage('page-1');
      
      expect(result.id).toBe('page-1');
      expect(mockEventPublisher).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'notion.object.fetched'
        })
      );
    });
  });

  describe('error handling', () => {
    it('should handle rate limit errors', async () => {
      const rateLimitError = {
        code: 'rate_limited',
        status: 429,
        headers: { 'retry-after': '60' }
      };

      const mockClient = (notionClient as any).client;
      mockClient.pages.retrieve.mockRejectedValue(rateLimitError);

      await expect(notionClient.getPage('page-1')).rejects.toThrow();
      
      expect(mockEventPublisher).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'notion.rate_limit.hit'
        })
      );
    });
  });
});
```

### **Day 6-7: Configuration Standardization**

#### **5. Unified Configuration System**
```typescript
// src/config/index.ts
import { z } from 'zod';
import { loadConfig } from 'zod-config';

const ConfigSchema = z.object({
  notion: z.object({
    apiKey: z.string(),
    apiVersion: z.string().default('2022-06-28'),
    baseUrl: z.string().default('https://api.notion.com'),
    timeout: z.number().default(30000),
    retryAttempts: z.number().default(3)
  }),
  export: z.object({
    defaultOutputPath: z.string().default('./exports'),
    defaultFormat: z.enum(['json', 'markdown', 'html', 'csv']).default('json'),
    maxConcurrency: z.number().default(5),
    chunkSize: z.number().default(100),
    enableResume: z.boolean().default(true)
  }),
  performance: z.object({
    rateLimits: z.object({
      pages: z.number().default(10),
      blocks: z.number().default(10),
      databases: z.number().default(5)
    }),
    circuitBreaker: z.object({
      failureThreshold: z.number().default(5),
      resetTimeout: z.number().default(60000),
      monitoringPeriod: z.number().default(60000)
    })
  }),
  monitoring: z.object({
    enableMetrics: z.boolean().default(false),
    enableLogging: z.boolean().default(true),
    logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info')
  })
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export function loadAppConfig(): AppConfig {
  return loadConfig({
    schema: ConfigSchema,
    // Load from environment variables with NOTION_SYNC_ prefix
    environment: true,
    environmentPrefix: 'NOTION_SYNC_',
    // Load from config files
    files: [
      'notion-sync.config.js',
      'notion-sync.config.json',
      '.env'
    ]
  });
}
```

## 🎯 **Phase 2: Reliability & Performance (Week 2)**

### **Day 8-10: Event System Completion**

#### **6. Complete Event Integration**
```typescript
// src/core/events/event-bus.ts
/**
 * Centralized Event Bus
 *
 * Ensures all events are properly typed and routed
 */
import { Subject, Observable } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { DomainEvent } from '../../shared/types';

export class EventBus {
  private eventSubject = new Subject<DomainEvent>();

  publish(event: DomainEvent): void {
    this.eventSubject.next(event);
  }

  subscribe<T extends DomainEvent>(
    eventType: T['type'],
    handler: (event: T) => void
  ): { unsubscribe: () => void } {
    const subscription = this.eventSubject
      .pipe(
        filter((event): event is T => event.type === eventType),
        map(event => event as T)
      )
      .subscribe(handler);

    return {
      unsubscribe: () => subscription.unsubscribe()
    };
  }

  subscribeToAll(): Observable<DomainEvent> {
    return this.eventSubject.asObservable();
  }

  destroy(): void {
    this.eventSubject.complete();
  }
}
```

#### **7. Health Check System**
```typescript
// src/lib/monitoring/health-check.ts
/**
 * Health Check System
 *
 * Monitors system health and reports status
 */
export interface HealthCheck {
  name: string;
  check(): Promise<HealthStatus>;
}

export interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  message?: string;
  details?: Record<string, any>;
  timestamp: Date;
}

export class HealthCheckService {
  private checks = new Map<string, HealthCheck>();

  register(check: HealthCheck): void {
    this.checks.set(check.name, check);
  }

  async checkAll(): Promise<Record<string, HealthStatus>> {
    const results: Record<string, HealthStatus> = {};

    for (const [name, check] of this.checks) {
      try {
        results[name] = await check.check();
      } catch (error) {
        results[name] = {
          status: 'unhealthy',
          message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date()
        };
      }
    }

    return results;
  }

  async getOverallHealth(): Promise<HealthStatus> {
    const results = await this.checkAll();
    const statuses = Object.values(results);

    if (statuses.every(s => s.status === 'healthy')) {
      return {
        status: 'healthy',
        message: 'All systems operational',
        timestamp: new Date()
      };
    }

    if (statuses.some(s => s.status === 'unhealthy')) {
      return {
        status: 'unhealthy',
        message: 'One or more systems are unhealthy',
        details: results,
        timestamp: new Date()
      };
    }

    return {
      status: 'degraded',
      message: 'Some systems are degraded',
      details: results,
      timestamp: new Date()
    };
  }
}

// Built-in health checks
export class NotionAPIHealthCheck implements HealthCheck {
  name = 'notion-api';

  constructor(private notionClient: any) {}

  async check(): Promise<HealthStatus> {
    try {
      // Simple API call to check connectivity
      await this.notionClient.getUsers();
      
      return {
        status: 'healthy',
        message: 'Notion API accessible',
        timestamp: new Date()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: 'Notion API unavailable',
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
        timestamp: new Date()
      };
    }
  }
}
```

### **Day 11-12: Performance Optimization**

#### **8. Enhanced Concurrency Management**
```typescript
// src/lib/export/enhanced-concurrency.ts
/**
 * Enhanced Concurrency Manager
 *
 * Provides intelligent concurrency control with auto-tuning
 */
export class EnhancedConcurrencyManager {
  private operationQueues = new Map<string, Array<() => Promise<any>>>();
  private activeOperations = new Map<string, number>();
  private limits = new Map<string, number>();
  private performance = new Map<string, PerformanceMetrics>();

  constructor(private defaultLimits: Record<string, number>) {
    Object.entries(defaultLimits).forEach(([type, limit]) => {
      this.limits.set(type, limit);
      this.activeOperations.set(type, 0);
      this.operationQueues.set(type, []);
    });
  }

  async execute<T>(
    operationType: string,
    operation: () => Promise<T>
  ): Promise<T> {
    await this.waitForSlot(operationType);
    
    const startTime = Date.now();
    this.incrementActive(operationType);

    try {
      const result = await operation();
      this.recordSuccess(operationType, Date.now() - startTime);
      return result;
    } catch (error) {
      this.recordError(operationType, Date.now() - startTime);
      throw error;
    } finally {
      this.decrementActive(operationType);
      this.processQueue(operationType);
    }
  }

  private async waitForSlot(operationType: string): Promise<void> {
    if (this.canProceed(operationType)) {
      return;
    }

    return new Promise((resolve) => {
      const queue = this.operationQueues.get(operationType)!;
      queue.push(async () => resolve());
    });
  }

  private canProceed(operationType: string): boolean {
    const active = this.activeOperations.get(operationType) || 0;
    const limit = this.limits.get(operationType) || 1;
    return active < limit;
  }

  // Auto-tuning based on performance metrics
  autoTune(): void {
    for (const [type, metrics] of this.performance) {
      const currentLimit = this.limits.get(type) || 1;
      
      if (metrics.errorRate > 0.1) {
        // High error rate - reduce concurrency
        this.limits.set(type, Math.max(1, Math.floor(currentLimit * 0.8)));
      } else if (metrics.errorRate < 0.01 && metrics.avgResponseTime < 1000) {
        // Low error rate and fast responses - increase concurrency
        this.limits.set(type, Math.min(20, Math.floor(currentLimit * 1.2)));
      }
    }
  }
}
```

### **Day 13-14: Monitoring & Observability**

#### **9. Comprehensive Metrics System**
```typescript
// src/lib/monitoring/metrics.ts
/**
 * Metrics Collection System
 *
 * Collects and exports performance metrics
 */
export interface Metric {
  name: string;
  value: number;
  tags?: Record<string, string>;
  timestamp: Date;
}

export class MetricsCollector {
  private metrics: Metric[] = [];
  private counters = new Map<string, number>();
  private gauges = new Map<string, number>();
  private histograms = new Map<string, number[]>();

  // Counter metrics
  increment(name: string, tags?: Record<string, string>): void {
    const key = this.createKey(name, tags);
    this.counters.set(key, (this.counters.get(key) || 0) + 1);
    this.recordMetric(name, this.counters.get(key)!, tags);
  }

  // Gauge metrics
  gauge(name: string, value: number, tags?: Record<string, string>): void {
    const key = this.createKey(name, tags);
    this.gauges.set(key, value);
    this.recordMetric(name, value, tags);
  }

  // Histogram metrics
  histogram(name: string, value: number, tags?: Record<string, string>): void {
    const key = this.createKey(name, tags);
    const values = this.histograms.get(key) || [];
    values.push(value);
    this.histograms.set(key, values);
    this.recordMetric(name, value, tags);
  }

  // Time a function execution
  async time<T>(
    name: string,
    fn: () => Promise<T>,
    tags?: Record<string, string>
  ): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      this.histogram(`${name}.duration`, Date.now() - start, tags);
      this.increment(`${name}.success`, tags);
      return result;
    } catch (error) {
      this.histogram(`${name}.duration`, Date.now() - start, tags);
      this.increment(`${name}.error`, tags);
      throw error;
    }
  }

  private createKey(name: string, tags?: Record<string, string>): string {
    if (!tags) return name;
    const tagString = Object.entries(tags)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    return `${name}{${tagString}}`;
  }

  private recordMetric(name: string, value: number, tags?: Record<string, string>): void {
    this.metrics.push({
      name,
      value,
      tags,
      timestamp: new Date()
    });

    // Keep only last 1000 metrics to prevent memory growth
    if (this.metrics.length > 1000) {
      this.metrics = this.metrics.slice(-1000);
    }
  }

  getMetrics(): Metric[] {
    return [...this.metrics];
  }

  // Export metrics in Prometheus format
  exportPrometheus(): string {
    const lines: string[] = [];
    const metricsByName = new Map<string, Metric[]>();

    // Group metrics by name
    for (const metric of this.metrics) {
      const metrics = metricsByName.get(metric.name) || [];
      metrics.push(metric);
      metricsByName.set(metric.name, metrics);
    }

    // Format for Prometheus
    for (const [name, metrics] of metricsByName) {
      lines.push(`# TYPE ${name} gauge`);
      for (const metric of metrics.slice(-1)) { // Latest value only
        const labels = metric.tags 
          ? Object.entries(metric.tags).map(([k, v]) => `${k}="${v}"`).join(',')
          : '';
        const labelString = labels ? `{${labels}}` : '';
        lines.push(`${name}${labelString} ${metric.value}`);
      }
    }

    return lines.join('\n');
  }
}
```

## 🎯 **Phase 3: Operations & Documentation (Week 3)**

### **Day 15-17: Complete Documentation**

#### **10. API Documentation**
```typescript
// src/docs/api.md
/**
 * Notion Sync API Documentation
 *
 * Complete API reference for all public interfaces
 */

// Auto-generated from TypeScript definitions
// Use typedoc for comprehensive API docs
```

#### **11. Deployment Guide**
```yaml
# deployment/docker-compose.yml
version: '3.8'
services:
  notion-sync:
    build: .
    environment:
      - NOTION_SYNC_NOTION_API_KEY=${NOTION_API_KEY}
      - NOTION_SYNC_EXPORT_DEFAULT_OUTPUT_PATH=/exports
      - NOTION_SYNC_MONITORING_ENABLE_METRICS=true
    volumes:
      - ./exports:/exports
    ports:
      - "3000:3000"  # Health check endpoint
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### **Day 18-21: Production Deployment**

#### **12. CI/CD Pipeline**
```yaml
# .github/workflows/ci.yml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - run: npm ci
      - run: npm run build
      - run: npm run test
      - run: npm run test:coverage
      
      - name: Upload coverage reports
        uses: codecov/codecov-action@v3
        with:
          file: ./coverage/lcov.info

  deploy:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to production
        run: |
          # Deployment scripts here
          echo "Deploying to production..."
```

## 📊 **Success Verification**

### **Testing Commands**
```bash
# Run all tests with coverage
npm run test:coverage

# Run specific test suites
npm run test src/core/domain/__tests__/
npm run test src/core/services/__tests__/
npm run test src/infrastructure/notion/__tests__/

# Integration tests
npm run test:integration

# Performance tests
npm run test:performance
```

### **Quality Gates**
- ✅ Test Coverage: >90%
- ✅ Type Coverage: 100%
- ✅ Linting: Zero errors
- ✅ Security Scan: Zero critical issues
- ✅ Performance: <200MB memory, >1000 pages/min

---

**Next Step**: Choose which phase to implement first and I'll provide detailed implementation assistance for that specific area. 