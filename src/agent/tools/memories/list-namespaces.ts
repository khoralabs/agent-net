import { tool } from "@khoralabs/agent-capabilities";
import { z } from "zod";

import { hasMemoriesClient } from "../policies.ts";
import type { HarnessToolkitEnv } from "../types.ts";

export const listNamespacesTool = tool<
  "listNamespaces",
  Record<string, never>,
  { namespaces: string[] },
  HarnessToolkitEnv
>({
  name: "listNamespaces",
  description: "List all namespaces currently present in the agent's memory database.",
  instructions: ["Discover namespaces currently in use before searching or writing memories."],
  inputSchema: z.object({}),
  policies: [hasMemoriesClient],
  handler: async (ctx) => {
    const client = ctx.env.memoriesClient;
    if (client === undefined) throw new Error("memories client is not configured");

    const listFn = client.persistence.listMemoryNamespaces;
    if (listFn === undefined) {
      throw new Error("memories client does not support listing namespaces");
    }

    const namespaces = await listFn.call(client.persistence);
    return { namespaces: [...namespaces] };
  },
});
