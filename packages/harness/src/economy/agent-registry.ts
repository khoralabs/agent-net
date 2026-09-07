import type { NetworkHarnessHandle } from "../index.ts";

import { loadEconomyStateBySessionId } from "./economy-state.ts";

export async function ensureEconomyAgentRegistered(
  harness: NetworkHarnessHandle,
  dataDir: string,
  sessionId: string,
  agentDid: string,
): Promise<void> {
  const state = await loadEconomyStateBySessionId(dataDir, sessionId);
  if (state === null) {
    throw new Error(`economy session ${sessionId} not found in workflow db`);
  }

  const actor = state.actors.find((entry) => entry.did === agentDid);
  if (actor === undefined) {
    throw new Error(`agent ${agentDid} not registered in economy session ${sessionId}`);
  }

  await harness.ensureAgentRegistered({
    agentDid,
    name: `Economy actor ${actor.label}`,
    instructions: [`Economy actor ${actor.label}`],
    context: { sessionId, did: agentDid, label: actor.label },
  });
}
