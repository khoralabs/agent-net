import { resolveHarnessDataDir } from "../workflow/paths.ts";

export function resolveAgentDataDir(): string {
  return resolveHarnessDataDir(process.env.HARNESS_AGENT_DATA_DIR);
}
