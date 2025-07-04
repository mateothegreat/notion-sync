import { promises as fs } from "fs";
import { join } from "path";
import type { ExportItem, StreamingExportConfig } from "./streaming-export-manager";

/**
 * Processes export items and writes them to disk with proper formatting.
 */
export class StreamProcessor {
  private isPaused: boolean = false;
  private activeProcessors: number = 0;
  private processedCount: number = 0;
  private outputHandles: Map<string, fs.FileHandle> = new Map();

  constructor(private config: StreamingExportConfig) {}

  /**
   * Process a single export item.
   */
  async processItem(item: ExportItem): Promise<void> {
    if (this.isPaused) {
      await this.waitForResume();
    }

    this.activeProcessors++;
    try {
      for (const format of this.config.format) {
        switch (format) {
          case "json":
            await this.processJsonItem(item);
            break;
          case "markdown":
            await this.processMarkdownItem(item);
            break;
          case "csv":
            await this.processCsvItem(item);
            break;
          default:
            throw new Error(`Unsupported format: ${format}`);
        }
      }
      this.processedCount++;
    } finally {
      this.activeProcessors--;
    }
  }

  /**
   * Pause processing.
   */
  pause(): void {
    this.isPaused = true;
  }

  /**
   * Resume processing.
   */
  resume(): void {
    this.isPaused = false;
  }

  /**
   * Get processing statistics.
   */
  getStats() {
    return {
      activeProcessors: this.activeProcessors,
      processedCount: this.processedCount,
      isPaused: this.isPaused
    };
  }

  /**
   * Close all file handles.
   */
  async close(): Promise<void> {
    for (const handle of this.outputHandles.values()) {
      await handle.close();
    }
    this.outputHandles.clear();
  }

  private async waitForResume(): Promise<void> {
    while (this.isPaused) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  private async processJsonItem(item: ExportItem): Promise<void> {
    // Ensure output directory exists
    await fs.mkdir(this.config.outputPath, { recursive: true });

    const filename = join(this.config.outputPath, `${item.type}s.jsonl`);
    const handle = await this.getFileHandle(filename);

    const line =
      JSON.stringify({
        id: item.id,
        type: item.type,
        timestamp: item.timestamp.toISOString(),
        data: item.data
      }) + "\n";

    await handle.write(line);
  }

  private async processMarkdownItem(item: ExportItem): Promise<void> {
    const filename = join(this.config.outputPath, item.type, `${item.id}.md`);
    const dir = join(this.config.outputPath, item.type);

    // Ensure directory exists
    await fs.mkdir(dir, { recursive: true });

    let content = "";
    if (item.type === "page") {
      // Extract title from Notion's title property format
      const titleProperty = item.data.properties?.Name?.title || item.data.properties?.title?.title;
      if (titleProperty && titleProperty.length > 0) {
        const title = titleProperty.map((t: any) => t.plain_text || t.text?.content || "").join("");
        content = `# ${title}\n\n`;
      }
    }

    // Convert blocks to markdown (simplified)
    if (item.data.blocks) {
      for (const block of item.data.blocks) {
        content += this.blockToMarkdown(block) + "\n\n";
      }
    }

    await fs.writeFile(filename, content);
  }

  private async processCsvItem(item: ExportItem): Promise<void> {
    // Ensure output directory exists
    await fs.mkdir(this.config.outputPath, { recursive: true });

    const filename = join(this.config.outputPath, `${item.type}s.csv`);
    const handle = await this.getFileHandle(filename);

    // Write header if file is new
    if (this.processedCount === 0) {
      await handle.write("id,type,timestamp,title\n");
    }

    const title = item.data.properties?.title || "";
    const line = `"${item.id}","${item.type}","${item.timestamp.toISOString()}","${title}"\n`;
    await handle.write(line);
  }

  private async getFileHandle(filename: string): Promise<fs.FileHandle> {
    if (!this.outputHandles.has(filename)) {
      const handle = await fs.open(filename, "a");
      this.outputHandles.set(filename, handle);
    }
    return this.outputHandles.get(filename)!;
  }

  private blockToMarkdown(block: any): string {
    // Extract text from Notion's rich text format
    const extractText = (richTextArray: any[]): string => {
      if (!richTextArray || !Array.isArray(richTextArray)) return "";
      return richTextArray.map((rt) => rt.plain_text || rt.text?.content || "").join("");
    };

    // Handle different block types with proper rich text extraction
    switch (block.type) {
      case "paragraph":
        return extractText(block.paragraph?.rich_text);
      case "heading_1":
        return `# ${extractText(block.heading_1?.rich_text)}`;
      case "heading_2":
        return `## ${extractText(block.heading_2?.rich_text)}`;
      case "heading_3":
        return `### ${extractText(block.heading_3?.rich_text)}`;
      case "bulleted_list_item":
        return `- ${extractText(block.bulleted_list_item?.rich_text)}`;
      case "numbered_list_item":
        return `1. ${extractText(block.numbered_list_item?.rich_text)}`;
      case "code":
        const codeText = extractText(block.code?.rich_text);
        const language = block.code?.language || "";
        return "```" + language + "\n" + codeText + "\n```";
      case "quote":
        return `> ${extractText(block.quote?.rich_text)}`;
      case "callout":
        return `💡 ${extractText(block.callout?.rich_text)}`;
      case "toggle":
        return `<details><summary>${extractText(block.toggle?.rich_text)}</summary></details>`;
      default:
        // Try to extract text from any rich_text property
        const richText = block[block.type]?.rich_text;
        return richText ? extractText(richText) : "";
    }
  }
}
