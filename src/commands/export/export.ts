import { Client } from "@notionhq/client";
import { Flags } from "@oclif/core";
import chalk from "chalk";
import { config } from "dotenv";
import { createOptimizedExportCLI } from "../../../tmp/bad";
import { BaseCommand } from "../../lib/commands/base-command";
import { baseFlags } from "../../lib/commands/flags";

config({
  path: ".env",
  quiet: true
});

/**
 * Optimized export command with streaming, memory management, and resumability.
 */
export default class ExportOptimized extends BaseCommand {
  static override description = "Export Notion workspace with optimized streaming and memory management.";

  static override examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --format markdown",
    "<%= config.bin %> <%= command.id %> --resume",
    "<%= config.bin %> <%= command.id %> --memory 512",
    "<%= config.bin %> <%= command.id %> --concurrency 10"
  ];

  static override flags = {
    ...baseFlags,
    output: Flags.string({
      description: "Output directory for export",
      default: `./notion-export-optimized-${new Date().toISOString().split("T")[0]}`
    }),
    format: Flags.string({
      description: "Export format",
      options: ["json", "markdown", "csv"],
      default: "json"
    }),
    memory: Flags.integer({
      description: "Maximum memory usage in MB",
      default: 256
    }),
    concurrency: Flags.integer({
      description: "Number of concurrent operations",
      default: 8
    }),
    resume: Flags.boolean({
      description: "Resume a previous export",
      default: false
    }),
    "auto-tune": Flags.boolean({
      description: "Enable automatic performance tuning",
      default: true
    }),
    "checkpoint-interval": Flags.integer({
      description: "Checkpoint save interval in seconds",
      default: 30
    })
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ExportOptimized);

    // Initialize Notion client
    const notion = new Client({
      auth: flags.token
    });

    // Create optimized CLI
    const cli = createOptimizedExportCLI({
      outputPath: flags.output,
      format: flags.format as "json" | "markdown" | "csv",
      maxMemoryMB: flags.memory,
      concurrency: flags.concurrency,
      checkpointInterval: flags["checkpoint-interval"] * 1000
    });

    console.log(`${chalk.blue("🚀 Notion Optimized Export")}`);
    console.log(`${chalk.gray("━".repeat(50))}`);
    console.log(`📁 Output: ${chalk.yellow(flags.output)}`);
    console.log(`📄 Format: ${chalk.yellow(flags.format)}`);
    console.log(`💾 Memory Limit: ${chalk.yellow(flags.memory + "MB")}`);
    console.log(`🔄 Concurrency: ${chalk.yellow(flags.concurrency)}`);
    console.log(`${chalk.gray("━".repeat(50))}\n`);

    try {
      if (flags.resume) {
        await cli.resumeExport(notion);
      } else {
        await cli.startExport(notion);
      }

      // Show final metrics
      console.log(`\n${chalk.gray("━".repeat(50))}`);
      cli.showMetrics();
    } catch (error) {
      if (error instanceof Error && error.message.includes("No resumable export found")) {
        console.error(chalk.red("❌ No resumable export found. Start a new export without --resume flag."));
      } else {
        console.error(chalk.red("❌ Export failed:"), error);
        console.log(chalk.yellow("\n💡 Tip: You can resume this export using the --resume flag"));
      }
      process.exit(1);
    }

    // Auto-tune performance if enabled
    if (flags["auto-tune"]) {
      const autoTuneInterval = setInterval(() => {
        cli.autoTune();
      }, 60000); // Auto-tune every minute

      // Clean up interval on exit
      process.on("SIGINT", () => {
        clearInterval(autoTuneInterval);
        cli.pauseExport();
        process.exit(0);
      });

      process.on("SIGTERM", () => {
        clearInterval(autoTuneInterval);
        cli.pauseExport();
        process.exit(0);
      });
    }
  }
}
