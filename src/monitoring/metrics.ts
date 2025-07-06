/**
 * Performance Monitoring & Metrics System
 *
 * Comprehensive monitoring with real-time metrics, alerting, and observability
 */
import { EventEmitter } from "events";
import { performance } from "perf_hooks";

/**
 * Metric types for different data collection
 */
export type MetricType = "counter" | "gauge" | "histogram" | "summary";

/**
 * Metric configuration interface
 */
export interface MetricConfig {
  name: string;
  help: string;
  type: MetricType;
  labels?: string[];
  buckets?: number[]; // For histograms
}

/**
 * Performance measurement interface
 */
export interface PerformanceMeasurement {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  labels?: Record<string, string>;
  success?: boolean;
  error?: string;
}

/**
 * System metrics interface
 */
export interface SystemMetrics {
  memoryUsage: NodeJS.MemoryUsage;
  cpuUsage: NodeJS.CpuUsage;
  uptime: number;
  timestamp: number;
  gcStats?: GCStats;
}

/**
 * Garbage collection statistics
 */
export interface GCStats {
  totalGCDuration: number;
  totalGCCount: number;
  minorGCCount: number;
  majorGCCount: number;
  lastGCDuration: number;
}

/**
 * Export performance metrics
 */
export interface ExportMetrics {
  totalApiCalls: number;
  totalDataExported: number; // in bytes
  averageResponseTime: number;
  errorRate: number;
  rateLimitHits: number;
  cacheHitRate: number;
  concurrencyUtilization: number;
  throughputPerSecond: number;
  memoryEfficiency: number;
}

/**
 * Alert configuration
 */
export interface AlertConfig {
  name: string;
  metric: string;
  threshold: number;
  condition: "greater_than" | "less_than" | "equals";
  severity: "low" | "medium" | "high" | "critical";
  cooldown: number; // milliseconds
}

/**
 * Alert instance
 */
export interface Alert {
  config: AlertConfig;
  triggered: boolean;
  lastTriggered?: number;
  count: number;
  message: string;
}

/**
 * Enhanced performance monitoring system
 */
export class PerformanceMonitor extends EventEmitter {
  private metrics: Map<string, any> = new Map();
  private measurements: Map<string, PerformanceMeasurement> = new Map();
  private systemMetricsHistory: SystemMetrics[] = [];
  private alerts: Map<string, Alert> = new Map();
  private isMonitoring = false;
  private intervalId?: NodeJS.Timeout;
  private gcObserver?: any;
  private startCpuUsage: NodeJS.CpuUsage = process.cpuUsage();

  constructor(
    private config: {
      collectInterval: number;
      historySize: number;
      enableGCMonitoring: boolean;
      alertConfigs: AlertConfig[];
    } = {
      collectInterval: 5000,
      historySize: 1000,
      enableGCMonitoring: true,
      alertConfigs: []
    }
  ) {
    super();
    this.setupAlerts();
    this.setupGCMonitoring();
  }

  /**
   * Start performance monitoring
   */
  start(): void {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    this.startCpuUsage = process.cpuUsage();

    this.intervalId = setInterval(() => {
      this.collectSystemMetrics();
      this.checkAlerts();
    }, this.config.collectInterval);

    this.emit("monitoring.started");
  }

  /**
   * Stop performance monitoring
   */
  stop(): void {
    if (!this.isMonitoring) return;

    this.isMonitoring = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    this.emit("monitoring.stopped");
  }

  /**
   * Register a new metric
   */
  registerMetric(config: MetricConfig): void {
    const metric = this.createMetric(config);
    this.metrics.set(config.name, metric);
  }

  /**
   * Start measuring performance for an operation
   */
  startMeasurement(name: string, labels?: Record<string, string>): string {
    const measurementId = `${name}_${Date.now()}_${Math.random()}`;

    const measurement: PerformanceMeasurement = {
      name,
      startTime: performance.now(),
      labels
    };

    this.measurements.set(measurementId, measurement);
    return measurementId;
  }

  /**
   * End performance measurement
   */
  endMeasurement(measurementId: string, success: boolean = true, error?: string): number {
    const measurement = this.measurements.get(measurementId);
    if (!measurement) {
      throw new Error(`Measurement ${measurementId} not found`);
    }

    measurement.endTime = performance.now();
    measurement.duration = measurement.endTime - measurement.startTime;
    measurement.success = success;
    measurement.error = error;

    // Record to histogram if exists
    const histogramName = `${measurement.name}_duration`;
    if (this.metrics.has(histogramName)) {
      this.recordHistogram(histogramName, measurement.duration, measurement.labels);
    }

    // Emit measurement event
    this.emit("measurement.completed", measurement);

    this.measurements.delete(measurementId);
    return measurement.duration;
  }

