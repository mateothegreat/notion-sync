/**
 * src/lib/plugins/types.ts
 * * Defines the core interfaces for the plugin system.
 */
import { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import { AppContext } from "../context";

/**
 * @interface IRenderer
 * @description Defines the contract for a renderer plugin. A renderer is responsible
 * for transforming a Notion page object into a string representation (e.g., Markdown, HTML).
 */
export interface IRenderer {
  /**
   * The unique name of the renderer (e.g., 'markdown', 'json').
   */
  name: string;

  /**
   * Renders a Notion page object into a string.
   * @param {PageObjectResponse} page - The Notion page object to render.
   * @returns {Promise<string>} - The rendered content as a string.
   */
  render(page: PageObjectResponse): Promise<string>;
}

/**
 * @interface IExporter
 * @description Defines the contract for an exporter plugin. An exporter is responsible
 * for taking rendered content and saving it to a destination (e.g., filesystem, S3).
 */
export interface IExporter {
  /**
   * The unique name of the exporter (e.g., 'filesystem', 's3').
   */
  name: string;

  /**
   * Exports the given content.
   * @param {string} filePath - The intended destination path or identifier for the content.
   * @param {string} content - The content to export.
   * @returns {Promise<void>}
   */
  export(filePath: string, content: string): Promise<void>;
}

export interface IPlugin {
  name: string;
  install: (context: AppContext) => void;
}

/**
 * src/lib/plugins/plugin-manager.ts
 * * Manages the discovery, loading, and registration of plugins.
 */
import { IExporter, IRenderer } from "./types";

export class PluginManager {
  private readonly renderers = new Map<string, IRenderer>();
  private readonly exporters = new Map<string, IExporter>();

  constructor(private readonly appContext: AppContext) {}

  public registerRenderer(renderer: IRenderer): void {
    if (this.renderers.has(renderer.name)) {
      this.appContext.eventBus.emit("error", new Error(`Renderer '${renderer.name}' is already registered.`));
      return;
    }
    this.renderers.set(renderer.name, renderer);
  }

  public registerExporter(exporter: IExporter): void {
    if (this.exporters.has(exporter.name)) {
      this.appContext.eventBus.emit("error", new Error(`Exporter '${exporter.name}' is already registered.`));
      return;
    }
    this.exporters.set(exporter.name, exporter);
  }

  public getRenderer(name: string): IRenderer {
    const renderer = this.renderers.get(name);
    if (!renderer) {
      throw new Error(`Renderer '${name}' not found.`);
    }
    return renderer;
  }

  public getExporter(name: string): IExporter {
    const exporter = this.exporters.get(name);
    if (!exporter) {
      throw new Error(`Exporter '${name}' not found.`);
    }
    return exporter;
  }
}

/**
 * src/lib/context.ts
 * * Updated to include the PluginManager.
 */
import { IConfig } from "@oclif/core";
import { EventBus } from "./events/event-bus";
import { PluginManager } from "./plugins/plugin-manager";

export interface AppContextOptions {
  config: IConfig;
}

export class AppContext {
  public readonly eventBus: EventBus;
  public readonly config: IConfig;
  public readonly pluginManager: PluginManager;

  constructor(options: AppContextOptions) {
    this.eventBus = new EventBus();
    this.config = options.config;
    this.pluginManager = new PluginManager(this);
  }
}

/**
 * src/plugins/markdown-renderer.ts
 * * An example renderer that converts a Notion page to Markdown.
 */

export class MarkdownRenderer implements IRenderer {
  public readonly name = "markdown";

  public async render(page: PageObjectResponse): Promise<string> {
    const title = (page as any).properties.Name.title[0].plain_text;
    let content = `# ${title}\n\n`;
    // In a real implementation, you would convert the Notion blocks to Markdown.
    content += "*(Content would be rendered here)*";
    return content;
  }
}

/**
 * src/plugins/filesystem-exporter.ts
 * * An example exporter that saves content to the local filesystem.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";

export class FileSystemExporter implements IExporter {
  public readonly name = "filesystem";

  public async export(filePath: string, content: string): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content);
  }
}
