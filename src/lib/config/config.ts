import yaml from "yaml";
import { ResolvedCommandConfig } from "./loader";

export class Config<TCommand extends string> {
  private readonly config: ResolvedCommandConfig<TCommand>;

  constructor(config: ResolvedCommandConfig<TCommand>) {
    this.config = config;
  }

  get rendered(): ResolvedCommandConfig<TCommand> {
    return this.config;
  }

  toYaml() {
    return yaml.stringify(this.config);
  }
}
