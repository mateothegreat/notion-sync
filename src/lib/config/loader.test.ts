import * as fs from "fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { loadCommandConfig } from "./loader";

vi.mock("fs/promises");

describe("loadCommandConfig", () => {
  const baseSchema = z.object({
    token: z.string(),
    verbose: z.coerce.boolean().default(false)
  });

  const commandSchema = z.object({
    path: z.string(),
    format: z.enum(["json", "markdown"]),
    output: z.string().optional()
  });

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should load config from CLI flags only, with defaults applied", async () => {
    vi.mocked(fs.readFile).mockRejectedValue({ code: "ENOENT" });
    const flags = { token: "cli_token", path: "./cli_path", format: "json" };
    const config = await loadCommandConfig(baseSchema, commandSchema, flags);
    expect(config).toEqual({ ...flags, verbose: false });
  });

  it("should load config from YAML file", async () => {
    const yamlContent = `
token: yaml_token
path: ./yaml_path
format: markdown
`;
    vi.mocked(fs.readFile).mockResolvedValue(yamlContent);
    const config = await loadCommandConfig(baseSchema, commandSchema, {});
    expect(config).toEqual({
      token: "yaml_token",
      path: "./yaml_path",
      format: "markdown",
      verbose: false
    });
  });

  it("should load and coerce config from environment variables", async () => {
    vi.mocked(fs.readFile).mockRejectedValue({ code: "ENOENT" });
    process.env.TOKEN = "env_token";
    process.env.PATH = "./env_path";
    process.env.FORMAT = "json";
    process.env.VERBOSE = "true";

    const config = await loadCommandConfig(baseSchema, commandSchema, {});
    expect(config).toEqual({
      token: "env_token",
      path: "./env_path",
      format: "json",
      verbose: true
    });
    // Clean up env vars
    delete process.env.TOKEN;
    delete process.env.PATH;
    delete process.env.FORMAT;
    delete process.env.VERBOSE;
  });

  it("should respect precedence: CLI > env > YAML", async () => {
    const yamlContent = `
token: yaml_token
path: ./yaml_path
format: markdown
verbose: false
`;
    vi.mocked(fs.readFile).mockResolvedValue(yamlContent);

    process.env.TOKEN = "env_token";
    process.env.PATH = "./env_path";
    process.env.VERBOSE = "true";

    const flags = { token: "cli_token", format: "json" };

    const config = await loadCommandConfig(baseSchema, commandSchema, flags);

    expect(config).toEqual({
      token: "cli_token",
      path: "./env_path",
      format: "json",
      verbose: true
    });
    // Clean up env vars
    delete process.env.TOKEN;
    delete process.env.PATH;
    delete process.env.VERBOSE;
  });

  it('should handle the "output" alias for "path"', async () => {
    vi.mocked(fs.readFile).mockRejectedValue({ code: "ENOENT" });
    const flags = { token: "token", output: "./output_path", format: "json" };
    const config = await loadCommandConfig(baseSchema, commandSchema, flags);
    expect(config.path).toBe("./output_path");
  });

  it("should throw a validation error for invalid config", async () => {
    vi.mocked(fs.readFile).mockRejectedValue({ code: "ENOENT" });
    const flags = { path: "./path" }; // Missing token and format
    await expect(loadCommandConfig(baseSchema, commandSchema, flags)).rejects.toThrow("Configuration loading failed.");
  });

  it("should log an error for non-ENOENT file errors but succeed if other sources are valid", async () => {
    vi.mocked(fs.readFile).mockRejectedValue({ code: "EACCES" });
    const flags = { token: "cli_token", path: "./cli_path", format: "json" };
    const config = await loadCommandConfig(baseSchema, commandSchema, flags);
    expect(config).toEqual({ ...flags, verbose: false });
  });
});
