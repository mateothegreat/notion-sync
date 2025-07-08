import { defineConfig } from "vitest/config";

const include = ["./src/**/*.test.ts"];
const exclude = [];

export default defineConfig({
  test: {
    exclude,
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
    benchmark: {
      outputJson: "./coverage/benchmark.json"
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      all: true,
      include,
      exclude,
      enabled: true,
      clean: true,
      ignoreEmptyLines: true,
      watermarks: {
        branches: [80, 100],
        functions: [80, 100],
        lines: [80, 100],
        statements: [80, 100]
      },
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80
      }
    }
  }
});
