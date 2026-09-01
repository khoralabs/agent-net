import type { ListNetworkEventsOptions } from "../../events-plugin.ts";
import type { NetworkEvent } from "../../types.ts";

export type NetworkEventStore = {
  append(event: NetworkEvent): Promise<NetworkEvent | null>;
  list(sessionId: string, opts?: ListNetworkEventsOptions): Promise<NetworkEvent[]>;
  close(): void;
};
