import type { KhoraClient } from "@khoralabs/khora-client";
import type { EmbeddingModel } from "@khoralabs/memories-core/helpers";
import type { RemoteMemoriesClientAsync } from "@khoralabs/memories-service-client";

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
  skills: SkillRecord[];
  activatedSkillNames: Set<string>;
  recentNamespaces: RecentNamespacesTracker;
};
