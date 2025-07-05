/**
 * Progress Service
 * 
 * Manages progress tracking for exports
 */

import { ProgressInfo, ErrorInfo } from '../../shared/types';
import { ProgressEvents } from '../events';

export interface ProgressTracker {
  exportId: string;
  sections: Map<string, SectionProgress>;
  totalItems: number;
  processedItems: number;
  startTime: Date;
  errors: ErrorInfo[];
}

export interface SectionProgress {
  name: string;
  totalItems: number;
  processedItems: number;
  startTime: Date;
  endTime?: Date;
  errors: ErrorInfo[];
}

export class ProgressService {
  private trackers = new Map<string, ProgressTracker>();

  constructor(
    private eventPublisher: (event: any) => Promise<void>
  ) {}

  async startTracking(exportId: string): Promise<void> {
    const tracker: ProgressTracker = {
      exportId,
      sections: new Map(),
      totalItems: 0,
      processedItems: 0,
      startTime: new Date(),
      errors: []
    };

    this.trackers.set(exportId, tracker);
  }

  async startSection(exportId: string, sectionName: string, totalItems: number): Promise<void> {
    const tracker = this.getTracker(exportId);
    
    const section: SectionProgress = {
      name: sectionName,
      totalItems,
      processedItems: 0,
      startTime: new Date(),
      errors: []
    };

    tracker.sections.set(sectionName, section);
    tracker.totalItems += totalItems;

    // Publish event
    await this.eventPublisher(
      ProgressEvents.sectionStarted(exportId, sectionName, totalItems)
    );
  }

  async updateSectionProgress(
    exportId: string, 
    sectionName: string, 
    processedItems: number
  ): Promise<void> {
    const tracker = this.getTracker(exportId);
    const section = tracker.sections.get(sectionName);
    
    if (!section) {
      throw new Error(`Section ${sectionName} not found for export ${exportId}`);
    }

    const previousProcessed = section.processedItems;
    section.processedItems = processedItems;
    
    // Update total processed items
    tracker.processedItems += (processedItems - previousProcessed);
  }

  async completeSection(exportId: string, sectionName: string): Promise<void> {
    const tracker = this.getTracker(exportId);
    const section = tracker.sections.get(sectionName);
    
    if (!section) {
      throw new Error(`Section ${sectionName} not found for export ${exportId}`);
    }

    section.endTime = new Date();
    const duration = section.endTime.getTime() - section.startTime.getTime();

    // Publish event
    await this.eventPublisher(
      ProgressEvents.sectionCompleted(
        exportId,
        sectionName,
        section.processedItems,
        duration,
        section.errors
      )
    );
  }

  async recordItemProcessed(
    exportId: string,
    itemId: string,
    itemType: string,
    duration: number,
    success: boolean,
    error?: ErrorInfo
  ): Promise<void> {
    const tracker = this.getTracker(exportId);

    if (!success && error) {
      tracker.errors.push(error);
    }

    // Publish event
    await this.eventPublisher(
      ProgressEvents.itemProcessed(
        exportId,
        itemId,
        itemType,
        duration,
        success,
        error
      )
    );
  }

  async addError(exportId: string, sectionName: string, error: ErrorInfo): Promise<void> {
    const tracker = this.getTracker(exportId);
    const section = tracker.sections.get(sectionName);
    
    if (section) {
      section.errors.push(error);
    }
    
    tracker.errors.push(error);
  }

  getProgress(exportId: string): ProgressInfo {
    const tracker = this.getTracker(exportId);
    
    const percentage = tracker.totalItems > 0 
      ? (tracker.processedItems / tracker.totalItems) * 100 
      : 0;

    // Calculate current operation
    let currentOperation = 'processing';
    for (const [name, section] of tracker.sections) {
      if (!section.endTime) {
        currentOperation = name;
        break;
      }
    }

    // Calculate ETA
    let estimatedCompletion: Date | undefined;
    if (tracker.processedItems > 0 && tracker.totalItems > 0) {
      const elapsed = Date.now() - tracker.startTime.getTime();
      const rate = tracker.processedItems / elapsed;
      const remaining = tracker.totalItems - tracker.processedItems;
      estimatedCompletion = new Date(Date.now() + (remaining / rate));
    }

    return {
      processed: tracker.processedItems,
      total: tracker.totalItems,
      percentage,
      currentOperation,
      estimatedCompletion,
      errors: tracker.errors
    };
  }

  getSectionProgress(exportId: string, sectionName: string): SectionProgress | null {
    const tracker = this.getTracker(exportId);
    return tracker.sections.get(sectionName) || null;
  }

  getAllSections(exportId: string): SectionProgress[] {
    const tracker = this.getTracker(exportId);
    return Array.from(tracker.sections.values());
  }

  getStatistics(exportId: string): ProgressStatistics {
    const tracker = this.getTracker(exportId);
    const progress = this.getProgress(exportId);
    
    const completedSections = Array.from(tracker.sections.values())
      .filter(section => section.endTime);
    
    const totalDuration = Date.now() - tracker.startTime.getTime();
    const averageItemTime = tracker.processedItems > 0 
      ? totalDuration / tracker.processedItems 
      : 0;

    const errorRate = tracker.totalItems > 0 
      ? tracker.errors.length / tracker.totalItems 
      : 0;

    return {
      totalDuration,
      averageItemTime,
      errorRate,
      completedSections: completedSections.length,
      totalSections: tracker.sections.size,
      itemsPerSecond: totalDuration > 0 ? (tracker.processedItems / (totalDuration / 1000)) : 0
    };
  }

  stopTracking(exportId: string): void {
    this.trackers.delete(exportId);
  }

  private getTracker(exportId: string): ProgressTracker {
    const tracker = this.trackers.get(exportId);
    if (!tracker) {
      throw new Error(`No progress tracker found for export ${exportId}`);
    }
    return tracker;
  }
}

export interface ProgressStatistics {
  totalDuration: number;
  averageItemTime: number;
  errorRate: number;
  completedSections: number;
  totalSections: number;
  itemsPerSecond: number;
}