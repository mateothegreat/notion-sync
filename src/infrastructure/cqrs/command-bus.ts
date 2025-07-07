/**
 * Command Bus Implementation
 *
 * Handles command dispatching and execution in the CQRS pattern
 */

import { ControlPlane } from "../../lib/control-plane/control-plane";
import { Command, CommandHandler } from "../../lib/control-plane/types";
import { log } from "../../lib/log";

/**
 * Command handler registration interface.
 * Maps command types to their handlers.
 */
export interface CommandHandlerRegistry {
  [commandType: string]: CommandHandler;
}

/**
 * Command bus interface for dispatching commands.
 */
export interface ICommandBus {
  dispatch<T = any>(command: Command<T>): Promise<void>;
  register(commandType: string, handler: CommandHandler): void;
  unregister(commandType: string): void;
}

/**
 * Command bus implementation that integrates with the control plane.
 * Provides command routing and execution with proper error handling.
 */
export class CommandBus implements ICommandBus {
  private handlers: CommandHandlerRegistry = {};
  private readonly channel = "commands";

  constructor(private controlPlane: ControlPlane) {
    this.setupCommandSubscription();
  }

  /**
   * Set up subscription to command channel.
   * Routes incoming commands to appropriate handlers.
   */
  private setupCommandSubscription(): void {
    this.controlPlane.subscribe(this.channel, async (message) => {
      const command = message.payload as Command;

      if (!command || !command.type) {
        log.error("Invalid command received", { message });
        return;
      }

      try {
        await this.handleCommand(command);
      } catch (error) {
        log.error("Command execution failed", {
          command: command.type,
          commandId: command.id,
          error
        });

        // Publish command failure event
        await this.controlPlane.publish("command.failed", {
          commandId: command.id,
          commandType: command.type,
          error: error instanceof Error ? error.message : "Unknown error",
          timestamp: Date.now()
        });
      }
    });
  }

  /**
   * Dispatch a command for execution.
   *
   * Arguments:
   * - command: The command to dispatch
   *
   * Returns:
   * - Promise that resolves when the command is dispatched
   */
  async dispatch<T = any>(command: Command<T>): Promise<void> {
    log.trace("Dispatching command", { type: command.type, id: command.id });

    // Publish command to the control plane
    await this.controlPlane.publish(this.channel, command);

    // Also handle locally if handler is registered
    if (this.handlers[command.type]) {
      try {
        await this.handleCommand(command);
      } catch (error) {
        // Publish command failure event
        await this.controlPlane.publish("command.failed", {
          commandId: command.id,
          commandType: command.type,
          error: error instanceof Error ? error.message : "Unknown error",
          timestamp: Date.now()
        });
        // Don't re-throw the error as the command has been dispatched
      }
    }
  }

  /**
   * Handle command execution.
   */
  private async handleCommand(command: Command): Promise<void> {
    const handler = this.handlers[command.type];

    if (!handler) {
      throw new Error(`No handler registered for command type: ${command.type}`);
    }

    log.trace("Executing command", { type: command.type, id: command.id });

    // Publish command execution started event
    await this.controlPlane.publish("command.started", {
      commandId: command.id,
      commandType: command.type,
      timestamp: Date.now()
    });

    const startTime = Date.now();

    try {
      await handler(command);

      const duration = Date.now() - startTime;

      // Publish command execution completed event
      await this.controlPlane.publish("command.completed", {
        commandId: command.id,
        commandType: command.type,
        duration,
        timestamp: Date.now()
      });

      log.trace("Command executed successfully", {
        type: command.type,
        id: command.id,
        duration
      });
    } catch (error) {
      const duration = Date.now() - startTime;

      log.error("Command handler error", {
        command: command.type,
        commandId: command.id,
        duration,
        error
      });

      throw error;
    }
  }

  /**
   * Register a command handler.
   *
   * Arguments:
   * - commandType: The type of command to handle
   * - handler: The handler function
   */
  register(commandType: string, handler: CommandHandler): void {
    if (this.handlers[commandType]) {
      log.info("Overwriting existing command handler", { commandType });
    }

    this.handlers[commandType] = handler;
    log.trace("Command handler registered", { commandType });
  }

  /**
   * Unregister a command handler.
   *
   * Arguments:
   * - commandType: The type of command to unregister
   */
  unregister(commandType: string): void {
    delete this.handlers[commandType];
    log.trace("Command handler unregistered", { commandType });
  }

  /**
   * Get all registered command types.
   */
  getRegisteredCommands(): string[] {
    return Object.keys(this.handlers);
  }
}

/**
 * Create a command with proper structure.
 *
 * Arguments:
 * - type: The command type
 * - payload: The command payload
 * - metadata: Optional metadata
 *
 * Returns:
 * - A properly structured command
 */
export function createCommand<T = any>(type: string, payload: T, metadata?: Record<string, any>): Command<T> {
  return {
    id: crypto.randomUUID(),
    type,
    payload,
    timestamp: Date.now(),
    metadata
  };
}
