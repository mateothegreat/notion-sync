/**
 * JSON File Writer
 * 
 * Writes Notion objects to structured JSON files
 */

import { BaseFileWriter } from '../base-writer';
import { FileWriteResult, JsonFormatOptions } from '../types';
import { NotionBlock, NotionDatabase, NotionPage } from '../../../shared/types';

export class JSONWriter extends BaseFileWriter {
  private formatOptions: JsonFormatOptions;

  constructor(config: any, eventPublisher?: (event: any) => Promise<void>, formatOptions?: JsonFormatOptions) {
    super(config, eventPublisher);
    
    this.formatOptions = {
      pretty: true,
      includeMetadata: true,
      includeBlocks: true,
      includeProperties: true,
      dateFormat: 'iso',
      ...formatOptions
    };
  }

  getFileExtension(): string {
    return '.json';
  }

  getMimeType(): string {
    return 'application/json';
  }

  /**
   * Write a Notion database to JSON file
   */
  async writeDatabase(database: NotionDatabase, outputPath: string): Promise<FileWriteResult> {
    const filename = this.generateFilename(database);
    const filePath = this.getFullFilePath(outputPath, filename);
    
    const jsonData = this.formatDatabaseData(database);
    return this.writeRawData(jsonData, filePath);
  }

  /**
   * Write a Notion page to JSON file
   */
  async writePage(page: NotionPage, outputPath: string): Promise<FileWriteResult> {
    const filename = this.generateFilename(page);
    const filePath = this.getFullFilePath(outputPath, filename);
    
    const jsonData = this.formatPageData(page);
    return this.writeRawData(jsonData, filePath);
  }

  /**
   * Write Notion blocks to JSON file
   */
  async writeBlocks(blocks: NotionBlock[], outputPath: string): Promise<FileWriteResult> {
    const filename = `blocks_${Date.now()}`;
    const filePath = this.getFullFilePath(outputPath, filename);
    
    const jsonData = this.formatBlocksData(blocks);
    return this.writeRawData(jsonData, filePath);
  }

  /**
   * Format data as JSON string
   */
  formatData(data: any): string {
    if (this.formatOptions.pretty) {
      return JSON.stringify(data, null, 2);
    }
    return JSON.stringify(data);
  }

  /**
   * Format database data for JSON export
   */
  private formatDatabaseData(database: NotionDatabase): any {
    const data: any = {
      id: database.id,
      type: 'database',
      title: database.title,
      description: database.description,
      url: database.url,
      archived: database.archived
    };

    if (this.formatOptions.includeMetadata) {
      data.metadata = {
        createdTime: this.formatDate(database.createdTime, this.formatOptions.dateFormat),
        lastEditedTime: this.formatDate(database.lastEditedTime, this.formatOptions.dateFormat),
        createdBy: database.createdBy,
        lastEditedBy: database.lastEditedBy,
        parent: database.parent
      };
    }

    if (this.formatOptions.includeProperties && database.properties) {
      data.properties = this.formatProperties(database.properties);
    }

    return data;
  }

  /**
   * Format page data for JSON export
   */
  private formatPageData(page: NotionPage): any {
    const data: any = {
      id: page.id,
      type: 'page',
      title: page.title,
      url: page.url,
      archived: page.archived
    };

    if (this.formatOptions.includeMetadata) {
      data.metadata = {
        createdTime: this.formatDate(page.createdTime, this.formatOptions.dateFormat),
        lastEditedTime: this.formatDate(page.lastEditedTime, this.formatOptions.dateFormat),
        createdBy: page.createdBy,
        lastEditedBy: page.lastEditedBy,
        parent: page.parent
      };
    }

    if (this.formatOptions.includeProperties && page.properties) {
      data.properties = this.formatProperties(page.properties);
    }

    return data;
  }

  /**
   * Format blocks data for JSON export
   */
  private formatBlocksData(blocks: NotionBlock[]): any {
    return {
      type: 'blocks',
      count: blocks.length,
      blocks: blocks.map(block => this.formatBlockData(block))
    };
  }

  /**
   * Format individual block data
   */
  private formatBlockData(block: NotionBlock): any {
    const data: any = {
      id: block.id,
      type: block.blockType,
      hasChildren: block.hasChildren,
      archived: block.archived
    };

    if (this.formatOptions.includeMetadata) {
      data.metadata = {
        createdTime: this.formatDate(block.createdTime, this.formatOptions.dateFormat),
        lastEditedTime: this.formatDate(block.lastEditedTime, this.formatOptions.dateFormat),
        createdBy: block.createdBy,
        lastEditedBy: block.lastEditedBy
      };
    }

    if (block.content) {
      data.content = this.formatBlockContent(block.content, block.blockType);
    }

    return data;
  }

