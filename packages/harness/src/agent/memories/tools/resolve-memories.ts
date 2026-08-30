import { tool } from "@khoralabs/agent-capabilities";
import { z } from "zod";

import { toolEnabled } from "../../turn/tools/_helpers/disable-policies.ts";
import { type LineTuple, readLines } from "../../turn/tools/_helpers/line-editing.ts";
import { hasMemoriesClient } from "../../turn/tools/policies.ts";
import type { HarnessToolkitEnv } from "../../turn/tools/types.ts";
import { loadMemoryTextByKey } from "./_helpers/memory-text.ts";
import { touchRecentNamespaces } from "./_helpers/recent-namespaces.ts";

const zMemoryRef = z.object({
  namespace: z.string().min(1).describe("Memory namespace path."),
  key: z.string().min(1).describe("Memory key within the namespace."),
});

export type ResolveMemoryResult = {
  namespace: string;
  key: string;
  text?: string;
  lines?: LineTuple[];
  error?: string;
};

export const resolveMemoriesTool = tool<
  "resolveMemories",
  { memories: Array<{ namespace: string; key: string }>; enumerateLines?: boolean },
  { results: ResolveMemoryResult[] },
  HarnessToolkitEnv
>({
  name: "resolveMemories",
  description:
    "Resolve one or more memories to their stored text. Pass enumerateLines: true to get numbered line tuples (for replaceMemoryLines); omit or false for a single text block per memory.",
  instructions: [
    "After searchMemories, resolve hit content here (batch when reading several hits).",
    "Use enumerateLines: true before replaceMemoryLines.",
  ],
  inputSchema: z.object({
    memories: z.array(zMemoryRef).min(1).describe("Memories to resolve (namespace + key)."),
    enumerateLines: z
      .boolean()
      .optional()
      .describe("When true, return numbered [lineNumber, content] tuples instead of text."),
  }),
  policies: [hasMemoriesClient, toolEnabled("resolveMemories")],
  handler: async (ctx, input) => {
    const client = ctx.env.memoriesClient;
    if (client === undefined) throw new Error("memories client is not configured");

    const enumerateLines = input.enumerateLines === true;
    const results: ResolveMemoryResult[] = [];
    const touched: string[] = [];

    for (const ref of input.memories) {
      const namespace = ref.namespace.trim();
      const key = ref.key.trim();
      const text = await loadMemoryTextByKey(client, namespace, key);
      if (text === undefined) {
        results.push({ namespace, key, error: `memory not found: ${namespace}/${key}` });
        continue;
      }
      touched.push(namespace);
      if (enumerateLines) {
        results.push({ namespace, key, lines: readLines(text) });
      } else {
        results.push({ namespace, key, text });
      }
    }

    if (touched.length > 0) {
      await touchRecentNamespaces(ctx.env.recentNamespaces, touched);
    }
    return { results };
  },
});
