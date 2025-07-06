/**
 * src/lib/export/streaming-export-manager.ts
 * * Refactored to use an RxJS pipeline for orchestrating the export process.
 */
import { Client } from "@notionhq/client";
import { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import * as path from "node:path";
import { concatMap, finalize, from, lastValueFrom, mergeMap, tap, toArray } from "rxjs";
import { AppContext } from "../context";
import { IExporter, IRenderer } from "../plugins/types";
import { NotionApiStreamer } from "./notion-api-streamer";

export interface StreamingExportManagerOptions {
  notionToken: string;
  databaseId: string;
  outputPath: string;
  renderer: string;
  exporter: string;
}

export class StreamingExportManager {
  private readonly appContext: AppContext;
  private readonly notion: Client;
  private readonly options: StreamingExportManagerOptions;
  private readonly renderer: IRenderer;
  private readonly exporter: IExporter;

  constructor(appContext: AppContext, options: StreamingExportManagerOptions) {
    this.appContext = appContext;
    this.options = options;
    this.notion = new Client({ auth: options.notionToken });

    // Get the selected renderer and exporter from the plugin manager
    this.renderer = this.appContext.pluginManager.getRenderer(options.renderer);
    this.exporter = this.appContext.pluginManager.getExporter(options.exporter);
  }

  /**
   * Starts the export process using an RxJS pipeline.
   * The pipeline fetches all pages, then processes them sequentially.
   * @returns {Promise<void>} A promise that resolves when the export is complete.
   */
  public async start(): Promise<void> {
    const notionStreamer = new NotionApiStreamer({
      notion: this.notion,
      databaseId: this.options.databaseId
    });

    // Create an observable from the async generator of Notion pages
    const pages$ = from(notionStreamer.streamPages());

    const exportPipeline$ = pages$.pipe(
      // Step 1: Collect all pages into an array to get the total count for the progress bar.
      // Note: This buffers pages in memory. For extremely large datasets, a different
      // strategy might be needed if memory becomes a concern.
      toArray(),

      // Step 2: Start the progress bar now that we have the total count.
      tap((pages: PageObjectResponse[]) => {
        this.appContext.eventBus.emit("progress:start", {
          total: pages.length,
          startValue: 0,
          payload: { type: "pages" }
        });
      }),

      // Step 3: Flatten the array of pages back into a stream to process them one by one.
      mergeMap((pages: PageObjectResponse[]) => from(pages)),

      // Step 4: Process each page sequentially. `concatMap` waits for the inner
      // observable to complete before processing the next item. This prevents
      // overwhelming the filesystem or other resources.
      concatMap((page: PageObjectResponse) => {
        const pageTitle = (page as any).properties.Name.title[0].plain_text;
        const safeTitle = pageTitle.replace(/[^a-z0-9]/gi, "_").toLowerCase();
        const filePath = path.join(this.options.outputPath, `${safeTitle}.md`);

        // Create a sub-pipeline for rendering and exporting a single page
        return from(this.renderer.render(page)).pipe(
          mergeMap((renderedContent: string) =>
            // Convert the exporter's promise to an observable
            from(this.exporter.export(filePath, renderedContent))
          ),
          // After the page is successfully exported, tick the progress bar.
          tap(() => {
            this.appContext.eventBus.emit("progress:tick", {
              payload: { type: "pages", page: pageTitle }
            });
          })
        );
      }),

      // Step 5: When the entire pipeline is complete, stop the CLI progress bar.
      finalize(() => {
        this.appContext.eventBus.emit("cli:stop", undefined);
      })
    );

    // Execute the pipeline and wait for it to complete.
    await lastValueFrom(exportPipeline$, { defaultValue: undefined });
  }
}

/**
 * src/commands/export.ts
 * * The export command remains unchanged as the complexity is encapsulated
 * * in the StreamingExportManager. It still calls `start()` as a promise.
 */
import { Flags } from "@oclif/core";
import { Presets, SingleBar } from "cli-progress";
import { cli } from "cli-ux";

import BaseCommand from "../lib/commands/base-command";
import * as flags from "../lib/commands/flags";
import { EventPayloads } from "../lib/events/types";
import { StreamingExportManager } from "../lib/export/streaming-export-manager";
import { FileSystemExporter } from "../plugins/filesystem-exporter";
import { MarkdownRenderer } from "../plugins/markdown-renderer";

export default class Export extends BaseCommand<typeof Export> {
  static description = "Export data from Notion using a plugin-based system.";

  static examples = [`$ notion-sync export -d <db-id> --renderer markdown --exporter filesystem`];

  static flags = {
    ...flags.common,
    "database-id": Flags.string({
      char: "d",
      description: "The ID of the database to export",
      required: true
    }),
    "output-path": Flags.string({
      char: "o",
      description: "Path to save the exported files",
      default: "./"
    }),
    renderer: Flags.string({
      description: "The renderer plugin to use",
      default: "markdown"
    }),
    exporter: Flags.string({
      description: "The exporter plugin to use",
      default: "filesystem"
    })
  };

  private progressBar!: SingleBar;

  private setupEventListeners(appContext: AppContext) {
    const onProgressStart = (payload: EventPayloads["progress:start"]) => {
      this.progressBar = new SingleBar({}, Presets.shades_classic);
      this.progressBar.start(payload.total, payload.startValue, payload.payload);
    };

    const onProgressTick = (payload: EventPayloads["progress:tick"]) => {
      if (this.progressBar) {
        this.progressBar.increment(1, payload.payload);
      }
    };

    const onCliStop = () => {
      if (this.progressBar) {
        this.progressBar.stop();
      }
    };

    appContext.eventBus.on("progress:start", onProgressStart);
    appContext.eventBus.on("progress:tick", onProgressTick);
    appContext.eventBus.on("cli:stop", onCliStop);
  }

  /**
   * Registers the core plugins with the plugin manager.
   * In a real application, this might involve dynamically scanning a plugins directory.
   */
  private registerCorePlugins() {
    this.appContext.pluginManager.registerRenderer(new MarkdownRenderer());
    this.appContext.pluginManager.registerExporter(new FileSystemExporter());
  }

  public async run(): Promise<void> {
    const { flags } = await this.parse(Export);

    this.setupEventListeners(this.appContext);
    this.registerCorePlugins();

    cli.action.start(`Exporting using ${flags.renderer} renderer and ${flags.exporter} exporter...`);

    const manager = new StreamingExportManager(this.appContext, {
      notionToken: flags.token,
      databaseId: flags["database-id"],
      outputPath: path.resolve(process.cwd(), flags["output-path"]),
      renderer: flags.renderer,
      exporter: flags.exporter
    });

    await manager.start();

    cli.action.stop("Export complete!");
  }
}
