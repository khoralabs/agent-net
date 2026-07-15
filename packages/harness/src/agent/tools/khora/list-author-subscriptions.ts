import { tool } from "@khoralabs/agent-capabilities";
import type { AuthorSubscriptionsSnapshot } from "@khoralabs/khora-client";
import { z } from "zod";

import type { HarnessToolkitEnv } from "../types.ts";
import { hasKhoraClient } from "./policies.ts";

export const listAuthorSubscriptionsTool = tool<
  "listAuthorSubscriptions",
  Record<string, never>,
  AuthorSubscriptionsSnapshot,
  HarnessToolkitEnv
>({
  name: "listAuthorSubscriptions",
  description: "List this agent's standing-search subscription posts.",
  instructions: ["Inspect existing subscriptions before creating new ones."],
  inputSchema: z.object({}),
  policies: [hasKhoraClient],
  handler: async (ctx) => {
    const client = ctx.env.khoraClient;
    if (client === undefined) throw new Error("khora client is not configured");

    return client.listAuthorSubscriptions();
  },
});
