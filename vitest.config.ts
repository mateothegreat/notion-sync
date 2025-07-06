import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./src/vitest.setup.ts"],
    // disableConsoleIntercept: true,
    hideSkippedTests: true,
    name: "notion-sync",
    printConsoleTrace: true,
    typecheck: {
      enabled: true
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      clean: true
    }
  }
});

interface ExportMetrics {
  totalApiCalls: number;
  averageResponseTime: number;
  errorRate: number;
  rateLimitHits: number;
  cacheHitRate: number;
  concurrencyUtilization: number;
  throughputPerSecond: number;
  memoryEfficiency: number;
}
