import { tool } from "@khoralabs/agent-capabilities";
import { z } from "zod";
import { hasMemoriesClient } from "../policies.ts";
import type { HarnessToolkitEnv } from "../types.ts";
import { writeMemoryNode } from "./_helpers/memory-write.ts";
import { touchRecentNamespaces } from "./_helpers/recent-namespaces.ts";

const zMemoryLink = z.object({
  namespace: z.string().min(1).describe("Peer memory namespace."),
  key: z.string().min(1).describe("Peer memory key."),
  direction: z
    .enum(["in", "out"])
    .optional()
    .describe("Edge direction from this memory to the peer. Defaults to out."),
  label: z
    .string()
    .min(1)
    .optional()
    .describe("Edge label kind. Defaults to References (harness minimal ontology)."),
});

export const writeMemoryTool = tool<
  "writeMemory",
  {
    namespace: string;
    key: string;
    text: string;
    links?: Array<z.infer<typeof zMemoryLink>>;
  },
  { memoryIds: string[] },
  HarnessToolkitEnv
>({
  name: "writeMemory",
  description:
    "Write or update a memory in the agent's database at the given namespace and key. Optionally link to other existing memories using the same graph edge model as mergeMemory.",
  instructions: [
    "Persist notes and observations in an appropriate namespace.",
    "For small refinements to existing memories, prefer readMemoryLines + replaceMemoryLines.",
  ],
  inputSchema: z.object({
    namespace: z.string().min(1).describe("Target memory namespace path."),
    key: z.string().min(1).describe("Memory key within the namespace."),
    text: z.string().min(1).describe("Text content to store."),
    links: z
      .array(zMemoryLink)
      .optional()
      .describe("Optional directed links to peer memories that already exist."),
  }),
  policies: [hasMemoriesClient],
  handler: async (ctx, input) => {
    const client = ctx.env.memoriesClient;
    if (client === undefined) throw new Error("memories client is not configured");

    const memoryIds = await writeMemoryNode(client, input);
    await touchRecentNamespaces(ctx.env.recentNamespaces, [
      ...(input.links?.map((link) => link.namespace) ?? []),
      input.namespace,
    ]);
    return { memoryIds };
  },
});
