/**
 * Export Command Handlers
 * 
 * Application layer command handlers for export operations
 */

import { Command, CommandResult, ExportConfiguration } from '../../shared/types';
import { ExportService } from '../../core/services/export-service';
import { ProgressService } from '../../core/services/progress-service';
import { ValidationError } from '../../shared/errors';

// Command Types
export interface CreateExportCommand extends Command {
  type: 'export.create';
  payload: {
    configuration: ExportConfiguration;
    userId?: string;
  };
}

export interface StartExportCommand extends Command {
  type: 'export.start';
  payload: {
    exportId: string;
  };
}

export interface CancelExportCommand extends Command {
  type: 'export.cancel';
  payload: {
    exportId: string;
    reason: string;
  };
}

export interface DeleteExportCommand extends Command {
  type: 'export.delete';
  payload: {
    exportId: string;
  };
}

export interface RestartExportCommand extends Command {
  type: 'export.restart';
  payload: {
    exportId: string;
  };
}

// Command Handlers
export class ExportCommandHandlers {
  constructor(
    private exportService: ExportService,
    private progressService: ProgressService
  ) {}

  async handleCreateExport(command: CreateExportCommand): Promise<CommandResult> {
    try {
      this.validateCreateExportCommand(command);
      
      const export_ = await this.exportService.createExport(command.payload.configuration);
      
      return {
        success: true,
        data: {
          exportId: export_.id,
          status: export_.status,
          configuration: export_.configuration
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error as Error
      };
    }
  }

  async handleStartExport(command: StartExportCommand): Promise<CommandResult> {
    try {
      this.validateStartExportCommand(command);
      
      await this.exportService.startExport(command.payload.exportId);
      await this.progressService.startTracking(command.payload.exportId);
      
      return {
        success: true,
        data: {
          exportId: command.payload.exportId,
          status: 'running'
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error as Error
      };
    }
  }

  async handleCancelExport(command: CancelExportCommand): Promise<CommandResult> {
    try {
      this.validateCancelExportCommand(command);
      
      await this.exportService.cancelExport(command.payload.exportId, command.payload.reason);
      this.progressService.stopTracking(command.payload.exportId);
      
      return {
        success: true,
        data: {
          exportId: command.payload.exportId,
          status: 'cancelled',
          reason: command.payload.reason
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error as Error
      };
    }
  }

  async handleDeleteExport(command: DeleteExportCommand): Promise<CommandResult> {
    try {
      this.validateDeleteExportCommand(command);
      
      await this.exportService.deleteExport(command.payload.exportId);
      
      return {
        success: true,
        data: {
          exportId: command.payload.exportId,
          deleted: true
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error as Error
      };
    }
  }

  async handleRestartExport(command: RestartExportCommand): Promise<CommandResult> {
    try {
      this.validateRestartExportCommand(command);
      
      const newExport = await this.exportService.restartExport(command.payload.exportId);
      
      return {
        success: true,
        data: {
          originalExportId: command.payload.exportId,
          newExportId: newExport.id,
          status: newExport.status
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error as Error
      };
    }
  }

  // Validation methods
  private validateCreateExportCommand(command: CreateExportCommand): void {
    if (!command.payload.configuration) {
      throw new ValidationError('Configuration is required');
    }

    const config = command.payload.configuration;
    
    if (!config.outputPath) {
      throw new ValidationError('Output path is required');
    }

    if (!config.format) {
      throw new ValidationError('Export format is required');
    }

    if (config.databases.length === 0 && config.pages.length === 0) {
      throw new ValidationError('At least one database or page must be specified');
    }

    // Validate database IDs format
    for (const databaseId of config.databases) {
      if (!this.isValidNotionId(databaseId)) {
        throw new ValidationError(`Invalid database ID format: ${databaseId}`);
      }
    }

    // Validate page IDs format
    for (const pageId of config.pages) {
      if (!this.isValidNotionId(pageId)) {
        throw new ValidationError(`Invalid page ID format: ${pageId}`);
      }
    }
  }

  private validateStartExportCommand(command: StartExportCommand): void {
    if (!command.payload.exportId) {
      throw new ValidationError('Export ID is required');
    }

    if (!this.isValidUuid(command.payload.exportId)) {
      throw new ValidationError('Invalid export ID format');
    }
  }

  private validateCancelExportCommand(command: CancelExportCommand): void {
    if (!command.payload.exportId) {
      throw new ValidationError('Export ID is required');
    }

    if (!command.payload.reason) {
      throw new ValidationError('Cancellation reason is required');
    }

    if (!this.isValidUuid(command.payload.exportId)) {
      throw new ValidationError('Invalid export ID format');
    }
  }

  private validateDeleteExportCommand(command: DeleteExportCommand): void {
    if (!command.payload.exportId) {
      throw new ValidationError('Export ID is required');
    }

    if (!this.isValidUuid(command.payload.exportId)) {
      throw new ValidationError('Invalid export ID format');
    }
  }

  private validateRestartExportCommand(command: RestartExportCommand): void {
    if (!command.payload.exportId) {
      throw new ValidationError('Export ID is required');
    }

    if (!this.isValidUuid(command.payload.exportId)) {
      throw new ValidationError('Invalid export ID format');
    }
  }

  private isValidNotionId(id: string): boolean {
    // Notion IDs are 32 character hex strings with dashes
    const notionIdRegex = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
    return notionIdRegex.test(id);
  }

  private isValidUuid(id: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
  }
}

// Command Factory
export class ExportCommandFactory {
  static createExport(configuration: ExportConfiguration, userId?: string): CreateExportCommand {
    return {
      id: crypto.randomUUID(),
      type: 'export.create',
      payload: { configuration, userId },
      metadata: { timestamp: new Date() }
    };
  }

  static startExport(exportId: string): StartExportCommand {
    return {
      id: crypto.randomUUID(),
      type: 'export.start',
      payload: { exportId },
      metadata: { timestamp: new Date() }
    };
  }

  static cancelExport(exportId: string, reason: string): CancelExportCommand {
    return {
      id: crypto.randomUUID(),
      type: 'export.cancel',
      payload: { exportId, reason },
      metadata: { timestamp: new Date() }
    };
  }

  static deleteExport(exportId: string): DeleteExportCommand {
    return {
      id: crypto.randomUUID(),
      type: 'export.delete',
      payload: { exportId },
      metadata: { timestamp: new Date() }
    };
  }

  static restartExport(exportId: string): RestartExportCommand {
    return {
      id: crypto.randomUUID(),
      type: 'export.restart',
      payload: { exportId },
      metadata: { timestamp: new Date() }
    };
  }
}