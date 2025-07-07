import { Command, Flags } from "@oclif/core";
import * as fs from "fs/promises";
import { createCommandFlags, generateConfigYaml } from "../../lib/config/config-loader";

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

    try {
      if (flags.full) {
        await generateConfigYaml(flags.output, true);
        this.log(`✅ Full configuration file created at: ${flags.output}`);
        this.log(`\nNext steps:`);
        this.log(`1. Edit ${flags.output} and add your Notion integration token`);
        this.log(`2. Add your database and page IDs`);
        this.log(`3. Customize any other settings as needed`);
        this.log(`4. Run 'notion-sync export' to start exporting your Notion data`);
      } else {
        await generateConfigYaml(flags.output);
        this.log(`✅ Minimal configuration file created at: ${flags.output}`);
        this.log(`\nNext steps:`);
        this.log(`1. Edit ${flags.output} and replace the placeholder values:`);
        this.log(`   - Add your Notion integration token`);
        this.log(`   - Add your database ID(s)`);
        this.log(`2. Run 'notion-sync export' to start exporting your Notion data`);
        this.log(`\nFor more configuration options, run: notion-sync config init --full`);
      }
    } catch (error) {
      this.error(`Failed to create configuration file: ${error instanceof Error ? error.message : error}`);
    }
  }
}
