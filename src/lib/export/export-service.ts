/**
 * Export Service
 *
 * Core business logic for managing exports. This service orchestrates
 * the export lifecycle, managing state transitions and coordinating
 * with the WorkspaceExporter for actual export execution.
 */

import { ResolvedCommandConfig } from "$lib/config/loader";
import { ExportEvents } from "../../core/events/events";
import { ProgressService } from "../../core/services/progress-service";
import { ExportError, ExportNotFoundError } from "../../shared/errors";
import { Export, ExportFactory, ExportRepository } from "./domain";

export class ExportService {
  constructor(
    private exportRepository: ExportRepository,
    private eventPublisher: (event: any) => Promise<void>,
    private progressService?: ProgressService
  ) {}

  /**
   * Create an export and publish the started event to the event bus.
   *
   * @param configuration - The configuration for the export.
   *
   * @returns The created export.
   */
  async create(configuration: ResolvedCommandConfig<"export">): Promise<Export> {
    const exp = ExportFactory.create(configuration);

    await this.exportRepository.save(exp);
    await this.eventPublisher(ExportEvents.started(exp.id, configuration));

    return exp;
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

    const newExport = ExportFactory.create(export_.configuration);

    await this.exportRepository.save(newExport);
    await this.eventPublisher(ExportEvents.started(newExport.id, newExport.configuration));

    return newExport;
  }
}
