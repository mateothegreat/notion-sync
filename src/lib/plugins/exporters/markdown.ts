import { ResolvedCommandConfig } from "$config/loader";
import { NotionExportableObject } from "$notion/types";
import { log } from "$util/log";
import { normalization } from "$util/normalization";
import { strings } from "$util/strings";
import { tskit } from "@mateothegreat/ts-kit";
import path from "node:path";
import { ExporterPlugin, exporters, ExportHookConfig } from "./exporter";

// @mark exporters->markdown
export const markdown = (hookConfig: ExportHookConfig, commandConfig: ResolvedCommandConfig<"export">) => {
  try {
    return {
      id: exporters.exporters.markdown.id,
      config: hookConfig,
      write: async (obj: NotionExportableObject) => {
        log.debugging.inspect("obj", obj);
        const filepath = `${normalization.normalize(obj, commandConfig["naming-strategy"]).toLocaleLowerCase()}.json`;
        const str = JSON.stringify(obj);
        try {
          const writeable = await tskit.fs.write(
            path.join(commandConfig.path, strings.pluralize(obj.type), filepath),
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
