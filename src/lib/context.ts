import { NotionClient } from "$notion/client";
import { NotionObjectType } from "$notion/types";
import { Registry } from "prom-client";
import { ResolvedCommandConfig } from "./config/loader";
import { bus, MessageBusAdapter } from "./message-bus/message-bus";
import { Plugin, plugins } from "./plugins/plugin";

export type ContextConfig = {
  command: ResolvedCommandConfig<string>;
  token: string;
  plugins?: Plugin[];
};

export class Context<C extends string> {
  command: ResolvedCommandConfig<C>;
  notionClient: NotionClient;
  plugins: Plugin[] = [];
  bus: {
    adapter: MessageBusAdapter;
    registry: Registry;
  };

  constructor(private config: ContextConfig) {
    this.command = config.command;
    this.bus = bus.make();
    this.plugins.push(
      plugins.json(
        {
          objects: [NotionObjectType.DATABASE, NotionObjectType.PAGE]
        },
        this
      ) as Plugin
    );

    this.notionClient = new NotionClient({
      apiKey: this.config.token,
      apiVersion: "2022-06-28",
      baseUrl: "https://api.notion.com",
      timeout: 30000
    });
  }
}
