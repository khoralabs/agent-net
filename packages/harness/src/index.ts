export type { AgentActor } from "./agent/actor.ts";
export type { BindAgentServicesOptions } from "./agent/handle.ts";
export {
  AgentHandle,
  type AgentHandleOptions,
} from "./agent/handle.ts";
export { AgentSocial, type SocialInvitation } from "./agent/social/social.ts";
export { resolveAgentsDataDir } from "./agent/social/tools/_helpers/khora-client-factory.ts";
export {
  AGENT_MEMORY_DOMAIN,
  type AgentMemoryEntity,
  type AgentMemoryEntityMap,
  type AgentMemoryLocators,
  type AgentMemorySourceRef,
  type AgentMemoryStore,
  agentMemoryChatSource,
  agentMemorySourceRef,
  createAgentMemoryStore,
  isAgentMemorySourceRef,
  sourcesFromMemoryToolParts,
} from "./agent/turn/agent-memory-source.ts";
export {
  configureHarnessAgentRegistry,
  configureHarnessCapabilityTurnHook,
  getAgentRegistry,
  getCapabilityRegistry,
  type OnCapabilityTurn,
  resetHarnessAgentRegistryForTests,
} from "./agent/turn/agent-runtime.ts";
export type { AgentTurnParams, AgentTurnResult, AgentUIMessage } from "./agent/turn/agent-turn.ts";
export { HARNESS_AGENT_ID } from "./agent/turn/capability-agents/index.ts";
export { NETWORK_NEGOTIATION_AGENT_ID } from "./agent/turn/capability-agents/network-negotiation-agent.ts";
export {
  formatAgentStepContext,
  resolveAgentStepContext,
} from "./agent/turn/step-context.ts";
export {
  AGENT_DATABASE_DOMAIN,
  type AgentDatabaseEntity,
  type AgentDatabaseEntityMap,
  type AgentDatabaseSourceRef,
  type AgentDatabaseStore,
  agentDatabaseSourceRef,
  isAgentDatabaseSourceRef,
  isNamespaceCatalogSourceRef,
  type MemoriesContextRefs,
  mergeAgentStepContextFacets,
  NAMESPACE_CATALOG_DOMAIN,
  type NamespaceCatalogEntity,
  type NamespaceCatalogEntityMap,
  type NamespaceCatalogSourceRef,
  type NamespaceCatalogStore,
  namespaceCatalogSourceRef,
  resolveMemoriesStepContextFacets,
} from "./agent/turn/step-context-sources.ts";
export { HARNESS_TOOLKIT, type HarnessToolkitId } from "./agent/turn/tools/ids.ts";
export type { HarnessMemorySearchExtensions, NbcToolkitContext } from "./agent/turn/tools/types.ts";
export type {
  AgentStepContext,
  AgentStepNamespaceEntry,
  AgentStepSourceContext,
  AgentWorkflowParams,
  AgentWorkflowResult,
  HarnessAgentExecutor,
  MemoriesDatabaseContext,
  MemorySearchAgentExecutor,
  MemorySearchAgentMessage,
  MemorySearchAgentRunResult,
  MemorySearchSessionContextSlice,
} from "./agent/turn/types.ts";
export {
  AI_STEP_MAX_RETRIES,
  AI_STEP_TIMEOUT_MS,
  isAbortError,
} from "./agent/turn/workflow-resilience.ts";
export {
  requireChatBaseUrl,
  requireChatToken,
  resolveChatBaseUrlFromEnv,
  resolveChatTokenFromEnv,
} from "./lib/chat-base-url.ts";
export {
  inboxEventPostId,
  inboxEventPostIds,
  inboxHasPost,
  inboxPostAuthorDid,
} from "./lib/inbox.ts";
export { requireKhoraBaseUrl, resolveKhoraBaseUrlFromEnv } from "./lib/khora-base-url.ts";
export {
  requireMemoriesAdminToken,
  requireMemoriesBaseUrl,
} from "./lib/memories-base-url.ts";
export { requireRelayBaseUrl } from "./lib/relay-base-url.ts";
export {
  type HarnessAgentWorkflowDeps,
  harnessAgentsDataDir,
  type NetworkHarnessHandle,
  startNetworkHarness,
} from "./pool/host/harness.ts";
export {
  type AgentMemoriesFraming,
  type AgentRecord,
  AgentStore,
  HARNESS_IDENTITY_WRAP_KEY_ENV,
  HarnessPoolInbox,
  type InboxConnection,
  type InboxConnectionHandle,
  loadHarnessIdentity,
  ManagedAgentPool,
  type PoolAgentRegistry,
  type PoolInboxEvent,
  type PoolInboxLifecycleHandler,
  type PoolInboxOptions,
  parseIdentityWrapKey,
  requireIdentitySecret,
  resolveIdentitySecretFromEnv,
  saveHarnessIdentity,
  wrapKeySecretFromBytes,
} from "./pool/index.ts";
export {
  mintKhoraInviteTokens,
  requireKhoraAdminToken,
  resolveKhoraAdminTokenFromEnv,
} from "./pool/khora-admin-invites.ts";
export {
  emitNetworkEvent,
  installNetworkEventsPlugin,
  type ListNetworkEventsOptions,
  listNetworkEvents,
  type NetworkEventsPlugin,
  networkEventId,
} from "./pool/network/index.ts";
export type {
  NetworkAttribution,
  NetworkEvent,
  ThreadHashSnapshot,
} from "./pool/network/types.ts";
export { buildNetworkAttribution } from "./pool/observability/attribution-digest.ts";
export type {
  CreateHarnessLoggerOptions,
  HarnessObservability,
} from "./pool/observability/harness-observability.ts";
export {
  createHarnessAgentTelemetry,
  getHarnessMemoriesTelemetry,
  getHarnessObservability,
  installHarnessObservability,
  resetHarnessObservabilityForTests,
} from "./pool/observability/harness-observability.ts";
export {
  bindNetworkSessionContext,
  clearNetworkSessionContext,
  getCurrentAttribution,
  getNetworkSessionContext,
} from "./pool/observability/network-log.ts";
export { PerAgentInviteBank } from "./pool/per-agent-invite-bank.ts";
