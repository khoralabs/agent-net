import { tool } from "@khoralabs/agent-capabilities";
import { z } from "zod";
import { toolEnabled } from "../../turn/tools/_helpers/disable-policies.ts";

import {
  applyLineChanges,
  type LineTuple,
  readLines,
} from "../../turn/tools/_helpers/line-editing.ts";
import { hasMemoriesClient } from "../../turn/tools/policies.ts";
import type { HarnessToolkitEnv } from "../../turn/tools/types.ts";
import { writeMemoryNode } from "../tools/_helpers/memory-write.ts";
import { touchRecentNamespaces } from "../tools/_helpers/recent-namespaces.ts";
import { resolveWriteMemoryOptions } from "../tools/_helpers/write-memory-options.ts";
import {
  loadSkillTextByKey,
  resolveSkillStorageKey,
  SKILLS_NAMESPACE,
  skillRecordFromText,
  upsertSkillInEnv,
} from "./_helpers/skills.ts";

const zLineChange = z.object({
  lineNumber: z.number().int().min(1),
  content: z.string(),
});

type LineChangeInput = z.infer<typeof zLineChange>;

export const replaceSkillLinesTool = tool<
  "replaceSkillLines",
  { key: string; changes: LineChangeInput[] },
  { key: string; memoryIds: string[]; lines: LineTuple[]; namespace: string },
  HarnessToolkitEnv
>({
  name: "replaceSkillLines",
  description:
    "Replace specific lines in a skill's full stored document. Each change is an object with lineNumber and content. Resolve with enumerateLines: true first via resolveSkills.",
  instructions: [
    "Refine a skill by replacing specific line numbers.",
    "Prefer line edits over full writeSkill rewrites for skill refinements.",
  ],
  inputSchema: z.object({
    key: z
      .string()
      .min(1)
      .describe("Skill storage key in the _skills_ namespace, or matching skill name."),
    changes: z
      .array(zLineChange)
      .min(1)
      .describe("Line replacements: objects with lineNumber and new content."),
  }),
  policies: [hasMemoriesClient, toolEnabled("replaceSkillLines")],
  handler: async (ctx, input) => {
    const client = ctx.env.memoriesClient;
    if (client === undefined) throw new Error("memories client is not configured");

    const key = resolveSkillStorageKey(ctx.env.skills, input.key);
    const text = await loadSkillTextByKey(client, key);
    if (text === undefined) throw new Error(`skill not found: ${key}`);

    const tuples: LineTuple[] = input.changes.map((c) => [c.lineNumber, c.content]);
    const updated = applyLineChanges(text, tuples);
    try {
      skillRecordFromText(SKILLS_NAMESPACE, key, updated);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`skill document invalid after line changes: ${message}`);
    }

    const memoryIds = await writeMemoryNode(
      client,
      {
        namespace: SKILLS_NAMESPACE,
        key,
        text: updated,
      },
      resolveWriteMemoryOptions(ctx.env, "replaceSkillLines"),
    );

    upsertSkillInEnv(ctx.env.skills, skillRecordFromText(SKILLS_NAMESPACE, key, updated));
    await touchRecentNamespaces(ctx.env.recentNamespaces, [SKILLS_NAMESPACE]);

    return { key, memoryIds, lines: readLines(updated), namespace: SKILLS_NAMESPACE };
  },
});