  /**
   * Format block content based on block type
   */
  private formatBlockContent(content: any, blockType: string): any {
    switch (blockType) {
      case 'paragraph':
        return {
          richText: content.rich_text || [],
          color: content.color
        };

      case 'heading_1':
      case 'heading_2':
      case 'heading_3':
        return {
          richText: content.rich_text || [],
          color: content.color,
          isToggleable: content.is_toggleable || false
        };

      case 'bulleted_list_item':
      case 'numbered_list_item':
        return {
          richText: content.rich_text || [],
          color: content.color,
          children: content.children || []
        };

      case 'to_do':
        return {
          richText: content.rich_text || [],
          checked: content.checked || false,
          color: content.color,
          children: content.children || []
        };

      case 'toggle':
        return {
          richText: content.rich_text || [],
          color: content.color,
          children: content.children || []
        };

      case 'code':
        return {
          richText: content.rich_text || [],
          language: content.language || 'plain text',
          caption: content.caption || []
        };

      case 'quote':
        return {
          richText: content.rich_text || [],
          color: content.color,
          children: content.children || []
        };

      case 'callout':
        return {
          richText: content.rich_text || [],
          icon: content.icon,
          color: content.color,
          children: content.children || []
        };

      case 'divider':
        return {};

      case 'image':
      case 'video':
      case 'file':
      case 'pdf':
        return {
          type: content.type,
          url: content[content.type]?.url,
          caption: content.caption || []
        };

      case 'bookmark':
        return {
          url: content.url,
          caption: content.caption || []
        };

      case 'embed':
        return {
          url: content.url,
          caption: content.caption || []
        };

      case 'table':
        return {
          tableWidth: content.table_width,
          hasColumnHeader: content.has_column_header,
          hasRowHeader: content.has_row_header,
          children: content.children || []
        };

      case 'table_row':
        return {
          cells: content.cells || []
        };

      case 'equation':
        return {
          expression: content.expression
        };

      case 'breadcrumb':
        return {};

      case 'table_of_contents':
        return {
          color: content.color
        };

      case 'column_list':
      case 'column':
        return {
          children: content.children || []
        };

      case 'link_preview':
        return {
          url: content.url
        };

      case 'synced_block':
        return {
          syncedFrom: content.synced_from,
          children: content.children || []
        };

      case 'template':
        return {
          richText: content.rich_text || [],
          children: content.children || []
        };

      case 'link_to_page':
        return {
          type: content.type,
          pageId: content.page_id,
          databaseId: content.database_id
        };

      default:
        return content;
    }
  }

  /**
   * Format properties object
   */
  private formatProperties(properties: Record<string, any>): Record<string, any> {
    const formatted: Record<string, any> = {};

    for (const [key, property] of Object.entries(properties)) {
      formatted[key] = this.formatProperty(property);
    }

    return formatted;
  }

  /**
   * Format individual property
   */
  private formatProperty(property: any): any {
    if (!property || !property.type) {
      return property;
    }

    const formatted: any = {
      id: property.id,
      name: property.name,
      type: property.type
    };

    // Add type-specific configuration
    switch (property.type) {
      case 'title':
      case 'rich_text':
        formatted.richText = property[property.type] || [];
        break;

      case 'number':
        formatted.number = property.number;
        formatted.format = property.number?.format;
        break;

      case 'select':
        formatted.select = property.select;
        formatted.options = property.select?.options || [];
        break;

      case 'multi_select':
        formatted.multiSelect = property.multi_select;
        formatted.options = property.multi_select?.options || [];
        break;

      case 'date':
        formatted.date = property.date;
        if (property.date?.start) {
          formatted.date.start = this.formatDate(property.date.start, this.formatOptions.dateFormat);
        }
        if (property.date?.end) {
          formatted.date.end = this.formatDate(property.date.end, this.formatOptions.dateFormat);
        }
        break;

      case 'people':
        formatted.people = property.people || [];
        break;

      case 'files':
        formatted.files = property.files || [];
        break;

      case 'checkbox':
        formatted.checkbox = property.checkbox;
        break;

      case 'url':
        formatted.url = property.url;
        break;

      case 'email':
        formatted.email = property.email;
        break;

      case 'phone_number':
        formatted.phoneNumber = property.phone_number;
        break;

      case 'formula':
        formatted.formula = property.formula;
        break;

      case 'relation':
        formatted.relation = property.relation;
        break;

      case 'rollup':
        formatted.rollup = property.rollup;
        break;

      case 'created_time':
        formatted.createdTime = this.formatDate(property.created_time, this.formatOptions.dateFormat);
        break;

      case 'created_by':
        formatted.createdBy = property.created_by;
        break;

      case 'last_edited_time':
        formatted.lastEditedTime = this.formatDate(property.last_edited_time, this.formatOptions.dateFormat);
        break;

      case 'last_edited_by':
        formatted.lastEditedBy = property.last_edited_by;
        break;

      default:
        formatted.value = property[property.type];
        break;
    }

    return formatted;
  }
}