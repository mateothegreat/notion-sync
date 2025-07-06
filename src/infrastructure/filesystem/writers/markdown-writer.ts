/**
 * Markdown File Writer
 * 
 * Converts Notion objects to Markdown format with proper formatting
 */

import { BaseFileWriter } from '../base-writer';
import { FileWriteResult, MarkdownFormatOptions } from '../types';
import { NotionBlock, NotionDatabase, NotionPage } from '../../../shared/types';

export class MarkdownWriter extends BaseFileWriter {
  private formatOptions: MarkdownFormatOptions;

  constructor(config: any, eventPublisher?: (event: any) => Promise<void>, formatOptions?: MarkdownFormatOptions) {
    super(config, eventPublisher);
    
    this.formatOptions = {
      includeMetadata: true,
      includeFrontmatter: true,
      frontmatterFormat: 'yaml',
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      linkStyle: 'inline',
      imageHandling: 'link',
      ...formatOptions
    };
  }

  getFileExtension(): string {
    return '.md';
  }

  getMimeType(): string {
    return 'text/markdown';
  }

  /**
   * Write a Notion database to Markdown file
   */
  async writeDatabase(database: NotionDatabase, outputPath: string): Promise<FileWriteResult> {
    const filename = this.generateFilename(database);
    const filePath = this.getFullFilePath(outputPath, filename);
    
    const markdownContent = this.formatDatabaseData(database);
    return this.writeRawData(markdownContent, filePath);
  }

  /**
   * Write a Notion page to Markdown file
   */
  async writePage(page: NotionPage, outputPath: string): Promise<FileWriteResult> {
    const filename = this.generateFilename(page);
    const filePath = this.getFullFilePath(outputPath, filename);
    
    const markdownContent = this.formatPageData(page);
    return this.writeRawData(markdownContent, filePath);
  }

  /**
   * Write Notion blocks to Markdown file
   */
  async writeBlocks(blocks: NotionBlock[], outputPath: string): Promise<FileWriteResult> {
    const filename = `blocks_${Date.now()}`;
    const filePath = this.getFullFilePath(outputPath, filename);
    
    const markdownContent = this.formatBlocksData(blocks);
    return this.writeRawData(markdownContent, filePath);
  }

  /**
   * Format data as Markdown string
   */
  formatData(data: any): string {
    return data;
  }

  /**
   * Format database data for Markdown export
   */
  private formatDatabaseData(database: NotionDatabase): string {
    let content = '';

    // Add frontmatter if enabled
    if (this.formatOptions.includeFrontmatter) {
      content += this.generateFrontmatter({
        title: database.title,
        type: 'database',
        id: database.id,
        url: database.url,
        archived: database.archived,
        createdTime: database.createdTime,
        lastEditedTime: database.lastEditedTime
      });
      content += '\n';
    }

    // Add title
    content += this.formatHeading(database.title || 'Untitled Database', 1);
    content += '\n';

    // Add description if available
    if (database.description) {
      content += `${database.description}\n\n`;
    }

    // Add metadata section if enabled
    if (this.formatOptions.includeMetadata) {
      content += this.formatHeading('Database Information', 2);
      content += `- **ID**: ${database.id}\n`;
      content += `- **URL**: [Open in Notion](${database.url})\n`;
      content += `- **Created**: ${this.formatDate(database.createdTime)}\n`;
      content += `- **Last Edited**: ${this.formatDate(database.lastEditedTime)}\n`;
      content += `- **Archived**: ${database.archived ? 'Yes' : 'No'}\n\n`;
    }

    // Add properties section
    if (database.properties && Object.keys(database.properties).length > 0) {
      content += this.formatHeading('Properties', 2);
      content += this.formatDatabaseProperties(database.properties);
      content += '\n';
    }

    return content;
  }

