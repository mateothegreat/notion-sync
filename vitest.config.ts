import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
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
      all: true,
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/*.d.ts", "src/index.ts"],
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
