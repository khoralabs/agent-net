import { tool } from "@khoralabs/agent-capabilities";
import { z } from "zod";
import { toolEnabled } from "../_helpers/disable-policies.ts";
import { hasMemoriesClient } from "../policies.ts";
import type { HarnessToolkitEnv } from "../types.ts";
import { writeMemoryNode } from "./_helpers/memory-write.ts";
import { touchRecentNamespaces } from "./_helpers/recent-namespaces.ts";
import { resolveWriteMemoryOptions } from "./_helpers/write-memory-options.ts";

const zMemoryLink = z.object({
  namespace: z.string().min(1).describe("Peer memory namespace."),
  key: z.string().min(1).describe("Peer memory key."),
  direction: z
    .enum(["in", "out"])
    .optional()
    .describe("Edge direction from this memory to the peer. Defaults to out."),
  label: z.string().min(1).optional().describe("Ontology edge label kind. Defaults to references."),
});

export const writeMemoryTool = tool<
  "writeMemory",
  {
    namespace: string;
    key: string;
    text: string;
    links?: Array<z.infer<typeof zMemoryLink>>;
    nodeLabels?: Record<string, unknown>;
  },
  { memoryIds: string[] },
  HarnessToolkitEnv
>({
  name: "writeMemory",
  description:
    "Write or update a memory in the agent's database at the given namespace and key. Embeds content, applies ontology labels, optionally links peers, then enqueues async graph integration.",
  instructions: [
    "Persist notes and observations in an appropriate namespace.",
    "Prefer ontology node labels that fit the content (person, organization, fact, event, memory, …).",
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
    nodeLabels: z
      .record(z.string(), z.unknown())
      .optional()
      .describe(
        'Ontology node labels keyed by kind (e.g. { person: { name: "Ada" } }). Defaults to memory.',
      ),
  }),
  policies: [hasMemoriesClient, toolEnabled("writeMemory")],
  handler: async (ctx, input) => {
    const client = ctx.env.memoriesClient;
    if (client === undefined) throw new Error("memories client is not configured");

    const memoryIds = await writeMemoryNode(
      client,
      input,
      resolveWriteMemoryOptions(ctx.env, "writeMemory"),
    );
    await touchRecentNamespaces(ctx.env.recentNamespaces, [
      ...(input.links?.map((link) => link.namespace) ?? []),
      input.namespace,
    ]);
    return { memoryIds };
  },
});
