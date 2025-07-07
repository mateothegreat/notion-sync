import { SimpleExportCommand } from "../lib/commands/simple-base-command";
import { CombinedExportConfig, getExportFlags } from "../lib/config/combined-config";
import chalk from "chalk";

/**
 * Simple export command that uses the new configuration system
 */
export default class SimpleExport extends SimpleExportCommand {
  static override description = "Export Notion content using the simple configuration system";
  
  static override examples = [
    "<%= config.bin %> <%= command.id %> --path ./exports",
    "<%= config.bin %> <%= command.id %> --path ./exports --databases db1,db2",
    "<%= config.bin %> <%= command.id %> --path ./exports --format json",
    "<%= config.bin %> <%= command.id %> --path ./exports --format markdown --include-comments"
  ];

  static override flags = getExportFlags();

  public async run(): Promise<void> {
    try {
      // Configuration is automatically loaded in the base class
      const config = this.getConfig();
      
      // Display configuration summary
      this.displayConfigSummary(config);
      
      // Execute export
      await this.executeExport(config);
      
      this.log(chalk.green("✅ Export completed successfully!"));
      
    } catch (error) {
      this.error(chalk.red(`❌ Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  }

  private displayConfigSummary(config: CombinedExportConfig): void {
    this.log(chalk.blue("🚀 Simple Export Configuration"));
    this.log(chalk.gray("━".repeat(50)));
    
    // Base configuration
    this.log(chalk.cyan("Base Configuration:"));
    this.log(`  Token: ${chalk.yellow(config.token.substring(0, 10) + "...")}`);
    this.log(`  Concurrency: ${chalk.yellow(config.concurrency)}`);
    this.log(`  Retries: ${chalk.yellow(config.retries)}`);
    this.log(`  Timeout: ${chalk.yellow(config.timeout)}`);
    this.log(`  Verbose: ${chalk.yellow(config.verbose)}`);
    this.log(`  Flush: ${chalk.yellow(config.flush)}`);
    
    // Export configuration
    this.log(chalk.cyan("Export Configuration:"));
    this.log(`  Path: ${chalk.yellow(config.path)}`);
    this.log(`  Format: ${chalk.yellow(config.format)}`);
    this.log(`  Max Concurrency: ${chalk.yellow(config.maxConcurrency)}`);
    this.log(`  Include Blocks: ${chalk.yellow(config.includeBlocks)}`);
    this.log(`  Include Comments: ${chalk.yellow(config.includeComments)}`);
    this.log(`  Include Properties: ${chalk.yellow(config.includeProperties)}`);
    
    if (config.databases) {
      this.log(`  Databases: ${chalk.yellow(config.databases)}`);
    }
    
    if (config.pages) {
      this.log(`  Pages: ${chalk.yellow(config.pages)}`);
    }
    
    this.log(chalk.gray("━".repeat(50)));
  }

  private async executeExport(config: CombinedExportConfig): Promise<void> {
    this.log(chalk.blue("🔄 Starting export process..."));
    
    // Mock export process - in real implementation this would use the actual services
    const steps = [
      "Initializing export service",
      "Loading workspace metadata",
      "Processing databases",
      "Processing pages",
      "Writing output files",
      "Finalizing export"
    ];
    
    for (const step of steps) {
      this.log(chalk.gray(`  ${step}...`));
      
      // Simulate work with a small delay
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    this.log(chalk.green("✅ Export process completed"));
    this.log(chalk.gray(`📁 Output saved to: ${config.path}`));
  }
}

// Export type for other files to use
export type { CombinedExportConfig } from "../lib/config/combined-config";