  /**
   * Format page data for Markdown export
   */
  private formatPageData(page: NotionPage): string {
    let content = '';

    // Add frontmatter if enabled
    if (this.formatOptions.includeFrontmatter) {
      content += this.generateFrontmatter({
        title: page.title,
        type: 'page',
        id: page.id,
        url: page.url,
        archived: page.archived,
        createdTime: page.createdTime,
        lastEditedTime: page.lastEditedTime
      });
      content += '\n';
    }

    // Add title
    content += this.formatHeading(page.title || 'Untitled Page', 1);
    content += '\n';

    // Add metadata section if enabled
    if (this.formatOptions.includeMetadata) {
      content += this.formatHeading('Page Information', 2);
      content += `- **ID**: ${page.id}\n`;
      content += `- **URL**: [Open in Notion](${page.url})\n`;
      content += `- **Created**: ${this.formatDate(page.createdTime)}\n`;
      content += `- **Last Edited**: ${this.formatDate(page.lastEditedTime)}\n`;
      content += `- **Archived**: ${page.archived ? 'Yes' : 'No'}\n\n`;
    }

    // Add properties section
    if (page.properties && Object.keys(page.properties).length > 0) {
      content += this.formatHeading('Properties', 2);
      content += this.formatPageProperties(page.properties);
      content += '\n';
    }

    return content;
  }

  /**
   * Format blocks data for Markdown export
   */
  private formatBlocksData(blocks: NotionBlock[]): string {
    let content = '';

    content += this.formatHeading('Blocks', 1);
    content += '\n';

    for (const block of blocks) {
      content += this.formatBlock(block);
      content += '\n';
    }

    return content;
  }

  /**
   * Format individual block as Markdown
   */
  private formatBlock(block: NotionBlock, level: number = 0): string {
    const indent = '  '.repeat(level);
    
    switch (block.blockType) {
      case 'paragraph':
        return this.formatParagraph(block.content);

      case 'heading_1':
        return this.formatHeading(this.extractRichText(block.content?.rich_text), 1);

      case 'heading_2':
        return this.formatHeading(this.extractRichText(block.content?.rich_text), 2);

      case 'heading_3':
        return this.formatHeading(this.extractRichText(block.content?.rich_text), 3);

      case 'bulleted_list_item':
        return `${indent}- ${this.formatRichText(block.content?.rich_text)}`;

      case 'numbered_list_item':
        return `${indent}1. ${this.formatRichText(block.content?.rich_text)}`;

      case 'to_do':
        const checked = block.content?.checked ? 'x' : ' ';
        return `${indent}- [${checked}] ${this.formatRichText(block.content?.rich_text)}`;

      case 'toggle':
        return `${indent}<details>\n${indent}  <summary>${this.formatRichText(block.content?.rich_text)}</summary>\n${indent}</details>`;

      case 'code':
        return this.formatCodeBlock(block.content);

      case 'quote':
        return `> ${this.formatRichText(block.content?.rich_text)}`;

      case 'callout':
        const icon = block.content?.icon?.emoji || '💡';
        return `> ${icon} ${this.formatRichText(block.content?.rich_text)}`;

      case 'divider':
        return '---';

      case 'image':
        return this.formatImage(block.content);

      case 'video':
        return this.formatVideo(block.content);

      case 'file':
        return this.formatFile(block.content);

      case 'bookmark':
        return this.formatBookmark(block.content);

      case 'embed':
        return this.formatEmbed(block.content);

      case 'table':
        return this.formatTable(block.content);

      case 'table_row':
        return this.formatTableRow(block.content);

      case 'equation':
        return `$$${block.content?.expression}$$`;

      case 'breadcrumb':
        return '*Breadcrumb*';

      case 'table_of_contents':
        return '*Table of Contents*';

      case 'link_preview':
        return `[Link Preview](${block.content?.url})`;

      default:
        return `*${block.blockType}*: ${this.formatRichText(block.content?.rich_text)}`;
    }
  }

  /**
   * Generate frontmatter in specified format
   */
  private generateFrontmatter(metadata: Record<string, any>): string {
    switch (this.formatOptions.frontmatterFormat) {
      case 'yaml':
        return this.generateYamlFrontmatter(metadata);
      case 'json':
        return this.generateJsonFrontmatter(metadata);
      case 'toml':
        return this.generateTomlFrontmatter(metadata);
      default:
        return this.generateYamlFrontmatter(metadata);
    }
  }

