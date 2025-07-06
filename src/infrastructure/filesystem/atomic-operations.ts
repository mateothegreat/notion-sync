/**
 * Atomic File Operations
 * 
 * Provides transactional file operations with rollback capability
 */

import { promises as fs } from 'fs';
import path from 'path';
import { AtomicFileOperation, FileOperation } from './types';

interface OperationState {
  id: string;
  operations: FileOperation[];
  backups: Map<string, string>;
  tempFiles: Set<string>;
  startTime: Date;
  status: 'pending' | 'committed' | 'rolled_back';
}

export class AtomicFileOperationManager implements AtomicFileOperation {
  private operations = new Map<string, OperationState>();
  private tempDir: string;

  constructor(tempDir: string = '/tmp/notion-sync-atomic') {
    this.tempDir = tempDir;
    this.ensureTempDir();
  }

  /**
   * Begin a new atomic operation
   */
  async begin(): Promise<string> {
    const operationId = crypto.randomUUID();
    
    this.operations.set(operationId, {
      id: operationId,
      operations: [],
      backups: new Map(),
      tempFiles: new Set(),
      startTime: new Date(),
      status: 'pending'
    });

    return operationId;
  }

  /**
   * Add a file operation to the transaction
   */
  async addOperation(operationId: string, operation: FileOperation): Promise<void> {
    const state = this.operations.get(operationId);
    if (!state) {
      throw new Error(`Operation ${operationId} not found`);
    }

    if (state.status !== 'pending') {
      throw new Error(`Operation ${operationId} is not in pending state`);
    }

    // Validate operation
    await this.validateOperation(operation);

    // Prepare operation (create backups, temp files, etc.)
    await this.prepareOperation(state, operation);

    state.operations.push(operation);
  }

  /**
   * Commit all operations in the transaction
   */
  async commit(operationId: string): Promise<void> {
    const state = this.operations.get(operationId);
    if (!state) {
      throw new Error(`Operation ${operationId} not found`);
    }

    if (state.status !== 'pending') {
      throw new Error(`Operation ${operationId} is not in pending state`);
    }

    try {
      // Execute all operations
      for (const operation of state.operations) {
        await this.executeOperation(operation);
      }

      // Mark as committed
      state.status = 'committed';

      // Clean up backups and temp files
      await this.cleanupOperation(state);

    } catch (error) {
      // Rollback on any error
      await this.rollback(operationId);
      throw error;
    }
  }

  /**
   * Rollback all operations in the transaction
   */
  async rollback(operationId: string): Promise<void> {
    const state = this.operations.get(operationId);
    if (!state) {
      throw new Error(`Operation ${operationId} not found`);
    }

    if (state.status === 'rolled_back') {
      return; // Already rolled back
    }

    try {
      // Restore from backups in reverse order
      for (const operation of state.operations.reverse()) {
        await this.rollbackOperation(state, operation);
      }

      state.status = 'rolled_back';

    } finally {
      // Clean up regardless of rollback success
      await this.cleanupOperation(state);
    }
  }

  /**
   * Check if an operation is in progress
   */
  isOperationInProgress(operationId: string): boolean {
    const state = this.operations.get(operationId);
    return state?.status === 'pending' || false;
  }

  /**
   * Get operation statistics
   */
  getOperationStats(operationId: string): any {
    const state = this.operations.get(operationId);
    if (!state) {
      return null;
    }

    return {
      id: state.id,
      status: state.status,
      operationCount: state.operations.length,
      backupCount: state.backups.size,
      tempFileCount: state.tempFiles.size,
      startTime: state.startTime,
      duration: Date.now() - state.startTime.getTime()
    };
  }

  /**
   * Clean up old operations
   */
  async cleanup(maxAge: number = 24 * 60 * 60 * 1000): Promise<void> {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [id, state] of this.operations) {
      const age = now - state.startTime.getTime();
      if (age > maxAge && state.status !== 'pending') {
        toDelete.push(id);
      }
    }

