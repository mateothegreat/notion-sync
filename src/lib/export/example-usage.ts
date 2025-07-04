import { Client } from "@notionhq/client";
import { OperationTypeAwareLimiter, type OperationContext } from "../concurrency-manager";
import { smartRetryOperation, type RetryContext } from "../operations";
import { AdaptiveRateLimiter } from "../rate-limiting";
import { streamPaginatedAPI } from "../streaming";
import { NotionStreamingExporter, StreamingExportManager } from "./manager";

/**
 * Example: Complete workspace export with all performance optimizations
 */
export async function exportEntireWorkspace(): Promise<void> {
  const notion = new Client({ auth: process.env.NOTION_TOKEN });
  const exportId = `workspace-export-${Date.now()}`;
  const outputDir = "./exports";

  // Create exporter with custom concurrency limits optimized for your use case
  const exporter = new NotionStreamingExporter(exportId, outputDir, {
    pages: 3, // Heavier operations - conservative limit
    blocks: 12, // Lighter operations - higher throughput
    databases: 2, // Complex operations - careful limit
    comments: 8, // Medium operations
    users: 15, // Very light operations
    properties: 10 // Medium-light operations
  });

  try {
    console.log("🚀 Starting optimized workspace export...");
    await exporter.exportWorkspace(notion);
    console.log("✅ Export completed successfully!");
  } catch (error) {
    console.error("❌ Export failed:", error);
    console.log("💾 Progress saved - you can resume later");
    throw error;
  }
}

/**
 * Example: Custom export with advanced features
 */
export async function customExportWithAnalytics(): Promise<void> {
  const notion = new Client({ auth: process.env.NOTION_TOKEN });
  const exportId = `custom-export-${Date.now()}`;
  const outputDir = "./exports";

  // Create manager with custom memory bounds and checkpoint interval
  const manager = new StreamingExportManager(
    exportId,
    outputDir,
    100 * 1024 * 1024, // 100MB memory limit
    15000, // 15s checkpoint interval
    {
      pages: 5,
      databases: 3
    }
  );

  await manager.initialize();

  try {
    // Example: Export pages with streaming and error handling
    const pages = await getPagesWithPagination(notion);

    for await (const page of manager.streamExportItems(
      pages,
      (page) => enhancedPageTransform(page),
      "pages",
      "pages"
    )) {
      // Each page is processed and streamed to disk immediately
      // Memory usage remains bounded regardless of workspace size
    }

    // Get real-time analytics
    const progress = manager.getProgress();
    console.log(`📊 Export Analytics:
      - Processed: ${progress.processed.toLocaleString()} items
      - Progress: ${progress.percentage.toFixed(1)}%  
      - Memory: ${(progress.memoryUsage.heapUsed / 1024 / 1024).toFixed(1)}MB
      - API Calls: ${progress.analytics.totalApiCalls.toLocaleString()}
      - Error Rate: ${((progress.analytics.totalErrors / progress.analytics.totalApiCalls) * 100).toFixed(2)}%
      - Data Transferred: ${(progress.analytics.dataTransferred / 1024 / 1024).toFixed(1)}MB
    `);

    await manager.finalize();
    await manager.cleanup();
  } catch (error) {
    console.error("Export failed, but progress is saved for resuming:", error);
    throw error;
  }
}

/**
 * Example: Advanced API operations with smart retry and rate limiting
 */
export async function advancedApiOperations(): Promise<void> {
  const notion = new Client({ auth: process.env.NOTION_TOKEN });

  // Enhanced rate limiter that adapts to actual API responses
  const rateLimiter = new AdaptiveRateLimiter();

  // Operation-aware concurrency manager
  const concurrencyManager = new OperationTypeAwareLimiter({
    pages: 4,
    blocks: 12,
    databases: 2
  });

  // Example: Fetch a page with all optimizations
  const context: OperationContext = {
    type: "pages",
    objectId: "page-123",
    operation: "fetch-page-with-blocks",
    priority: "high",
    timeout: 30000
  };

  try {
    const pageWithBlocks = await concurrencyManager.run(context, async () => {
      // Wait for rate limit
      await rateLimiter.waitForSlot();

      // Smart retry with circuit breaker integration
      const retryContext: RetryContext = {
        operationType: "read",
        priority: "high",
        objectId: "page-123"
      };

      return await smartRetryOperation(
        () => notion.pages.retrieve({ page_id: "page-123" }),
        "fetch-page",
        retryContext
      );
    });

    console.log("Page fetched successfully:", pageWithBlocks.id);

    // Update rate limiter from response headers (if available)
    // rateLimiter.updateFromHeaders(response.headers);
  } catch (error) {
    console.error("Failed to fetch page:", error);
  }

  // Get performance statistics
  const stats = concurrencyManager.getAllStats();
  console.log("Concurrency Stats:", stats);
}

