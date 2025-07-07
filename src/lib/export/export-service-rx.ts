/**
 * RxJS-based Export Service
 *
 * Event-driven export service using RxJS Observables for reactive
 * state management and asynchronous operations.
 */

import { ResolvedCommandConfig } from "$lib/config/loader";
import { BehaviorSubject, Observable, of, Subject, throwError } from "rxjs";
import { catchError, distinctUntilChanged, filter, map, mergeMap, switchMap, takeUntil, tap } from "rxjs/operators";
import { ExportEvents } from "../../core/events/events";
import { ProgressService } from "../../core/services/progress-service";
import { ExportError, ExportNotFoundError } from "../../shared/errors";
import { ExportStatus, ProgressInfo } from "../../shared/types";
import { Export, ExportFactory, ObservableExportRepository, ObservableExportService } from "./domain";

export class ObservableExportServiceImpl implements ObservableExportService {
  private exportSubjects = new Map<string, BehaviorSubject<Export | null>>();
  private progressSubjects = new Map<string, Subject<ProgressInfo>>();
  private destroy$ = new Subject<void>();

  constructor(
    private exportRepository: ObservableExportRepository,
    private eventPublisher: (event: any) => Observable<void>,
    private progressService?: ProgressService
  ) {}

  createExport(configuration: ResolvedCommandConfig<"export">): Observable<Export> {
    return of(ExportFactory.create(configuration)).pipe(
      mergeMap((exp) =>
        this.exportRepository.save(exp).pipe(
          mergeMap(() => this.eventPublisher(ExportEvents.started(exp.id, configuration))),
          map(() => {
            // Cache the export in a subject for real-time updates
            this.exportSubjects.set(exp.id, new BehaviorSubject(exp));
            this.progressSubjects.set(exp.id, new Subject());
            return exp;
          })
        )
      ),
      catchError((error) => {
        if (error.code === "VALIDATION_ERROR") {
          return throwError(() => new ExportError(error.message));
        }
        return throwError(() => error);
      })
    );
  }

  startExport(id: string): Observable<void> {
    return this.getExport(id).pipe(
      tap((export_) => export_.start()),
      mergeMap((export_) =>
        this.exportRepository.save(export_).pipe(
          mergeMap(() => this.eventPublisher(ExportEvents.progressUpdated(export_.id, export_.progress))),
          tap(() => {
            // Update cached export
            this.exportSubjects.get(id)?.next(export_);
            this.progressSubjects.get(id)?.next(export_.progress);
          })
        )
      ),
      catchError((error) => {
        if (error.message?.includes("Cannot transition")) {
          return throwError(() => new ExportError(error.message));
        }
        return throwError(() => error);
      })
    );
  }

  cancelExport(id: string, reason: string): Observable<void> {
    return this.getExport(id).pipe(
      tap((export_) => {
        if (!export_.isRunning()) {
          throw new ExportError(`Cannot cancel export in ${export_.status} status`);
        }
        export_.cancel(reason);
      }),
      mergeMap((export_) =>
        this.exportRepository.save(export_).pipe(
          mergeMap(() => this.eventPublisher(ExportEvents.cancelled(export_.id, reason, export_.progress))),
          tap(() => {
            // Update cached export
            this.exportSubjects.get(id)?.next(export_);
            // Complete progress stream on cancellation
            this.progressSubjects.get(id)?.complete();
          })
        )
      )
    );
  }

  getExport(id: string): Observable<Export> {
    // Check cache first
    const cached = this.exportSubjects.get(id);
    if (cached && cached.value) {
      return of(cached.value);
    }

    return this.exportRepository.findById(id).pipe(
      map((export_) => {
        if (!export_) {
          throw new ExportNotFoundError(`Export not found: ${id}`);
        }
        // Cache the export
        if (!this.exportSubjects.has(id)) {
          this.exportSubjects.set(id, new BehaviorSubject(export_));
          this.progressSubjects.set(id, new Subject());
        } else {
          this.exportSubjects.get(id)!.next(export_);
        }
        return export_;
      })
    );
  }

  listExports(limit?: number, offset?: number): Observable<Export[]> {
    return this.exportRepository.list(limit, offset);
  }

  getRunningExports(): Observable<Export[]> {
    return this.exportRepository.findRunning();
  }

