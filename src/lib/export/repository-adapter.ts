/**
 * Repository Adapters
 *
 * Adapters to bridge Promise-based repositories with Observable-based interfaces
 */

import { Observable, from, of } from "rxjs";
import { ExportStatus } from "../../shared/types";
import { Export, ExportRepository, ObservableExportRepository } from "./domain";

/**
 * Adapts a Promise-based repository to an Observable-based interface
 */
export class ObservableRepositoryAdapter implements ObservableExportRepository {
  constructor(private promiseRepository: ExportRepository) {}

  save(export_: Export): Observable<void> {
    return from(this.promiseRepository.save(export_));
  }

  findById(id: string): Observable<Export | null> {
    return from(this.promiseRepository.findById(id));
  }

  findByStatus(status: ExportStatus): Observable<Export[]> {
    return from(this.promiseRepository.findByStatus(status));
  }

  findRunning(): Observable<Export[]> {
    return from(this.promiseRepository.findRunning());
  }

  delete(id: string): Observable<void> {
    return from(this.promiseRepository.delete(id));
  }

  list(limit?: number, offset?: number): Observable<Export[]> {
    return from(this.promiseRepository.list(limit, offset));
  }
}

/**
 * In-memory Observable repository implementation
 */
export class InMemoryObservableRepository implements ObservableExportRepository {
  private exports = new Map<string, Export>();

  save(export_: Export): Observable<void> {
    this.exports.set(export_.id, export_);
    return of(undefined);
  }

  findById(id: string): Observable<Export | null> {
    return of(this.exports.get(id) || null);
  }

  findByStatus(status: ExportStatus): Observable<Export[]> {
    const results = Array.from(this.exports.values()).filter((exp) => exp.status === status);
    return of(results);
  }

  findRunning(): Observable<Export[]> {
    const results = Array.from(this.exports.values()).filter((exp) => exp.status === ExportStatus.RUNNING);
    return of(results);
  }

  delete(id: string): Observable<void> {
    this.exports.delete(id);
    return of(undefined);
  }

  list(limit?: number, offset?: number): Observable<Export[]> {
    const all = Array.from(this.exports.values());
    const start = offset || 0;
    const end = limit ? start + limit : undefined;
    return of(all.slice(start, end));
  }

  clear(): void {
    this.exports.clear();
  }
}
