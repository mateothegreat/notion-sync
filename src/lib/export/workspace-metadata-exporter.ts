import { log } from "$lib/log";
import { Client } from "@notionhq/client";
import { promises as fs } from "fs";
import path from "path";
import type { OperationEventEmitter } from "../operations";
import { retry } from "../operations";
import { ExporterConfig } from "./config";

export class WorkspaceMetadataExporter {
  private client: Client;
  private config: ExporterConfig;
  private emitter: OperationEventEmitter;

  constructor(config: ExporterConfig, emitter: OperationEventEmitter) {
    this.config = config;
    this.client = new Client({
      auth: this.config.token,
      timeoutMs: this.config.timeout
    });
    this.emitter = emitter;
  }

  async export(): Promise<any> {
    this.emitter.emit("debug", "Exporting workspace metadata");

    try {
      const userInfo = await retry({
        fn: () => this.client.users.me({}),
        operation: "workspace metadata",
        context: {
          op: "read",
          priority: "normal"
        },
        maxRetries: this.config.retries,
        baseDelay: this.config.rate,
        timeout: this.config.timeout,
        emitter: this.emitter
      });

      const workspaceInfo = {
        exportDate: new Date().toISOString(),
        exportVersion: "1.0.0",
        user: userInfo,
        settings: {
          includeArchived: this.config.archived,
          includeComments: this.config.comments,
          maxDepth: this.config.depth
        }
      };

      const filePath = path.join(this.config.output, "metadata", "workspace-info.json");
      await fs.writeFile(filePath, JSON.stringify(workspaceInfo, null, 2));
      log.info(`Saving workspace metadata to disk at ${filePath}`);

      return workspaceInfo;
    } catch (error) {
      this.emitter.emit("error", { name: "workspace metadata", operation: "get", priority: "normal", data: { error } });
      return null;
    }
  }
}