  /**
   * Generate YAML frontmatter
   */
  private generateYamlFrontmatter(metadata: Record<string, any>): string {
    let yaml = '---\n';
    for (const [key, value] of Object.entries(metadata)) {
      if (typeof value === 'string') {
        yaml += `${key}: "${value}"\n`;
      } else if (typeof value === 'boolean') {
        yaml += `${key}: ${value}\n`;
      } else if (value instanceof Date) {
        yaml += `${key}: "${value.toISOString()}"\n`;
      } else {
        yaml += `${key}: ${JSON.stringify(value)}\n`;
      }
    }
    yaml += '---';
    return yaml;
  }

  /**
   * Generate JSON frontmatter
   */
  private generateJsonFrontmatter(metadata: Record<string, any>): string {
    return `---\n${JSON.stringify(metadata, null, 2)}\n---`;
  }

  /**
   * Generate TOML frontmatter
   */
  private generateTomlFrontmatter(metadata: Record<string, any>): string {
    let toml = '+++\n';
    for (const [key, value] of Object.entries(metadata)) {
      if (typeof value === 'string') {
        toml += `${key} = "${value}"\n`;
      } else if (typeof value === 'boolean') {
        toml += `${key} = ${value}\n`;
      } else if (value instanceof Date) {
        toml += `${key} = "${value.toISOString()}"\n`;
      } else {
        toml += `${key} = ${JSON.stringify(value)}\n`;
      }
    }
    toml += '+++';
    return toml;
  }

  /**
   * Format heading based on style preference
   */
  private formatHeading(text: string, level: number): string {
    if (this.formatOptions.headingStyle === 'atx') {
      return `${'#'.repeat(level)} ${text}`;
    } else {
      // Setext style (only for h1 and h2)
      if (level === 1) {
        return `${text}\n${'='.repeat(text.length)}`;
      } else if (level === 2) {
        return `${text}\n${'-'.repeat(text.length)}`;
      } else {
        return `${'#'.repeat(level)} ${text}`;
      }
    }
  }

  /**
   * Format paragraph content
   */
  private formatParagraph(content: any): string {
    return this.formatRichText(content?.rich_text);
  }

  /**
   * Format rich text array
   */
  private formatRichText(richText: any[]): string {
    if (!Array.isArray(richText)) {
      return '';
    }

    return richText.map(item => {
      let text = item.plain_text || item.text?.content || '';
      
      if (item.annotations) {
        if (item.annotations.bold) text = `**${text}**`;
        if (item.annotations.italic) text = `*${text}*`;
        if (item.annotations.strikethrough) text = `~~${text}~~`;
        if (item.annotations.underline) text = `<u>${text}</u>`;
        if (item.annotations.code) text = `\`${text}\``;
      }

      if (item.text?.link) {
        text = this.formatLink(text, item.text.link.url);
      }

      return text;
    }).join('');
  }

  /**
   * Extract plain text from rich text
   */
  private extractRichText(richText: any[]): string {
    if (!Array.isArray(richText)) {
      return '';
    }
    return richText.map(item => item.plain_text || item.text?.content || '').join('');
  }

  /**
   * Format link based on style preference
   */
  private formatLink(text: string, url: string): string {
    if (this.formatOptions.linkStyle === 'inline') {
      return `[${text}](${url})`;
    } else {
      // Reference style would require collecting all links
      return `[${text}](${url})`;
    }
  }

  /**
   * Format code block
   */
  private formatCodeBlock(content: any): string {
    const language = content?.language || '';
    const code = this.extractRichText(content?.rich_text);
    
    if (this.formatOptions.codeBlockStyle === 'fenced') {
      return `\`\`\`${language}\n${code}\n\`\`\``;
    } else {
      return code.split('\n').map(line => `    ${line}`).join('\n');
    }
  }

  /**
   * Format image
   */
  private formatImage(content: any): string {
    const url = content?.file?.url || content?.external?.url || '';
    const caption = this.extractRichText(content?.caption);
    
    switch (this.formatOptions.imageHandling) {
      case 'embed':
        return `![${caption}](${url})`;
      case 'link':
        return `[Image: ${caption || 'Untitled'}](${url})`;
      case 'download':
        // Would need to implement image downloading
        return `![${caption}](${url})`;
      default:
        return `![${caption}](${url})`;
    }
  }

