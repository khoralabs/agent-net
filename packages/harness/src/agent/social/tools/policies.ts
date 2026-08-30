import { policy } from "@khoralabs/agent-capabilities";

import type { HarnessToolkitEnv } from "../../turn/tools/types.ts";

export const hasKhoraClient = policy<HarnessToolkitEnv>("has-khora-client", async (env) =>
  Promise.resolve(env.khoraClient !== undefined),
);