  /**
   * Measure a function execution
   */
  async measureFunction<T>(
    name: string,
    fn: () => Promise<T> | T,
    labels?: Record<string, string>
  ): Promise<{ result: T; duration: number }> {
    const measurementId = this.startMeasurement(name, labels);

    try {
      const result = await fn();
      const duration = this.endMeasurement(measurementId, true);
      return { result, duration };
    } catch (error) {
      const duration = this.endMeasurement(
        measurementId,
        false,
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    }
  }

  /**
   * Record counter metric
   */
  incrementCounter(name: string, value: number = 1, labels?: Record<string, string>): void {
    const metric = this.metrics.get(name);
    if (metric && metric.type === "counter") {
      metric.inc(labels, value);
    }
  }

  /**
   * Record gauge metric
   */
  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    const metric = this.metrics.get(name);
    if (metric && metric.type === "gauge") {
      metric.set(labels, value);
    }
  }

  /**
   * Record histogram metric
   */
  recordHistogram(name: string, value: number, labels?: Record<string, string>): void {
    const metric = this.metrics.get(name);
    if (metric && metric.type === "histogram") {
      metric.observe(labels, value);
    }
  }

  /**
   * Get current system metrics
   */
  getCurrentSystemMetrics(): SystemMetrics {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage(this.startCpuUsage);

    return {
      memoryUsage,
      cpuUsage,
      uptime: process.uptime(),
      timestamp: Date.now(),
      gcStats: this.getGCStats()
    };
  }

  /**
   * Get historical system metrics
   */
  getSystemMetricsHistory(): SystemMetrics[] {
    return [...this.systemMetricsHistory];
  }

  /**
   * Get export performance metrics
   */
  getExportMetrics(): ExportMetrics {
    return {
      totalApiCalls: this.getMetricValue("api_calls_total") || 0,
      totalDataExported: this.getMetricValue("data_exported_bytes_total") || 0,
      averageResponseTime: this.getMetricValue("api_response_time_avg") || 0,
      errorRate: this.calculateErrorRate(),
      rateLimitHits: this.getMetricValue("rate_limit_hits_total") || 0,
      cacheHitRate: this.calculateCacheHitRate(),
      concurrencyUtilization: this.calculateConcurrencyUtilization(),
      throughputPerSecond: this.calculateThroughput(),
      memoryEfficiency: this.calculateMemoryEfficiency()
    };
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): Alert[] {
    return Array.from(this.alerts.values()).filter((alert) => alert.triggered);
  }

  /**
   * Get all metrics for export (Prometheus format)
   */
  getMetricsForExport(): string {
    const lines: string[] = [];

    for (const [name, metric] of this.metrics) {
      if (metric.register) {
        lines.push(metric.register.metrics());
      }
    }

    return lines.join("\n");
  }

  /**
   * Add custom alert configuration
   */
  addAlert(config: AlertConfig): void {
    const alert: Alert = {
      config,
      triggered: false,
      count: 0,
      message: ""
    };

    this.alerts.set(config.name, alert);
  }

  /**
   * Check memory pressure and emit warnings
   */
  checkMemoryPressure(): { pressure: "low" | "medium" | "high" | "critical"; details: any } {
    const metrics = this.getCurrentSystemMetrics();
    const heapUsed = metrics.memoryUsage.heapUsed;
    const heapTotal = metrics.memoryUsage.heapTotal;
    const external = metrics.memoryUsage.external;

    const heapUtilization = heapUsed / heapTotal;
    const totalMemory = heapTotal + external;

    let pressure: "low" | "medium" | "high" | "critical";

    if (heapUtilization > 0.9 || totalMemory > 500 * 1024 * 1024) {
      pressure = "critical";
    } else if (heapUtilization > 0.8 || totalMemory > 300 * 1024 * 1024) {
      pressure = "high";
    } else if (heapUtilization > 0.7 || totalMemory > 200 * 1024 * 1024) {
      pressure = "medium";
    } else {
      pressure = "low";
    }

    const details = {
      heapUsed: Math.round(heapUsed / 1024 / 1024),
      heapTotal: Math.round(heapTotal / 1024 / 1024),
      heapUtilization: Math.round(heapUtilization * 100),
      external: Math.round(external / 1024 / 1024),
      totalMemory: Math.round(totalMemory / 1024 / 1024)
    };

    if (pressure !== "low") {
      this.emit("memory.pressure", { pressure, details });
    }

    return { pressure, details };
  }

