import { BaseCommand } from "$lib/commands/base-command";
import { Exporter } from "$lib/export/exporter";
import { StreamingExportManager } from "$lib/export/manager";
import { DebugLogger, getDateString, LogLevel, RateTracker } from "$lib/export/util";
import { Flags } from "@oclif/core";
import chalk from "chalk";
import { config } from "dotenv";
import fs from "fs";
import ora, { Ora } from "ora";
import path from "path";

config({
  quiet: true
});

let spinner: Ora | null = null;
let exporter: Exporter | null = null;
let isExiting = false;
let debugLogger: DebugLogger | null = null;

class SimpleDisplayManager {
  private lastDebugLines: string[] = [];
  private maxDebugLines: number;

  constructor(maxDebugLines: number = 5) {
    this.maxDebugLines = maxDebugLines;
  }

  update(spinner: Ora | null, debugLines: string[], spinnerText: string): void {
    if (!spinner || !process.stdout.isTTY) {
      if (spinner) {
        spinner.text = spinnerText;
      }
      return;
    }

    // Get only the new debug lines that haven't been displayed yet
    const newLines = debugLines.slice(this.lastDebugLines.length);

    if (newLines.length > 0) {
      // Temporarily stop the spinner
      spinner.stop();

      // Print new debug lines above where the spinner will be
      newLines.forEach((line) => {
        console.log(line);
      });

      // Keep only the last N lines in memory
      this.lastDebugLines = debugLines.slice(-this.maxDebugLines);
    }

    // Update and restart the spinner
    spinner.text = spinnerText;
    spinner.start();
  }
}

// Alternative: Use log file approach for debug output
class FileDebugLogger {
  private logStream: NodeJS.WritableStream | null = null;
  private logFile: string;

  constructor(outputDir: string) {
    fs.mkdirSync(outputDir, { recursive: true });
    this.logFile = path.join(outputDir, "export-debug.log");
    this.logStream = fs.createWriteStream(this.logFile, { flags: "a" });
    this.logStream.write(`${new Date().toISOString()}: Debug logging started.\n`);
  }

  write(message: string): void {
    if (this.logStream) {
      this.logStream.write(`${new Date().toISOString()}: ${message}\n`);
    }
  }

  close(): void {
    if (this.logStream) {
      this.logStream.end();
    }
  }

  getLogFile(): string {
    return this.logFile;
  }
}

let displayManager: SimpleDisplayManager | null = null;
let fileLogger: FileDebugLogger | null = null;

