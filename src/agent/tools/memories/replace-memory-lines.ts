import { tool } from "@khoralabs/agent-capabilities";
import { z } from "zod";

import { applyLineChanges, type LineTuple, readLines } from "../_helpers/line-editing.ts";
import { hasMemoriesClient } from "../policies.ts";
import {
  SKILLS_NAMESPACE,
  skillRecordFromText,
  upsertSkillInEnv,
} from "../skills/_helpers/skills.ts";
import type { HarnessToolkitEnv } from "../types.ts";
import { loadMemoryTextByKey } from "./_helpers/memory-text.ts";
import { writeMemoryNode } from "./_helpers/memory-write.ts";

const zLineChange = z.tuple([z.number().int().min(1), z.string()]);

export const replaceMemoryLinesTool = tool<
  "replaceMemoryLines",
  { namespace: string; key: string; changes: LineTuple[] },
  { namespace: string; key: string; memoryIds: string[]; lines: LineTuple[] },
  HarnessToolkitEnv
>({
  name: "replaceMemoryLines",
  description:
    "Replace specific lines in a memory's stored text. Each change is a [lineNumber, newContent] tuple. Read lines first with readMemoryLines.",
  inputSchema: z.object({
    namespace: z.string().min(1).describe("Memory namespace path."),
    key: z.string().min(1).describe("Memory key within the namespace."),
    changes: z
      .array(zLineChange)
      .min(1)
      .describe("Line replacements as [lineNumber, newContent] tuples."),
  }),
  policies: [hasMemoriesClient],
  handler: async (ctx, input) => {
    const client = ctx.env.memoriesClient;
    if (client === undefined) throw new Error("memories client is not configured");

    const namespace = input.namespace.trim();
    const key = input.key.trim();
    const text = await loadMemoryTextByKey(client, namespace, key);
    if (text === undefined) throw new Error(`memory not found: ${namespace}/${key}`);

    const updated = applyLineChanges(text, input.changes);
    const memoryIds = await writeMemoryNode(client, { namespace, key, text: updated });

    if (namespace === SKILLS_NAMESPACE) {
      try {
        upsertSkillInEnv(ctx.env.skills, skillRecordFromText(SKILLS_NAMESPACE, key, updated));
      } catch {
        // Non-skill content in the skills namespace; skip catalog refresh.
      }
    }

    return { namespace, key, memoryIds, lines: readLines(updated) };
  },
});
