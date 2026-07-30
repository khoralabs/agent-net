import type { KhoraClient } from "@khoralabs/khora-client";
import type { EmbeddingModel } from "@khoralabs/memories-node/helpers";
import type { RemoteMemoriesClientAsync } from "@khoralabs/memories-service/client";

import type { AgentChatClient } from "../../chat.ts";
import type { RecentNamespacesTracker } from "./memories/_helpers/recent-namespaces.ts";
import type { SkillRecord } from "./skills/_helpers/skills.ts";

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
    writeScope?: "exact" | "under";
  };
  skills: SkillRecord[];
  activatedSkillNames: Set<string>;
  recentNamespaces: RecentNamespacesTracker;
  /** Toolkit names excluded for this invocation (policy-gated). */
  disabledToolkits: ReadonlySet<string>;
  /** Individual tool names excluded for this invocation (policy-gated). */
  disabledTools: ReadonlySet<string>;
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
