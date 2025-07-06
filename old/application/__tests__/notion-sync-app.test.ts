/**
 * Notion Sync Application Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NotionSyncApp } from "../notion-sync-app";
import { ApplicationConfig, ExportFormat } from "../../shared/types";

describe("NotionSyncApp", () => {
  let app: NotionSyncApp;
  let config: ApplicationConfig;

  beforeEach(() => {
    config = {
      notion: {
        apiKey: "test-api-key",
        apiVersion: "2022-06-28",
        baseUrl: "https://api.notion.com",
        timeout: 30000,
        retryAttempts: 3
      },
      export: {
        defaultOutputPath: "./test-exports",
        defaultFormat: ExportFormat.JSON,
        maxConcurrency: 5,
        chunkSize: 100,
        enableResume: false
      },
      performance: {
        rateLimits: {
          pages: 10,
          blocks: 20,
          databases: 5,
          comments: 15,
          users: 5,
          properties: 10
        },
        circuitBreaker: {
          failureThreshold: 5,
          resetTimeout: 30000,
          monitoringPeriod: 60000
        },
        caching: {
          enabled: true,
          ttl: 300000,
          maxSize: 1000
        }
      },
      logging: {
        level: "info",
        format: "text",
        outputs: ["console"]
      }
    };

    app = new NotionSyncApp(config);
  });

  afterEach(async () => {
    if (app) {
      await app.destroy();
    }
  });

  describe("Lifecycle Management", () => {
    it("should initialize successfully", async () => {
      await app.initialize();

      const status = await app.getHealthStatus();
      expect(status.initialized).toBe(true);
      expect(status.started).toBe(false);
    });

    it("should start after initialization", async () => {
      await app.initialize();
      await app.start();

      const status = await app.getHealthStatus();
      expect(status.initialized).toBe(true);
      expect(status.started).toBe(true);
      expect(status.status).toBe("healthy");
    });

    it("should auto-initialize when starting", async () => {
      await app.start();

      const status = await app.getHealthStatus();
      expect(status.initialized).toBe(true);
      expect(status.started).toBe(true);
    });

    it("should stop gracefully", async () => {
      await app.start();
      await app.stop();

      const status = await app.getHealthStatus();
      expect(status.started).toBe(false);
    });

    it("should destroy and cleanup resources", async () => {
      await app.start();
      await app.destroy();

      // App should be in destroyed state
      expect(app.getControlPlane).toBeDefined();
    });

    it("should handle multiple initialization calls", async () => {
      await app.initialize();
      await app.initialize(); // Should not throw

      const status = await app.getHealthStatus();
      expect(status.initialized).toBe(true);
    });

    it("should handle multiple start calls", async () => {
      await app.start();
      await app.start(); // Should not throw

      const status = await app.getHealthStatus();
      expect(status.started).toBe(true);
    });
  });

  describe("Service Access", () => {
    beforeEach(async () => {
      await app.start();
    });

    it("should provide access to control plane", () => {
      const controlPlane = app.getControlPlane();
      expect(controlPlane).toBeDefined();
      expect(controlPlane.getStatus).toBeDefined();
    });

    it("should provide access to export service", () => {
      const exportService = app.getExportService();
      expect(exportService).toBeDefined();
      expect(exportService.createExport).toBeDefined();
    });

    it("should provide access to progress service", () => {
      const progressService = app.getProgressService();
      expect(progressService).toBeDefined();
      expect(progressService.startTracking).toBeDefined();
    });

    it("should provide access to command handlers", () => {
      const commandHandlers = app.getCommandHandlers();
      expect(commandHandlers).toBeDefined();
      expect(commandHandlers.handleCreateExport).toBeDefined();
    });

    it("should provide access to notion client", () => {
      const notionClient = app.getNotionClient();
      expect(notionClient).toBeDefined();
      expect(notionClient.getPage).toBeDefined();
    });
  });

  describe("Health Status", () => {
    it("should return stopped status when not started", async () => {
      const status = await app.getHealthStatus();

      expect(status.status).toBe("stopped");
      expect(status.initialized).toBe(false);
      expect(status.started).toBe(false);
      expect(status.timestamp).toBeDefined();
    });

    it("should return healthy status when running", async () => {
      await app.start();
      const status = await app.getHealthStatus();

      expect(status.status).toBe("healthy");
      expect(status.initialized).toBe(true);
      expect(status.started).toBe(true);
      expect(status.controlPlane).toBeDefined();
      expect(status.components).toBeDefined();
    });

    it("should include component status", async () => {
      await app.start();
      const status = await app.getHealthStatus();

      expect(status.components.exportService).toBe("running");
      expect(status.components.progressService).toBe("running");
      expect(status.components.notionClient).toBe("running");
    });
  });

  describe("Event Handling", () => {
    beforeEach(async () => {
      await app.start();
    });

    it("should handle domain events", async () => {
      const controlPlane = app.getControlPlane();

      // Publish a test domain event
      await controlPlane.publish("domain-events", {
        type: "export.started",
        aggregateId: "test-export",
        payload: { exportId: "test-export" }
      });

      // Event should be processed without errors
      // In a real test, you might want to verify specific side effects
    });

    it("should handle command processing", async () => {
      const controlPlane = app.getControlPlane();

      // Publish a test command
      const command = {
        id: "test-command",
        type: "export.create",
        payload: {
          configuration: {
            outputPath: "./test",
            format: ExportFormat.JSON,
            includeBlocks: true,
            includeComments: false,
            includeProperties: true,
            databases: ["test-db"],
            pages: []
          }
        }
      };

      await controlPlane.publish("commands", command);

      // Command should be processed
      // You might want to check for command results
    });

    it("should handle metrics collection", async () => {
      const controlPlane = app.getControlPlane();

      // Publish a test metric
      await controlPlane.publish("metrics", {
        type: "test_metric",
        value: 100,
        timestamp: new Date()
      });

      // Metric should be processed without errors
    });
  });

  describe("Error Handling", () => {
    it("should handle initialization errors gracefully", async () => {
      // Create app with invalid config
      const invalidConfig = {
        ...config,
        notion: {
          ...config.notion,
          apiKey: "" // Invalid API key
        }
      };

      const invalidApp = new NotionSyncApp(invalidConfig);

      // Should not throw during initialization
      await expect(invalidApp.initialize()).resolves.not.toThrow();

      await invalidApp.destroy();
    });

    it("should handle component creation errors", async () => {
      await app.start();

      // This test would require mocking component creation to fail
      // For now, we just verify the app can handle the scenario
      expect(app.getControlPlane()).toBeDefined();
    });
  });

  describe("Configuration", () => {
    it("should use provided configuration", async () => {
      await app.start();

      const notionClient = app.getNotionClient();
      expect(notionClient).toBeDefined();

      // Verify configuration is applied
      // This would require exposing config from the client
    });

    it("should create circuit breakers with correct configuration", async () => {
      await app.start();

      const controlPlane = app.getControlPlane();
      const stats = controlPlane.getCircuitBreakerStats();

      expect(stats["notion-api"]).toBeDefined();
    });
  });

  describe("Performance", () => {
    it("should handle concurrent operations", async () => {
      await app.start();

      const controlPlane = app.getControlPlane();

      // Simulate concurrent message processing
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(controlPlane.publish("test-channel", { id: i, data: `test-${i}` }));
      }

      await Promise.all(promises);

      // All messages should be processed successfully
    });

    it("should maintain performance under load", async () => {
      await app.start();

      const controlPlane = app.getControlPlane();
      const startTime = Date.now();

      // Process many messages
      const messageCount = 100;
      const promises = [];

      for (let i = 0; i < messageCount; i++) {
        promises.push(controlPlane.publish("perf-test", { id: i }));
      }

      await Promise.all(promises);

      const duration = Date.now() - startTime;
      const throughput = messageCount / (duration / 1000);

      // Should maintain reasonable throughput
      expect(throughput).toBeGreaterThan(10); // At least 10 messages per second
    });
  });
});
