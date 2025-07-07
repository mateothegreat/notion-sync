import { Command } from "@oclif/core";
import { CombinedConfigLoader, CommandName, CombinedConfig } from "../config/combined-config";

/**
 * Simple base command that uses the new configuration system
 */
export abstract class SimpleBaseCommand<TCommand extends CommandName> extends Command {
  protected config!: CombinedConfig<TCommand>;
  
  constructor(
    public commandName: TCommand,
    argv: string[],
    config: any
  ) {
    super(argv, config);
  }

  public async init(): Promise<void> {
    await super.init();

    // Parse flags using the simple approach
    const { flags } = await this.parse({
      flags: CombinedConfigLoader.getCombinedFlags(this.commandName),
      args: (this.constructor as typeof Command).args,
      strict: (this.constructor as typeof Command).strict
    });

    // Load the combined configuration
    this.config = await CombinedConfigLoader.loadCombinedConfig(
      this.commandName,
      flags
    );
  }

  /**
   * Get the parsed configuration
   */
  protected getConfig(): CombinedConfig<TCommand> {
    return this.config;
  }

  /**
   * Get a specific configuration value
   */
  protected getConfigValue<K extends keyof CombinedConfig<TCommand>>(
    key: K
  ): CombinedConfig<TCommand>[K] {
    return this.config[key];
  }

  protected async catch(err: Error & { exitCode?: number }): Promise<any> {
    // add any custom logic to handle errors from the command
    // or simply return the parent class error handling
    return super.catch(err);
  }

  protected async finally(_: Error | undefined): Promise<any> {
    // called after run and catch regardless of whether or not the command errored
    return super.finally(_);
  }
}

/**
 * Simple export command base class
 */
export abstract class SimpleExportCommand extends SimpleBaseCommand<"export"> {
  constructor(argv: string[], config: any) {
    super("export", argv, config);
  }
}