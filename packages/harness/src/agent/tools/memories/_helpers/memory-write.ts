import { ids } from "@khoralabs/memories-persistence-core";
import type { RemoteMemoriesClientAsync } from "@khoralabs/memories-service/client";

import { HARNESS_MEMORY_EDGE_KIND, HARNESS_MEMORY_NODE_KIND } from "./minimal-ontology.ts";

/**
 * Tool-facing link input. These are harness DTOs for the agent tool schema — they are mapped
 * into memories-service `mergeMemory` edge payloads (`peer_memory_id`, `direction`, `label`).
 * Ontology kinds live in the linked OntologyDefinition, not in the memories HTTP client types.
 */
export type MemoryLinkInput = {
  namespace: string;
  key: string;
  direction?: "in" | "out";
  /** Edge label kind. Defaults to {@link HARNESS_MEMORY_EDGE_KIND} (`References`). */
  label?: string;
};

export type WriteMemoryNodeInput = {
  namespace: string;
  key: string;
  text: string;
  links?: MemoryLinkInput[];
};

export async function writeMemoryNode(
  client: RemoteMemoriesClientAsync,
  input: WriteMemoryNodeInput,
): Promise<string[]> {
  const namespace = input.namespace.trim();
  const key = input.key.trim();
  const edges =
    input.links?.map((link) => ({
      peer_memory_id: ids.memory(link.namespace.trim(), link.key.trim()),
      direction: link.direction ?? ("out" as const),
      label: { kind: link.label?.trim() || HARNESS_MEMORY_EDGE_KIND, props: {} },
    })) ?? [];

  return client.mergeMemory({
    kind: "node",
    namespace,
    key,
    content: [{ key: "text", text: input.text }],
    labels: [{ kind: HARNESS_MEMORY_NODE_KIND, props: {} }],
    ...(edges.length > 0 ? { edges } : {}),
  });
}
