import { ResolvedCommandConfig } from "$lib/config/loader";
import { NotionObject, NotionObjectType } from "../notion/types";
import { html } from "./html";
import { json } from "./json";
import { markdown } from "./mardown";

export enum Exporter {
  JSON = "json",
  MARKDOWN = "markdown",
  HTML = "html"
}

export interface ExportHookConfig {
  formats: Exporter[];
  types: NotionObjectType[];
}

export interface ExporterPlugin {
  id: string;
  config: ExportHookConfig;
  write: (obj: NotionObject) => Promise<void>;
}

export type ExporterHook = <T extends string>(
  config: ExportHookConfig,
  commandConfig: ResolvedCommandConfig<T>
) => ExporterPlugin;

export const exporters: {
  [key in Exporter]: {
    id: string;
    ref: ExporterHook;
  };
} = {
  [Exporter.JSON]: {
    id: "json-builtin",
    ref: json
  },
  [Exporter.MARKDOWN]: {
    id: "markdown-builtin",
    ref: markdown
  },
  [Exporter.HTML]: {
    id: "html-builtin",
    ref: html
  }
};
