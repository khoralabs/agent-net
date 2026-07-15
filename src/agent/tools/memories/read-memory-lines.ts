import { tool } from "@khoralabs/agent-capabilities";
import { z } from "zod";

import { type LineTuple, readLines } from "../_helpers/line-editing.ts";
import { hasMemoriesClient } from "../policies.ts";
import type { HarnessToolkitEnv } from "../types.ts";
import { loadMemoryTextByKey } from "./_helpers/memory-text.ts";

export const readMemoryLinesTool = tool<
  "readMemoryLines",
  { namespace: string; key: string },
  { namespace: string; key: string; lines: LineTuple[] },
  HarnessToolkitEnv
>({
  name: "readMemoryLines",
  description:
    "Read a memory's stored text content as numbered lines. Works for any namespace and key.",
  instructions: ["Inspect an existing memory as numbered lines before editing it."],
  inputSchema: z.object({
    namespace: z.string().min(1).describe("Memory namespace path."),
    key: z.string().min(1).describe("Memory key within the namespace."),
  }),
  policies: [hasMemoriesClient],
  handler: async (ctx, input) => {
    const client = ctx.env.memoriesClient;
    if (client === undefined) throw new Error("memories client is not configured");

    const namespace = input.namespace.trim();
    const key = input.key.trim();
    const text = await loadMemoryTextByKey(client, namespace, key);
    if (text === undefined) throw new Error(`memory not found: ${namespace}/${key}`);

    return { namespace, key, lines: readLines(text) };
  },
});
