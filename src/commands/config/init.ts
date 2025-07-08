import { Command, Flags } from "@oclif/core";
import * as fs from "fs/promises";
import { createCommandFlags } from "../../lib/config/loader";

export default class Init extends Command {
  static override description = "Initialize a new Notion Sync project configuration file";
  static override examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --full",
    "<%= config.bin %> <%= command.id %> --output ./my-config.yaml"
  ];

  /**
   * Export-specific flags extracted dynamically based on command name.
   * This automatically includes all global flags (*) and export-specific flags.
   */
  static override flags = {
    ...createCommandFlags("init"),
    full: Flags.boolean({
      description: "Generate a full configuration file with all available options",
      default: false,
      exclusive: ["minimal"]
    }),
    minimal: Flags.boolean({
      description: "Generate a minimal configuration file with essential settings only (default)",
      default: true,
      exclusive: ["full"]
    }),
    output: Flags.string({
      char: "o",
      description: "Output path for the configuration file",
      default: "./notion-sync.yaml"
    }),
    force: Flags.boolean({
      char: "f",
      description: "Overwrite existing configuration file",
      default: false
    })
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(Init);

    // Check if file already exists
    try {
      await fs.access(flags.output);
      if (!flags.force) {
        this.error(`Configuration file already exists at ${flags.output}. Use --force to overwrite.`);
      }
    } catch {
      // File doesn't exist, which is what we want
    }

    this.log(`Initializing Notion Sync configuration file...`);
    // const config = new Config<"export">({
    //   path: "./exports",
    //   format: ExportFormat.JSON,
    //   databases: [{ name: "Database 1", id: "1234567890" }],
    //   pages: [{ name: "Page 1", id: "1234567890" }],
    //   "max-concurrency": 10,
    //   "include-archived": false,
    //   "include-comments": false,
    //   "include-properties": false,
    //   "include-blocks": false,
    //   retries: 3,
    //   timeout: 10000,
    //   token: "your-notion-api-token",
    //   verbose: false,
    //   flush: false,
    //   concurrency: 10,
    //   output: "./exports"
    // });

    // await fs.writeFile(flags.output, config.toYaml());
    // this.log(`✅ Configuration file created at: ${flags.output}`);
  }
}
