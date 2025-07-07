/**
 * Export Service
 *
 * Core business logic for managing exports. This service orchestrates
 * the export lifecycle, managing state transitions and coordinating
 * with the WorkspaceExporter for actual export execution.
 */

import { log } from "$lib/log";
import { Export, ExportFactory, ExportRepository } from "../../core/domain/export";
import { ExportEvents } from "../../core/events/index";
import { ProgressService } from "../../core/services/progress-service";
import { ExportAlreadyRunningError, ExportError, ExportNotFoundError } from "../../shared/errors/index";
import { ExportConfiguration } from "../../shared/types/index";

export class ExportService {
  constructor(
    private exportRepository: ExportRepository,
    private eventPublisher: (event: any) => Promise<void>,
    private progressService?: ProgressService
  ) {}

  async create(configuration: ExportConfiguration): Promise<Export> {
    // Check for existing running exports with same configuration
    const runningExports = await this.exportRepository.findRunning();
    log.debugging.inspect("Running exports", runningExports);
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
    await this.eventPublisher(ExportEvents.progressUpdated(export_.id, export_.progress));
  }

  async cancelExport(id: string, reason: string): Promise<void> {
    const export_ = await this.getExport(id);

    if (!export_.isRunning()) {
      throw new ExportError(`Cannot cancel export in ${export_.status} status`);
    }

    export_.cancel(reason);

    await this.exportRepository.save(export_);
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
