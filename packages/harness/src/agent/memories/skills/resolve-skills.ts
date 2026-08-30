import { tool } from "@khoralabs/agent-capabilities";
import { z } from "zod";

import { toolEnabled } from "../../../runtime/tools/_helpers/disable-policies.ts";
import { type LineTuple, readLines } from "../../../runtime/tools/_helpers/line-editing.ts";
import { hasMemoriesClient } from "../../../runtime/tools/policies.ts";
import type { HarnessToolkitEnv } from "../../../runtime/tools/types.ts";
import { touchRecentNamespaces } from "../tools/_helpers/recent-namespaces.ts";
import { loadSkillTextByKey, resolveSkillStorageKey, SKILLS_NAMESPACE } from "./_helpers/skills.ts";

export type ResolveSkillResult = {
  namespace: string;
  key: string;
  text?: string;
  lines?: LineTuple[];
  error?: string;
};

export const resolveSkillsTool = tool<
  "resolveSkills",
  { keys: string[]; enumerateLines?: boolean },
  { results: ResolveSkillResult[] },
  HarnessToolkitEnv
>({
  name: "resolveSkills",
  description:
    "Resolve one or more skills to their full stored documents. Pass enumerateLines: true for numbered line tuples (for replaceSkillLines); omit or false for a single text block per skill.",
  instructions: [
    "After searchSkills, resolve skill content here (batch when reading several).",
    "Use enumerateLines: true before replaceSkillLines.",
  ],
  inputSchema: z.object({
    keys: z
      .array(z.string().min(1))
      .min(1)
      .describe("Skill storage keys, or skill names that match known keys."),
    enumerateLines: z
      .boolean()
      .optional()
      .describe("When true, return numbered [lineNumber, content] tuples instead of text."),
  }),
  policies: [hasMemoriesClient, toolEnabled("resolveSkills")],
  handler: async (ctx, input) => {
    const client = ctx.env.memoriesClient;
    if (client === undefined) throw new Error("memories client is not configured");

    const enumerateLines = input.enumerateLines === true;
    const results: ResolveSkillResult[] = [];
    let anyOk = false;

    for (const raw of input.keys) {
      const key = resolveSkillStorageKey(ctx.env.skills, raw);
      const text = await loadSkillTextByKey(client, key);
      if (text === undefined) {
        results.push({
          namespace: SKILLS_NAMESPACE,
          key,
          error: `skill not found: ${key}`,
        });
        continue;
      }
      anyOk = true;
      if (enumerateLines) {
        results.push({ namespace: SKILLS_NAMESPACE, key, lines: readLines(text) });
      } else {
        results.push({ namespace: SKILLS_NAMESPACE, key, text });
      }
    }

    if (anyOk) {
      await touchRecentNamespaces(ctx.env.recentNamespaces, [SKILLS_NAMESPACE]);
    }
    return { results };
  },
});
