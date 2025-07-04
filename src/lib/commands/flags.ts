import { getObjects } from "$lib/objects/types";
import { Flags } from "@oclif/core";

export const baseFlags = {
  token: Flags.string({
    description: "Notion API integration token.",
    default: async () => {
      const token = process.env.NOTION_TOKEN;
      if (!token) {
        throw new Error("NOTION_TOKEN is not set");
      }
      return token;
    },
    env: "NOTION_TOKEN",
    required: true
  }),
  flush: Flags.boolean({
    description: "Flush stdout after each log instead of updating in place",
    default: false
  }),
  timeout: Flags.integer({
    description: "Max run time in seconds",
    default: 0
  }),
  objects: Flags.string({
    description: "Objects to export",
    options: getObjects(),
    multiple: true
  })
};
