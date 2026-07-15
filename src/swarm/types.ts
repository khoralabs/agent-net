import type { PostUsage } from "@khoralabs/chat-core";

import type { AgentWorkflowResult } from "../agent/types.ts";

export type { NetworkAttribution, NetworkEvent, ThreadHashSnapshot } from "../network/types.ts";

export type SwarmConfig = {
  sessionId: string;
  dataDir: string;
  /** Remote Khora host; falls back to KHORA_BASE_URL / HARNESS_KHORA_BASE_URL / KHORA_SERVER_URL. */
  khoraBaseUrl?: string;
  /** Remote relay host; falls back to RELAY_BASE_URL / HARNESS_RELAY_BASE_URL / RELAY_SERVER_URL. */
  relayBaseUrl?: string;
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
  capabilities: AgentWorkflowResult["capabilities"];
  memoriesProvenanceRootHex: string;
  threadHashes: import("../network/types.ts").ThreadHashSnapshot[];
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
