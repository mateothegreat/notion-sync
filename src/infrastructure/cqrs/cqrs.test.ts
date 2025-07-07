/**
 * CQRS Infrastructure Tests
 *
 * Tests for command and query bus implementations
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ControlPlane, createControlPlane } from "../../lib/control-plane/control-plane";
import { CommandBus, createCommand } from "./command-bus";
import { QueryBus, createQuery } from "./query-bus";

describe("CommandBus", () => {
  let controlPlane: ControlPlane;
  let commandBus: CommandBus;

  beforeEach(async () => {
    controlPlane = createControlPlane();
    await controlPlane.initialize();
    await controlPlane.start();
    commandBus = new CommandBus(controlPlane);
  });

  afterEach(async () => {
    await controlPlane.destroy();
  });

  describe("dispatch", () => {
    it("should dispatch a command", async () => {
      const command = createCommand("test.command", { data: "test" });
      const handler = vi.fn();

      commandBus.register("test.command", handler);

      await commandBus.dispatch(command);

      // Give some time for async execution
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "test.command",
          payload: { data: "test" }
        })
      );
    });

    it("should publish command events", async () => {
      const command = createCommand("test.command", { data: "test" });
      const handler = vi.fn();
      const eventHandler = vi.fn();

      commandBus.register("test.command", handler);

      await controlPlane.subscribe("command.started", eventHandler);
      await controlPlane.subscribe("command.completed", eventHandler);

      await commandBus.dispatch(command);

      // Give some time for async execution
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(eventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "command.started",
          payload: expect.objectContaining({
            commandId: command.id,
            commandType: "test.command"
          })
        })
      );

      expect(eventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "command.completed",
          payload: expect.objectContaining({
            commandId: command.id,
            commandType: "test.command"
          })
        })
      );
    });

    it("should handle command handler errors", async () => {
      const command = createCommand("test.command", { data: "test" });
      const error = new Error("Handler error");
      const handler = vi.fn().mockRejectedValue(error);
      const errorHandler = vi.fn();

      commandBus.register("test.command", handler);

      await controlPlane.subscribe("command.failed", errorHandler);

      await commandBus.dispatch(command);

      // Give some time for async execution
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "command.failed",
          payload: expect.objectContaining({
            commandId: command.id,
            commandType: "test.command",
            error: "Handler error"
          })
        })
      );
    });
  });

  describe("register", () => {
    it("should register a command handler", () => {
      const handler = vi.fn();

      commandBus.register("test.command", handler);

      expect(commandBus.getRegisteredCommands()).toContain("test.command");
    });

    it("should overwrite existing handler", () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      commandBus.register("test.command", handler1);
      commandBus.register("test.command", handler2);

      expect(commandBus.getRegisteredCommands()).toHaveLength(1);
    });
  });

  describe("unregister", () => {
    it("should unregister a command handler", () => {
      const handler = vi.fn();

      commandBus.register("test.command", handler);
      expect(commandBus.getRegisteredCommands()).toContain("test.command");

      commandBus.unregister("test.command");
      expect(commandBus.getRegisteredCommands()).not.toContain("test.command");
    });
  });
});

describe("QueryBus", () => {
  let controlPlane: ControlPlane;
  let queryBus: QueryBus;

  beforeEach(async () => {
    controlPlane = createControlPlane();
    await controlPlane.initialize();
    await controlPlane.start();
    queryBus = new QueryBus(controlPlane);
  });

  afterEach(async () => {
    await controlPlane.destroy();
  });

  describe("execute", () => {
    it("should execute a query and return result", async () => {
      const query = createQuery("test.query", { id: "123" });
      const result = { name: "Test Result" };
      const handler = vi.fn().mockResolvedValue(result);

      queryBus.register("test.query", handler);

      const queryResult = await queryBus.execute(query);

      expect(queryResult).toEqual(result);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "test.query",
          payload: { id: "123" }
        })
      );
    });

    it("should publish query events", async () => {
      const query = createQuery("test.query", { id: "123" });
      const result = { name: "Test Result" };
      const handler = vi.fn().mockResolvedValue(result);
      const eventHandler = vi.fn();

      queryBus.register("test.query", handler);

      await controlPlane.subscribe("query.started", eventHandler);
      await controlPlane.subscribe("query.completed", eventHandler);

      await queryBus.execute(query);

      // Give some time for async execution of events
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(eventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "query.started",
          payload: expect.objectContaining({
            queryId: query.id,
            queryType: "test.query"
          })
        })
      );

      expect(eventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "query.completed",
          payload: expect.objectContaining({
            queryId: query.id,
            queryType: "test.query"
          })
        })
      );
    });

    it("should handle query handler errors", async () => {
      const query = createQuery("test.query", { id: "123" });
      const error = new Error("Handler error");
      const handler = vi.fn().mockRejectedValue(error);
      const errorHandler = vi.fn();

      queryBus.register("test.query", handler);

      await controlPlane.subscribe("query.failed", errorHandler);

      await expect(queryBus.execute(query)).rejects.toThrow("Handler error");

      // Give some time for async execution
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "query.failed",
          payload: expect.objectContaining({
            queryId: query.id,
            queryType: "test.query",
            error: "Handler error"
          })
        })
      );
    });

    it("should handle distributed query execution", async () => {
      const query = createQuery("remote.query", { id: "456" });
      const result = { name: "Remote Result" };

      // Simulate remote query handler
      setTimeout(async () => {
        await controlPlane.publish("query-responses", {
          queryId: query.id,
          queryType: query.type,
          result,
          timestamp: Date.now()
        });
      }, 10);

      const queryResult = await queryBus.execute(query);

      expect(queryResult).toEqual(result);
    });

    it("should timeout on distributed queries", async () => {
      const query = createQuery("timeout.query", { id: "789" });

      // Don't send any response to trigger timeout

      await expect(queryBus.execute(query)).rejects.toThrow("Query timeout: timeout.query");
    }, 35000); // Increase test timeout
  });

  describe("register", () => {
    it("should register a query handler", () => {
      const handler = vi.fn();

      queryBus.register("test.query", handler);

      expect(queryBus.getRegisteredQueries()).toContain("test.query");
    });

    it("should overwrite existing handler", () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      queryBus.register("test.query", handler1);
      queryBus.register("test.query", handler2);

      expect(queryBus.getRegisteredQueries()).toHaveLength(1);
    });
  });

  describe("unregister", () => {
    it("should unregister a query handler", () => {
      const handler = vi.fn();

      queryBus.register("test.query", handler);
      expect(queryBus.getRegisteredQueries()).toContain("test.query");

      queryBus.unregister("test.query");
      expect(queryBus.getRegisteredQueries()).not.toContain("test.query");
    });
  });
});

describe("createCommand", () => {
  it("should create a command with proper structure", () => {
    const command = createCommand("test.command", { data: "test" }, { userId: "123" });

    expect(command).toMatchObject({
      type: "test.command",
      payload: { data: "test" },
      metadata: { userId: "123" }
    });
    expect(command.id).toBeDefined();
    expect(command.timestamp).toBeDefined();
  });
});

describe("createQuery", () => {
  it("should create a query with proper structure", () => {
    const query = createQuery("test.query", { id: "123" }, { userId: "456" });

    expect(query).toMatchObject({
      type: "test.query",
      payload: { id: "123" },
      metadata: { userId: "456" }
    });
    expect(query.id).toBeDefined();
    expect(query.timestamp).toBeDefined();
  });
});
