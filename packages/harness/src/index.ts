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
export {
  captureHarnessCapabilities,
  configureHarnessAgentRegistry,
  configureHarnessCapabilityTurnHook,
  getAgentRegistry,
  type OnCapabilityTurn,
  resetHarnessAgentRegistryForTests,
} from "./agent/agent-runtime.ts";
export { HARNESS_AGENT_ID } from "./agent/agents/index.ts";
export { NETWORK_NEGOTIATION_AGENT_ID } from "./agent/agents/network-negotiation-agent.ts";
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
  type NegotiationTurnWire,
  negotiationOutputToWire,
} from "./agent/nbc/action.ts";
export type {
  NbcLoopChain,
  NbcLoopHost,
  NbcLoopStartTurnInput,
  NbcLoopStatusPatch,
} from "./agent/nbc/loop-host.ts";
export {
  createNbcChainChangeBus,
  type NbcChainChangeBus,
  type NbcChainChanged,
} from "./agent/nbc/nbc-chain-change-bus.ts";
export {
  type NbcInternalNegotiationChain,
  type NbcInternalNegotiationHost,
  type RegisterNbcInternalNegotiationRoutesInput,
  registerNbcInternalNegotiationRoutes,
} from "./agent/nbc/nbc-internal-routes.ts";
export { type NbcLoopHandle, startNbcLoop } from "./agent/nbc/nbc-loop.ts";
export {
  createNbcMeshClient,
  type NbcMeshClient,
  type NbcNegotiationStateResponse,
} from "./agent/nbc/nbc-mesh-client.ts";
export { startNbcReplicaWatch } from "./agent/nbc/nbc-replica-watch.ts";
export { nbcTurnContext } from "./agent/nbc/nbc-turn-context.ts";
export {
  createNbcWakeDispatcher,
  resetNbcWakeDispatcherForTests,
} from "./agent/nbc/nbc-wake-dispatcher.ts";
export {
  buildNegotiationInstructions,
  buildNegotiationUserMessage,
  type NegotiationBrief,
  summarizeNbcGraph,
} from "./agent/nbc/prompt.ts";
export { type RunNbcModelTurnInput, runNbcModelTurn } from "./agent/nbc/run-nbc-model-turn.ts";
export {
  type NegotiationPortDefinition,
  type NegotiationTurnEnvelope,
  type NegotiationTurnEnvelopeContext,
  negotiationTurnEnvelopeSchema,
  parseNegotiationTurnEnvelope,
} from "./agent/nbc/turn-output-schema.ts";
export {
  type AvailablePeerPort,
  availablePeerPorts,
  clampMaxTurns,
  NBC_DEFAULT_MAX_TURNS,
  NBC_MAX_TURNS_CAP,
  type NegotiationChainView,
  type WhoShouldActResult,
  whoShouldAct,
} from "./agent/nbc/who-should-act.ts";
export {
  type PreparedHarnessStep,
  type PrepareHarnessStepInput,
  prepareHarnessStepRuntime,
} from "./agent/prepare-harness-step.ts";
export { runHarnessAgentStep } from "./agent/run-harness-agent-step.ts";
export {
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
  harnessMemoriesFetch,
  installHarnessMemoriesFetch,
  type MemoriesServiceFetch,
} from "./agent/tools/memories/_helpers/memories-client.ts";
export {
  getInstalledMemoriesOntology,
  installMemoriesOntology,
} from "./agent/tools/memories/_helpers/memories-ontology-install.ts";
export {
  EMBEDDING_MODEL_REQUIRED_MESSAGE,
  type EnrichedNamespaceSearchHit,
  type EnrichedNamespaceSearchResult,
  MEMORY_SEARCH_SCOPE_EXACT,
  MEMORY_SEARCH_SCOPE_SUBTREE,
  type MemorySearchScopeMode,
  type NamespaceSearchArms,
  resolveMemoriesHeadRootHex,
  resolveMemoriesSearchAsOf,
  resolveMemoriesSearchAsOfTimestampMs,
  runStandardHybridMemorySearch,
  runStandardNamespaceSearch,
  type StandardHybridMemorySearchInput,
  type StandardNamespaceSearchInput,
} from "./agent/tools/memories/_helpers/memory-search.ts";
export { writeMemoryNode } from "./agent/tools/memories/_helpers/memory-write.ts";
export {
  createRemoteSourceMapContentStore,
  DEFAULT_MEMORY_SOURCE_KEY,
  MEMORY_TEXT_SOURCE_PREFIX,
  type SourceMapTextPreviewClient,
} from "./agent/tools/memories/_helpers/source-map-content-store.ts";
export type { NbcToolkitContext } from "./agent/tools/types.ts";
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
  type AgentHandleOptions,
  type AgentMemoriesFraming,
  type AgentRecord,
  type AgentRegistry,
  AgentStore,
  connectPoolInbox,
  HarnessPoolInbox,
  type InboxConnection,
  type InboxConnectionHandle,
  type PoolInboxEvent,
  type PoolInboxLifecycleHandler,
  type PoolInboxOptions,
  type VellumHandle,
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
export {
  type LoadNbcChainGraphInput,
  loadNbcChainGraph,
  type NbcChainGraph,
} from "./lib/nbc-chain-graph.ts";
export { PerAgentInviteBank } from "./lib/per-agent-invite-bank.ts";
export { requireRelayBaseUrl } from "./lib/relay-base-url.ts";
export {
  createHarnessVellumPool,
  disconnectVellum,
  type HarnessVellumPoolOptions,
  openVellumChain,
  type VellumPairOptions,
  wrapPoolClient,
} from "./lib/vellum.ts";
export { vellumPoolAttachmentDataDir } from "./lib/vellum-pool-paths.ts";
export {
  type CommitTurnResult,
  type CreateVellumChainSessionRegistryOptions,
  createVellumChainSessionRegistry,
  NBC_GENESIS_NOT_INITIATOR,
  type VellumChainLiveSession,
  type VellumChainSessionRegistry,
} from "./lib/vellum-sessions.ts";
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
