import { Args, Command, Flags } from '@oclif/core';
import { NotionSyncApp } from '../application/notion-sync-app';
import { ExportCommandFactory } from '../application/commands/export-commands';
import { ExportConfiguration, ExportFormat, ApplicationConfig } from '../shared/types';
import { promises as fs } from 'fs';
import path from 'path';
import chalk from 'chalk';

export default class ExportNew extends Command {
  static override args = {
    output: Args.string({
      description: 'Output directory for exported files',
      required: true,
    }),
  };

  static override description = 'Export Notion content using the new event-driven architecture';

  static override examples = [
    '<%= config.bin %> <%= command.id %> ./exports',
    '<%= config.bin %> <%= command.id %> ./exports --databases db1,db2',
    '<%= config.bin %> <%= command.id %> ./exports --pages page1,page2',
    '<%= config.bin %> <%= command.id %> ./exports --format json',
  ];

  static override flags = {
    databases: Flags.string({
      char: 'd',
      description: 'Comma-separated list of database IDs to export',
      multiple: false,
    }),
    pages: Flags.string({
      char: 'p',
      description: 'Comma-separated list of page IDs to export',
      multiple: false,
    }),
    format: Flags.string({
      char: 'f',
      description: 'Export format',
      options: ['json', 'markdown', 'html', 'csv'],
      default: 'json',
    }),
    'include-blocks': Flags.boolean({
      description: 'Include block content in export',
      default: true,
    }),
    'include-comments': Flags.boolean({
      description: 'Include comments in export',
      default: false,
    }),
    'include-properties': Flags.boolean({
      description: 'Include all properties in export',
      default: true,
    }),
    resume: Flags.boolean({
      description: 'Resume a previous export if checkpoint exists',
      default: false,
    }),
    'max-concurrency': Flags.integer({
      description: 'Maximum number of concurrent requests',
      default: 10,
    }),
    'chunk-size': Flags.integer({
      description: 'Number of items to process in each chunk',
      default: 100,
    }),
    verbose: Flags.boolean({
      char: 'v',
      description: 'Enable verbose logging',
      default: false,
    }),
  };

  private app?: NotionSyncApp;

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(ExportNew);

