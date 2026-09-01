import { tool } from "@khoralabs/agent-capabilities";
import { writeMemoryNode } from "@khoralabs/memories-node/helpers/agent";
import {
  type AgentMemoriesOntology,
  minimalAgentMemoriesOntology,
  resolveAgentMemoriesOntology,
} from "@khoralabs/memories-service/client/agent";
import { z } from "zod";
import { toolEnabled } from "../../turn/tools/_helpers/disable-policies.ts";
import { hasMemoriesClient } from "../../turn/tools/policies.ts";
import type { HarnessToolkitEnv } from "../../turn/tools/types.ts";
import {
  memoryLinkSchema,
  nodeLabelsInputSchema,
  parseMemoryLinkRow,
} from "./_helpers/ontology-tool-schema.ts";
import { touchRecentNamespaces } from "./_helpers/recent-namespaces.ts";
import { resolveWriteMemoryOptions } from "./_helpers/write-memory-options.ts";

export type WriteMemoryResult = { memoryIds: string[] } | { memoryIds: []; error: string };

export function createWriteMemoryTool(ontology: AgentMemoriesOntology) {
  const resolved = resolveAgentMemoriesOntology(ontology);
  const zLink = memoryLinkSchema(resolved);
  const zNodeLabels = nodeLabelsInputSchema(resolved);

  return tool<
    "writeMemory",
    {
      namespace: string;
      key: string;
      text: string;
      links?: Array<Record<string, unknown>>;
      nodeLabels?: Record<string, unknown>;
    },
    WriteMemoryResult,
    HarnessToolkitEnv
  >({
    name: "writeMemory",
    description:
      "Write or update a memory in the agent's database at the given namespace and key. Embeds content, applies ontology labels, optionally links peers, then enqueues async graph integration.",
    instructions: [
      "Persist notes and observations in an appropriate namespace.",
      "Set nodeLabels using ontology kinds and their required fields (see tool schema). Omit nodeLabels to default to memory.",
      "Peer links need namespace + key from search hits (not a joined path). Set at most one edge-kind field on each link (omit for default references).",
      "For small refinements to existing memories, prefer resolveMemories (enumerateLines: true) + replaceMemoryLines.",
    ],
    inputSchema: z.object({
      namespace: z.string().min(1).describe("Target memory namespace path."),
      key: z.string().min(1).describe("Memory key within the namespace."),
      text: z.string().min(1).describe("Text content to store."),
      links: z
        .array(zLink)
        .optional()
        .describe("Optional directed links to peer memories that already exist."),
      nodeLabels: zNodeLabels,
    }),
    policies: [hasMemoriesClient, toolEnabled("writeMemory")],
    handler: async (ctx, input) => {
      const client = ctx.env.memoriesClient;
      if (client === undefined) {
        return { memoryIds: [], error: "memories client is not configured" };
      }

      try {
        const links =
          input.links?.map((row) => parseMemoryLinkRow(row as Record<string, unknown>, resolved)) ??
          [];

        const nodeLabels =
          input.nodeLabels !== undefined
            ? Object.fromEntries(
                Object.entries(input.nodeLabels).filter(([, v]) => v !== undefined),
              )
            : undefined;

        const memoryIds = await writeMemoryNode(
          client,
          {
            namespace: input.namespace,
            key: input.key,
            text: input.text,
            ...(links.length > 0 ? { links } : {}),
            ...(nodeLabels !== undefined && Object.keys(nodeLabels).length > 0
              ? { nodeLabels }
              : {}),
          },
          resolveWriteMemoryOptions(ctx.env, "writeMemory"),
        );
        await touchRecentNamespaces(ctx.env.recentNamespaces, [
          ...links.map((link) => link.namespace),
          input.namespace,
        ]);
        return { memoryIds };
      } catch (err) {
        const message =
          err instanceof Error && err.message.trim().length > 0 ? err.message.trim() : String(err);
        return { memoryIds: [], error: message };
      }
    },
  });
}

/** Static export for tests; prefers createWriteMemoryTool(installed ontology) in dynamicToolkit. */
export const writeMemoryTool = createWriteMemoryTool(minimalAgentMemoriesOntology);
