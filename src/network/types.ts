export type ThreadHashSnapshot = {
  threadId: string;
  headLineageHash: string;
  lastPostContentHash?: string;
};

export type NetworkEventSource = "harness" | "swarm" | "agent" | "inbox" | "chat" | "workflow";

export type NetworkAttribution = {
  staticHash: string;
  runtimeHash: string;
  invocationHash?: string;
  toolRefs: Array<{ toolKey: string; toolHash: string }>;
  memoriesProvenanceRootHex: string;
  threadHashes: ThreadHashSnapshot[];
  attributionDigestHex: string;
};

export type NetworkEvent = {
  eventId: string;
  sessionId: string;
  seq?: number;
  tsMs: number;
  source: NetworkEventSource;
  kind: string;
  level?: "debug" | "info" | "warn" | "error";
  message?: string;
  agentDid?: string;
  agentRole?: string;
  runId?: string;
  payload?: Record<string, unknown>;
  attribution?: NetworkAttribution;
};
