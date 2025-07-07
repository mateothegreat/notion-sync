/**
 * RxJS-based WorkspaceExporter - Stream-based workspace export execution.
 *
 * This class provides reactive streams for export operations,
 * replacing EventEmitter with RxJS Observables for better
 * composability and error handling.
 */

import { ResolvedCommandConfig } from "$lib/config/loader";
import { Client } from "@notionhq/client";
import { promises as fs } from "fs";
import path from "path";
import { BehaviorSubject, from, merge, Observable, of, Subject, throwError } from "rxjs";
import { catchError, finalize, map, mergeMap, retry, scan, share, takeLast, takeUntil, tap } from "rxjs/operators";
import { FileSystemEvents } from "../../core/events/events";
import { ProgressService } from "../../core/services/progress-service";
import { log } from "../log";
import { Export } from "./domain";
import { ObservableConcurrencyLimiter } from "./util";

/**
 * Export event types
 */
export interface ExportEvent {
  type: "progress" | "file" | "error" | "warning" | "complete";
  timestamp: Date;
  data: any;
}

/**
 * Progress event data
 */
export interface ProgressEvent extends ExportEvent {
  type: "progress";
  data: {
    phase: string;
    current: number;
    total: number;
    percentage: number;
  };
}

/**
 * File event data
 */
export interface FileEvent extends ExportEvent {
  type: "file";
  data: {
    path: string;
    size: number;
    type: string;
  };
}

/**
 * Error event data
 */
export interface ErrorEvent extends ExportEvent {
  type: "error";
  data: {
    error: Error;
    context: string;
    recoverable: boolean;
  };
}

/**
 * Result of a workspace export operation.
 */
export interface WorkspaceExportResult {
  usersCount: number;
  databasesCount: number;
  pagesCount: number;
  blocksCount: number;
  commentsCount: number;
  filesCount: number;
  startTime: Date;
  endTime: Date;
  errors: Array<{ type: string; id?: string; error: string }>;
  workspaceInfo?: any;
}

/**
 * Observable-based WorkspaceExporter executes export operations with reactive streams.
 */
export class ObservableWorkspaceExporter {
  private client: Client;
  private config: ResolvedCommandConfig<"export">;
  private progressService: ProgressService;
  private eventPublisher: (event: any) => Observable<void>;

  // Event streams
  private events$ = new Subject<ExportEvent>();
  private destroy$ = new Subject<void>();
  private errors$ = new Subject<ErrorEvent>();
  private progress$ = new BehaviorSubject<ProgressEvent>({
    type: "progress",
    timestamp: new Date(),
    data: { phase: "initializing", current: 0, total: 0, percentage: 0 }
  });

  // Concurrency limiter for API calls
  private apiLimiter: ObservableConcurrencyLimiter;

  constructor(
    config: ResolvedCommandConfig<"export">,
    progressService: ProgressService,
    eventPublisher: (event: any) => Observable<void>
  ) {
    this.config = config;
    this.progressService = progressService;
    this.eventPublisher = eventPublisher;

    this.client = new Client({
      auth: this.config.token,
      timeoutMs: this.config.timeout
    });

    // Initialize concurrency limiter (e.g., 10 concurrent API calls)
    this.apiLimiter = new ObservableConcurrencyLimiter(10);

    // Forward errors to main event stream
    this.errors$.pipe(takeUntil(this.destroy$)).subscribe((error) => this.events$.next(error));

    // Forward progress to main event stream
    this.progress$.pipe(takeUntil(this.destroy$)).subscribe((progress) => this.events$.next(progress));
  }

  /**
   * Get the event stream
   */
  get events(): Observable<ExportEvent> {
    return this.events$.asObservable().pipe(takeUntil(this.destroy$), share());
  }

  /**
   * Get the progress stream
   */
  get progress(): Observable<ProgressEvent> {
    return this.progress$.asObservable().pipe(takeUntil(this.destroy$), share());
  }

  /**
   * Get the error stream
   */
  get errors(): Observable<ErrorEvent> {
    return this.errors$.asObservable().pipe(takeUntil(this.destroy$), share());
  }

  /**
   * Execute the export for a given Export entity.
   */
  execute(export_: Export): Observable<WorkspaceExportResult> {
    const startTime = new Date();
    log.info("Starting workspace export", { exportId: export_.id });

    return of(export_).pipe(
      // Create output directory structure
      mergeMap(() => this.createOutputDirectoryStructure(export_.configuration.path)),

      // Start progress tracking
      mergeMap(() => from(this.progressService.startTracking(export_.id))),

      // Export workspace metadata
      mergeMap(() => this.exportWorkspaceMetadata(export_)),

      // Export all content in parallel streams
      mergeMap((workspaceInfo) => {
        const exportStreams = [this.exportDatabases(export_), this.exportPages(export_), this.exportUsers(export_)];

        return merge(...exportStreams).pipe(
          // Collect results
          scan(
            (acc: any, result: any) => {
              if (result.type === "database") acc.databasesCount += result.count;
              if (result.type === "page") acc.pagesCount += result.count;
              if (result.type === "user") acc.usersCount += result.count;
              if (result.type === "block") acc.blocksCount += result.count;
              if (result.type === "comment") acc.commentsCount += result.count;
              if (result.type === "file") acc.filesCount += result.count;
              if (result.errors) acc.errors.push(...result.errors);
              return acc;
            },
            {
              usersCount: 0,
              databasesCount: 0,
              pagesCount: 0,
              blocksCount: 0,
              commentsCount: 0,
              filesCount: 0,
              errors: [],
              workspaceInfo,
              startTime
            }
          ),

          // Take the final accumulated result
          takeLast(1),

          // Add end time
          map((result) => ({
            ...result,
            endTime: new Date()
          }))
        );
      }),

      // Log success
      tap((result) => {
        log.success(`Exported workspace ${export_.id}`, { result });
        this.events$.next({
          type: "complete",
          timestamp: new Date(),
          data: result
        });
      }),

      // Handle errors
      catchError((error) => {
        log.error(`Failed to export workspace ${export_.id}`, { error });
        this.errors$.next({
          type: "error",
          timestamp: new Date(),
          data: {
            error,
            context: "export",
            recoverable: false
          }
        });
        return throwError(() => error);
      }),

      // Cleanup on completion
      finalize(() => {
        this.apiLimiter.complete();
        this.destroy$.next();
        this.destroy$.complete();
      })
    );
  }

