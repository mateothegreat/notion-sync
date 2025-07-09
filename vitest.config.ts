import { resolve } from "path";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

const include = ["./src/**/*.test.ts"];
const exclude = [];

export default defineConfig({
  plugins: [
    tsconfigPaths({
      root: ".",
      projects: ["./tsconfig.json"],
      ignoreConfigErrors: true
    })
  ],
  resolve: {
    alias: {
      // src
      $core: resolve(__dirname, "./src/core"),
      $shared: resolve(__dirname, "./src/shared"),
      // lib
      $commands: resolve(__dirname, "./src/lib/commands"),
      $lib: resolve(__dirname, "./src/lib"),
      $config: resolve(__dirname, "./src/lib/config"),
      "$control-plane": resolve(__dirname, "./src/lib/control-plane"),
      $export: resolve(__dirname, "./src/lib/exporters"),
      $notion: resolve(__dirname, "./src/lib/notion"),
      $objects: resolve(__dirname, "./src/lib/objects"),
      $renderers: resolve(__dirname, "./src/lib/renderers"),
      $util: resolve(__dirname, "./src/lib/util"),
      // test
      $test: resolve(__dirname, "./src/test")
    }
  },
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
