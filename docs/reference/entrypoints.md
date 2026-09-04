# Entrypoints

Published import surfaces for `@khoralabs/agent-net`.

| Import | Role |
|--------|------|
| `@khoralabs/agent-net` | Core control plane: `startNetworkHarness`, agents, pool, network events (no AI SDK / Workflow directives) |
| `@khoralabs/agent-net/agent` | Slim agent surface |
| `@khoralabs/agent-net/pool` | Pool / inbox / network / observability |
| `@khoralabs/agent-net/ai-sdk` | LLM helpers: `generateStructured`, `runAgentWorkflow`, tool capture (optional peers: `ai`, `agent-capabilities-ai-sdk`) |
| `@khoralabs/agent-net/agent-response-run` | Directive-free agent-response body for host durable wrappers |
| `@khoralabs/agent-net/swarm` | Session/config only: `provideHarnessForSession`, `provideOntologyForSession`, `SwarmConfig` |
| `@khoralabs/agent-net/swarm-run` | Directive-free swarm setup/assemble/state helpers |

Swarm orchestrators and `"use workflow"` / `"use step"` wrappers are **host-owned** (see `apps/reference/src/workflows/`). Swarm is **not** re-exported from the root entrypoint.

Optional peers: `ai`, `workflow`, and `@khoralabs/agent-capabilities-ai-sdk`. Install them when using `./ai-sdk` or host Workflow wrappers.

Contributor import-boundary rules: `packages/harness/AGENTS.md`. Peel rationale: [architecture](../explanation/architecture.md).

## Migration (from pre-peel root barrel)

| Old import from `@khoralabs/agent-net` | New import |
|----------------------------------------|------------|
| `generateStructured`, `runHarnessAgentStep`, `prepareHarnessStepRuntime`, `captureHarnessCapabilities` | `@khoralabs/agent-net/ai-sdk` |
| `agentResponse`, `executeAgentResponse`, `runAgentResponseStep` | Host wrappers (copy `apps/reference/src/workflows/agent-response*.ts`) + `./agent-response-run` |
| `swarmOrchestrator` from `./swarm` | Host wrapper (`apps/reference/src/workflows/swarm.ts`) + `./swarm` session helpers + `./swarm-run` |
| `LanguageModel` / `gateway(modelId)` on structured helpers | Pass `model: string` (gateway model id) |
