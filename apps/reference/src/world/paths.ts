import path from "node:path";

export function resolveHarnessDataDir(configured?: string): string {
  const fromEnv =
    configured?.trim() ||
    process.env.HARNESS_SWARM_DATA_DIR?.trim() ||
    process.env.HARNESS_AGENT_DATA_DIR?.trim();
  if (fromEnv !== undefined && fromEnv.length > 0) return fromEnv;
  return path.join(process.cwd(), ".harness-agent-data");
}

export function workflowDbPath(dataDir: string): string {
  return path.join(dataDir, "workflow.db");
}
