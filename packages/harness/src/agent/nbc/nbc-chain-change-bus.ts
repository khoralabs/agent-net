/**
 * In-process NBC chain-change bus (`opened` | `turn` | `snapshot`).
 *
 * **Temporary** — the `opened` and `snapshot` causes exist because replica
 * wakes are poll-driven and channel-open is decoupled from genesis. Replace
 * with a single upstream `committed` (or equivalent) event when Vellum/OBP
 * unify channel bind, chain init, and turn commit notifications.
 */
export type NbcChainChanged = {
  chainId: string;
  /** Protocol sequence / turnsCompleted after the change, for dedupe. */
  turnSeq: number;
  cause: "opened" | "turn" | "snapshot";
};

export type NbcChainChangeBus = {
  publish(event: NbcChainChanged): void;
  subscribe(listener: (event: NbcChainChanged) => void): () => void;
};

/** In-process chain-change bus. Not SSE — control plane only. */
export function createNbcChainChangeBus(): NbcChainChangeBus {
  const listeners = new Set<(event: NbcChainChanged) => void>();
  return {
    publish(event) {
      for (const listener of listeners) {
        try {
          listener(event);
        } catch {
          /* ignore */
        }
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
