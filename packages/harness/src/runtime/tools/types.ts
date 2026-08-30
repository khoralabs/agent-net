import type { KhoraClient } from "@khoralabs/khora-client";
import type { EmbeddingModel } from "@khoralabs/memories-node/helpers";
import type { RemoteMemoriesClientAsync } from "@khoralabs/memories-service/client";
import type { NbcChainGraph } from "@khoralabs/obp-nbc";
import type { IntegrateMemoryWriteScope } from "../../agent/memories/integrate/write-scope.ts";
import type { SkillRecord } from "../../agent/memories/skills/_helpers/skills.ts";
import type { RecentNamespacesTracker } from "../../agent/memories/tools/_helpers/recent-namespaces.ts";
import type { AgentChatClient } from "../../agent/social/message/chat.ts";
import type { MemoriesDatabaseContext } from "../types.ts";

export type NbcToolkitContext = {
  chainId: string;
  asDid: string;
  peerDid: string;
  initiatorDid: string;
  graph: NbcChainGraph;
  remainingTurns: number;
  submitTurn: (body: Record<string, unknown>) => Promise<void>;
  leave: (reason?: string) => Promise<void>;
};

export type HarnessToolkitEnv = {
  memoriesClient?: RemoteMemoriesClientAsync;
  khoraClient?: KhoraClient;
  agentChat?: AgentChatClient;
  agentDid?: string;
  sessionId?: string;
  networkDataDir?: string;
  embeddingModel?: EmbeddingModel;
  embeddingCache?: Map<string, number[]>;
  memoriesSnapshotRootHex?: string;
  /**
   * When set, memory/skill writes fire-and-forget a `kind: "memory"` integrate
   * job after embed+merge.
   */
  integrateMemories?: {
    baseUrl: string;
    token: string;
    /** Defaults to `under` when enqueueing. */
    writeScope?: IntegrateMemoryWriteScope;
  };
  /** Host framing for this agent's memories database (memories toolkit instructions). */
  memoriesContext?: MemoriesDatabaseContext;
  skills: SkillRecord[];
  activatedSkillNames: Set<string>;
  recentNamespaces: RecentNamespacesTracker;
  /** Toolkit names excluded for this invocation (policy-gated). */
  disabledToolkits: ReadonlySet<string>;
  /** Individual tool names excluded for this invocation (policy-gated). */
  disabledTools: ReadonlySet<string>;
  /** NBC negotiation replica + submit hooks (negotiation agent only). */
  nbc?: NbcToolkitContext;
};

export function emptyDisabledToolSets(): {
  disabledToolkits: ReadonlySet<string>;
  disabledTools: ReadonlySet<string>;
} {
  return {
    disabledToolkits: new Set(),
    disabledTools: new Set(),
  };
}
