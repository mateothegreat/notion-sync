import { Flags } from "@oclif/core";
import chalk from "chalk";
import { config } from "dotenv";
import { inspect } from "node:util";
import { BaseCommand } from "../lib/commands/base-command";
import { baseFlags } from "../lib/commands/flags";
import { OperationTypeAwareLimiter } from "../lib/export/concurrency-manager";
import { ExporterConfig } from "../lib/export/config";
import { Exporter } from "../lib/export/exporter";
import { AdaptiveRateLimiter } from "../lib/export/rate-limiting";
import { ObjectType } from "../lib/objects/types";

config({
  path: ".env",
  quiet: true
});

/**
 * Real-time display manager that updates console in place or outputs line-by-line.
 */
class RealTimeDisplayManager {
  private displayInterval: NodeJS.Timeout | null = null;
  private startTime = Date.now();
  private isActive = false;
  private lastStats: any = null;

  constructor(
    private exporter: Exporter,
    private rateLimiter: AdaptiveRateLimiter,
    private operationLimiter: OperationTypeAwareLimiter,
    private flushMode: boolean = false
  ) {}

  start(): void {
    if (this.isActive) return;

    this.isActive = true;
    this.startTime = Date.now();

    if (!this.flushMode) {
      // Hide cursor and clear screen only in real-time mode
      process.stdout.write("\x1b[?25l");
      process.stdout.write("\x1b[2J\x1b[H");
    }

    // Start update loop
    this.displayInterval = setInterval(() => {
      this.updateDisplay();
    }, 1000);
  }

  stop(): void {
    if (!this.isActive) return;

    this.isActive = false;

    if (this.displayInterval) {
      clearInterval(this.displayInterval);
      this.displayInterval = null;
    }

    if (!this.flushMode) {
      // Show cursor and add final newline only in real-time mode
      process.stdout.write("\x1b[?25h\n");
    }
  }

  private updateDisplay(): void {
    const stats = this.gatherStats();

    if (this.flushMode) {
      // In flush mode, only emit new logs when significant changes occur
      this.emitProgressUpdate(stats);
    } else {
      // In real-time mode, update display in place
      const display = this.formatDisplay(stats);
      // Move cursor to top and clear screen
      process.stdout.write("\x1b[H\x1b[J");
      process.stdout.write(display);
    }
  }

  private emitProgressUpdate(stats: any): void {
    // Emit selective progress updates as new lines
    const now = new Date().toLocaleTimeString();

    // Current operation change
    if (!this.lastStats || this.lastStats.items.currentOperation !== stats.items.currentOperation) {
      console.log(`📍 [${now}] Current: ${stats.items.currentOperation}`);
    }

    // Progress milestones (every 100 items)
    const totalItems =
      stats.items.users + stats.items.databases + stats.items.pages + stats.items.blocks + stats.items.comments;
    const lastTotalItems = this.lastStats
      ? this.lastStats.items.users +
        this.lastStats.items.databases +
        this.lastStats.items.pages +
        this.lastStats.items.blocks +
        this.lastStats.items.comments
      : 0;

    if (Math.floor(totalItems / 100) > Math.floor(lastTotalItems / 100)) {
      console.log(
        `📊 [${now}] Progress: ${totalItems} items processed (${stats.performance.operationsPerSecond.toFixed(
          1
        )} ops/s)`
      );
    }

    // Error alerts
    if (stats.errors.total > (this.lastStats?.errors.total || 0)) {
      console.log(
        `❌ [${now}] Error: ${stats.errors.list[stats.errors.list.length - 1]?.type}: ${
          stats.errors.list[stats.errors.list.length - 1]?.error
        }`
      );
    }

    // Memory warnings
    if (stats.system.memoryUsageMB > 500) {
      // Warning at 500MB
      const lastMemory = this.lastStats?.system.memoryUsageMB || 0;
      if (Math.floor(stats.system.memoryUsageMB / 100) > Math.floor(lastMemory / 100)) {
        console.log(`💾 [${now}] Memory usage: ${stats.system.memoryUsageMB}MB`);
      }
    }

    // Rate limit changes
    if (!this.lastStats || stats.rateLimit.currentLimit !== this.lastStats.rateLimit.currentLimit) {
      console.log(`🔧 [${now}] Concurrency limit adjusted: ${stats.rateLimit.currentLimit}`);
    }

    this.lastStats = stats;
  }

