/**
 * Export Domain Model
 *
 * Core business logic for export operations
 */

import { ResolvedCommandConfig } from "$lib/config/loader";
import { ExportFormat } from "$lib/exporters/exporter";
import { ExportError, ValidationError } from "../../shared/errors";
import { Entity, ErrorInfo, ExportStatus, ProgressInfo } from "../../shared/types";

export class Export implements Entity {
  public readonly id: string;
  public readonly createdAt: Date;
  public updatedAt: Date;

  constructor(
    id: string,
    public readonly configuration: ResolvedCommandConfig<"export">,
    public status: ExportStatus = ExportStatus.PENDING,
    public progress: ProgressInfo = {
      processed: 0,
      total: 0,
      percentage: 0,
      currentOperation: "initializing",
      errors: []
    },
    public outputPath?: string,
    public startedAt?: Date,
    public completedAt?: Date,
    public error?: ErrorInfo,
    createdAt?: Date,
    updatedAt?: Date
  ) {
    this.id = id;
    this.createdAt = createdAt || new Date();
    this.updatedAt = updatedAt || new Date();

    this.validateConfiguration();
  }

  private validateConfiguration(): void {
    if (!this.configuration.path) {
      throw new ValidationError("Output path is required");
    }

    if (this.configuration.databases.length === 0 && this.configuration.pages?.length === 0) {
      throw new ValidationError("At least one database or page must be specified");
    }

    if (!Object.values(ExportFormat).includes(this.configuration.format)) {
      throw new ValidationError(`Invalid export format: ${this.configuration.format}`);
    }
  }

  start(): void {
    if (this.status !== ExportStatus.PENDING) {
      throw new ExportError(`Cannot start export in ${this.status} status`);
    }

    this.status = ExportStatus.RUNNING;
    this.startedAt = new Date();
    this.updatedAt = new Date();
  }

  updateProgress(progress: Partial<ProgressInfo>): void {
    if (this.status !== ExportStatus.RUNNING) {
      throw new ExportError(`Cannot update progress for export in ${this.status} status`);
    }

    this.progress = {
      ...this.progress,
      ...progress,
      percentage: progress.total
        ? ((progress.processed || this.progress.processed) / progress.total) * 100
        : this.progress.percentage
    };

    // Update ETA if we have enough data
    if (this.progress.processed > 0 && this.progress.total > 0 && this.startedAt) {
      const elapsed = Date.now() - this.startedAt.getTime();
      const rate = this.progress.processed / elapsed;
      const remaining = this.progress.total - this.progress.processed;
      this.progress.estimatedCompletion = new Date(Date.now() + remaining / rate);
    }

    this.updatedAt = new Date();
  }

  addError(error: ErrorInfo): void {
    this.progress.errors.push(error);
    this.updatedAt = new Date();
  }

  complete(outputPath: string): void {
    if (this.status !== ExportStatus.RUNNING) {
      throw new ExportError(`Cannot complete export in ${this.status} status`);
    }

    this.status = ExportStatus.COMPLETED;
    this.outputPath = outputPath;
    this.completedAt = new Date();
    this.updatedAt = new Date();

    // Ensure progress shows 100%
    this.progress.processed = this.progress.total;
    this.progress.percentage = 100;
    this.progress.currentOperation = "completed";
  }

  fail(error: ErrorInfo): void {
    if (this.status !== ExportStatus.RUNNING) {
      throw new ExportError(`Cannot fail export in ${this.status} status`);
    }

    this.status = ExportStatus.FAILED;
    this.error = error;
    this.completedAt = new Date();
    this.updatedAt = new Date();
    this.progress.currentOperation = "failed";
  }

  cancel(reason: string): void {
    if (this.status !== ExportStatus.RUNNING) {
      throw new ExportError(`Cannot cancel export in ${this.status} status`);
    }

    this.status = ExportStatus.CANCELLED;
    this.error = {
      id: crypto.randomUUID(),
      message: `Export cancelled: ${reason}`,
      code: "EXPORT_CANCELLED",
      timestamp: new Date(),
      context: { reason }
    };
    this.completedAt = new Date();
    this.updatedAt = new Date();
    this.progress.currentOperation = "cancelled";
  }

  getDuration(): number | null {
    if (!this.startedAt) return null;
    const endTime = this.completedAt || new Date();
    return endTime.getTime() - this.startedAt.getTime();
  }

  getSuccessRate(): number {
    if (this.progress.total === 0) return 0;
    const successful = this.progress.processed - this.progress.errors.length;
    return successful / this.progress.total;
  }

  isRunning(): boolean {
    return this.status === ExportStatus.RUNNING;
  }

  isCompleted(): boolean {
    return [ExportStatus.COMPLETED, ExportStatus.FAILED, ExportStatus.CANCELLED].includes(this.status);
  }

  canBeRestarted(): boolean {
    return this.isCompleted() && this.status !== ExportStatus.COMPLETED;
  }

  toSnapshot(): ExportSnapshot {
    return {
      id: this.id,
      configuration: this.configuration,
      status: this.status,
      progress: this.progress,
      outputPath: this.outputPath,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      error: this.error,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  static fromSnapshot(snapshot: ExportSnapshot): Export {
    return new Export(
      snapshot.id,
      snapshot.configuration,
      snapshot.status,
      snapshot.progress,
      snapshot.outputPath,
      snapshot.startedAt,
      snapshot.completedAt,
      snapshot.error,
      snapshot.createdAt,
      snapshot.updatedAt
    );
  }
}

export interface ExportSnapshot {
  id: string;
  configuration: ResolvedCommandConfig<"export">;
  status: ExportStatus;
  progress: ProgressInfo;
  outputPath?: string;
  startedAt?: Date;
  completedAt?: Date;
  error?: ErrorInfo;
  createdAt: Date;
  updatedAt: Date;
}

// Export Factory
export class ExportFactory {
  static create(configuration: ResolvedCommandConfig<"export">): Export {
    const id = crypto.randomUUID();
    return new Export(id, configuration);
  }

  static createWithId(id: string, configuration: ResolvedCommandConfig<"export">): Export {
    return new Export(id, configuration);
  }
}

// Export Repository Interface
export interface ExportRepository {
  save(export_: Export): Promise<void>;
  findById(id: string): Promise<Export | null>;
  findByStatus(status: ExportStatus): Promise<Export[]>;
  findRunning(): Promise<Export[]>;
  delete(id: string): Promise<void>;
  list(limit?: number, offset?: number): Promise<Export[]>;
}

// Export Service Interface
export interface ExportService {
  createExport(configuration: ResolvedCommandConfig<"export">): Promise<Export>;
  startExport(id: string): Promise<void>;
  cancelExport(id: string, reason: string): Promise<void>;
  getExport(id: string): Promise<Export>;
  listExports(limit?: number, offset?: number): Promise<Export[]>;
  getRunningExports(): Promise<Export[]>;
}
