import type { ListNetworkEventsOptions, NetworkEvent } from "@khoralabs/agent-net";

export type NetworkEventStore = {
  append(event: NetworkEvent): Promise<NetworkEvent | null>;
  list(sessionId: string, opts?: ListNetworkEventsOptions): Promise<NetworkEvent[]>;
  close(): void;
};
