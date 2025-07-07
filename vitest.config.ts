import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./src/vitest.setup.ts"],
    // disableConsoleIntercept: true,
    hideSkippedTests: true,
    name: "notion-sync",
    printConsoleTrace: false,
    typecheck: {
      enabled: true
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      all: true,
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/*.d.ts", "src/index.ts"]
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
