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
  })
};
