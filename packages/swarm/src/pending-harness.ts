import type { NetworkHarnessHandle } from "@khoralabs/agent-net";

/** Process-local harness handed from CLI into setupSwarmStep (not serializable). */
const pending = new Map<string, NetworkHarnessHandle>();

export function provideHarnessForSession(sessionId: string, harness: NetworkHarnessHandle): void {
  pending.set(sessionId, harness);
}

export function takeHarnessForSession(sessionId: string): NetworkHarnessHandle {
  const harness = pending.get(sessionId);
  pending.delete(sessionId);
  if (harness === undefined) {
    throw new Error(
      `No harness provided for session ${sessionId}. Call provideHarnessForSession before starting the swarm workflow.`,
    );
  }
  return harness;
}

export function clearPendingHarnessForTests(): void {
  pending.clear();
}
