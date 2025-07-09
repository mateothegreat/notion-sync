import { Command, Help, Interfaces } from "@oclif/core";

export default class HelpClass extends Help {
  /**
   * Format a single command for display.
   * Wraps the base implementation with custom logging.
   *
   * @param command - The command to format.
   *
   * @returns The formatted command.
   */
  formatCommand(command: Command.Loadable): string {
    const baseOutput = super.formatCommand(command);
    return baseOutput;
  }

  /**
   * Format a list of commands for display.
   * Wraps the base implementation with custom logging.
   *
   * @todo implement
   *
   * @param commands - The commands to format.
   *
   * @returns The formatted commands.
   */
  formatCommands(commands: Command.Loadable[]): string {
    const baseOutput = super.formatCommands(commands);
    return baseOutput;
  }

  /**
   * Format the root help display.
   * Wraps the base implementation with custom logging.
   *
   * @todo implement
   *
   * @returns {string} The formatted root help.
   */
  formatRoot(): string {
    console.log("formatRoot");
    const baseOutput = super.formatRoot();
    return baseOutput;
  }

  /**
   * Format an individual topic for display.
   * Wraps the base implementation with custom logging.
   *
   * @todo implement
   *
   * @param topic - The topic to format.
   *
   * @returns The formatted topic.
   */
  formatTopic(topic: Interfaces.Topic): string {
    console.log("formatTopic", topic.name);
    const baseOutput = super.formatTopic(topic);
    // You can modify the output here later if needed
    return baseOutput;
  }

  /**
   * Format a list of topics for display.
   * Wraps the base implementation with custom logging.
   *
   * @todo implement
   *
   * @param topics - The topics to format.
   *
   * @returns The formatted topics.
   */
  protected formatTopics(topics: Interfaces.Topic[]): string {
    console.log(
      "formatTopics",
      topics.map((t) => t.name)
    );
    const baseOutput = super.formatTopics(topics);
    // You can modify the output here later if needed
    return baseOutput;
  }

  /**
   * Display help for a specific command.
   * Wraps the base implementation with custom logging.
   *
   * @todo implement
   *
   * @param command - The command to display help for.
   */
  async showCommandHelp(command: Command.Loadable): Promise<void> {
    return super.showCommandHelp(command);
  }

  /**
   * Display help based on provided arguments.
   * Wraps the base implementation with custom logging.
   *
   * @todo implement
   *
   * @param args - The arguments to display help for.
   */
  async showHelp(args: string[]): Promise<void> {
    return super.showHelp(args);
  }

  /**
   * Display the root help of the CLI.
   * Wraps the base implementation with custom logging.
   *
   * @todo implement
   */
  async showRootHelp(): Promise<void> {
    console.log("showRootHelp");
    return super.showRootHelp();
  }

  /**
   * Display help for a specific topic.
   * Wraps the base implementation with custom logging.
   *
   * @todo implement
   *
   * @param topic - The topic to display help for.
   */
  async showTopicHelp(topic: Interfaces.Topic): Promise<void> {
    console.log("showTopicHelp", topic.name);
    return super.showTopicHelp(topic);
  }
}
