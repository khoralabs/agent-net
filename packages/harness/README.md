# @khoralabs/agent-net-harness

Custodial network harness: agent pool, per-agent social fabric + memories, signed chat, tools, and durable turn workflows.

## Entrypoints

| Import | Role |
|--------|------|
| `@khoralabs/agent-net-harness` | Control plane: `startNetworkHarness`, agents, pool, turns, network events |
| `@khoralabs/agent-net-harness/agent` | Slim agent surface |
| `@khoralabs/agent-net-harness/pool` | Pool / inbox / network / observability |
| `@khoralabs/agent-net-harness/swarm` | Budgeted multi-agent orchestration — see [`src/swarm/README.md`](src/swarm/README.md) |

Swarm is **not** re-exported from the root entrypoint. Agent rules for the import boundary live in [`AGENTS.md`](AGENTS.md).

## Target DX

```ts
import { startNetworkHarness } from "@khoralabs/agent-net-harness";

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

Harness workflows use the abstract [Workflow SDK](https://useworkflow.dev) APIs (`"use workflow"`, `"use step"`, `start`). They do **not** select a world backend.

The process that hosts the workflow worker must configure the world **before** running workflows — for example set `WORKFLOW_TARGET_WORLD` / `WORKFLOW_TURSO_DATABASE_URL` and call `getWorld().start()`. The reference app (`apps/reference`) does this for Turso and also starts optional local memories/relay servers.

## Telemetry

Install host observability with `installHarnessObservability`. Besides agent OTEL (`createAgentTelemetry`), provide `createMemoriesTelemetry` when **this process hosts** a memories stack:

```ts
import { installHarnessObservability, getHarnessMemoriesTelemetry } from "@khoralabs/agent-net-harness";
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

Memory merge/search/delete and database open/close/delete/evict spans emit in the **memories-service process**. Pointing the harness at a remote `memoriesBaseUrl` only surfaces those spans if that host is instrumented (the reference orchestrator does this). Agent tool OTEL remains separate via `createAgentTelemetry`.
