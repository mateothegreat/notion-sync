import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    bail: 5,
    maxConcurrency: 10,
    passWithNoTests: false,
    isolate: true,
    silent: false,
    update: false,
    hideSkippedTests: true,
    name: "notion-sync",
    printConsoleTrace: false,
    typecheck: {
      enabled: true
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      all: false,
      include: ["src/lib/config/config-loader.ts"],
      enabled: true,
      clean: true,
      ignoreEmptyLines: true,
      watermarks: {
        branches: [100, 100],
        functions: [100, 100],
        lines: [100, 100],
        statements: [100, 100]
      },
      thresholds: {
        branches: 100,
        functions: 100,
        lines: 100,
        statements: 100
      }
    }
  }
});
