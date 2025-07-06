import { confirm } from "@inquirer/prompts";
import { blueBright, reset } from "ansis";
import { default as fastLevenshtein } from "fast-levenshtein";
import { setTimeout } from "node:timers/promises";

export const getConfirmation = async (suggestion: string): Promise<boolean> => {
  const ac = new AbortController();
  const { signal } = ac;
  const confirmation = confirm({
    default: true,
    message: `Did you mean ${blueBright(suggestion)}?`,
    theme: {
      prefix: "",
      style: {
        message: (text: string) => reset(text)
      }
    }
  });

  setTimeout(10_000, "timeout", { signal })
    .catch(() => false)
    .then(() => confirmation.cancel());

  return confirmation.then((value) => {
    ac.abort();
    return value;
  });
};

export const closest = (target: string, possibilities: string[]): string =>
  possibilities
    .map((id) => ({ distance: fastLevenshtein.get(target, id, { useCollator: true }), id }))
    .sort((a, b) => a.distance - b.distance)[0]?.id ?? "";