  private gatherStats() {
    const rateLimiterStats = this.rateLimiter.getStats();
    const operationStats = this.operationLimiter.getAllStats();
    const globalStats = this.operationLimiter.getGlobalStats();
    const progress = (this.exporter as any).progress || {};

    return {
      rateLimit: {
        currentLimit: rateLimiterStats.recommendedConcurrency,
        remainingRequests: rateLimiterStats.remainingRequests,
        resetTime: rateLimiterStats.resetTime,
        quotaLimit: rateLimiterStats.quotaLimit,
        quotaUtilization:
          rateLimiterStats.quotaLimit > 0 ? 1 - rateLimiterStats.remainingRequests / rateLimiterStats.quotaLimit : 0,
        adaptiveInterval: rateLimiterStats.adaptiveInterval
      },
      performance: {
        operationsPerSecond: globalStats.operationsPerSecond,
        avgResponseTime: rateLimiterStats.avgResponseTime,
        errorRate: globalStats.errorRate,
        successRate: rateLimiterStats.successRate
      },
      items: {
        users: progress.usersCount || 0,
        databases: progress.databasesCount || 0,
        pages: progress.pagesCount || 0,
        blocks: progress.blocksCount || 0,
        comments: progress.commentsCount || 0,
        properties: 0,
        currentOperation: progress.currentOperation || "Initializing"
      },
      errors: {
        total: globalStats.totalErrors,
        list: (this.exporter as any).errors || []
      },
      retries: rateLimiterStats.retryStats,
      system: {
        uptime: Date.now() - this.startTime,
        memoryUsageMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        activeOperations: globalStats.activeOperations
      }
    };
  }

  private formatDisplay(stats: any): string {
    const lines: string[] = [];

    // Header
    lines.push("🚀 Notion Export - Real-time Dashboard");
    lines.push("═".repeat(80));
    lines.push("");

    // Current Operation
    lines.push(`📍 Current: ${stats.items.currentOperation}`);
    lines.push("");

    // Rate Limiting Section
    lines.push("📊 Rate Limiting & API Status");
    lines.push("─".repeat(40));
    lines.push(`   Concurrency Limit: ${stats.rateLimit.currentLimit}`);
    lines.push(`   API Quota Remaining: ${stats.rateLimit.remainingRequests} / ${stats.rateLimit.quotaLimit}`);
    lines.push(`   Quota Utilization: ${(stats.rateLimit.quotaUtilization * 100).toFixed(1)}%`);
    lines.push(`   Rate Reset Time: ${stats.rateLimit.resetTime.toLocaleTimeString()}`);
    lines.push(`   Adaptive Interval: ${stats.rateLimit.adaptiveInterval}ms`);
    lines.push("");

    // Performance Section
    lines.push("⚡ Performance Metrics");
    lines.push("─".repeat(40));
    lines.push(`   Operations/sec: ${stats.performance.operationsPerSecond.toFixed(2)}`);
    lines.push(`   Avg Response Time: ${stats.performance.avgResponseTime.toFixed(0)}ms`);
    lines.push(`   Success Rate: ${(stats.performance.successRate * 100).toFixed(1)}%`);
    lines.push(`   Error Rate: ${(stats.performance.errorRate * 100).toFixed(2)}%`);
    lines.push("");

    // Item Counts Section
    lines.push("📦 Content Processing");
    lines.push("─".repeat(40));
    if (stats.items.users > 0) lines.push(`   Users: ${stats.items.users}`);
    if (stats.items.databases > 0) lines.push(`   Databases: ${stats.items.databases}`);
    if (stats.items.pages > 0) lines.push(`   Pages: ${stats.items.pages}`);
    if (stats.items.blocks > 0) lines.push(`   Blocks: ${stats.items.blocks}`);
    if (stats.items.comments > 0) lines.push(`   Comments: ${stats.items.comments}`);
    lines.push("");

    // Errors Section
    lines.push("❌ Error Tracking");
    lines.push("─".repeat(40));
    lines.push(`   Total Errors: ${stats.errors.total}`);
    if (stats.errors.list.length > 0) {
      lines.push("   Recent errors:");
      stats.errors.list.slice(-3).forEach((error: any) => {
        lines.push(`     └─ ${error.type}: ${error.error}`);
      });
    }
    lines.push("");

    // Retries Section
    lines.push("🔄 Retry Statistics");
    lines.push("─".repeat(40));
    lines.push(`   Total Retry Attempts: ${stats.retries.totalAttempts}`);
    lines.push(`   Successful Retries: ${stats.retries.successfulRetries}`);
    lines.push(`   Failed Retries: ${stats.retries.failedRetries}`);
    lines.push(`   Retries/minute: ${stats.retries.retriesPerMinute}`);
    lines.push("");

    // System Section
    lines.push("💻 System Status");
    lines.push("─".repeat(40));
    const uptimeMinutes = Math.floor(stats.system.uptime / 60000);
    const uptimeSeconds = Math.floor((stats.system.uptime % 60000) / 1000);
    lines.push(`   Uptime: ${uptimeMinutes}m ${uptimeSeconds}s`);
    lines.push(`   Memory Usage: ${stats.system.memoryUsageMB}MB`);
    lines.push(`   Active Operations: ${stats.system.activeOperations}`);
    lines.push("");

    // Footer with timestamp
    lines.push("─".repeat(80));
    lines.push(`Last updated: ${new Date().toLocaleTimeString()}`);

    return lines.join("\n");
  }
}

