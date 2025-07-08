import { ResolvedCommandConfig } from "$lib/config/loader";
import { log } from "$lib/log";
import { NotionObject } from "$lib/notion/types";
import util from "$lib/util";
import { tskit } from "@mateothegreat/ts-kit";
import path from "node:path";
import { ExporterPlugin, exporters, ExportHookConfig } from "./exporter";

// @mark exporters->html
export const html = (hookConfig: ExportHookConfig, commandConfig: ResolvedCommandConfig<"export">) => {
  try {
    return {
      id: exporters.html.id,
      config: hookConfig,
      write: async (obj: NotionObject) => {
        log.debugging.inspect("obj", obj);
        const filepath = `${util.normalization
          .normalize(obj, commandConfig["naming-strategy"])
          .toLocaleLowerCase()}.json`;
        const str = JSON.stringify(obj);
        try {
          const writeable = await tskit.fs.write(
            path.join(commandConfig.path, util.string.pluralize(obj.type), filepath),
            str
          );
          log.debug(`wrote ${obj.type} file to ${filepath} (${str.length} bytes)`);
        } catch (error) {
          log.error(`failed to write file ${filepath}`, { error });
        }
      }
    } as ExporterPlugin;
  } catch (error) {
    log.error("failed to create json exporter hook", { error });
    throw error;
  }
};