    try {
      // Validate API key
      const apiKey = process.env.NOTION_API_KEY;
      if (!apiKey) {
        this.error('NOTION_API_KEY environment variable is required');
      }

      // Parse databases and pages
      const databases = flags.databases ? flags.databases.split(',').map(id => id.trim()) : [];
      const pages = flags.pages ? flags.pages.split(',').map(id => id.trim()) : [];

      if (databases.length === 0 && pages.length === 0) {
        this.error('At least one database or page must be specified');
      }

      // Create output directory
      const outputPath = path.resolve(args.output);
      await fs.mkdir(outputPath, { recursive: true });

      this.log(chalk.blue('🚀 Notion Sync - Event-Driven Architecture'));
      this.log(chalk.gray('━'.repeat(50)));
      this.log(`📁 Output: ${chalk.yellow(outputPath)}`);
      this.log(`🔄 Max Concurrency: ${chalk.yellow(flags['max-concurrency'])}`);
      this.log(`📦 Format: ${chalk.yellow(flags.format)}`);
      this.log(chalk.gray('━'.repeat(50)));

      // Create application configuration
      const appConfig: ApplicationConfig = {
        notion: {
          apiKey,
          apiVersion: '2022-06-28',
          baseUrl: 'https://api.notion.com',
          timeout: 30000,
          retryAttempts: 3
        },
        export: {
          defaultOutputPath: outputPath,
          defaultFormat: flags.format as ExportFormat,
          maxConcurrency: flags['max-concurrency'],
          chunkSize: flags['chunk-size'],
          enableResume: flags.resume
        },
        performance: {
          rateLimits: {
            pages: 10,
            blocks: 20,
            databases: 5,
            comments: 15,
            users: 5,
            properties: 10
          },
          circuitBreaker: {
            failureThreshold: 5,
            resetTimeout: 30000,
            monitoringPeriod: 60000
          },
          caching: {
            enabled: true,
            ttl: 300000, // 5 minutes
            maxSize: 1000
          }
        },
        logging: {
          level: flags.verbose ? 'debug' : 'info',
          format: 'text',
          outputs: ['console']
        }
      };

      // Create export configuration
      const exportConfiguration: ExportConfiguration = {
        outputPath,
        format: flags.format as ExportFormat,
        includeBlocks: flags['include-blocks'],
        includeComments: flags['include-comments'],
        includeProperties: flags['include-properties'],
        databases,
        pages,
      };

      // Initialize application
      this.log('🔧 Initializing application...');
      this.app = new NotionSyncApp(appConfig);
      await this.app.initialize();
      await this.app.start();

      // Set up progress monitoring
      this.setupProgressMonitoring();

      // Create export command
      const createCommand = ExportCommandFactory.createExport(exportConfiguration);
      
      this.log('📝 Creating export...');
      const createResult = await this.executeCommand(createCommand);
      
      if (!createResult.success) {
        throw createResult.error;
      }

      const exportId = createResult.data.exportId;
      this.log(`✅ Export created with ID: ${chalk.cyan(exportId)}`);

      // Start export
      const startCommand = ExportCommandFactory.startExport(exportId);
      
      this.log('🚀 Starting export...');
      const startResult = await this.executeCommand(startCommand);
      
      if (!startResult.success) {
        throw startResult.error;
      }

      // Wait for export completion
      await this.waitForExportCompletion(exportId);

      this.log(chalk.green('\n✅ Export completed successfully!'));
      this.log(`📁 Files saved to: ${chalk.yellow(outputPath)}`);

    } catch (error) {
      if (error instanceof Error) {
        this.error(chalk.red(`❌ Export failed: ${error.message}`));
      } else {
        this.error(chalk.red('❌ Export failed with unknown error'));
      }
    } finally {
      // Clean up
      if (this.app) {
        await this.app.destroy();
      }
    }
  }

  private setupProgressMonitoring(): void {
    if (!this.app) return;

    const controlPlane = this.app.getControlPlane();
    let lastProgress = 0;

    // Monitor domain events
    controlPlane.subscribe('domain-events', async (message) => {
      const event = message.payload;
      
      switch (event.type) {
        case 'export.progress.updated':
          const progress = event.payload.progress;
          
          // Only show progress updates every 10%
          const currentProgress = Math.floor(progress.percentage / 10) * 10;
          if (currentProgress > lastProgress) {
            this.log(`📊 Progress: ${currentProgress}% (${progress.processed}/${progress.total}) - ${progress.currentOperation}`);
            lastProgress = currentProgress;
          }
          
          if (progress.estimatedCompletion && progress.percentage > 10) {
            const eta = new Date(progress.estimatedCompletion);
            const now = new Date();
            const remainingMs = eta.getTime() - now.getTime();
            const remainingMin = Math.ceil(remainingMs / 60000);
            
            if (remainingMin > 0) {
              this.log(`⏱️  ETA: ${remainingMin} minutes`);
            }
          }
          break;

        case 'export.completed':
          const duration = event.payload.duration;
          const itemsProcessed = event.payload.itemsProcessed;
          const errors = event.payload.errors;
          
          this.log(chalk.green('\n🎉 Export Statistics:'));
          this.log(`   📦 Items processed: ${chalk.cyan(itemsProcessed)}`);
          this.log(`   ⏱️  Duration: ${chalk.cyan((duration / 1000).toFixed(1))}s`);
          this.log(`   🚀 Items/second: ${chalk.cyan((itemsProcessed / (duration / 1000)).toFixed(1))}`);
          
          if (errors.length > 0) {
            this.log(`   ⚠️  Errors: ${chalk.yellow(errors.length)}`);
          } else {
            this.log(`   ✅ No errors`);
          }
          break;

        case 'export.failed':
          const error = event.payload.error;
          this.error(chalk.red(`❌ Export failed: ${error.message}`));
          break;

        case 'notion.rate_limit.hit':
          const retryAfter = event.payload.retryAfter;
          this.log(chalk.yellow(`⏳ Rate limit hit. Waiting ${retryAfter} seconds...`));
          break;

        case 'circuit_breaker.opened':
          const breakerName = event.payload.name;
          this.log(chalk.yellow(`🔌 Circuit breaker opened for ${breakerName}. Requests temporarily blocked.`));
          break;

        case 'circuit_breaker.closed':
          const closedBreakerName = event.payload.name;
          this.log(chalk.green(`🔌 Circuit breaker closed for ${closedBreakerName}. Requests resumed.`));
          break;

        case 'progress.section.started':
          const section = event.payload.section;
          const totalItems = event.payload.totalItems;
          this.log(`📂 Starting section: ${chalk.cyan(section)} (${totalItems} items)`);
          break;

        case 'progress.section.completed':
          const completedSection = event.payload.section;
          const sectionDuration = event.payload.duration;
          const sectionErrors = event.payload.errors;
          this.log(`✅ Completed section: ${chalk.cyan(completedSection)} in ${(sectionDuration / 1000).toFixed(1)}s`);
          if (sectionErrors.length > 0) {
            this.log(`   ⚠️  Section errors: ${sectionErrors.length}`);
          }
          break;
      }
    });

    // Monitor metrics
    controlPlane.subscribe('metrics', async (message) => {
      const metric = message.payload;
      
      if (metric.type === 'message_failed') {
        this.log(chalk.red(`❌ Message failed: ${metric.messageType} - ${metric.error}`));
      }
    });
  }

  private async executeCommand(command: any): Promise<any> {
    if (!this.app) {
      throw new Error('Application not initialized');
    }

    const controlPlane = this.app.getControlPlane();
    
    // Publish command
    await controlPlane.publish('commands', command);

    // Wait for result
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Command timeout'));
      }, 30000); // 30 second timeout

      controlPlane.subscribe('command-results', async (message) => {
        const result = message.payload;
        
        if (result.commandId === command.id) {
          clearTimeout(timeout);
          resolve(result.result);
        }
      });
    });
  }

  private async waitForExportCompletion(exportId: string): Promise<void> {
    if (!this.app) {
      throw new Error('Application not initialized');
    }

    const controlPlane = this.app.getControlPlane();
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Export timeout (1 hour)'));
      }, 3600000); // 1 hour timeout

      controlPlane.subscribe('domain-events', async (message) => {
        const event = message.payload;
        
        if (event.aggregateId === exportId) {
          switch (event.type) {
            case 'export.completed':
              clearTimeout(timeout);
              resolve();
              break;
            case 'export.failed':
            case 'export.cancelled':
              clearTimeout(timeout);
              reject(new Error(`Export ${event.type.split('.')[1]}: ${event.payload.error?.message || event.payload.reason}`));
              break;
          }
        }
      });
    });
  }
}