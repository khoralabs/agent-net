import { policy } from "@khoralabs/agent-capabilities";
import type { RemoteMemoriesClientAsync } from "@khoralabs/memories-service/client";

import type { HarnessToolkitEnv } from "../../../runtime/tools/types.ts";
import { SKILLS_NAMESPACE } from "./_helpers/skills.ts";

/**
 * True when the agent's memories DB has an unsuppressed `_skills_` namespace
 * (`namespaceExistsUnderPrefix` defaults to discovery-visible paths only).
 */
export async function skillsNamespaceExists(client: RemoteMemoriesClientAsync): Promise<boolean> {
  const existsFn = client.persistence.namespaceExistsUnderPrefix;
  if (existsFn === undefined) return false;
  return existsFn.call(client.persistence, SKILLS_NAMESPACE);
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
