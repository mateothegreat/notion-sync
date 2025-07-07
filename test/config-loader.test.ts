import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fs/promises before it is imported anywhere.
vi.mock("fs/promises", () => {
  const readFile = vi.fn();
  const writeFile = vi.fn().mockResolvedValue(undefined);
  return {
    writeFile,
    readFile
  };
});

import * as fs from "fs/promises";

import {
  createCommandFlags,
  compileCommandConfig,
  generateConfigYaml,
  loadConfigFile,
  ResolvedCommandConfig
} from "../src/lib/config/config-loader";

const mockedFs = fs as unknown as { writeFile: ReturnType<typeof vi.fn>; readFile: ReturnType<typeof vi.fn> };

describe("config-loader (simplified)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should expose core flags for '*'", () => {
    const flags = createCommandFlags("*");
    expect(flags).toHaveProperty("token");
    expect(flags).toHaveProperty("concurrency");
    // Only core flags should be present
    expect(flags).not.toHaveProperty("path");
  });

  it("should merge core and command specific flags for 'export'", () => {
    const flags = createCommandFlags("export");
    expect(flags).toHaveProperty("token");
    expect(flags).toHaveProperty("path");
    expect(flags).toHaveProperty("format");
  });

  it("should compile a valid export configuration from flags", () => {
    const inputFlags = {
      token: "ntn_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN012345",
      path: "./out",
      format: "csv",
      concurrency: 5,
      "include-blocks": false,
      "include-comments": true,
      "include-properties": true,
      databases: "db1,db2"
    } as const;

    const config = compileCommandConfig("export", { ...inputFlags });

    // Type assertion ensures we received the proper shape (compile-time), runtime checks below.
    const typedConfig: ResolvedCommandConfig<"export"> = config;

    expect(typedConfig).toMatchObject({
      token: inputFlags.token,
      path: inputFlags.path,
      format: inputFlags.format,
      concurrency: inputFlags.concurrency
    });
  });

  it("should compile core configuration when using '*'", () => {
    const config = compileCommandConfig("*", {
      token: "ntn_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN012345",
      concurrency: 2,
      retries: 1,
      verbose: true
    });

    expect(config).toEqual({
      token: expect.any(String),
      concurrency: 2,
      retries: 1,
      verbose: true
    });
  });

  it("should create a YAML configuration scaffold", async () => {
    await generateConfigYaml("./dummy.yaml");
    expect(mockedFs.writeFile).toHaveBeenCalledTimes(1);
    const [filePath, content] = mockedFs.writeFile.mock.calls[0];
    expect(filePath).toBe("./dummy.yaml");
    expect(content).toContain("# Notion Sync Configuration");
  });

  it("should attempt to load config file but fall back when not present", async () => {
    mockedFs.readFile.mockRejectedValueOnce(new Error("File not found"));
    const config = await loadConfigFile();
    expect(config).toEqual({});
    expect(mockedFs.readFile).toHaveBeenCalled();
  });

  it("should load config file when present", async () => {
    mockedFs.readFile.mockResolvedValueOnce("token: foo\nconcurrency: 3");
    const cfg = await loadConfigFile();
    expect(cfg).toMatchObject({ token: "foo", concurrency: 3 });
  });
});