  /**
   * Force garbage collection if available
   */
  forceGarbageCollection(): boolean {
    if (global.gc) {
      global.gc();
      this.emit("gc.forced");
      return true;
    }
    return false;
  }

  /**
   * Get performance insights and recommendations
   */
  getPerformanceInsights(): {
    insights: string[];
    recommendations: string[];
    metrics: any;
  } {
    const insights: string[] = [];
    const recommendations: string[] = [];
    const metrics = this.getExportMetrics();
    const memoryPressure = this.checkMemoryPressure();

    // Memory insights
    if (memoryPressure.pressure === "critical") {
      insights.push(`Critical memory pressure: ${memoryPressure.details.heapUtilization}% heap utilization`);
      recommendations.push("Reduce batch sizes and implement more aggressive cleanup");
    } else if (memoryPressure.pressure === "high") {
      insights.push(`High memory usage: ${memoryPressure.details.totalMemory}MB total`);
      recommendations.push("Consider implementing streaming or chunked processing");
    }

    // Error rate insights
    if (metrics.errorRate > 0.05) {
      insights.push(`High error rate: ${(metrics.errorRate * 100).toFixed(1)}%`);
      recommendations.push("Review error patterns and implement better retry strategies");
    }

    // Rate limiting insights
    if (metrics.rateLimitHits > 0) {
      insights.push(`Rate limit hits detected: ${metrics.rateLimitHits} occurrences`);
      recommendations.push("Implement adaptive rate limiting or increase delays");
    }

    // Performance insights
    if (metrics.averageResponseTime > 2000) {
      insights.push(`Slow API responses: ${metrics.averageResponseTime.toFixed(0)}ms average`);
      recommendations.push("Optimize request patterns or implement caching");
    }

    return { insights, recommendations, metrics };
  }

  /**
   * Private: Create metric based on configuration
   */
  private createMetric(config: MetricConfig): any {
    // This would integrate with a metrics library like prom-client
    // For now, return a mock implementation
    return {
      type: config.type,
      name: config.name,
      help: config.help,
      labels: config.labels || [],
      buckets: config.buckets,
      value: 0,
      inc: (labels: Record<string, string>, value: number = 1) => {
        this.emit("metric.updated", { name: config.name, type: "counter", labels, value });
      },
      set: (labels: Record<string, string>, value: number) => {
        this.emit("metric.updated", { name: config.name, type: "gauge", labels, value });
      },
      observe: (labels: Record<string, string>, value: number) => {
        this.emit("metric.updated", { name: config.name, type: "histogram", labels, value });
      }
    };
  }

  /**
   * Private: Setup alert monitoring
   */
  private setupAlerts(): void {
    for (const alertConfig of this.config.alertConfigs) {
      this.addAlert(alertConfig);
    }
  }

  /**
   * Private: Setup garbage collection monitoring
   */
  private setupGCMonitoring(): void {
    if (!this.config.enableGCMonitoring) return;

    try {
      // This would use a proper GC monitoring library in production
      this.emit("gc.monitoring.enabled");
    } catch (error) {
      this.emit("gc.monitoring.failed", error);
    }
  }

  /**
   * Private: Collect system metrics
   */
  private collectSystemMetrics(): void {
    const metrics = this.getCurrentSystemMetrics();

    this.systemMetricsHistory.push(metrics);

    // Keep history size under control
    if (this.systemMetricsHistory.length > this.config.historySize) {
      this.systemMetricsHistory.shift();
    }

    this.emit("metrics.collected", metrics);
  }

  /**
   * Private: Check alerts against current metrics
   */
  private checkAlerts(): void {
    for (const alert of this.alerts.values()) {
      const currentValue = this.getMetricValue(alert.config.metric);
      if (currentValue === null) continue;

      const shouldTrigger = this.evaluateAlertCondition(currentValue, alert.config.threshold, alert.config.condition);

      const now = Date.now();
      const cooledDown = !alert.lastTriggered || now - alert.lastTriggered > alert.config.cooldown;

      if (shouldTrigger && !alert.triggered && cooledDown) {
        alert.triggered = true;
        alert.lastTriggered = now;
        alert.count++;
        alert.message = `Alert: ${alert.config.name} - ${alert.config.metric} ${alert.config.condition} ${alert.config.threshold} (current: ${currentValue})`;

        this.emit("alert.triggered", alert);
      } else if (!shouldTrigger && alert.triggered) {
        alert.triggered = false;
        this.emit("alert.resolved", alert);
      }
    }
  }