/**
 * Export command with real-time monitoring.
 */
export default class ExportOptimized extends BaseCommand {
  static override description = "Export Notion workspace with real-time monitoring.";

  static override examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --format markdown",
    "<%= config.bin %> <%= command.id %> --concurrency 10",
    "<%= config.bin %> <%= command.id %> --flush"
  ];

  static override flags = {
    ...baseFlags,
    output: Flags.string({
      description: "Output directory to place exported artifacts.",
      default: `./notion-export-${new Date().toISOString().split("T")[0]}`
    }),
    format: Flags.string({
      description: "Export format(s).",
      options: ["json", "markdown", "csv"],
      multiple: true
    }),
    concurrency: Flags.integer({
      description: "Number of concurrent operations.",
      default: 5
    }),
    archived: Flags.boolean({
      description: "Export archived pages",
      default: true
    }),
    comments: Flags.boolean({
      description: "Export comments",
      default: true
    }),
    depth: Flags.integer({
      description: "Depth of nested pages to export",
      default: 10
    }),
    rate: Flags.integer({
      description: "Base rate limit delay in milliseconds",
      default: 100
    }),
    properties: Flags.boolean({
      description: "Export page properties",
      default: true
    }),
    retries: Flags.integer({
      description: "Number of retries for failed requests",
      default: 3
    }),
    size: Flags.integer({
      description: "Page size for API requests",
      default: 100
    }),
    flush: Flags.boolean({
      description: "Enable flush mode (outputting line-by-line logs)",
      default: false
    })
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ExportOptimized);

    // Initialize rate limiter and operation limiter
    const rateLimiter = new AdaptiveRateLimiter({
      initialConcurrency: flags.concurrency,
      maxConcurrency: flags.concurrency * 3,
      minConcurrency: 1
    });

    const operationLimiter = new OperationTypeAwareLimiter({
      pages: flags.concurrency,
      databases: Math.max(1, Math.floor(flags.concurrency * 0.6)),
      blocks: Math.min(20, flags.concurrency * 4),
      comments: flags.concurrency * 2,
      users: 25,
      properties: 15
    });

    // Create exporter config
    const exporterConfig = new ExporterConfig({
      ...flags,
      objects: flags.objects as ObjectType[]
    });

    // Create exporter with injected limiters
    const exporter = new Exporter(exporterConfig);

    // Inject the limiters into the exporter
    (exporter as any).rateLimiter = rateLimiter;
    (exporter as any).concurrencyLimiter = operationLimiter;

    // Set up event listeners to update rate limiter
    // Listen to all events and filter for API calls
    exporter.on("*", (event: string, data: any) => {
      // Only log events in flush mode to avoid interfering with real-time display
      // if (flags.flush) {
      console.log(
        `🔍 [${new Date().toLocaleTimeString()}] ====${event}:`,
        inspect(data, { depth: 2, colors: true, compact: true })
      );

      switch (event) {
        case "api-call":
          rateLimiter.recordRetryAttempt(true);
          break;
        case "retry":
          rateLimiter.recordRetryAttempt(false);
          break;
        default:
          throw new Error(`unknown event: ${event}`);
      }
      // }
      if (event === "api-call") {
        // Track API calls
        // rateLimiter.recordRetryAttempt(true);
        // if (data.headers) {
        //   rateLimiter.updateFromHeaders(data.headers, data.responseTime);
        // }
      }
    });

    exporter.on("retry", (data: any) => {
      console.log("retry", data);
      rateLimiter.recordRetryAttempt(false);
      if (flags.flush) {
        console.log(`🔄 [${new Date().toLocaleTimeString()}] Retry:`, data);
      }
    });

    // exporter.on("progress", (message: string) => {
    //   // Progress is tracked in the exporter's internal state
    //   if (flags.flush) {
    //     console.log(message);
    //     console.log(`${new Date().toLocaleTimeString()} 📈 [progress]: ${JSON.stringify(message)}`);
    //   }
    // });

    // Create display manager with flush mode
    const displayManager = new RealTimeDisplayManager(exporter, rateLimiter, operationLimiter, flags.flush);

    console.log(`${chalk.blue("🚀 Notion Export with Real-time Monitoring")}`);
    if (flags.flush) {
      console.log(`${chalk.gray("📄 Flush mode enabled - outputting line-by-line logs")}`);
    }
    console.log(`${chalk.gray("━".repeat(50))}`);
    console.log(`📁 Output: ${chalk.yellow(flags.output)}`);
    console.log(`🔄 Concurrency: ${chalk.yellow(flags.concurrency)}`);
    console.log(`${chalk.gray("━".repeat(50))}\n`);

    // Handle graceful shutdown
    process.on("SIGINT", () => {
      displayManager.stop();
      console.log(chalk.yellow("\n\n💾 Export interrupted! Progress and checkpoint data has been saved."));
      console.log(chalk.yellow("You can resume the export by running the command again with the --resume flag."));
      process.exit(0);
    });

    process.on("SIGTERM", () => {
      displayManager.stop();
      process.exit(0);
    });

    try {
      // Start real-time display.
      displayManager.start();

      // Run the export
      const result = await exporter.export();

      // Stop display and show results.
      displayManager.stop();

      console.log(`\n${chalk.green("✅ Export completed successfully!")}`);
      console.log(`${chalk.gray("━".repeat(50))}`);
      console.log(`📊 Export Summary:`);
      console.log(`   Users: ${result.usersCount}`);
      console.log(`   Databases: ${result.databasesCount}`);
      console.log(`   Pages: ${result.pagesCount}`);
      console.log(`   Blocks: ${result.blocksCount}`);
      console.log(`   Comments: ${result.commentsCount}`);
      console.log(`   Files: ${result.filesCount}`);
      console.log(`   Duration: ${((result.endTime.getTime() - result.startTime.getTime()) / 1000).toFixed(1)}s`);

      if (result.errors.length > 0) {
        console.log(`\n${chalk.yellow("⚠️  Errors encountered:")}`);
        result.errors.forEach((error) => {
          console.log(`   - ${error.type} ${error.id ? `(${error.id})` : ""}: ${error.error}`);
        });
      }
    } catch (error) {
      displayManager.stop();
      console.error(chalk.red("\n❌ Export failed:"), error);
      process.exit(1);
    }
  }
}
