import { log } from "$lib/log";
import { Hook } from "@oclif/core";

/**
 * Preparse hook that ensures the token flag is set from various sources.
 * This hook runs before argument parsing and can modify the argv array.
 */
const hook: Hook.Preparse = async function (v): Promise<string[]> {
  try {
    log.debug.inspect("preparse", v.options.flags.token);
    // Check if token flag is already provided in argv
    const hasTokenFlag = v.argv.includes("--token") || v.argv.includes("-t");

    // If the token flag is not provided in argv, check if the token is set in the config.
    // if (!hasTokenFlag && config.token) {
    //   argv.push("--token", config.token);
    // }
  } catch (error) {
    log.error("Failed to load config:", error);
    // Fallback to environment variables
    const token = process.env.NOTION_TOKEN || process.env.TOKEN;
    if (token && !v.argv.includes("--token") && !v.argv.includes("-t")) {
      v.argv.push("--token", token);
    }
  }

  // log.debug.inspect("preparse", { argv: v.argv, flags: v.config });
  return v.argv;
};

export default hook;
