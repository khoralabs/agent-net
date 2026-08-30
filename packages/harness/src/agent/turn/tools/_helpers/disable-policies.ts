import { policy } from "@khoralabs/agent-capabilities";

import type { HarnessToolkitEnv } from "../types.ts";

/** Toolkit-level gate: fail when `toolkitName` is in `env.disabledToolkits`. */
export function toolkitEnabled(toolkitName: string) {
  return policy<HarnessToolkitEnv>(`toolkit-enabled:${toolkitName}`, async (env) =>
    Promise.resolve(!env.disabledToolkits.has(toolkitName)),
  );
}

/** Tool-level gate: fail when `toolName` is in `env.disabledTools`. */
export function toolEnabled(toolName: string) {
  return policy<HarnessToolkitEnv>(`tool-enabled:${toolName}`, async (env) =>
    Promise.resolve(!env.disabledTools.has(toolName)),
  );
}
