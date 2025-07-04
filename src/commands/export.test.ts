import { runCommand } from "@oclif/test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDateString } from "../lib/util";

describe("export", () => {
  const defaultOutputDir = `./notion-export-${getDateString()}`;

  beforeEach(() => {
    process.env.NOTION_TOKEN = "test-token";
  });

  afterEach(() => {
    delete process.env.NOTION_TOKEN;
  });

  it("uses token from environment variable", async () => {
    const { stdout, stderr } = await runCommand("config:dump");
    console.log(stdout);
    // The output includes both the hook message and the config dump
    // Split by newline and check if any line contains the token
    const lines = stdout.split("\n");
    const configOutput = lines.join("\n");
    expect(configOutput).to.contain("test-token");
  });
});
