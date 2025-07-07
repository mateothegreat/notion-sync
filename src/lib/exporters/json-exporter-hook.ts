import { log } from "$lib/log";
import { NotionObject } from "$lib/notion/types";
import { ExporterHook, ExportHookConfig } from "./exporter";

export const jsonExporterHook: ExporterHook = (config: ExportHookConfig) => {
  return {
    config,
    write: async (obj: NotionObject) => {
      log.debugging.inspect("jsonExporterHook", { type: obj.type, id: obj.id, config });
    }
  };
};
