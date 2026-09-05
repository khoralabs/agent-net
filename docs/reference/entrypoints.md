# Entrypoints

Published import surfaces for `@khoralabs/agent-net`.

| Import | Role |
|--------|------|
| `@khoralabs/agent-net` | Core control plane: `startNetworkHarness`, agents/pool/network events, turn helpers (no AI SDK / Workflow directives; no negotiate/chat/memories peels) |
| `@khoralabs/agent-net/agent` | Slim agent surface (`AgentHandle`, `AgentSocial`, …) |
| `@khoralabs/agent-net/pool` | Pool / inbox / network / observability |
| `@khoralabs/agent-net/negotiate` | NBC / Vellum negotiate (`AgentSocialNegotiate`, sessions, loop, routes, prompts) |
| `@khoralabs/agent-net/chat` | Signed chat backends and agent chat service helpers |
| `@khoralabs/agent-net/memories` | Ontology install, deferred client, write-scope helpers |
| `@khoralabs/agent-net/integrate/write-scope` | Write-scope only |
| `@khoralabs/agent-net/integrate/memory-event` | Integrate memory-event helpers |
| `@khoralabs/agent-net/ai-sdk` | LLM helpers: `generateStructured`, `runAgentWorkflow`, tool capture (optional peers: `ai`, `agent-capabilities-ai-sdk`) |
| `@khoralabs/agent-net/agent-response-run` | Directive-free agent-response body for host durable wrappers |
| `@khoralabs/agent-net/classify-response-plan-run` | Classify response-plan run helper |
| `@khoralabs/agent-net/response-plan` | Response plan types/helpers |
| `@khoralabs/agent-net/gateway-model-capabilities` | Gateway model capability helpers |
| `@khoralabs/agent-net/workflow-resilience` | `AI_STEP_*` retries/timeouts |
| `@khoralabs/agent-net/step-context` | Step context format/resolve |
| `@khoralabs/agent-net/run-harness-agent-step` | Single-step runner |
| `@khoralabs/agent-net/nbc-run-model-turn-run` | NBC model turn run helper |
| `@khoralabs/agent-net/nbc-prepare-turn-run` | NBC prepare turn / tools |
| `@khoralabs/agent-net/attribution-digest` | `buildNetworkAttribution` |
| `@khoralabs/agent-net/network-events` | Network event persistence core |
| `@khoralabs/agent-net/network-events/sqlite` | SQLite network-events plugin |
| `@khoralabs/agent-net/structured-output` | `generateStructured` helpers |
| `@khoralabs/agent-net/swarm` | Session/config only: `provideHarnessForSession`, `provideOntologyForSession`, `SwarmConfig` |
| `@khoralabs/agent-net/swarm-run` | Directive-free swarm setup/assemble/state helpers |
| `@khoralabs/agent-net/agent-workflow-types` | Lean workflow types |

Swarm orchestrators and `"use workflow"` / `"use step"` wrappers are **host-owned** (see `apps/reference/src/workflows/`). Swarm, ai-sdk, negotiate, chat, and memories peels are **not** re-exported from the root entrypoint.

Optional peers: `ai`, `workflow`, and `@khoralabs/agent-capabilities-ai-sdk`. Install them when using `./ai-sdk` or host Workflow wrappers.

Contributor import-boundary rules: `packages/harness/AGENTS.md`. Peel rationale: [architecture](../explanation/architecture.md).

## Migration (from fat root barrel)

| Old import from `@khoralabs/agent-net` | New import |
|----------------------------------------|------------|
| NBC / Vellum negotiate helpers (`disconnectVellum`, `registerNbcInternalNegotiationRoutes`, `createVellumChainSessionRegistry`, …) | `@khoralabs/agent-net/negotiate` |
| Chat backends / `installAgentChat` / `AgentSocialMessage` | `@khoralabs/agent-net/chat` |
| `installMemoriesOntology`, `createBoundAgentMemoriesClient`, write-scope helpers | `@khoralabs/agent-net/memories` (or `./integrate/write-scope`) |
| `generateStructured`, `runHarnessAgentStep`, `prepareHarnessStepRuntime`, `captureHarnessCapabilities` | `@khoralabs/agent-net/ai-sdk` |
| `AI_STEP_MAX_RETRIES` / `AI_STEP_TIMEOUT_MS` | `@khoralabs/agent-net/workflow-resilience` |
| `agentResponse`, `executeAgentResponse`, `runAgentResponseStep` | Host wrappers (copy `apps/reference/src/workflows/agent-response*.ts`) + `./agent-response-run` |
| `swarmOrchestrator` from `./swarm` | Host wrapper (`apps/reference/src/workflows/swarm.ts`) + `./swarm` session helpers + `./swarm-run` |
| `LanguageModel` / `gateway(modelId)` on structured helpers | Pass `model: string` (gateway model id) |
