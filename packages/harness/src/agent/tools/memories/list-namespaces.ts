import { tool } from "@khoralabs/agent-capabilities";
import { z } from "zod";
import { toolEnabled } from "../_helpers/disable-policies.ts";

import { hasMemoriesClient } from "../policies.ts";
import type { HarnessToolkitEnv } from "../types.ts";

/** Aligns with memories-service `DatabaseNamespaceMetadata` / node `NamespaceMetadataInfo`. */
export type ListedNamespace = {
  namespace: string;
  alias: string | null;
  description: string;
};

function toListedNamespace(raw: {
  namespace: string;
  alias?: string | null;
  description?: string;
}): ListedNamespace {
  return {
    namespace: raw.namespace,
    alias: raw.alias ?? null,
    description: raw.description ?? "",
  };
}

export const listNamespacesTool = tool<
  "listNamespaces",
  Record<string, never>,
  { namespaces: ListedNamespace[] },
  HarnessToolkitEnv
>({
  name: "listNamespaces",
  description:
    "List all namespaces currently present in the agent's memory database (suppressed namespaces are omitted). Prefer searchNamespaces when looking for namespaces by topic or keyword.",
  instructions: [
    "Use for a full inventory; prefer searchNamespaces for query-based discovery before searchMemories.",
  ],
  inputSchema: z.object({}),
  policies: [hasMemoriesClient, toolEnabled("listNamespaces")],
  handler: async (ctx) => {
    const client = ctx.env.memoriesClient;
    if (client === undefined) throw new Error("memories client is not configured");

    const withMeta = client.persistence.listNamespacesWithMetadata;
    if (withMeta !== undefined) {
      const rows = await withMeta.call(client.persistence);
      return {
        namespaces: [...rows].map((row) =>
          toListedNamespace({
            namespace: row.namespace,
            alias: row.alias,
            description: row.description,
          }),
        ),
      };
    }

    const listFn = client.persistence.listMemoryNamespaces;
    if (listFn === undefined) {
      throw new Error("memories client does not support listing namespaces");
    }

    const paths = await listFn.call(client.persistence);
    return {
      namespaces: [...paths].map((namespace) => toListedNamespace({ namespace })),
    };
  },
});
