import { policy } from "@khoralabs/agent-capabilities";

import type { HarnessToolkitEnv } from "../../../../runtime/tools/types.ts";

export const hasAgentChat = policy<HarnessToolkitEnv>("has-agent-chat", async (env) =>
  Promise.resolve(env.agentChat !== undefined),
);
