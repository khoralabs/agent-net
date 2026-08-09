import { policy } from "@khoralabs/agent-capabilities";
import type { RemoteMemoriesClientAsync } from "@khoralabs/memories-service/client";

import type { HarnessToolkitEnv } from "../types.ts";
import { SKILLS_NAMESPACE } from "./_helpers/skills.ts";

// TODO: Add a query in memories to check if a namespace exists by prefix
// TODO: Add a query in memories to get a namespace by prefix
// TODO: Use namespace exists prefix instead of listing namespaces and checking for inclusion

/**
 * True when the agent's memories DB has an unsuppressed `_skills_` namespace
 * (catalog metadata preferred; path-only listing cannot detect suppression).
 */
export async function skillsNamespaceExists(client: RemoteMemoriesClientAsync): Promise<boolean> {
  const withMeta = client.persistence.listNamespacesWithMetadata;
  if (withMeta !== undefined) {
    const rows = await withMeta.call(client.persistence);
    const row = rows.find((entry) => entry.namespace === SKILLS_NAMESPACE);
    return row !== undefined && row.suppressed !== true;
  }
  const listFn = client.persistence.listMemoryNamespaces;
  if (listFn === undefined) return false;
  const paths = await listFn.call(client.persistence);
  return paths.includes(SKILLS_NAMESPACE);
}

/**
 * Toolkit gate: skills tools are only visible when `_skills_` exists and is not
 * suppressed (typically via the "Agent With Skills" namespace template / preseed).
 */
export const hasSkillsNamespace = policy<HarnessToolkitEnv>("has-skills-namespace", async (env) => {
  const client = env.memoriesClient;
  if (client === undefined) return false;
  return skillsNamespaceExists(client);
});
