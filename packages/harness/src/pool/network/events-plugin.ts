import type { NetworkEvent } from "./types.ts";

export type ListNetworkEventsOptions = {
  kind?: string;
  source?: string;
  agentDid?: string;
  sinceSeq?: number;
  /** Exclusive upper bound on seq (for paging older history). */
  beforeSeq?: number;
  limit?: number;
  order?: "asc" | "desc";
};

/** Host-owned network event sink (persist, fan-out, etc.). */
export type NetworkEventsPlugin = {
  onNetworkEvent(event: NetworkEvent): Promise<NetworkEvent | null>;
  listEvents(sessionId: string, opts?: ListNetworkEventsOptions): Promise<NetworkEvent[]>;
  close?(): void;
};

let installed: NetworkEventsPlugin | undefined;

export function installNetworkEventsPlugin(plugin: NetworkEventsPlugin | undefined): void {
  installed = plugin;
}

export function getInstalledNetworkEventsPlugin(): NetworkEventsPlugin | undefined {
  return installed;
}

/** Emit via the installed plugin. No-op (`null`) when none is installed. */
export async function emitNetworkEvent(event: NetworkEvent): Promise<NetworkEvent | null> {
  if (installed === undefined) return null;
  return installed.onNetworkEvent(event);
}

/** List via the installed plugin. Throws when none is installed. */
export async function listNetworkEvents(
  sessionId: string,
  opts: ListNetworkEventsOptions = {},
): Promise<NetworkEvent[]> {
  if (installed === undefined) {
    throw new Error(
      "network events plugin is not configured; call installNetworkEventsPlugin first",
    );
  }
  return installed.listEvents(sessionId, opts);
}
