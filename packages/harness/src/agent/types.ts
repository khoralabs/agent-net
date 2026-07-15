import type { ThreadHashSnapshot } from "../network/types.ts";

export type AgentUIMessage = {
  id: string;
  role: string;
  parts: Array<{ type: string } & Record<string, unknown>>;
  metadata?: unknown;
};

export type AgentWorkflowParams = {
  runId: string;
  agent: {
    id: string;
    name: string;
    actingFor: { type: string; id: string };
  };
  model: {
    id: string;
    fallbackIds?: string[];
    maxSteps?: number;
  };
  context: {
    sessionId?: string;
    threadId: string;
    messages: AgentUIMessage[];
    instructions?: string[];
  };
  output: {
    chat: {
      threadId: string;
      postId?: string;
      streamDeltas: boolean;
    };
  };
};

export type AgentWorkflowResult = {
  runId: string;
  chat: {
    threadId: string;
    postId: string;
    status: "complete" | "aborted";
  };
  message?: AgentUIMessage;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    reasoningTokens?: number;
    cachedInputTokens?: number;
  };
  memoriesProvenanceRootHex?: string;
  threadHashes?: ThreadHashSnapshot[];
  capabilities: {
    staticHash: string;
    runtimeHash: string;
    invocationHash?: string;
    toolRefs: Array<{ toolKey: string; toolHash: string }>;
    envelopeId?: string;
  };
};
