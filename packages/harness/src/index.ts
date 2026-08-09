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
} from "./agent/agent-memory-source.ts";
export { HARNESS_AGENT_ID } from "./agent/agents/index.ts";
export {
  ensureThread,
  getAgentChatClient,
  getAgentChatClientForDid,
  getAgentChatService,
  getDevAgentDid,
  installAgentChat,
  resolveAgentChatSigner,
} from "./agent/chat-service.ts";
export {
  type PreparedHarnessStep,
  type PrepareHarnessStepInput,
  prepareHarnessStepRuntime,
} from "./agent/prepare-harness-step.ts";
export { runHarnessAgentStep } from "./agent/run-harness-agent-step.ts";
export {
  AGENT_STEP_NAMESPACE_CATALOG_CAP,
  formatAgentStepContext,
  resolveAgentStepContext,
} from "./agent/step-context.ts";
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
} from "./agent/step-context-sources.ts";
export {
  describeGenerationFailure,
  generateStructured,
  repairTruncatedJson,
} from "./agent/structured-output.ts";
export { HARNESS_TOOLKIT, type HarnessToolkitId } from "./agent/tools/ids.ts";
export { resolveAgentsDataDir } from "./agent/tools/khora/_helpers/khora-client-factory.ts";
export { resolveHarnessEmbeddingModel } from "./agent/tools/memories/_helpers/embedding-model.ts";
export {
  agentMemoriesDatabase,
  createDeferredHarnessMemoriesClient,
  createHarnessMemoriesClient,
} from "./agent/tools/memories/_helpers/memories-client.ts";
export { installMemoriesOntology } from "./agent/tools/memories/_helpers/memories-ontology-install.ts";
export {
  EMBEDDING_MODEL_REQUIRED_MESSAGE,
  MEMORY_SEARCH_SCOPE_EXACT,
  MEMORY_SEARCH_SCOPE_SUBTREE,
  type MemorySearchScopeMode,
  resolveMemoriesHeadRootHex,
  resolveMemoriesSearchAsOf,
  resolveMemoriesSearchAsOfTimestampMs,
  runStandardHybridMemorySearch,
  type StandardHybridMemorySearchInput,
} from "./agent/tools/memories/_helpers/memory-search.ts";
export { writeMemoryNode } from "./agent/tools/memories/_helpers/memory-write.ts";
export {
  createRemoteSourceMapContentStore,
  DEFAULT_MEMORY_SOURCE_KEY,
  MEMORY_TEXT_SOURCE_PREFIX,
  type SourceMapTextPreviewClient,
} from "./agent/tools/memories/_helpers/source-map-content-store.ts";
export type {
  AgentStepContext,
  AgentStepNamespaceEntry,
  AgentStepSourceContext,
  AgentWorkflowParams,
  AgentWorkflowResult,
  MemoriesDatabaseContext,
} from "./agent/types.ts";
export {
  AI_STEP_MAX_RETRIES,
  AI_STEP_TIMEOUT_MS,
  isAbortError,
  rethrowAsRetryableTimeout,
} from "./agent/workflow-resilience.ts";
export { agentResponse } from "./agent/workflows/agent-response.ts";
export {
  type AgentResponseDeps,
  runExecuteAgentResponse,
} from "./agent/workflows/agent-response-run.ts";
export {
  executeAgentResponse,
  runAgentResponseStep,
} from "./agent/workflows/agent-response-step.ts";
export type { AgentTurnParams, AgentTurnResult, AgentUIMessage } from "./agent-turn.ts";
export { runAgentTurn } from "./agent-turn.ts";
export {
  AgentHandle,
  type AgentMemoriesFraming,
  type AgentRecord,
  AgentStore,
  connectPoolInbox,
  HarnessPoolInbox,
  type InboxConnection,
  type InboxConnectionHandle,
  type PoolInboxEvent,
  type PoolInboxLifecycleHandler,
  type PoolInboxOptions,
} from "./agents/index.ts";
export {
  type AgentChatClient,
  type ChatServiceClient,
  type CreateAgentThreadInput,
  type CreateHarnessChatBackendOptions,
  type CreateRemoteHarnessChatOptions,
  createHarnessChatBackend,
  createRemoteHarnessChat,
  HARNESS_CHAT_CHANNEL_ID,
  type SignedChatBackend,
} from "./chat.ts";
export {
  type HarnessAgentWorkflowDeps,
  harnessAgentsDataDir,
  type NetworkHarnessHandle,
  startNetworkHarness,
} from "./harness.ts";
export {
  type IntegrateMemoryWriteScope,
  isIntegrateMemoryWriteScope,
  isUnderNamespace,
  parseIntegrateMemoryWriteScope,
  resolveWriteNamespaceChoice,
  type WriteScopeNeighborSearchOptions,
  writeScopeNamespaceCandidates,
  writeScopeNeedsNamespaceChoice,
  writeScopeNeighborSearchOptions,
} from "./integrate/write-scope.ts";
export {
  requireChatBaseUrl,
  requireChatToken,
  resolveChatBaseUrlFromEnv,
  resolveChatTokenFromEnv,
} from "./lib/chat-base-url.ts";
export {
  HARNESS_IDENTITY_WRAP_KEY_ENV,
  loadHarnessIdentity,
  parseIdentityWrapKey,
  requireIdentitySecret,
  resolveIdentitySecretFromEnv,
  saveHarnessIdentity,
  wrapKeySecretFromBytes,
} from "./lib/identity-wrap-key.ts";
export {
  mintKhoraInviteTokens,
  requireKhoraAdminToken,
  resolveKhoraAdminTokenFromEnv,
} from "./lib/khora-admin-invites.ts";
export { requireKhoraBaseUrl } from "./lib/khora-base-url.ts";
export {
  requireMemoriesAdminToken,
  requireMemoriesBaseUrl,
} from "./lib/memories-base-url.ts";
export { PerAgentInviteBank } from "./lib/per-agent-invite-bank.ts";
export { requireRelayBaseUrl } from "./lib/relay-base-url.ts";
export {
  emitNetworkEvent,
  installNetworkEventsPlugin,
  type ListNetworkEventsOptions,
  listNetworkEvents,
  type NetworkEventsPlugin,
  networkEventId,
} from "./network/index.ts";
export type {
  NetworkAttribution,
  NetworkEvent,
  ThreadHashSnapshot,
} from "./network/types.ts";
export { buildNetworkAttribution } from "./observability/attribution-digest.ts";
export type {
  CreateHarnessLoggerOptions,
  HarnessObservability,
} from "./observability/harness-observability.ts";
export {
  createHarnessAgentTelemetry,
  getHarnessMemoriesTelemetry,
  getHarnessObservability,
  installHarnessObservability,
  resetHarnessObservabilityForTests,
} from "./observability/harness-observability.ts";
export {
  bindNetworkSessionContext,
  clearNetworkSessionContext,
  getCurrentAttribution,
  getNetworkSessionContext,
} from "./observability/network-log.ts";
