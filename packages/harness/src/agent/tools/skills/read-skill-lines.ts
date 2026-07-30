import { tool } from "@khoralabs/agent-capabilities";
import { z } from "zod";
import { toolEnabled } from "../_helpers/disable-policies.ts";

import { type LineTuple, readLines } from "../_helpers/line-editing.ts";
import { touchRecentNamespaces } from "../memories/_helpers/recent-namespaces.ts";
import { hasMemoriesClient } from "../policies.ts";
import type { HarnessToolkitEnv } from "../types.ts";
import { loadSkillTextByKey, resolveSkillStorageKey, SKILLS_NAMESPACE } from "./_helpers/skills.ts";

export const readSkillLinesTool = tool<
  "readSkillLines",
  { key: string },
  { key: string; lines: LineTuple[]; namespace: string },
  HarnessToolkitEnv
>({
  name: "readSkillLines",
  description:
    "Read a skill's full stored document (frontmatter and body) as numbered lines. Pass the skill storage key, or a skill name if it matches a known key.",
  instructions: ["Inspect an existing skill as numbered lines before editing it."],
  inputSchema: z.object({
    key: z
      .string()
      .min(1)
      .describe("Skill storage key in the _root_/_skills_ namespace, or matching skill name."),
  }),
  policies: [hasMemoriesClient, toolEnabled("readSkillLines")],
  handler: async (ctx, input) => {
    const client = ctx.env.memoriesClient;
    if (client === undefined) throw new Error("memories client is not configured");

    const key = resolveSkillStorageKey(ctx.env.skills, input.key);
    const text = await loadSkillTextByKey(client, key);
    if (text === undefined) throw new Error(`skill not found: ${key}`);

    await touchRecentNamespaces(ctx.env.recentNamespaces, [SKILLS_NAMESPACE]);

    return { key, lines: readLines(text), namespace: SKILLS_NAMESPACE };
  },
});
