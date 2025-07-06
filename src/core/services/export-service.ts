/**
 * Export Service
 *
 * Core business logic for managing exports
 */

import { ExportAlreadyRunningError, ExportError, ExportNotFoundError } from "../../shared/errors/index";
import { ExportConfiguration } from "../../shared/types/index";
import { Export, ExportFactory, ExportRepository } from "../domain/export";
import { ExportEvents } from "../events/index";

export class ExportService {
  constructor(private exportRepository: ExportRepository, private eventPublisher: (event: any) => Promise<void>) {}

  async createExport(configuration: ExportConfiguration): Promise<Export> {
    // Validate configuration
    this.validateConfiguration(configuration);

    // Check for existing running exports with same configuration
    const runningExports = await this.exportRepository.findRunning();
    const conflictingExport = runningExports.find((exp) =>
      this.configurationsConflict(exp.configuration, configuration)
    );

    if (conflictingExport) {
      throw new ExportAlreadyRunningError(`Export already running for similar configuration: ${conflictingExport.id}`);
    }

    // Create new export
    const export_ = ExportFactory.create(configuration);
    await this.exportRepository.save(export_);

    // Publish event
    await this.eventPublisher(ExportEvents.started(export_.id, configuration));

    return export_;
  }

  async startExport(id: string): Promise<void> {
    const export_ = await this.getExport(id);

    export_.start();
    await this.exportRepository.save(export_);

    // Publish progress event
    await this.eventPublisher(ExportEvents.progressUpdated(export_.id, export_.progress));
  }

  async cancelExport(id: string, reason: string): Promise<void> {
    const export_ = await this.getExport(id);

    if (!export_.isRunning()) {
      throw new ExportError(`Cannot cancel export in ${export_.status} status`);
    }

    export_.cancel(reason);
    await this.exportRepository.save(export_);

    // Publish event
    await this.eventPublisher(ExportEvents.cancelled(export_.id, reason, export_.progress));
  }

  async getExport(id: string): Promise<Export> {
    const export_ = await this.exportRepository.findById(id);
    if (!export_) {
      throw new ExportNotFoundError(`Export not found: ${id}`);
    }
    return export_;
  }

  async listExports(limit?: number, offset?: number): Promise<Export[]> {
    return this.exportRepository.list(limit, offset);
  }

  async getRunningExports(): Promise<Export[]> {
    return this.exportRepository.findRunning();
  }

  async updateExportProgress(id: string, progress: Partial<any>): Promise<void> {
    const export_ = await this.getExport(id);

    export_.updateProgress(progress);
    await this.exportRepository.save(export_);

    // Publish progress event
    await this.eventPublisher(ExportEvents.progressUpdated(export_.id, export_.progress));
  }

  async completeExport(id: string, outputPath: string): Promise<void> {
    const export_ = await this.getExport(id);

    export_.complete(outputPath);
    await this.exportRepository.save(export_);

    // Publish completion event
    const duration = export_.getDuration() || 0;
    await this.eventPublisher(
      ExportEvents.completed(export_.id, outputPath, duration, export_.progress.processed, export_.progress.errors)
    );
  }

  async failExport(id: string, error: any): Promise<void> {
    const export_ = await this.getExport(id);

    const errorInfo = {
      id: crypto.randomUUID(),
      message: error.message,
      code: error.code || "UNKNOWN_ERROR",
      timestamp: new Date(),
      context: error.context,
      stack: error.stack
    };

    export_.fail(errorInfo);
    await this.exportRepository.save(export_);

    // Publish failure event
    await this.eventPublisher(ExportEvents.failed(export_.id, errorInfo, export_.progress));
  }

  async deleteExport(id: string): Promise<void> {
    const export_ = await this.getExport(id);

    if (export_.isRunning()) {
      throw new ExportError("Cannot delete running export");
    }

    await this.exportRepository.delete(id);
  }

  async restartExport(id: string): Promise<Export> {
    const export_ = await this.getExport(id);

    if (!export_.canBeRestarted()) {
      throw new ExportError(`Cannot restart export in ${export_.status} status`);
    }

    // Create new export with same configuration
    const newExport = ExportFactory.create(export_.configuration);
    await this.exportRepository.save(newExport);

    // Publish event
    await this.eventPublisher(ExportEvents.started(newExport.id, newExport.configuration));

    return newExport;
  }

  private validateConfiguration(configuration: ExportConfiguration): void {
    if (!configuration.outputPath) {
      throw new ExportError("Output path is required");
    }

    if (configuration.databases.length === 0 && configuration.pages.length === 0) {
      throw new ExportError("At least one database or page must be specified");
    }

    // Validate paths exist and are accessible
    // This would typically involve filesystem checks
  }

  private configurationsConflict(config1: ExportConfiguration, config2: ExportConfiguration): boolean {
    // Check if configurations would write to the same output path
    if (config1.outputPath === config2.outputPath) {
      return true;
    }

    // Check if they're trying to export the same resources
    const databases1 = new Set(config1.databases);
    const databases2 = new Set(config2.databases);
    const pages1 = new Set(config1.pages);
    const pages2 = new Set(config2.pages);

    // Check for overlapping databases
    for (const db of databases2) {
      if (databases1.has(db)) {
        return true;
      }
    }

    // Check for overlapping pages
    for (const page of pages2) {
      if (pages1.has(page)) {
        return true;
      }
    }

    return false;
  }
}
