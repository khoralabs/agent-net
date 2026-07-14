import { policy } from "@khoralabs/agent-capabilities";

import type { HarnessToolkitEnv } from "./types.ts";

export const hasMemoriesClient = policy<HarnessToolkitEnv>("has-memories-client", async (env) =>
  Promise.resolve(env.memoriesClient !== undefined),
);
