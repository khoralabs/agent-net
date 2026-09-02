# @khoralabs/agent-net

Custodial network harness: agent pool, per-agent social fabric + memories, signed chat, tools, and durable turn workflows.

## Entrypoints

| Import | Role |
|--------|------|
| `@khoralabs/agent-net` | Core control plane: `startNetworkHarness`, agents, pool, network events (no AI SDK / Workflow directives) |
| `@khoralabs/agent-net/agent` | Slim agent surface |
| `@khoralabs/agent-net/pool` | Pool / inbox / network / observability |
| `@khoralabs/agent-net/ai-sdk` | LLM helpers: `generateStructured`, `runAgentWorkflow`, tool capture (optional peers: `ai`, `agent-capabilities-ai-sdk`) |
| `@khoralabs/agent-net/agent-response-run` | Directive-free agent-response body for host durable wrappers |
| `@khoralabs/agent-net/swarm` | Session/config only: `provideHarnessForSession`, `provideOntologyForSession`, `SwarmConfig` |
| `@khoralabs/agent-net/swarm-run` | Directive-free swarm setup/assemble/state helpers |

Swarm orchestrators and `"use workflow"` / `"use step"` wrappers are **host-owned** (see `apps/reference/src/workflows/`). Swarm is **not** re-exported from the root entrypoint. Agent rules: [`AGENTS.md`](AGENTS.md).

### Migration (from pre-peel root barrel)

| Old import from `@khoralabs/agent-net` | New import |
|----------------------------------------|------------|
| `generateStructured`, `runHarnessAgentStep`, `prepareHarnessStepRuntime`, `captureHarnessCapabilities` | `@khoralabs/agent-net/ai-sdk` |
| `agentResponse`, `executeAgentResponse`, `runAgentResponseStep` | Host wrappers (copy `apps/reference/src/workflows/agent-response*.ts`) + `./agent-response-run` |
| `swarmOrchestrator` from `./swarm` | Host wrapper (`apps/reference/src/workflows/swarm.ts`) + `./swarm` session helpers + `./swarm-run` |
| `LanguageModel` / `gateway(modelId)` on structured helpers | Pass `model: string` (gateway model id) |

`ai`, `workflow`, and `@khoralabs/agent-capabilities-ai-sdk` are **optional peer dependencies**. Install them when using `./ai-sdk` or host Workflow wrappers.

## Target DX

```ts
import { startNetworkHarness } from "@khoralabs/agent-net";

const harness = await startNetworkHarness({
  dataDir,
  khoraBaseUrl,
  relayBaseUrl,
  memoriesBaseUrl,
  memoriesAdminToken,
  chatBaseUrl,
  chatToken,
  khoraAdminToken, // optional
  identitySecret, // optional
});

const agent = await harness.spawn({ ontology });
// or: await harness.get(did, { ontology })

await agent.social.post({ kind: "post", /* … */ });
await agent.social.post({ kind: "subscription", search: { /* … */ } });
await agent.social.search({ /* … */ });
const invitation = await agent.social.connect(peerDid);

await agent.social.message.thread();
await agent.social.negotiate.start(peerHandle, vellumOptions);

await agent.memories.search({ namespace: "notes", query: "…" });
await agent.memories.integrate(integrateEvent);

// Inbox: one multiplex WebSocket for the whole pool — demux by event.did
const unsub = harness.subscribeInbox((event) => {
  console.log(event.did, event.type);
});
```

Spawning binds the agent DID on the shared inbox socket; `harness.removeAgent` unbinds it. Prefer `harness.get` / `spawn` over raw `pool.focus` when you need memories + `social`.

## Layout

| Module | Role |
|--------|------|
| `pool/` | Control plane: identities, registry, invite bank |
| `pool/inbox/` | Multiplex Khora inbox for the pool |
| `pool/network/` | Session registry, network events |
| `pool/observability/` | Telemetry install + attribution ALS |
| `pool/host/` | `startNetworkHarness` (wires pool + agent) |
| `agent/` | One network actor: handle, social, memories, turn |
| `agent/social/` | Fabric + nested `message` / `negotiate` |
| `agent/memories/` | Bound DB helpers, tools, integrate wire |
| `agent/turn/` | Capability agents, toolkits, workflows |
| `swarm/` | Budgeted orchestration on top of the control plane |

## Workflow world

Harness publishes directive-free run helpers. Hosts own Workflow SDK wrappers (`start`, durable steps). The package does **not** select a world backend.

The process that hosts the workflow worker must configure the world **before** running workflows — for example set `WORKFLOW_TARGET_WORLD=local` (and optionally `WORKFLOW_LOCAL_DATA_DIR`) and call `getWorld().start()`. The reference app (`apps/reference`) does this with the [local world](https://workflow-sdk.dev/worlds/local) and also starts local memories/relay/chat/Khora servers.

## Telemetry

Install host observability with `installHarnessObservability`. Besides agent OTEL (`createAgentTelemetry`), provide `createMemoriesTelemetry` when **this process hosts** a memories stack:

```ts
import { installHarnessObservability, getHarnessMemoriesTelemetry } from "@khoralabs/agent-net";
import { createMemoriesOtelTelemetry } from "@khoralabs/memories-otel";
import { createLocalSqliteServiceStack } from "@khoralabs/memories-service/storage/sqlite";
import { trace, metrics } from "@opentelemetry/api";

const tracer = trace.getTracer("my-app");
const meter = metrics.getMeter("my-app");

installHarnessObservability({
  createLogger,
  createAgentTelemetry,
  createMemoriesTelemetry: () => createMemoriesOtelTelemetry({ tracer, meter }),
});

const stack = createLocalSqliteServiceStack({
  dataDir,
  sqlCipherKey,
  telemetry: getHarnessMemoriesTelemetry(),
});
```

Memory merge/search/delete and database open/close/delete/evict spans emit in the **memories-service process**. Pointing the harness at a remote `memoriesBaseUrl` only surfaces those spans if that host installs real memories telemetry (for example via `@khoralabs/memories-otel`). The reference app uses harness noop memories telemetry. Agent tool OTEL remains separate via `createAgentTelemetry`.
