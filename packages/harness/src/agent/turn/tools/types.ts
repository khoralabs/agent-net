import type { KhoraClient } from "@khoralabs/khora-client";
import type { MemorySearchEnv } from "@khoralabs/memories-agents/tools";
import type { EmbeddingModel } from "@khoralabs/memories-node/helpers";
import type { RemoteMemoriesClientAsync } from "@khoralabs/memories-service/client";
import type { NbcChainGraph } from "@khoralabs/obp-nbc";
import type { IntegrateMemoryWriteScope } from "../../memories/integrate/write-scope.ts";
import type { SkillRecord } from "../../memories/skills/_helpers/skills.ts";
import type { RecentNamespacesTracker } from "../../memories/tools/_helpers/recent-namespaces.ts";
import type { AgentChatClient } from "../../social/message/chat.ts";
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

/**
 * Host bag for co-located domain toolkits on the shared memory-search session env
 * (`MemorySearchEnv.memorySearchExtensions`).
 */
export type HarnessMemorySearchExtensions = {
  khoraClient?: KhoraClient;
  agentChat?: AgentChatClient;
  nbc?: NbcToolkitContext;
};

/** Optional `MemorySearchEnv` fields filled by `toMemorySearchEnv` when a DB is present. */
type MemorySearchEnvSlice = Omit<
  Partial<MemorySearchEnv>,
  "memoriesClient" | "namespace" | "embeddingModel" | "memorySearchExtensions"
>;

export type HarnessToolkitEnv = MemorySearchEnvSlice & {
  memoriesClient?: RemoteMemoriesClientAsync;
  khoraClient?: KhoraClient;
  agentChat?: AgentChatClient;
  agentDid?: string;
  sessionId?: string;
  networkDataDir?: string;
  embeddingModel?: EmbeddingModel;
  /**
   * Default namespace for {@link memorySearchToolkit}'s `memory_search` (env-scoped).
   * Harness write/search tools still take namespace as tool args.
   */
  namespace?: string;
  /** Forwarded into memory-search env for domain toolkit composition. */
  memorySearchExtensions?: HarnessMemorySearchExtensions & Record<string, unknown>;
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
