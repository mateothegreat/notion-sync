/**
 * src/lib/commands/base-command.ts
 * * The base command is updated to create and manage the AppContext.
 */
import { Command, Config } from "@oclif/core";
import { AppContext, createAppContext } from "../context";

export default abstract class BaseCommand<T extends typeof Command> extends Command {
  protected appContext!: AppContext;

  public constructor(argv: string[], config: Config) {
    super(argv, config);
  }

  /**
   * Overrides the oclif init method to create the application context.
   * This ensures the context and event bus are available to all commands.
   */
  protected async init(): Promise<void> {
    await super.init();
    // Create the application context, which holds the event bus and other shared resources.
    this.appContext = createAppContext({ config: this.config });
  }

  /**
   * Centralized error handler. Emits errors to the event bus.
   */
  protected async catch(err: Error & { exitCode?: number }): Promise<any> {
    // Emit the error on the event bus for any interested listeners.
    this.appContext.eventBus.emit("error", err);
    return super.catch(err);
  }
}

/**
 * src/commands/export.ts
 * * The main export command, refactored to use the event bus for progress updates.
 */
import { Flags } from "@oclif/core";
import { Presets, SingleBar } from "cli-progress";
import { cli } from "cli-ux";
import * as path from "node:path";

import BaseCommand from "../lib/commands/base-command";
import * as flags from "../lib/commands/flags";
import { EventPayloads } from "../lib/events/types";
import { StreamingExportManager } from "../lib/export/streaming-export-manager";

export default class Export extends BaseCommand<typeof Export> {
  static description = "Export data from Notion";

  static examples = [
    `$ notion-sync export --token <token> --database-id <db-id>
`
  ];

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
    })
  };

  private progressBar!: SingleBar;

  /**
   * Sets up listeners on the event bus to handle progress bar updates.
   */
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

  public async run(): Promise<void> {
    const { flags } = await this.parse(Export);

    this.setupEventListeners(this.appContext);

    cli.action.start("Starting export...");

    const manager = new StreamingExportManager(this.appContext, {
      notionToken: flags.token,
      databaseId: flags["database-id"],
      outputPath: path.resolve(process.cwd(), flags["output-path"])
    });

    await manager.start();

    cli.action.stop("Export complete!");
  }
}

/**
 * src/lib/export/streaming-export-manager.ts
 * * Refactored to use the AppContext and EventBus instead of extending EventEmitter.
 */
import { Client } from "@notionhq/client";
import { Exporter } from "./exporter";
import { NotionApiStreamer } from "./notion-api-streamer";

export interface StreamingExportManagerOptions {
  notionToken: string;
  databaseId: string;
  outputPath: string;
}

export class StreamingExportManager {
  private readonly appContext: AppContext;
  private readonly notion: Client;
  private readonly options: StreamingExportManagerOptions;

  constructor(appContext: AppContext, options: StreamingExportManagerOptions) {
    this.appContext = appContext;
    this.options = options;
    this.notion = new Client({ auth: options.notionToken });
  }

  public async start(): Promise<void> {
    const notionStreamer = new NotionApiStreamer({
      notion: this.notion,
      databaseId: this.options.databaseId
    });

    const pagesStream = notionStreamer.streamPages();
    const exporter = new Exporter(this.appContext, {
      notion: this.notion,
      outputPath: this.options.outputPath
    });

    let pageCount = 0;
    const pages = [];

    for await (const page of pagesStream) {
      pageCount++;
      pages.push(page);
    }

    this.appContext.eventBus.emit("progress:start", {
      total: pageCount,
      startValue: 0,
      payload: { type: "pages" }
    });

    for (const page of pages) {
      await exporter.exportPage(page);
      this.appContext.eventBus.emit("progress:tick", {
        payload: { type: "pages", page: (page as any).properties.Name.title[0].plain_text }
      });
    }

    this.appContext.eventBus.emit("cli:stop", undefined);
  }
}

/**
 * src/lib/export/exporter.ts
 * * The lowest-level worker, refactored to use the event bus.
 */
import { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import * as fs from "node:fs/promises";

export interface ExporterOptions {
  notion: Client;
  outputPath: string;
}

export class Exporter {
  private readonly appContext: AppContext;
  private readonly options: ExporterOptions;

  constructor(appContext: AppContext, options: ExporterOptions) {
    this.appContext = appContext;
    this.options = options;
  }

  public async exportPage(page: PageObjectResponse): Promise<void> {
    try {
      const pageTitle = (page as any).properties.Name.title[0].plain_text;
      const safeTitle = pageTitle.replace(/[^a-z0-9]/gi, "_").toLowerCase();
      const filePath = path.join(this.options.outputPath, `${safeTitle}.json`);

      await fs.writeFile(filePath, JSON.stringify(page, null, 2));
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Failed to export page");
      this.appContext.eventBus.emit("error", err);
    }
  }
}
