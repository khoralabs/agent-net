# `@khoralabs/agent-net-harness/swarm`

Budgeted multi-agent orchestration on top of the harness control plane.

Exports `swarmOrchestrator`, `provideHarnessForSession`, `provideOntologyForSession`, and `SwarmConfig`. It does **not** select a Workflow world or host memories/relay.

```ts
import { startNetworkHarness } from "@khoralabs/agent-net-harness";
import {
  provideHarnessForSession,
  provideOntologyForSession,
  swarmOrchestrator,
  type SwarmConfig,
} from "@khoralabs/agent-net-harness/swarm";
import { start } from "workflow/api";

const harness = await startNetworkHarness({ /* … */ });
provideHarnessForSession(sessionId, harness);
provideOntologyForSession(sessionId, ontology);

const run = await start(swarmOrchestrator, [config]);
```

The hosting process must configure and start the Workflow world before `start(swarmOrchestrator, …)`.

## CLI (reference app)

From the agent-net repo root (reference configures Turso and wires remote URLs):

```bash
bun run swarm -- \
  --khora-url http://127.0.0.1:8788 \
  --relay-url http://127.0.0.1:8790 \
  --memories-url http://127.0.0.1:8791 \
  --agents 2

bun run swarm:test
```

## Observability

Swarm does not host memories. Agent turn OTEL comes from `installHarnessObservability` in the swarm process (see the reference `installReferenceObservability`). Memory op and database lifecycle spans (`memories.op.*`, `memories.database.*`) appear in OTLP when the **memories host** is instrumented — e.g. the reference orchestrator installs memories OTEL before `startMemoriesService`. Point `--memories-url` at that host and set `OTEL_EXPORTER_OTLP_ENDPOINT` on both processes if you want agent and memory signals in the same backend.