  updateExportProgress(id: string, progress: Partial<ProgressInfo>): Observable<void> {
    return this.getExport(id).pipe(
      tap((export_) => export_.updateProgress(progress)),
      mergeMap((export_) =>
        this.exportRepository.save(export_).pipe(
          mergeMap(() => this.eventPublisher(ExportEvents.progressUpdated(export_.id, export_.progress))),
          tap(() => {
            // Update cached export and emit progress
            this.exportSubjects.get(id)?.next(export_);
            this.progressSubjects.get(id)?.next(export_.progress);
          })
        )
      )
    );
  }

  completeExport(id: string, outputPath: string): Observable<void> {
    return this.getExport(id).pipe(
      tap((export_) => export_.complete(outputPath)),
      mergeMap((export_) => {
        const duration = export_.getDuration() || 0;
        return this.exportRepository.save(export_).pipe(
          mergeMap(() =>
            this.eventPublisher(
              ExportEvents.completed(
                export_.id,
                outputPath,
                duration,
                export_.progress.processed,
                export_.progress.errors
              )
            )
          ),
          tap(() => {
            // Update cached export and complete progress stream
            this.exportSubjects.get(id)?.next(export_);
            this.progressSubjects.get(id)?.complete();
          })
        );
      })
    );
  }

  failExport(id: string, error: any): Observable<void> {
    return this.getExport(id).pipe(
      tap((export_) => {
        const errorInfo = {
          id: crypto.randomUUID(),
          message: error.message,
          code: error.code || "UNKNOWN_ERROR",
          timestamp: new Date(),
          context: error.context,
          stack: error.stack
        };
        export_.fail(errorInfo);
      }),
      mergeMap((export_) =>
        this.exportRepository.save(export_).pipe(
          mergeMap(() => this.eventPublisher(ExportEvents.failed(export_.id, export_.error!, export_.progress))),
          tap(() => {
            // Update cached export and error the progress stream
            this.exportSubjects.get(id)?.next(export_);
            this.progressSubjects.get(id)?.error(export_.error);
          })
        )
      )
    );
  }

  deleteExport(id: string): Observable<void> {
    return this.getExport(id).pipe(
      tap((export_) => {
        if (export_.isRunning()) {
          throw new ExportError("Cannot delete running export");
        }
      }),
      mergeMap(() => this.exportRepository.delete(id)),
      tap(() => {
        // Clean up cached subjects
        this.exportSubjects.get(id)?.complete();
        this.exportSubjects.delete(id);
        this.progressSubjects.get(id)?.complete();
        this.progressSubjects.delete(id);
      })
    );
  }

  restartExport(id: string): Observable<Export> {
    return this.getExport(id).pipe(
      tap((export_) => {
        if (!export_.canBeRestarted()) {
          throw new ExportError(`Cannot restart export in ${export_.status} status`);
        }
      }),
      mergeMap((export_) => {
        const newExport = ExportFactory.create(export_.configuration);
        return this.exportRepository.save(newExport).pipe(
          mergeMap(() => this.eventPublisher(ExportEvents.started(newExport.id, newExport.configuration))),
          map(() => {
            // Cache the new export
            this.exportSubjects.set(newExport.id, new BehaviorSubject(newExport));
            this.progressSubjects.set(newExport.id, new Subject());
            return newExport;
          })
        );
      })
    );
  }

  // Stream-based methods for real-time updates
  exportProgress$(id: string): Observable<ProgressInfo> {
    if (!this.progressSubjects.has(id)) {
      // Load export to initialize streams
      return this.getExport(id).pipe(switchMap(() => this.progressSubjects.get(id)!.asObservable()));
    }
    return this.progressSubjects.get(id)!.asObservable().pipe(takeUntil(this.destroy$));
  }

  exportStatus$(id: string): Observable<ExportStatus> {
    if (!this.exportSubjects.has(id)) {
      // Load export to initialize streams
      return this.getExport(id).pipe(
        switchMap(() => this.exportSubjects.get(id)!.asObservable()),
        filter((exp): exp is Export => exp !== null),
        map((exp) => exp.status),
        distinctUntilChanged()
      );
    }
    return this.exportSubjects
      .get(id)!
      .asObservable()
      .pipe(
        filter((exp): exp is Export => exp !== null),
        map((exp) => exp.status),
        distinctUntilChanged(),
        takeUntil(this.destroy$)
      );
  }

  /**
   * Clean up all resources
   */
  destroy(): void {
    this.destroy$.next();
    this.destroy$.complete();

    // Complete all subjects
    this.exportSubjects.forEach((subject) => subject.complete());
    this.exportSubjects.clear();

    this.progressSubjects.forEach((subject) => subject.complete());
    this.progressSubjects.clear();
  }
}
