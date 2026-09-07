import type { NetworkHarnessHandle } from "../index.ts";

/** Process-local harness handed from CLI into setup (not serializable). */
const pending = new Map<string, NetworkHarnessHandle>();

export function provideEconomyHarnessForSession(
  sessionId: string,
  harness: NetworkHarnessHandle,
): void {
  pending.set(sessionId, harness);
}

export function takeEconomyHarnessForSession(sessionId: string): NetworkHarnessHandle {
  const harness = pending.get(sessionId);
  pending.delete(sessionId);
  if (harness === undefined) {
    throw new Error(
      `No harness provided for session ${sessionId}. Call provideEconomyHarnessForSession before starting the economy workflow.`,
    );
  }
  return harness;
}

export function clearPendingEconomyHarnessForTests(): void {
  pending.clear();
}