  /**
   * Create output directory structure
   */
  private createOutputDirectoryStructure(outputPath: string): Observable<void> {
    const directories = [
      outputPath,
      path.join(outputPath, "databases"),
      path.join(outputPath, "pages"),
      path.join(outputPath, "files"),
      path.join(outputPath, "users"),
      path.join(outputPath, "metadata")
    ];

    return from(directories).pipe(
      mergeMap((dir) =>
        from(fs.mkdir(dir, { recursive: true })).pipe(
          tap(() => {
            this.eventPublisher(FileSystemEvents.directoryCreated(dir, "export")).subscribe();
          }),
          catchError((error): Observable<any> => {
            if (error.code !== "EEXIST") {
              this.errors$.next({
                type: "error",
                timestamp: new Date(),
                data: {
                  error,
                  context: `create-directory: ${dir}`,
                  recoverable: false
                }
              });
              return throwError(() => error);
            }
            return of(undefined);
          })
        )
      ),
      map(() => undefined)
    );
  }

  /**
   * Export workspace metadata
   */
  private exportWorkspaceMetadata(export_: Export): Observable<any> {
    return this.apiLimiter
      .run(() => from(this.client.users.me({})))
      .pipe(
        mergeMap((user) => {
          const metadata = {
            exportId: export_.id,
            exportDate: new Date().toISOString(),
            configuration: export_.configuration,
            workspace: {
              user: {
                id: user.id,
                name: user.name,
                type: user.type
              }
            }
          };

          const metadataPath = path.join(export_.configuration.path, "metadata", "export-metadata.json");

          return from(fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2))).pipe(
            tap(() => {
              this.events$.next({
                type: "file",
                timestamp: new Date(),
                data: {
                  path: metadataPath,
                  size: JSON.stringify(metadata).length,
                  type: "metadata"
                }
              });
            }),
            map(() => metadata.workspace)
          );
        }),
        retry({
          count: 3,
          delay: 1000,
          resetOnSuccess: true
        })
      );
  }

  /**
   * Export databases
   */
  private exportDatabases(export_: Export): Observable<any> {
    if (!export_.configuration.databases.length) {
      return of({ type: "database", count: 0 });
    }

    let processed = 0;
    const total = export_.configuration.databases.length;

    return from(export_.configuration.databases).pipe(
      mergeMap(
        (databaseId) =>
          this.apiLimiter
            .run(() => from(this.client.databases.retrieve({ database_id: databaseId })))
            .pipe(
              tap(() => {
                processed++;
                this.updateProgress("databases", processed, total);
              }),
              map(() => ({ type: "database", count: 1 })),
              catchError((error) => {
                this.errors$.next({
                  type: "error",
                  timestamp: new Date(),
                  data: {
                    error,
                    context: `export-database: ${databaseId}`,
                    recoverable: true
                  }
                });
                return of({
                  type: "database",
                  count: 0,
                  errors: [{ type: "database", id: databaseId, error: error.message }]
                });
              })
            ),
        5 // Process 5 databases concurrently
      )
    );
  }

  /**
   * Export pages
   */
  private exportPages(export_: Export): Observable<any> {
    if (!export_.configuration.pages.length) {
      return of({ type: "page", count: 0 });
    }

    let processed = 0;
    const total = export_.configuration.pages.length;

    return from(export_.configuration.pages).pipe(
      mergeMap(
        (pageId) =>
          this.apiLimiter
            .run(() => from(this.client.pages.retrieve({ page_id: pageId })))
            .pipe(
              tap(() => {
                processed++;
                this.updateProgress("pages", processed, total);
              }),
              map(() => ({ type: "page", count: 1 })),
              catchError((error) => {
                this.errors$.next({
                  type: "error",
                  timestamp: new Date(),
                  data: {
                    error,
                    context: `export-page: ${pageId}`,
                    recoverable: true
                  }
                });
                return of({ type: "page", count: 0, errors: [{ type: "page", id: pageId, error: error.message }] });
              })
            ),
        5 // Process 5 pages concurrently
      )
    );
  }

  /**
   * Export users
   */
  private exportUsers(export_: Export): Observable<any> {
    return this.apiLimiter
      .run(() => from(this.client.users.list({})))
      .pipe(
        map((response) => ({ type: "user", count: response.results.length })),
        catchError((error) => {
          this.errors$.next({
            type: "error",
            timestamp: new Date(),
            data: {
              error,
              context: "export-users",
              recoverable: true
            }
          });
          return of({ type: "user", count: 0, errors: [{ type: "users", error: error.message }] });
        })
      );
  }

  /**
   * Update progress
   */
  private updateProgress(phase: string, current: number, total: number): void {
    const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
    this.progress$.next({
      type: "progress",
      timestamp: new Date(),
      data: { phase, current, total, percentage }
    });
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.events$.complete();
    this.errors$.complete();
    this.progress$.complete();
  }
}
