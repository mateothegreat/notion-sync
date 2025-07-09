import { ResolvedCommandConfig } from "$config/loader";
import { NotionObjectType } from "$notion/types";
import { Observable, of } from "rxjs";
import { Context } from "../context";

export type PluginConfig<T = {}> = T & {
  id?: string;
  fn?: PluginFn;
  objects: NotionObjectType[];
};

export type PluginFn = (input: PluginInput) => Observable<void>;

export type PluginHook = <C extends string, T extends PluginConfig = PluginConfig>(
  input: PluginInput,
  config: C
) => Plugin<T>;

export type PluginInput = {
  command: ResolvedCommandConfig<string>;
};

export interface Plugin<T extends PluginConfig = PluginConfig> {
  id: string;
  config: T;
  fn: PluginFn;
}

export enum DefaultPlugin {
  JSON = "json"
}

export namespace plugins {
  export const json = (config: PluginConfig, context: Context<string>): Plugin => {
    return {
      id: DefaultPlugin.JSON,
      config,
      fn: (input) => {
        return of(null);
      }
    };
  };
}
