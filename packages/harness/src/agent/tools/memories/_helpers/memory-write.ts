import { ids } from "@khoralabs/memories-persistence-core";
import type { RemoteMemoriesClientAsync } from "@khoralabs/memories-service-client";

import { HARNESS_MEMORY_LINK_LABEL } from "./memories-client.ts";

export type MemoryLinkInput = {
  namespace: string;
  key: string;
  direction?: "in" | "out";
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
      label: { kind: link.label?.trim() || HARNESS_MEMORY_LINK_LABEL, props: {} },
    })) ?? [];

  return client.mergeMemory({
    kind: "node",
    namespace,
    key,
    content: [{ key: "text", text: input.text }],
    labels: [],
    ...(edges.length > 0 ? { edges } : {}),
  });
}
