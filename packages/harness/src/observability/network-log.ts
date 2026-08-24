import { AsyncLocalStorage } from "node:async_hooks";

import type { NetworkAttribution } from "../network/types.ts";

export type NetworkSessionContext = {
  sessionId: string;
};

const attributionStorage = new AsyncLocalStorage<NetworkAttribution | undefined>();

let sessionContext: NetworkSessionContext | undefined;

/** Bind process-local session id for emitters / logger mixins (no persistence). */
export function bindNetworkSessionContext(ctx: NetworkSessionContext): void {
  sessionContext = ctx;
}

export function getNetworkSessionContext(): NetworkSessionContext | undefined {
  return sessionContext;
}

export function clearNetworkSessionContext(): void {
  sessionContext = undefined;
}

export function getCurrentAttribution(): NetworkAttribution | undefined {
  return attributionStorage.getStore();
}

export function runWithAttribution<T>(attribution: NetworkAttribution | undefined, fn: () => T): T {
  return attributionStorage.run(attribution, fn);
}

export async function runWithAttributionAsync<T>(
  attribution: NetworkAttribution | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  return attributionStorage.run(attribution, fn);
}

export function resetNetworkLogForTests(): void {
  clearNetworkSessionContext();
}
