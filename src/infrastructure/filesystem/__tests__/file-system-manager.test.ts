/**
 * File System Manager Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { FileSystemManager } from '../file-system-manager';
import { NotionDatabase, NotionPage, ExportFormat } from '../../../shared/types';

describe('FileSystemManager', () => {
  let manager: FileSystemManager;
  let tempDir: string;
  let config: any;

  beforeEach(async () => {
    tempDir = path.join(__dirname, 'temp', `test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    
    config = FileSystemManager.createDefaultConfig(tempDir);
    manager = new FileSystemManager(config);
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('configuration', () => {
    it('should create default configuration', () => {
      const defaultConfig = FileSystemManager.createDefaultConfig('/test/path');
      
      expect(defaultConfig.baseOutputPath).toBe('/test/path');
      expect(defaultConfig.enableAtomicOperations).toBe(true);
      expect(defaultConfig.enableBackup).toBe(true);
      expect(defaultConfig.namingStrategy).toBe('title');
      expect(defaultConfig.organizationStrategy).toBe('by-type');
      expect(defaultConfig.encoding).toBe('utf8');
    });

    it('should validate configuration', () => {
      const validConfig = FileSystemManager.createDefaultConfig('/test/path');
      const errors = FileSystemManager.validateConfig(validConfig);
      
      expect(errors).toHaveLength(0);
    });

    it('should detect invalid configuration', () => {
      const invalidConfig = {
        ...FileSystemManager.createDefaultConfig('/test/path'),
        baseOutputPath: '',
        maxFileSize: -1,
        compressionLevel: 15,
        namingStrategy: 'invalid' as any,
        organizationStrategy: 'invalid' as any,
        encoding: 'invalid' as any
      };
      
      const errors = FileSystemManager.validateConfig(invalidConfig);
      
      expect(errors.length).toBeGreaterThan(0);
      expect(errors).toContain('baseOutputPath is required');
      expect(errors).toContain('maxFileSize must be positive');
      expect(errors).toContain('compressionLevel must be between 1 and 9');
      expect(errors).toContain('Invalid naming strategy');
      expect(errors).toContain('Invalid organization strategy');
      expect(errors).toContain('Invalid encoding');
    });
  });

  describe('writeDatabase', () => {
    it('should write database to file system', async () => {
      const database: NotionDatabase = {
        id: 'test-db-123',
        type: 'database' as any,
        title: 'Test Database',
        description: 'A test database',
        url: 'https://notion.so/test-db-123',
        archived: false,
        createdTime: '2023-01-01T00:00:00.000Z',
        lastEditedTime: '2023-01-02T00:00:00.000Z',
        createdBy: { id: 'user-1', type: 'person' },
        lastEditedBy: { id: 'user-1', type: 'person' },
        parent: { type: 'workspace' },
        properties: {}
      };

      const filePath = await manager.writeDatabase(database, ExportFormat.JSON);
      
      expect(filePath).toContain('databases');
      expect(filePath).toContain('Test_Database.json');
      
      // Verify file exists
      const fileExists = await fs.access(filePath).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);
    });
  });

  describe('writePage', () => {
    it('should write page to file system', async () => {
      const page: NotionPage = {
        id: 'test-page-123',
        type: 'page' as any,
        title: 'Test Page',
        url: 'https://notion.so/test-page-123',
        archived: false,
        createdTime: '2023-01-01T00:00:00.000Z',
        lastEditedTime: '2023-01-02T00:00:00.000Z',
        createdBy: { id: 'user-1', type: 'person' },
        lastEditedBy: { id: 'user-1', type: 'person' },
        parent: { type: 'workspace' },
        properties: {}
      };

      const filePath = await manager.writePage(page, ExportFormat.JSON);
      
      expect(filePath).toContain('pages');
      expect(filePath).toContain('Test_Page.json');
      
      // Verify file exists
      const fileExists = await fs.access(filePath).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);
    });
  });

  describe('atomic operations', () => {
    it('should support atomic operations', async () => {
      const database: NotionDatabase = {
        id: 'test-db-atomic',
        type: 'database' as any,
        title: 'Atomic Test Database',
        description: '',
        url: 'https://notion.so/test-db-atomic',
        archived: false,
        createdTime: '2023-01-01T00:00:00.000Z',
        lastEditedTime: '2023-01-02T00:00:00.000Z',
        createdBy: { id: 'user-1', type: 'person' },
        lastEditedBy: { id: 'user-1', type: 'person' },
        parent: { type: 'workspace' },
        properties: {}
      };

      const page: NotionPage = {
        id: 'test-page-atomic',
        type: 'page' as any,
        title: 'Atomic Test Page',
        url: 'https://notion.so/test-page-atomic',
        archived: false,
        createdTime: '2023-01-01T00:00:00.000Z',
        lastEditedTime: '2023-01-02T00:00:00.000Z',
        createdBy: { id: 'user-1', type: 'person' },
        lastEditedBy: { id: 'user-1', type: 'person' },
        parent: { type: 'workspace' },
        properties: {}
      };

      const filePaths = await manager.writeAtomically([
        { type: 'database', data: database, format: ExportFormat.JSON },
        { type: 'page', data: page, format: ExportFormat.JSON }
      ]);

      expect(filePaths).toHaveLength(2);
      expect(filePaths[0]).toContain('Atomic_Test_Database.json');
      expect(filePaths[1]).toContain('Atomic_Test_Page.json');

      // Verify both files exist
      for (const filePath of filePaths) {
        const fileExists = await fs.access(filePath).then(() => true).catch(() => false);
        expect(fileExists).toBe(true);
      }
    });
  });

  describe('manifest and readme', () => {
    it('should create manifest file', async () => {
      const exportData = {
        exportId: 'test-export-123',
        configuration: { format: 'json' },
        statistics: { totalItems: 5 }
      };

      await manager.createManifest(exportData);
      
      const manifestPath = path.join(tempDir, '.metadata', 'manifest.json');
      const fileExists = await fs.access(manifestPath).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);

      const content = await fs.readFile(manifestPath, 'utf8');
      const manifest = JSON.parse(content);
      expect(manifest.exportId).toBe('test-export-123');
      expect(manifest.version).toBe('1.0.0');
    });

    it('should create README file', async () => {
      const exportData = {
        exportId: 'test-export-456',
        configuration: { format: 'json' },
        statistics: { totalItems: 10 }
      };

      await manager.createReadme(exportData);
      
      const readmePath = path.join(tempDir, 'README.md');
      const fileExists = await fs.access(readmePath).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);

      const content = await fs.readFile(readmePath, 'utf8');
      expect(content).toContain('# Notion Export');
      expect(content).toContain('test-export-456');
    });
  });
});