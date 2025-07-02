import { Command } from "@oclif/core";

export abstract class BaseCommand extends Command {
  // static override flags = {
  //   token: Flags.string({
  //     description: "Notion API integration token.",
  //     default: async () => {
  //       const token = process.env.NOTION_TOKEN;
  //       console.log("token", token);
  //       if (!token) {
  //         throw new Error("NOTION_TOKEN is not set");
  //       }
  //       return token;
  //     },
  //     env: "NOTION_TOKEN",
  //     required: true,
  //   }),
  // };
}
