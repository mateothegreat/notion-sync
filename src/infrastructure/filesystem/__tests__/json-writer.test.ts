/**
 * JSON Writer Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { JSONWriter } from '../writers/json-writer';
import { FileSystemManager } from '../file-system-manager';
import { NotionDatabase, NotionPage, ExportFormat } from '../../../shared/types';

describe('JSONWriter', () => {
  let writer: JSONWriter;
  let tempDir: string;
  let config: any;

  beforeEach(async () => {
    tempDir = path.join(__dirname, 'temp', `test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    
    config = FileSystemManager.createDefaultConfig(tempDir);
    writer = new JSONWriter(config);
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('writeDatabase', () => {
    it('should write database to JSON file', async () => {
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
        properties: {
          'Name': {
            id: 'title',
            name: 'Name',
            type: 'title'
          }
        }
      };

      const result = await writer.writeDatabase(database, tempDir);
      
      expect(result.success).toBe(true);
      expect(result.filePath).toContain('Test_Database.json');
      
      // Verify file exists and contains correct data
      const fileContent = await fs.readFile(result.filePath, 'utf8');
      const parsedData = JSON.parse(fileContent);
      
      expect(parsedData.id).toBe('test-db-123');
      expect(parsedData.type).toBe('database');
      expect(parsedData.title).toBe('Test Database');
      expect(parsedData.metadata).toBeDefined();
      expect(parsedData.properties).toBeDefined();
    });

    it('should handle database with no title', async () => {
      const database: NotionDatabase = {
        id: 'test-db-456',
        type: 'database' as any,
        title: '',
        description: '',
        url: 'https://notion.so/test-db-456',
        archived: false,
        createdTime: '2023-01-01T00:00:00.000Z',
        lastEditedTime: '2023-01-02T00:00:00.000Z',
        createdBy: { id: 'user-1', type: 'person' },
        lastEditedBy: { id: 'user-1', type: 'person' },
        parent: { type: 'workspace' },
        properties: {}
      };

      const result = await writer.writeDatabase(database, tempDir);
      
      expect(result.success).toBe(true);
      expect(result.filePath).toContain('test-db-456.json');
    });
  });

  describe('writePage', () => {
    it('should write page to JSON file', async () => {
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
        properties: {
          'Title': {
            id: 'title',
            name: 'Title',
            type: 'title',
            title: [
              {
                type: 'text',
                text: { content: 'Test Page' },
                plain_text: 'Test Page'
              }
            ]
          }
        }
      };

      const result = await writer.writePage(page, tempDir);
      
      expect(result.success).toBe(true);
      expect(result.filePath).toContain('Test_Page.json');
      
      // Verify file exists and contains correct data
      const fileContent = await fs.readFile(result.filePath, 'utf8');
      const parsedData = JSON.parse(fileContent);
      
      expect(parsedData.id).toBe('test-page-123');
      expect(parsedData.type).toBe('page');
      expect(parsedData.title).toBe('Test Page');
      expect(parsedData.metadata).toBeDefined();
      expect(parsedData.properties).toBeDefined();
    });
  });

  describe('formatData', () => {
    it('should format data as pretty JSON by default', () => {
      const data = { test: 'value', number: 123 };
      const result = writer.formatData(data);
      
      expect(result).toContain('{\n');
      expect(result).toContain('  "test": "value"');
      expect(result).toContain('  "number": 123');
    });
  });

  describe('file extension and MIME type', () => {
    it('should return correct file extension', () => {
      expect(writer.getFileExtension()).toBe('.json');
    });

    it('should return correct MIME type', () => {
      expect(writer.getMimeType()).toBe('application/json');
    });
  });

  describe('data validation', () => {
    it('should validate data successfully for valid input', () => {
      const data = { id: 'test', type: 'database' };
      const result = writer.validateData(data);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation for null data', () => {
      const result = writer.validateData(null);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Data cannot be null or undefined');
    });

    it('should warn for empty object', () => {
      const result = writer.validateData({});
      
      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('Data object is empty');
    });
  });
});