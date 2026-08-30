export type { BindAgentServicesOptions } from "./handle/handle.ts";
export { createBoundAgentMemoriesClient } from "./handle/memories-types.ts";
export {
  type HarnessAgentWorkflowDeps,
  harnessAgentsDataDir,
  type NetworkHarnessHandle,
  startNetworkHarness,
} from "./host/harness.ts";
export {
  requireChatBaseUrl,
  requireChatToken,
  resolveChatBaseUrlFromEnv,
  resolveChatTokenFromEnv,
} from "./lib/chat-base-url.ts";
export { requireKhoraBaseUrl } from "./lib/khora-base-url.ts";
export {
  requireMemoriesAdminToken,
  requireMemoriesBaseUrl,
} from "./lib/memories-base-url.ts";
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
export {
  HARNESS_IDENTITY_WRAP_KEY_ENV,
  loadHarnessIdentity,
  parseIdentityWrapKey,
  requireIdentitySecret,
  resolveIdentitySecretFromEnv,
  saveHarnessIdentity,
  wrapKeySecretFromBytes,
} from "./pool/identity-wrap-key.ts";
export {
  AgentHandle,
  type AgentHandleOptions,
  type AgentMemoriesClient,
  type AgentMemoriesFraming,
  type AgentRecord,
  AgentStore,
  HarnessPoolInbox,
  type InboxConnection,
  type InboxConnectionHandle,
  ManagedAgentPool,
  type PoolAgentRegistry,
  type PoolInboxEvent,
  type PoolInboxLifecycleHandler,
  type PoolInboxOptions,
} from "./pool/index.ts";
export {
  mintKhoraInviteTokens,
  requireKhoraAdminToken,
  resolveKhoraAdminTokenFromEnv,
} from "./pool/khora-admin-invites.ts";
export { PerAgentInviteBank } from "./pool/per-agent-invite-bank.ts";
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
} from "./runtime/agent-memory-source.ts";
export {
  captureHarnessCapabilities,
  configureHarnessAgentRegistry,
  configureHarnessCapabilityTurnHook,
  getAgentRegistry,
  getCapabilityRegistry,
  type OnCapabilityTurn,
  resetHarnessAgentRegistryForTests,
} from "./runtime/agent-runtime.ts";
export type { AgentTurnParams, AgentTurnResult, AgentUIMessage } from "./runtime/agent-turn.ts";
export { runAgentTurn } from "./runtime/agent-turn.ts";
export { HARNESS_AGENT_ID } from "./runtime/capability-agents/index.ts";
export { NETWORK_NEGOTIATION_AGENT_ID } from "./runtime/capability-agents/network-negotiation-agent.ts";
export {
  type PreparedHarnessStep,
  type PrepareHarnessStepInput,
  prepareHarnessStepRuntime,
} from "./runtime/prepare-harness-step.ts";
export { runHarnessAgentStep } from "./runtime/run-harness-agent-step.ts";
export {
  formatAgentStepContext,
  resolveAgentStepContext,
} from "./runtime/step-context.ts";
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
} from "./runtime/step-context-sources.ts";
export {
  describeGenerationFailure,
  generateStructured,
  repairTruncatedJson,
} from "./runtime/structured-output.ts";
export { HARNESS_TOOLKIT, type HarnessToolkitId } from "./runtime/tools/ids.ts";
export type { NbcToolkitContext } from "./runtime/tools/types.ts";
export type {
  AgentStepContext,
  AgentStepNamespaceEntry,
  AgentStepSourceContext,
  AgentWorkflowParams,
  AgentWorkflowResult,
  MemoriesDatabaseContext,
} from "./runtime/types.ts";
export {
  AI_STEP_MAX_RETRIES,
  AI_STEP_TIMEOUT_MS,
  isAbortError,
  rethrowAsRetryableTimeout,
} from "./runtime/workflow-resilience.ts";
export { agentResponse } from "./runtime/workflows/agent-response.ts";
export {
  type AgentResponseDeps,
  runExecuteAgentResponse,
} from "./runtime/workflows/agent-response-run.ts";
export {
  executeAgentResponse,
  runAgentResponseStep,
} from "./runtime/workflows/agent-response-step.ts";
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
} from "./services/memories/integrate/write-scope.ts";
export { resolveHarnessEmbeddingModel } from "./services/memories/tools/_helpers/embedding-model.ts";
export {
  agentMemoriesDatabase,
  createDeferredHarnessMemoriesClient,
  createHarnessMemoriesClient,
  harnessMemoriesFetch,
  installHarnessMemoriesFetch,
  type MemoriesServiceFetch,
} from "./services/memories/tools/_helpers/memories-client.ts";
export {
  getInstalledMemoriesOntology,
  installMemoriesOntology,
} from "./services/memories/tools/_helpers/memories-ontology-install.ts";
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
  runStandardHybridMemorySearch,
  runStandardNamespaceSearch,
  type StandardHybridMemorySearchInput,
  type StandardNamespaceSearchInput,
} from "./services/memories/tools/_helpers/memory-search.ts";
export { writeMemoryNode } from "./services/memories/tools/_helpers/memory-write.ts";
export {
  createRemoteSourceMapContentStore,
  DEFAULT_MEMORY_SOURCE_KEY,
  MEMORY_TEXT_SOURCE_PREFIX,
  type SourceMapTextPreviewClient,
} from "./services/memories/tools/_helpers/source-map-content-store.ts";
export {
  type AgentChatClient,
  type ChatServiceClient,
  type CreateAgentThreadInput,
  type CreateHarnessChatBackendOptions,
  type CreateRemoteHarnessChatOptions,
  createHarnessChatBackend,
  createRemoteHarnessChat,
  HARNESS_CHAT_CHANNEL_ID,
  type HarnessChatFetch,
  harnessChatFetch,
  installHarnessChatFetch,
  type SignedChatBackend,
} from "./services/social/message/chat.ts";
export {
  ensureThread,
  getAgentChatClient,
  getAgentChatClientForDid,
  getAgentChatService,
  getDevAgentDid,
  installAgentChat,
  resolveAgentChatSigner,
} from "./services/social/message/chat-service.ts";
export { AgentSocialMessage } from "./services/social/message/message.ts";
export {
  type NegotiationTurnWire,
  negotiationOutputToWire,
} from "./services/social/negotiate/nbc/action.ts";
export type {
  NbcLoopChain,
  NbcLoopHost,
  NbcLoopStartTurnInput,
  NbcLoopStatusPatch,
} from "./services/social/negotiate/nbc/loop-host.ts";
export {
  createNbcChainChangeBus,
  type NbcChainChangeBus,
  type NbcChainChanged,
} from "./services/social/negotiate/nbc/nbc-chain-change-bus.ts";
export {
  type NbcInternalNegotiationChain,
  type NbcInternalNegotiationHost,
  type RegisterNbcInternalNegotiationRoutesInput,
  registerNbcInternalNegotiationRoutes,
} from "./services/social/negotiate/nbc/nbc-internal-routes.ts";
export { type NbcLoopHandle, startNbcLoop } from "./services/social/negotiate/nbc/nbc-loop.ts";
export {
  createNbcMeshClient,
  type NbcMeshClient,
  type NbcNegotiationStateResponse,
} from "./services/social/negotiate/nbc/nbc-mesh-client.ts";
export { startNbcReplicaWatch } from "./services/social/negotiate/nbc/nbc-replica-watch.ts";
export { nbcTurnContext } from "./services/social/negotiate/nbc/nbc-turn-context.ts";
export {
  createNbcWakeDispatcher,
  resetNbcWakeDispatcherForTests,
} from "./services/social/negotiate/nbc/nbc-wake-dispatcher.ts";
export {
  buildNegotiationInstructions,
  buildNegotiationUserMessage,
  type NegotiationBrief,
  summarizeNbcGraph,
} from "./services/social/negotiate/nbc/prompt.ts";
export {
  type RunNbcModelTurnInput,
  runNbcModelTurn,
} from "./services/social/negotiate/nbc/run-nbc-model-turn.ts";
export {
  type NegotiationPortDefinition,
  type NegotiationTurnEnvelope,
  type NegotiationTurnEnvelopeContext,
  negotiationTurnEnvelopeSchema,
  parseNegotiationTurnEnvelope,
} from "./services/social/negotiate/nbc/turn-output-schema.ts";
export {
  type AvailablePeerPort,
  availablePeerPorts,
  clampMaxTurns,
  NBC_DEFAULT_MAX_TURNS,
  NBC_MAX_TURNS_CAP,
  type NegotiationChainView,
  type WhoShouldActResult,
  whoShouldAct,
} from "./services/social/negotiate/nbc/who-should-act.ts";
export {
  AgentSocialNegotiate,
  type NegotiateStartResult,
} from "./services/social/negotiate/negotiate.ts";
export {
  createHarnessVellumPool,
  disconnectVellum,
  type HarnessVellumPoolOptions,
  openVellumChain,
  type VellumHandle,
  type VellumPairOptions,
  wrapPoolClient,
} from "./services/social/negotiate/vellum.ts";
export { vellumPoolAttachmentDataDir } from "./services/social/negotiate/vellum-pool-paths.ts";
export {
  type CommitTurnResult,
  type CreateVellumChainSessionRegistryOptions,
  createVellumChainSessionRegistry,
  NBC_GENESIS_NOT_INITIATOR,
  type VellumChainLiveSession,
  type VellumChainSessionRegistry,
} from "./services/social/negotiate/vellum-sessions.ts";
export { AgentSocial, type SocialInvitation } from "./services/social/social.ts";
export { resolveAgentsDataDir } from "./services/social/tools/_helpers/khora-client-factory.ts";
