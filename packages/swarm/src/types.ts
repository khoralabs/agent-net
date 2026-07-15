import type {
  AgentTurnResult,
  NetworkAttribution,
  NetworkEvent,
  ThreadHashSnapshot,
} from "@khoralabs/agent-net";
import type { PostUsage } from "@khoralabs/chat-core";

export type { NetworkAttribution, NetworkEvent, ThreadHashSnapshot };

export type SwarmConfig = {
  sessionId: string;
  dataDir: string;
  goal: string;
  agentCount: number;
  maxTokenBudget: number;
  contextMessageLimit: number;
  model: { id: string; maxSteps?: number };
  roles: string[];
};

export type AgentLoopState = {
  did: string;
  agentId: string;
  role: string;
  selfThreadId: string;
  registeredStaticHash: string;
  turnCount: number;
};

export type TurnTelemetry = {
  sessionId: string;
  agentTurnIndex: number;
  agentDid: string;
  agentRole: string;
  runId: string;
  usage?: PostUsage;
  capabilities: AgentTurnResult["capabilities"];
  memoriesProvenanceRootHex: string;
  threadHashes: ThreadHashSnapshot[];
  inboxEntryIds: string[];
};

export type SwarmState = {
  id: string;
  sessionId: string;
  config: SwarmConfig;
  tokensUsed: number;
  agents: AgentLoopState[];
};

export type AgentLoopResult = {
  did: string;
  turns: number;
};

export type SwarmResult = {
  sessionId: string;
  tokensUsed: number;
  maxTokenBudget: number;
  agentResults: AgentLoopResult[];
};