/**
 * Example: Streaming large collections without memory issues
 */
export async function streamLargeCollection(): Promise<void> {
  const notion = new Client({ auth: process.env.NOTION_TOKEN });

  // Stream all pages without loading everything into memory
  async function* getAllPages() {
    yield* streamPaginatedAPI(
      (args) => notion.search(args),
      {
        filter: { property: "object", value: "page" },
        start_cursor: undefined
      },
      "search-pages",
      100, // Page size
      500, // Rate limit delay
      1000 // Memory limit (items in buffer)
    );
  }

  console.log("Processing all pages in workspace...");
  let processedCount = 0;

  for await (const page of getAllPages()) {
    // Process each page individually - memory usage stays constant
    await processPage(page);
    processedCount++;

    if (processedCount % 100 === 0) {
      console.log(`Processed ${processedCount} pages...`);

      // Optional: Force garbage collection periodically
      if (global.gc) {
        global.gc();
      }
    }
  }

  console.log(`✅ Completed processing ${processedCount} pages`);
}

/**
 * Example helper functions
 */

async function* getPagesWithPagination(notion: Client) {
  let cursor: string | undefined;

  do {
    const response = await notion.search({
      filter: { property: "object", value: "page" },
      start_cursor: cursor,
      page_size: 100
    });

    for (const page of response.results) {
      yield page;
    }

    cursor = response.next_cursor || undefined;
  } while (cursor);
}

function enhancedPageTransform(page: any) {
  return {
    id: page.id,
    title: page.properties?.title?.title?.[0]?.plain_text || "Untitled",
    created_time: page.created_time,
    last_edited_time: page.last_edited_time,
    url: page.url,
    archived: page.archived,
    properties: page.properties,
    // Add export metadata
    exported_at: new Date().toISOString(),
    export_version: "2.0"
  };
}

async function processPage(page: any): Promise<void> {
  // Simulate page processing
  await new Promise((resolve) => setTimeout(resolve, 10));

  // Example processing: extract text content, analyze properties, etc.
  console.log(`Processed page: ${page.id}`);
}

/**
 * Example: Monitor export progress in real-time
 */
export async function monitorExportProgress(manager: StreamingExportManager): Promise<void> {
  const interval = setInterval(() => {
    const progress = manager.getProgress();

    console.clear();
    console.log("📊 Real-time Export Progress");
    console.log("═".repeat(50));
    console.log(`Progress: ${progress.percentage.toFixed(1)}% (${progress.processed}/${progress.total})`);
    console.log(`Section: ${progress.currentSection}`);

    if (progress.eta.confidence > 0.3) {
      const etaMinutes = Math.round(progress.eta.eta / 60000);
      console.log(`ETA: ${etaMinutes} minutes (${Math.round(progress.eta.confidence * 100)}% confidence)`);
    }

    console.log(`Memory: ${(progress.memoryUsage.heapUsed / 1024 / 1024).toFixed(1)}MB`);
    console.log(`API Calls: ${progress.analytics.totalApiCalls}`);
    console.log(`Errors: ${progress.analytics.totalErrors}`);

    // Show concurrency statistics
    console.log("\n🔧 Concurrency Stats:");
    for (const [type, stats] of Object.entries(progress.concurrencyStats)) {
      console.log(`  ${type}: ${stats.running} running, ${stats.completed} completed`);
    }

    // Show recent errors if any
    if (progress.errors.length > 0) {
      console.log("\n⚠️  Recent Errors:");
      progress.errors.slice(-3).forEach((error) => {
        console.log(`  - ${error.operation}: ${error.error}`);
      });
    }
  }, 2000);

  // Cleanup on process exit
  process.on("SIGINT", () => {
    clearInterval(interval);
    console.log("\n👋 Export monitoring stopped");
    process.exit(0);
  });
}

// Example usage patterns
if (require.main === module) {
  console.log("Example usage patterns for the Streaming Export Manager:");
  console.log("1. exportEntireWorkspace() - Complete workspace export");
  console.log("2. customExportWithAnalytics() - Custom export with detailed analytics");
  console.log("3. advancedApiOperations() - Advanced API calls with optimizations");
  console.log("4. streamLargeCollection() - Stream large collections efficiently");
}
