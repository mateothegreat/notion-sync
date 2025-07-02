import { BaseCommand } from "$lib/commands/base-command";
import { baseFlags } from "$lib/commands/flags";
import { getDateString } from "$lib/util";
import { Flags } from "@oclif/core";
import chalk from "chalk";
import { inspect } from "util";

export default class ConfigDump extends BaseCommand {
  static override description = "Dump the configuration.";
  static override examples = ["<%= config.bin %> <%= command.id %>"];
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
      default: 10
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
      default: 1000
    }),
    size: Flags.integer({
      description: "Page size for pagination.",
      default: 10
    }),
    retries: Flags.integer({
      description: "Maximum number of retries for failed operations.",
      default: 3
    }),
    properties: Flags.boolean({
      description: "Export page properties.",
      default: true,
      allowNo: true
    }),
    timeout: Flags.integer({
      description: "Operation timeout in milliseconds.",
      default: 30_000
    })
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ConfigDump);
    this.log(`${chalk.blue("Loaded Configuration:")}`);
    this.log(
      inspect(flags, {
        depth: null,
        colors: true,
        sorted: true
      })
    );
  }
}
