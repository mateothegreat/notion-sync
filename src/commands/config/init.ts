import { Command, Flags } from "@oclif/core";
import * as fs from "fs/promises";
import { getCommandFlags } from "../../lib/config/simple-config";
import { generateConfigYaml } from "../../lib/config/config-loader";

export default class Init extends Command {
  static override description = "Initialize a new Notion Sync project configuration file";
  static override examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --full",
    "<%= config.bin %> <%= command.id %> --output ./my-config.yaml"
  ];

  /**
   * Init command doesn't need the full configuration system,
   * just basic flags for generating the config file.
   */
  static override flags = {
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
    const { args, flags } = await this.parse(Init);

    try {
      // Check if file exists
      if (!flags.force) {
        try {
          await fs.access(flags.output);
          this.error(`Configuration file already exists at ${flags.output}. Use --force to overwrite.`);
        } catch {
          // File doesn't exist, we can proceed
        }
      }

      // For now, generate using the old system
      // TODO: Create a new config generator that uses the simple-config system
      await generateConfigYaml(flags.output, flags.full);

      this.log(`✅ Configuration file created at: ${flags.output}`);
      this.log("\nNext steps:");
      this.log("1. Edit the configuration file with your Notion API token");
      this.log("2. Run 'notion-sync export' to start exporting your Notion content");
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to create configuration file: ${error.message}`);
      } else {
        this.error("Failed to create configuration file");
      }
    }
  }
}