export default class Export extends BaseCommand {
  static override description = "Export a Notion workspace to a local directory.";
  static override examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --token <token>",
    "<%= config.bin %> <%= command.id %> --resume",
    "<%= config.bin %> <%= command.id %> --debug",
    "<%= config.bin %> <%= command.id %> --verbose"
  ];
  static override flags = {
    token: Flags.string({
      description: "Notion API integration token.",
      default: async () => {
        const token = process.env.NOTION_TOKEN;
        if (!token) {
          throw new Error("NOTION_TOKEN is not set");
        }
        return token;
      },
      env: "NOTION_TOKEN"
      // required: true,
    }),
    output: Flags.string({
      description: "Output directory",
      default: `./notion-export-${getDateString()}`
    }),
    archived: Flags.boolean({
      description: "Include archived pages and databases.",
      default: true,
      allowNo: true
    }),
    concurrency: Flags.integer({
      description: "Number of concurrent operations.",
      default: 5 // Reduced from 10
    }),
    depth: Flags.integer({
      description: "Maximum depth for recursive block fetching.",
      default: 10
    }),
    comments: Flags.boolean({
      description: "Include comments when exporting pages.",
      default: true,
      allowNo: true
    }),
    rate: Flags.integer({
      description: "Delay between API calls in milliseconds.",
      default: 2000 // Increased from 1000
    }),
    size: Flags.integer({
      description: "Page size for pagination.",
      default: 25 // Reduced from 10 for better performance
    }),
    retries: Flags.integer({
      description: "Maximum number of retries for failed operations.",
      default: 5 // Increased from 3
    }),
    properties: Flags.boolean({
      description: "Export page properties.",
      default: true,
      allowNo: true
    }),
    timeout: Flags.integer({
      description: "Operation timeout in milliseconds.",
      default: 60_000 // Increased from 30_000
    }),
    resume: Flags.boolean({
      description: "Resume a previous export if progress file exists.",
      default: false
    }),
    debug: Flags.boolean({
      description: "Enable debug logging to see detailed operation information.",
      default: false
    }),
    verbose: Flags.boolean({
      description: "Enable verbose logging for maximum detail.",
      default: false
    }),
    "debug-console": Flags.boolean({
      description: "Show debug logs in console (can be messy, prefer --debug which logs to file).",
      default: false,
      hidden: true
    })
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Export);

    // Set up debug logger
    let logLevel = LogLevel.INFO;
    if (flags.verbose) {
      logLevel = LogLevel.VERBOSE;
    } else if (flags.debug) {
      logLevel = LogLevel.DEBUG;
    }

    // Initialize file logger for debug output
    if (flags.debug || flags.verbose) {
      fileLogger = new FileDebugLogger(flags.output);
    }

    // Only use console debug logger if explicitly requested
    if (flags["debug-console"]) {
      debugLogger = new DebugLogger(logLevel, 100, flags.verbose ? 10 : 5);
      displayManager = new SimpleDisplayManager(flags.verbose ? 10 : 5);
    }

    // Handle graceful shutdown
    const cleanup = async () => {
      if (isExiting) return;
      isExiting = true;

      if (spinner) {
        spinner.fail(chalk.yellow("Export interrupted"));
        spinner = null;
      }

      if (exporter) {
        console.log(chalk.yellow("\n⏸  Saving progress..."));
        // The exporter will save progress automatically on error
      }

      if (fileLogger) {
        fileLogger.close();
      }

      console.log(chalk.yellow("You can resume this export later with the --resume flag"));
      process.exit(1);
    };

    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);

    console.log(chalk.green("🚀 Starting Notion workspace export..."));
    console.log(chalk.blue(`📁 Output directory: ${chalk.cyan(flags.output)}`));
    console.log(chalk.blue(`⚙️  Options:`));
    console.log(chalk.gray(`   - Output directory: ${chalk.white(flags.output)}`));
    console.log(chalk.gray(`   - Include archived: ${chalk.white(flags.archived)}`));
    console.log(chalk.gray(`   - Max depth: ${chalk.white(flags.depth)}`));
    console.log(chalk.gray(`   - Include comments: ${chalk.white(flags.comments)}`));
    console.log(chalk.gray(`   - Rate limit delay: ${chalk.white(flags.rate)} ms`));
    console.log(chalk.gray(`   - Concurrency: ${chalk.white(flags.concurrency)} parallel operations`));
    console.log(chalk.gray(`   - Operation timeout: ${chalk.white(flags.timeout / 1000)}s`));
    console.log(chalk.gray(`   - Resume mode: ${chalk.white(flags.resume)}`));
    console.log(chalk.gray(`   - Debug mode: ${chalk.white(flags.debug || flags.verbose)}`));

    if (flags.debug || flags.verbose) {
      console.log(chalk.dim(`   - Log level: ${chalk.white(flags.verbose ? "VERBOSE" : "DEBUG")}`));
      if (fileLogger) {
        console.log(chalk.dim(`   - Debug log: ${chalk.white(fileLogger.getLogFile())}`));
      }
    }

    console.log(chalk.dim("\n💡 Press Ctrl+C to cancel at any time (progress will be saved)\n"));

    // Create spinner with isEnabled flag to prevent interference with signals.
    spinner = ora({
      text: "Initializing export...",
      // Disable spinner in non-TTY environments (helps with signal handling).
      isEnabled: process.stdout.isTTY,
      color: "cyan"
    }).start();

    let lastUpdate = Date.now();
    const rateTracker = new RateTracker();
    let startTime = new Date();

    try {
      exporter = new Exporter({
        token: flags.token,
        output: flags.output
      });

      // Handle debug events
      exporter.on("debug", (message: string) => {
        if (fileLogger) {
          fileLogger.write(`[DEBUG] ${message}`);
        }
        if (debugLogger) {
          debugLogger.debug(message);
        }
      });

      // Handle resumed event
      exporter.on("resumed", (progress) => {
        const resumeMsg1 = `Resumed from ${progress.timestamp}`;
        const resumeMsg2 = `Previously exported: ${progress.pagesCount} pages, ${progress.blocksCount} blocks`;

        if (fileLogger) {
          fileLogger.write(`[INFO] [Resume] ${resumeMsg1}`);
          fileLogger.write(`[INFO] [Resume] ${resumeMsg2}`);
        }

        if (debugLogger) {
          debugLogger.info(resumeMsg1, "Resume");
          debugLogger.info(resumeMsg2, "Resume");
        }

        if (spinner) {
          spinner.succeed(chalk.green("Resumed previous export"));
          spinner = ora({
            text: "Continuing export...",
            isEnabled: process.stdout.isTTY,
            color: "cyan"
          }).start();
        }
      });

      // Set up progress tracking with rates
      if (!flags.silent) {
        exporter.on("progress", (progress) => {
          if (isExiting) return;

          // Calculate rates
          const rates = {
            pagesPerSecond: rateTracker.updateMetric("pages", progress.pagesCount),
            blocksPerSecond: rateTracker.updateMetric("blocks", progress.blocksCount),
            databasesPerSecond: rateTracker.updateMetric("databases", progress.databasesCount),
            commentsPerSecond: rateTracker.updateMetric("comments", progress.commentsCount)
          };

          // Only update every second to avoid overwhelming the console
          const now = Date.now();
          if (now - lastUpdate >= 1000) {
            const elapsedTime = Math.floor((now - startTime.getTime()) / 1000);
            const timeStr = formatDuration(elapsedTime);

            const spinnerText =
              `${chalk.bold(progress.currentOperation)} | ` +
              chalk.gray(`Runtime: ${chalk.cyan(timeStr)} | `) +
              chalk.gray(
                `Pages: ${chalk.cyan(progress.pagesCount)} (${chalk.green(
                  RateTracker.formatRate(rates.pagesPerSecond)
                )}) | `
              ) +
              chalk.gray(
                `DBs: ${chalk.cyan(progress.databasesCount)} (${chalk.green(
                  RateTracker.formatRate(rates.databasesPerSecond)
                )}) | `
              ) +
              chalk.gray(
                `Blocks: ${chalk.cyan(progress.blocksCount)} (${chalk.green(
                  RateTracker.formatRate(rates.blocksPerSecond)
                )}) | `
              ) +
              chalk.gray(
                `Comments: ${chalk.cyan(progress.commentsCount)} (${chalk.green(
                  RateTracker.formatRate(rates.commentsPerSecond)
                )})` + `\n`
              );

            if (displayManager && debugLogger) {
              displayManager.update(spinner, debugLogger.getFormattedDisplay(), spinnerText);
            } else if (spinner) {
              spinner.text = spinnerText;
            }

            lastUpdate = now;
          }
        });

        // Add additional debug events
        exporter.on("api-call", (info: { operation: string; params: any }) => {
          if (flags.verbose) {
            const msg = `API: ${info.operation}`;
            if (fileLogger) {
              fileLogger.write(`[VERBOSE] [API] ${msg}`);
            }
            if (debugLogger) {
              debugLogger.verbose(msg, "API");
            }
          }
        });

        exporter.on("rate-limit", (info: { waitTime: number }) => {
          const msg = `Rate limit: waiting ${info.waitTime}ms`;
          if (fileLogger) {
            fileLogger.write(`[DEBUG] [RateLimit] ${msg}`);
          }
          if (debugLogger) {
            debugLogger.debug(msg, "RateLimit");
          }
        });

        exporter.on("retry", (info: { operation: string; attempt: number; maxRetries: number; error: string }) => {
          const msg = `Retry ${info.attempt}/${info.maxRetries}: ${info.operation} - ${info.error}`;
          if (fileLogger) {
            fileLogger.write(`[WARN] [Retry] ${msg}`);
          }
          if (debugLogger) {
            debugLogger.warn(msg, "Retry");
          }
        });

        exporter.on("circuit-breaker", (info: { state: string; operation?: string }) => {
          const msg = `Circuit breaker ${info.state}: ${info.operation || "N/A"}`;
          if (fileLogger) {
            fileLogger.write(`[WARN] [CircuitBreaker] ${msg}`);
          }
          if (debugLogger) {
            debugLogger.warn(msg, "CircuitBreaker");
          }
        });
      }

      const result = await exporter.export();
      // Stop spinner before final output.
      if (spinner && !flags.silent) {
        spinner.stop();
        spinner = null;
      }

      const duration = (result.endTime.getTime() - result.startTime.getTime()) / 1000;
      if (!flags.silent) {
        console.log(chalk.green("\n✅ Export completed successfully!"));
        console.log(chalk.bold("\n📊 Export Summary:"));
        console.log(chalk.gray(`   - Users exported: ${chalk.cyan(result.usersCount)}`));
        console.log(chalk.gray(`   - Databases exported: ${chalk.cyan(result.databasesCount)}`));
        console.log(chalk.gray(`   - Pages exported: ${chalk.cyan(result.pagesCount)}`));
        console.log(chalk.gray(`   - Blocks exported: ${chalk.cyan(result.blocksCount)}`));
        console.log(chalk.gray(`   - Comments exported: ${chalk.cyan(result.commentsCount)}`));
        console.log(chalk.gray(`   - Files referenced: ${chalk.cyan(result.filesCount)}`));
        console.log(chalk.gray(`   - Duration: ${chalk.cyan(duration.toFixed(1))}s`));

        if (result.errors.length > 0) {
          console.log(chalk.yellow(`\n⚠️  Errors encountered (${result.errors.length}):`));
          const errorsByType = result.errors.reduce((acc, error) => {
            acc[error.type] = (acc[error.type] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);

          Object.entries(errorsByType).forEach(([type, count]) => {
            console.log(chalk.red(`   - ${type}: ${count} errors`));
          });

          console.log(chalk.yellow("\nFirst 10 errors:"));
          result.errors.slice(0, 10).forEach((error) => {
            console.error(chalk.red(`   - [${error.type}] ${error.id || "N/A"}: ${error.error}`));
          });
        }

        console.log(chalk.blue(`\n📁 All data saved to: ${chalk.cyan(flags.output)}`));
        console.log(
          chalk.green(`\n🚄 Performance: Processed with ${chalk.cyan(flags.concurrency)} concurrent operations`)
        );

        if (flags.debug || flags.verbose) {
          console.log(chalk.dim(`\n📊 Debug Summary:`));
          if (fileLogger) {
            console.log(chalk.dim(`   - Debug log: ${chalk.white(fileLogger.getLogFile())}`));
          }
          console.log(chalk.dim(`   - API calls made: Check debug logs`));
          console.log(chalk.dim(`   - Rate limit delays: Check debug logs`));
          console.log(chalk.dim(`   - Circuit breaker state: ${exporter["circuitBreaker"]?.getState() || "N/A"}`));
        }
      }

      if (fileLogger) {
        fileLogger.close();
      }
    } catch (error) {
      if (spinner && !flags.silent) {
        spinner.fail(chalk.red("Export failed"));
        spinner = null;
      }

      if (!isExiting && !flags.silent) {
        console.error(chalk.red("\n❌ Export failed:"), error);
        console.log(chalk.yellow("\n💾 Progress has been saved. You can resume with:"));
        console.log(chalk.cyan(`   ${process.argv[1]} export --resume --output "${flags.output}"`));

        if (fileLogger) {
          fileLogger.close();
        }

        process.exit(1);
      }
    }
  }
}

/**
 * Format duration in a human-readable format.
 */
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${remainingSeconds}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  } else {
    return `${remainingSeconds}s`;
  }
}

const manager = new StreamingExportManager(
  "export-id",
  "./output",
  100 * 1024 * 1024, // 100MB memory limit
  15000, // 15s checkpoints
  { pages: 5, blocks: 20, databases: 3 } // Custom concurrency
);
