# @khoralabs/agent-net

Network harness library: agent pool, remote Khora/relay/memories clients, signed chat, agent tools, and durable turn workflows.

## Workflow world

Harness workflows use the abstract [Workflow SDK](https://useworkflow.dev) APIs (`"use workflow"`, `"use step"`, `start`). They do **not** select a world backend.

The process that hosts the workflow worker must configure the world **before** running workflows — for example set `WORKFLOW_TARGET_WORLD` / `WORKFLOW_TURSO_DATABASE_URL` and call `getWorld().start()`. The reference app (`apps/reference`) does this for Turso and also starts optional local memories/relay servers.

## Usage

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
  // Optional: mint invites on every spawn (also reads KHORA_ADMIN_TOKEN / ADMIN_ROOT_TOKEN)
  khoraAdminToken,
  // Optional: seal agent identity files (also reads HARNESS_IDENTITY_WRAP_KEY)
  identitySecret,
});
// Apps must supply an ontology — e.g. referenceMemoriesOntology from the reference app.
const agent = await harness.spawn({ ontology });
// Registration-issued invites (encrypted per agent): await harness.listInvitesForAgent(agent.did)

// Inbox: one multiplex WebSocket for the whole pool — demux by event.did
const unsub = harness.subscribeInbox((event) => {
  console.log(event.did, event.type);
});
```

Spawning (`harness.spawn` or `harness.pool.spawn`) binds the agent DID on that shared socket;
`harness.removeAgent` / `pool.remove` unbinds it. Do not open per-agent inbox WebSockets.

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
