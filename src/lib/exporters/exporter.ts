import { NotionObject, NotionObjectType } from "../notion/types";

export enum ExportFormat {
  JSON = "json",
  MARKDOWN = "markdown",
  HTML = "html"
}

export interface ExportHookConfig {
  formats: ExportFormat[];
  types: NotionObjectType[];
}

export interface Exporter {
  config: ExportHookConfig;
  write: (obj: NotionObject) => Promise<void>;
}

export type ExporterHook = (config: ExportHookConfig) => Exporter;
