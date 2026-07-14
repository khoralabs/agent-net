import { tool } from "@khoralabs/agent-capabilities";
import { z } from "zod";

import { applyLineChanges, type LineTuple, readLines } from "../_helpers/line-editing.ts";
import { writeMemoryNode } from "../memories/_helpers/memory-write.ts";
import { hasMemoriesClient } from "../policies.ts";
import type { HarnessToolkitEnv } from "../types.ts";
import {
  loadSkillTextByKey,
  resolveSkillStorageKey,
  SKILLS_NAMESPACE,
  skillRecordFromText,
  upsertSkillInEnv,
} from "./_helpers/skills.ts";

const zLineChange = z.tuple([z.number().int().min(1), z.string()]);

export const replaceSkillLinesTool = tool<
  "replaceSkillLines",
  { key: string; changes: LineTuple[] },
  { key: string; memoryIds: string[]; lines: LineTuple[] },
  HarnessToolkitEnv
>({
  name: "replaceSkillLines",
  description:
    "Replace specific lines in a skill's full stored document. Each change is a [lineNumber, newContent] tuple. Read lines first with readSkillLines.",
  inputSchema: z.object({
    key: z
      .string()
      .min(1)
      .describe("Skill storage key in the skills namespace, or matching skill name."),
    changes: z
      .array(zLineChange)
      .min(1)
      .describe("Line replacements as [lineNumber, newContent] tuples."),
  }),
  policies: [hasMemoriesClient],
  handler: async (ctx, input) => {
    const client = ctx.env.memoriesClient;
    if (client === undefined) throw new Error("memories client is not configured");

    const key = resolveSkillStorageKey(ctx.env.skills, input.key);
    const text = await loadSkillTextByKey(client, key);
    if (text === undefined) throw new Error(`skill not found: ${key}`);

    const updated = applyLineChanges(text, input.changes);
    try {
      skillRecordFromText(SKILLS_NAMESPACE, key, updated);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`skill document invalid after line changes: ${message}`);
    }

    const memoryIds = await writeMemoryNode(client, {
      namespace: SKILLS_NAMESPACE,
      key,
      text: updated,
    });

    upsertSkillInEnv(ctx.env.skills, skillRecordFromText(SKILLS_NAMESPACE, key, updated));

    return { key, memoryIds, lines: readLines(updated) };
  },
});
