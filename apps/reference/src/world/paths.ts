import path from "node:path";

/** Default on-disk root for reference app data (orchestrator, marketplace, swarm, events). */
export const REFERENCE_DEFAULT_DATA_DIR = ".data";

export function resolveHarnessDataDir(configured?: string): string {
  const fromEnv =
    configured?.trim() ||
    process.env.HARNESS_SWARM_DATA_DIR?.trim() ||
    process.env.HARNESS_AGENT_DATA_DIR?.trim();
  if (fromEnv !== undefined && fromEnv.length > 0) return path.resolve(fromEnv);
  return path.join(process.cwd(), REFERENCE_DEFAULT_DATA_DIR);
}

export function workflowDbPath(dataDir: string): string {
  return path.join(dataDir, "workflow.db");
}
