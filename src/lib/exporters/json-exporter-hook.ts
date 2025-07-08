import { ResolvedCommandConfig } from "$lib/config/loader";
import { log } from "$lib/log";
import { NotionDatabase, NotionObject } from "$lib/notion/types";
import util from "$lib/util";
import { tskit } from "@mateothegreat/ts-kit";
import path from "node:path";
import { Exporter, ExportHookConfig } from "./exporter";

// @mark export->jsonExporterHook
export const jsonExporterHook = (hookConfig: ExportHookConfig, exporterConfig: ResolvedCommandConfig<"export">) => {
  return {
    id: "json",
    config: hookConfig,
    write: async (obj: NotionObject) => {
      const filepath = `${util.normalization.normalize(obj, exporterConfig["naming-strategy"])}.json`;
      try {
        const result = await tskit.fs.write(path.join(exporterConfig.path, filepath), JSON.stringify(obj, null, 2));
        log.debugging.inspect("jsonExporterHook write", {
          filepath,
          result,
          obj
        });
      } catch (error) {
        log.error(`failed to write file ${filepath}`, { error });
      }

      log.debugging.inspect("jsonExporterHook", {
        filepath,
        type: obj.type,
        id: obj.id,
        name: (obj as NotionDatabase).title
      });
    }
  } as Exporter;
};
