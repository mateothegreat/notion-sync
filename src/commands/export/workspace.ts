import { Flags } from "@oclif/core";
import { BaseCommand } from "../../lib/commands/base-command";
import { baseFlags } from "../../lib/commands/flags";
import { NotionExportManager } from "../../lib/export-manager";
import { getDateString } from "../../lib/export/util";

/**
 * Export Notion workspace with high-performance streaming and resumability.
 */
export default class ExportWorkspace extends BaseCommand {
  static override description = "Export entire Notion workspace with high-performance streaming.";

  static override examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --output ./my-export",
    "<%= config.bin %> <%= command.id %> --concurrency 20 --memory-limit 100",
    "<%= config.bin %> <%= command.id %> --resume export-1234567890"
  ];

  static override flags = {
    ...baseFlags,
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
      default: 10,
      min: 1,
      max: 50
    }),
    depth: Flags.integer({
      description: "Maximum depth for recursive block fetching.",
      default: 10,
      min: 0,
      max: 100
    }),
    comments: Flags.boolean({
      description: "Include comments when exporting pages.",
      default: true,
      allowNo: true
    }),
    rate: Flags.integer({
      description: "Base delay between API calls in milliseconds.",
      default: 1000,
      min: 100
    }),
    size: Flags.integer({
      description: "Page size for pagination.",
      default: 10,
      min: 1,
      max: 100
    }),
    retries: Flags.integer({
      description: "Maximum number of retries for failed operations.",
      default: 3,
      min: 0,
      max: 10
    }),
    properties: Flags.boolean({
      description: "Export page properties.",
      default: true,
      allowNo: true
    }),
    timeout: Flags.integer({
      description: "Operation timeout in milliseconds.",
      default: 30_000,
      min: 5000
    }),
    "memory-limit": Flags.integer({
      description: "Memory limit in MB for bounded processing.",
      default: 100,
      min: 10,
      max: 1000
    }),
    "checkpoint-interval": Flags.integer({
      description: "Checkpoint save interval in milliseconds.",
      default: 30_000,
      min: 5000
    }),
    resume: Flags.string({
      description: "Resume from a previous export ID.",
      required: false
    })
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ExportWorkspace);

    // Convert memory limit to bytes
    const memoryLimitBytes = flags["memory-limit"] * 1024 * 1024;

    // Create export manager
    const exportManager = new NotionExportManager(
      flags.token,
      {
        outputDir: flags.output,
        archived: flags.archived,
        concurrency: flags.concurrency,
        depth: flags.depth,
        comments: flags.comments,
        rate: flags.rate,
        size: flags.size,
        retries: flags.retries,
        properties: flags.properties,
        timeout: flags.timeout,
        memoryLimit: memoryLimitBytes,
        checkpointInterval: flags["checkpoint-interval"]
      },
      flags.resume
    );

    try {
      // Initialize (will resume if checkpoint exists)
      await exportManager.initialize();

      // Run export
      await exportManager.exportWorkspace();
    } catch (error) {
      // Error handling is done within the export manager
      // Just re-throw to let CLI framework handle it
      throw error;
    }
  }
}
