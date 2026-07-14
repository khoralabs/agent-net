import { tool } from "@khoralabs/agent-capabilities";
import { z } from "zod";

import { type LineTuple, readLines } from "../_helpers/line-editing.ts";
import { hasMemoriesClient } from "../policies.ts";
import type { HarnessToolkitEnv } from "../types.ts";
import { loadSkillTextByKey, resolveSkillStorageKey } from "./_helpers/skills.ts";

export const readSkillLinesTool = tool<
  "readSkillLines",
  { key: string },
  { key: string; lines: LineTuple[] },
  HarnessToolkitEnv
>({
  name: "readSkillLines",
  description:
    "Read a skill's full stored document (frontmatter and body) as numbered lines. Pass the skill storage key, or a skill name if it matches a known key.",
  inputSchema: z.object({
    key: z
      .string()
      .min(1)
      .describe("Skill storage key in the skills namespace, or matching skill name."),
  }),
  policies: [hasMemoriesClient],
  handler: async (ctx, input) => {
    const client = ctx.env.memoriesClient;
    if (client === undefined) throw new Error("memories client is not configured");

    const key = resolveSkillStorageKey(ctx.env.skills, input.key);
    const text = await loadSkillTextByKey(client, key);
    if (text === undefined) throw new Error(`skill not found: ${key}`);

    return { key, lines: readLines(text) };
  },
});
