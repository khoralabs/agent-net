export type ThreadHashSnapshot = {
  threadId: string;
  headLineageHash: string;
  lastPostContentHash?: string;
};

/** Process or category that emitted the event (registry id, or harness/agent/inbox/swarm). */
export type NetworkEventSource = string;

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