  /**
   * Private: Evaluate alert condition
   */
  private evaluateAlertCondition(value: number, threshold: number, condition: string): boolean {
    switch (condition) {
      case "greater_than":
        return value > threshold;
      case "less_than":
        return value < threshold;
      case "equals":
        return value === threshold;
      default:
        return false;
    }
  }

  /**
   * Private: Get metric value
   */
  private getMetricValue(metricName: string): number | null {
    const metric = this.metrics.get(metricName);
    return metric ? metric.value : null;
  }

  /**
   * Private: Calculate error rate
   */
  private calculateErrorRate(): number {
    const totalRequests = this.getMetricValue("requests_total") || 0;
    const errorRequests = this.getMetricValue("requests_errors_total") || 0;

    return totalRequests > 0 ? errorRequests / totalRequests : 0;
  }

  /**
   * Private: Calculate cache hit rate
   */
  private calculateCacheHitRate(): number {
    const hits = this.getMetricValue("cache_hits_total") || 0;
    const misses = this.getMetricValue("cache_misses_total") || 0;
    const total = hits + misses;

    return total > 0 ? hits / total : 0;
  }

  /**
   * Private: Calculate concurrency utilization
   */
  private calculateConcurrencyUtilization(): number {
    const active = this.getMetricValue("concurrent_operations_active") || 0;
    const max = this.getMetricValue("concurrent_operations_max") || 1;

    return active / max;
  }

  /**
   * Private: Calculate throughput
   */
  private calculateThroughput(): number {
    const recentMetrics = this.systemMetricsHistory.slice(-12); // Last minute at 5s intervals
    if (recentMetrics.length < 2) return 0;

    const timeSpan = (recentMetrics[recentMetrics.length - 1].timestamp - recentMetrics[0].timestamp) / 1000;
    const operations = this.getMetricValue("operations_completed_total") || 0;

    return timeSpan > 0 ? operations / timeSpan : 0;
  }

  /**
   * Private: Calculate memory efficiency
   */
  private calculateMemoryEfficiency(): number {
    const currentMetrics = this.getCurrentSystemMetrics();
    const dataProcessed = this.getMetricValue("data_processed_bytes_total") || 1;
    const memoryUsed = currentMetrics.memoryUsage.heapUsed;

    return dataProcessed / memoryUsed; // bytes processed per byte of memory
  }

  /**
   * Private: Get garbage collection statistics
   */
  private getGCStats(): GCStats | undefined {
    // This would integrate with actual GC monitoring
    return undefined;
  }
}

/**
 * Global performance monitor instance
 */
let globalMonitor: PerformanceMonitor | null = null;

/**
 * Initialize global performance monitor
 */
export function initializePerformanceMonitor(config?: any): PerformanceMonitor {
  globalMonitor = new PerformanceMonitor(config);
  return globalMonitor;
}

/**
 * Get global performance monitor
 */
export function getPerformanceMonitor(): PerformanceMonitor {
  if (!globalMonitor) {
    throw new Error("Performance monitor not initialized");
  }
  return globalMonitor;
}

/**
 * Performance decorator for automatic measurement
 */
export function measured(metricName?: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const measurementName = metricName || `${target.constructor.name}_${propertyKey}`;

    descriptor.value = async function (...args: any[]) {
      const monitor = getPerformanceMonitor();
      const measurementId = monitor.startMeasurement(measurementName);

      try {
        const result = await originalMethod.apply(this, args);
        monitor.endMeasurement(measurementId, true);
        return result;
      } catch (error) {
        monitor.endMeasurement(measurementId, false, error instanceof Error ? error.message : String(error));
        throw error;
      }
    };

    return descriptor;
  };
}

/**
 * Export default monitor configuration
 */
export const defaultMonitorConfig = {
  collectInterval: 5000,
  historySize: 1000,
  enableGCMonitoring: true,
  alertConfigs: [
    {
      name: "high_memory_usage",
      metric: "memory_heap_used_bytes",
      threshold: 400 * 1024 * 1024, // 400MB
      condition: "greater_than" as const,
      severity: "high" as const,
      cooldown: 30000 // 30 seconds
    },
    {
      name: "high_error_rate",
      metric: "error_rate",
      threshold: 0.1, // 10%
      condition: "greater_than" as const,
      severity: "critical" as const,
      cooldown: 60000 // 1 minute
    }
  ]
};
