import { mkdirSync } from "node:fs";
import path from "node:path";

import { getWorld } from "workflow/runtime";

import { resolveHarnessDataDir } from "./paths.ts";

const startedForDataDir = new Set<string>();

/**
 * Configure Workflow SDK to use the zero-config local world.
 * @see https://workflow-sdk.dev/worlds/local
 */
export function configureLocalWorldEnv(opts?: { dataDir?: string }): string {
  const dataDir = path.resolve(resolveHarnessDataDir(opts?.dataDir));
  const workflowDataDir = path.join(dataDir, "workflow");
  mkdirSync(workflowDataDir, { recursive: true });
  process.env.WORKFLOW_TARGET_WORLD ??= "local";
  process.env.WORKFLOW_LOCAL_DATA_DIR ??= workflowDataDir;
  return dataDir;
}

/** Ensure the local world worker is started once per data dir. */
export async function startLocalWorldWorker(opts?: { dataDir?: string }): Promise<void> {
  const dataDir = configureLocalWorldEnv(opts);
  if (startedForDataDir.has(dataDir)) return;
  const world = getWorld();
  if (typeof world.start === "function") {
    await world.start();
  }
  startedForDataDir.add(dataDir);
}
