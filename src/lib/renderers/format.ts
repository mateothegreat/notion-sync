export type Format = "json" | "markdown" | "csv";

export const formatExtensions: Record<Format, string> = {
  json: "json",
  markdown: "md",
  csv: "csv"
};
