/**
 * Example usage of the optimized Notion export system.
 *
 * This demonstrates how to use the streaming export manager with
 * memory bounds, rate limiting, and resumability.
 */

import { Client } from "@notionhq/client";
import { createOptimizedExportCLI } from "./optimized-cli";

async function main() {
  // Initialize Notion client
  const notion = new Client({
    auth: process.env.NOTION_TOKEN
  });

  // Create optimized export CLI
  const exporter = createOptimizedExportCLI({
    outputPath: "./notion-export",
    format: "markdown",
    maxMemoryMB: 256, // Use max 256MB of memory
    concurrency: 8, // 8 concurrent operations
    checkpointInterval: 30000 // Save progress every 30 seconds
  });

  try {
    // Start export (will resume automatically if checkpoint exists)
    console.log("Starting optimized Notion export...");
    await exporter.startExport(notion);

    console.log("Export completed successfully!");
    exporter.showMetrics();
  } catch (error) {
    console.error("Export failed:", error);
    console.log("Progress has been saved. Run again to resume.");
  }
}

// Advanced example with custom handling
async function advancedExample() {
  const notion = new Client({ auth: process.env.NOTION_TOKEN });

  const exporter = createOptimizedExportCLI({
    outputPath: "./advanced-export",
    format: "json",
    maxMemoryMB: 512,
    concurrency: 12
  });

  // Handle interruption gracefully
  process.on("SIGINT", () => {
    console.log("\nPausing export...");
    exporter.pauseExport();
    process.exit(0);
  });

  // Auto-tune performance every minute
  const tuneInterval = setInterval(() => {
    exporter.autoTune();
  }, 60000);

  // Monitor progress
  const metricsInterval = setInterval(() => {
    const status = exporter.getStatus();
    console.log(`Progress: ${(status.progress * 100).toFixed(1)}%`);
    if (status.eta) {
      console.log(`ETA: ${status.eta}`);
    }
  }, 10000);

  try {
    await exporter.startExport(notion);
  } finally {
    clearInterval(tuneInterval);
    clearInterval(metricsInterval);
  }
}

// Resume example
async function resumeExample() {
  const notion = new Client({ auth: process.env.NOTION_TOKEN });

  const exporter = createOptimizedExportCLI({
    outputPath: "./notion-export",
    format: "markdown"
  });

  try {
    // This will automatically detect and resume from checkpoint
    await exporter.resumeExport(notion);
    console.log("Resume completed successfully!");
  } catch (error) {
    if (error instanceof Error && error.message.includes("No resumable export found")) {
      console.log("No previous export to resume. Starting fresh...");
      await exporter.startExport(notion);
    } else {
      throw error;
    }
  }
}

// Run the example
if (require.main === module) {
  main().catch(console.error);
}
