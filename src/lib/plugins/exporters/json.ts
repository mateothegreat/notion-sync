import { ResolvedCommandConfig } from "$config/loader";
import { NotionExportableObject, NotionObjectUnion } from "$notion/types";
import { log } from "$util/log";
import { normalization } from "$util/normalization";
import { paths } from "$util/paths";
import { tskit } from "@mateothegreat/ts-kit";
import path from "node:path";
import { ExporterPlugin, exporters, ExportHookConfig } from "./exporter";

// @mark exporters->json
export const json = (hookConfig: ExportHookConfig, commandConfig: ResolvedCommandConfig<"export">) => {
  try {
    return {
      id: exporters.exporters.json.id,
      config: hookConfig,
      write: async (obj: NotionExportableObject) => {
        // Handle different object types - SDK types use 'object' property, our types use 'type'
        const objectType = ("object" in obj ? obj.object : obj.type) || "page";
        const base = paths.base(commandConfig.path, { ...obj, type: objectType } as NotionObjectUnion);
        const filepath = `${normalization.normalize(obj, commandConfig["naming-strategy"]).toLocaleLowerCase()}.json`;

        log.debugging.inspect("obj", { base, filepath });

        const str = JSON.stringify(obj);
        try {
          const writeable = await tskit.fs.write(path.join(base, filepath), str);
          log.debug(`wrote ${objectType} file to ${filepath} (${str.length} bytes)`);
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
