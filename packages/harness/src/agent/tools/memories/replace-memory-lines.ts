import { tool } from "@khoralabs/agent-capabilities";
import { z } from "zod";
import { toolEnabled } from "../_helpers/disable-policies.ts";

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
import { touchRecentNamespaces } from "./_helpers/recent-namespaces.ts";
import { resolveWriteMemoryOptions } from "./_helpers/write-memory-options.ts";

const zLineChange = z.tuple([z.number().int().min(1), z.string()]);

export const replaceMemoryLinesTool = tool<
  "replaceMemoryLines",
  { namespace: string; key: string; changes: LineTuple[] },
  { namespace: string; key: string; memoryIds: string[]; lines: LineTuple[] },
  HarnessToolkitEnv
>({
  name: "replaceMemoryLines",
  description:
    "Replace specific lines in a memory's stored text. Each change is a [lineNumber, newContent] tuple. Resolve with enumerateLines: true first via resolveMemories.",
  instructions: [
    "Refine a memory by replacing specific line numbers.",
    "Prefer line edits over full writeMemory rewrites for small refinements.",
  ],
  inputSchema: z.object({
    namespace: z.string().min(1).describe("Memory namespace path."),
    key: z.string().min(1).describe("Memory key within the namespace."),
    changes: z
      .array(zLineChange)
      .min(1)
      .describe("Line replacements as [lineNumber, newContent] tuples."),
  }),
  policies: [hasMemoriesClient, toolEnabled("replaceMemoryLines")],
  handler: async (ctx, input) => {
    const client = ctx.env.memoriesClient;
    if (client === undefined) throw new Error("memories client is not configured");

    const namespace = input.namespace.trim();
    const key = input.key.trim();
    const text = await loadMemoryTextByKey(client, namespace, key);
    if (text === undefined) throw new Error(`memory not found: ${namespace}/${key}`);

    const updated = applyLineChanges(text, input.changes);
    const memoryIds = await writeMemoryNode(
      client,
      { namespace, key, text: updated },
      resolveWriteMemoryOptions(ctx.env, "replaceMemoryLines"),
    );

    if (namespace === SKILLS_NAMESPACE) {
      try {
        upsertSkillInEnv(ctx.env.skills, skillRecordFromText(SKILLS_NAMESPACE, key, updated));
      } catch {
        // Non-skill content in the _root_/_skills_ namespace; skip catalog refresh.
      }
    }

    await touchRecentNamespaces(ctx.env.recentNamespaces, namespace);
    return { namespace, key, memoryIds, lines: readLines(updated) };
  },
});
