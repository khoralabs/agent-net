import { resolveHarnessDataDir, workflowDbPath } from "@khoralabs/agent-net";
import { getWorld } from "workflow/runtime";

const startedForDataDir = new Set<string>();

/** Configure Workflow SDK to use the Turso world for this process. */
export function configureTursoWorldEnv(opts?: { dataDir?: string }): string {
  const dataDir = resolveHarnessDataDir(opts?.dataDir);
  process.env.WORKFLOW_TARGET_WORLD ??= "@workflow-worlds/turso";
  process.env.WORKFLOW_TURSO_DATABASE_URL ??= `file:${workflowDbPath(dataDir)}`;
  process.env.WORKFLOW_SERVICE_URL ??= `http://localhost:${process.env.PORT ?? "3000"}`;
  return dataDir;
}

export async function startTursoWorldWorker(opts?: { dataDir?: string }): Promise<void> {
  const dataDir = configureTursoWorldEnv(opts);
  if (startedForDataDir.has(dataDir)) return;
  const world = getWorld();
  if (typeof world.start === "function") {
    await world.start();
  }
  startedForDataDir.add(dataDir);
}