  /**
   * Format video
   */
  private formatVideo(content: any): string {
    const url = content?.file?.url || content?.external?.url || '';
    const caption = this.extractRichText(content?.caption);
    return `[Video: ${caption || 'Untitled'}](${url})`;
  }

  /**
   * Format file
   */
  private formatFile(content: any): string {
    const url = content?.file?.url || content?.external?.url || '';
    const caption = this.extractRichText(content?.caption);
    return `[File: ${caption || 'Untitled'}](${url})`;
  }

  /**
   * Format bookmark
   */
  private formatBookmark(content: any): string {
    const url = content?.url || '';
    const caption = this.extractRichText(content?.caption);
    return `[${caption || url}](${url})`;
  }

  /**
   * Format embed
   */
  private formatEmbed(content: any): string {
    const url = content?.url || '';
    const caption = this.extractRichText(content?.caption);
    return `[Embed: ${caption || url}](${url})`;
  }

  /**
   * Format table (simplified)
   */
  private formatTable(content: any): string {
    // This would need to be implemented with actual table data
    return '*Table content would be rendered here*';
  }

  /**
   * Format table row
   */
  private formatTableRow(content: any): string {
    const cells = content?.cells || [];
    return `| ${cells.map((cell: any) => this.formatRichText(cell)).join(' | ')} |`;
  }

  /**
   * Format database properties
   */
  private formatDatabaseProperties(properties: Record<string, any>): string {
    let content = '';
    
    for (const [name, property] of Object.entries(properties)) {
      content += `- **${name}** (${property.type})\n`;
    }
    
    return content;
  }

  /**
   * Format page properties
   */
  private formatPageProperties(properties: Record<string, any>): string {
    let content = '';
    
    for (const [name, property] of Object.entries(properties)) {
      const value = this.formatPropertyValue(property);
      content += `- **${name}**: ${value}\n`;
    }
    
    return content;
  }

  /**
   * Format property value based on type
   */
  private formatPropertyValue(property: any): string {
    if (!property || !property.type) {
      return 'N/A';
    }

    switch (property.type) {
      case 'title':
      case 'rich_text':
        return this.formatRichText(property[property.type]);
      
      case 'number':
        return property.number?.toString() || 'N/A';
      
      case 'select':
        return property.select?.name || 'N/A';
      
      case 'multi_select':
        return property.multi_select?.map((item: any) => item.name).join(', ') || 'N/A';
      
      case 'date':
        if (property.date?.start) {
          const start = this.formatDate(property.date.start);
          const end = property.date?.end ? ` - ${this.formatDate(property.date.end)}` : '';
          return `${start}${end}`;
        }
        return 'N/A';
      
      case 'people':
        return property.people?.map((person: any) => person.name || person.id).join(', ') || 'N/A';
      
      case 'files':
        return property.files?.map((file: any) => file.name || 'File').join(', ') || 'N/A';
      
      case 'checkbox':
        return property.checkbox ? 'Yes' : 'No';
      
      case 'url':
        return property.url ? `[${property.url}](${property.url})` : 'N/A';
      
      case 'email':
        return property.email || 'N/A';
      
      case 'phone_number':
        return property.phone_number || 'N/A';
      
      case 'formula':
        return property.formula?.string || property.formula?.number?.toString() || 'N/A';
      
      case 'relation':
        return property.relation?.map((rel: any) => rel.id).join(', ') || 'N/A';
      
      case 'rollup':
        return property.rollup?.array?.map((item: any) => item.title || item.id).join(', ') || 'N/A';
      
      case 'created_time':
        return this.formatDate(property.created_time);
      
      case 'created_by':
        return property.created_by?.name || property.created_by?.id || 'N/A';
      
      case 'last_edited_time':
        return this.formatDate(property.last_edited_time);
      
      case 'last_edited_by':
        return property.last_edited_by?.name || property.last_edited_by?.id || 'N/A';
      
      default:
        return JSON.stringify(property[property.type]) || 'N/A';
    }
  }
}