    for (const id of toDelete) {
      this.operations.delete(id);
    }
  }

  /**
   * Ensure temp directory exists
   */
  private async ensureTempDir(): Promise<void> {
    try {
      await fs.access(this.tempDir);
    } catch {
      await fs.mkdir(this.tempDir, { recursive: true });
    }
  }

  /**
   * Validate operation before adding to transaction
   */
  private async validateOperation(operation: FileOperation): Promise<void> {
    switch (operation.type) {
      case 'create':
        if (!operation.targetPath) {
          throw new Error('Create operation requires targetPath');
        }
        if (!operation.data) {
          throw new Error('Create operation requires data');
        }
        break;

      case 'update':
        if (!operation.targetPath) {
          throw new Error('Update operation requires targetPath');
        }
        if (!operation.data) {
          throw new Error('Update operation requires data');
        }
        // Check if file exists
        try {
          await fs.access(operation.targetPath);
        } catch {
          throw new Error(`Update target does not exist: ${operation.targetPath}`);
        }
        break;

      case 'delete':
        if (!operation.targetPath) {
          throw new Error('Delete operation requires targetPath');
        }
        // Check if file exists
        try {
          await fs.access(operation.targetPath);
        } catch {
          throw new Error(`Delete target does not exist: ${operation.targetPath}`);
        }
        break;

      case 'move':
        if (!operation.sourcePath || !operation.targetPath) {
          throw new Error('Move operation requires both sourcePath and targetPath');
        }
        // Check if source exists
        try {
          await fs.access(operation.sourcePath);
        } catch {
          throw new Error(`Move source does not exist: ${operation.sourcePath}`);
        }
        break;

      default:
        throw new Error(`Unknown operation type: ${operation.type}`);
    }
  }

  /**
   * Prepare operation (create backups, temp files, etc.)
   */
  private async prepareOperation(state: OperationState, operation: FileOperation): Promise<void> {
    switch (operation.type) {
      case 'create':
        // Check if target already exists and create backup if needed
        if (operation.backup) {
          try {
            await fs.access(operation.targetPath);
            const backupPath = await this.createBackup(operation.targetPath);
            state.backups.set(operation.targetPath, backupPath);
          } catch {
            // File doesn't exist, no backup needed
          }
        }
        break;

      case 'update':
        // Always create backup for updates
        const backupPath = await this.createBackup(operation.targetPath);
        state.backups.set(operation.targetPath, backupPath);
        break;

      case 'delete':
        // Create backup before deletion
        const deleteBackupPath = await this.createBackup(operation.targetPath);
        state.backups.set(operation.targetPath, deleteBackupPath);
        break;

      case 'move':
        // Create backup of source file
        const moveBackupPath = await this.createBackup(operation.sourcePath!);
        state.backups.set(operation.sourcePath!, moveBackupPath);
        
        // If target exists, backup it too
        try {
          await fs.access(operation.targetPath);
          const targetBackupPath = await this.createBackup(operation.targetPath);
          state.backups.set(operation.targetPath, targetBackupPath);
        } catch {
          // Target doesn't exist, no backup needed
        }
        break;
    }
  }

  /**
   * Execute a single operation
   */
  private async executeOperation(operation: FileOperation): Promise<void> {
    switch (operation.type) {
      case 'create':
        await this.ensureDirectoryExists(path.dirname(operation.targetPath));
        await fs.writeFile(operation.targetPath, operation.data!);
        break;

      case 'update':
        await fs.writeFile(operation.targetPath, operation.data!);
        break;

      case 'delete':
        await fs.unlink(operation.targetPath);
        break;

      case 'move':
        await this.ensureDirectoryExists(path.dirname(operation.targetPath));
        await fs.rename(operation.sourcePath!, operation.targetPath);
        break;
    }
  }

  /**
   * Rollback a single operation
   */
  private async rollbackOperation(state: OperationState, operation: FileOperation): Promise<void> {
    try {
      switch (operation.type) {
        case 'create':
          // Remove created file
          try {
            await fs.unlink(operation.targetPath);
          } catch {
            // File might not exist, ignore
          }
          
          // Restore backup if it exists
          const createBackup = state.backups.get(operation.targetPath);
          if (createBackup) {
            await fs.copyFile(createBackup, operation.targetPath);
          }
          break;

        case 'update':
          // Restore from backup
          const updateBackup = state.backups.get(operation.targetPath);
          if (updateBackup) {
            await fs.copyFile(updateBackup, operation.targetPath);
          }
          break;

        case 'delete':
          // Restore deleted file from backup
          const deleteBackup = state.backups.get(operation.targetPath);
          if (deleteBackup) {
            await this.ensureDirectoryExists(path.dirname(operation.targetPath));
            await fs.copyFile(deleteBackup, operation.targetPath);
          }
          break;

        case 'move':
          // Move file back to original location
          try {
            await fs.rename(operation.targetPath, operation.sourcePath!);
          } catch {
            // If rename fails, restore from backup
            const moveBackup = state.backups.get(operation.sourcePath!);
            if (moveBackup) {
              await this.ensureDirectoryExists(path.dirname(operation.sourcePath!));
              await fs.copyFile(moveBackup, operation.sourcePath!);
            }
          }
          
          // Restore target backup if it existed
          const targetBackup = state.backups.get(operation.targetPath);
          if (targetBackup) {
            await fs.copyFile(targetBackup, operation.targetPath);
          }
          break;
      }
    } catch (error) {
      console.error(`Failed to rollback operation ${operation.type} for ${operation.targetPath}:`, error);
      // Continue with other rollbacks even if one fails
    }
  }

  /**
   * Create backup of a file
   */
  private async createBackup(filePath: string): Promise<string> {
    const timestamp = Date.now();
    const backupName = `${path.basename(filePath)}.backup.${timestamp}`;
    const backupPath = path.join(this.tempDir, backupName);
    
    await fs.copyFile(filePath, backupPath);
    return backupPath;
  }

  /**
   * Clean up operation state
   */
  private async cleanupOperation(state: OperationState): Promise<void> {
    // Remove backup files
    for (const backupPath of state.backups.values()) {
      try {
        await fs.unlink(backupPath);
      } catch {
        // Ignore cleanup errors
      }
    }

    // Remove temp files
    for (const tempPath of state.tempFiles) {
      try {
        await fs.unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }
    }

    // Clear state
    state.backups.clear();
    state.tempFiles.clear();
  }

  /**
   * Ensure directory exists
   */
  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.access(dirPath);
    } catch {
      await fs.mkdir(dirPath, { recursive: true });
    }
  }
}