# `@khoralabs/agent-net/swarm`

Session/config helpers for budgeted multi-agent orchestration. This entrypoint does **not** export Workflow orchestrators or steps — hosts own durable directives.

Exports `provideHarnessForSession`, `provideOntologyForSession`, and `SwarmConfig`. Directive-free run helpers (`setupSwarm`, `assembleTurnContext`, swarm-state ops, …) live on `@khoralabs/agent-net/swarm-run`.

```ts
import { startNetworkHarness } from "@khoralabs/agent-net";
import {
  provideHarnessForSession,
  provideOntologyForSession,
  type SwarmConfig,
} from "@khoralabs/agent-net/swarm";
import { start } from "workflow/api";
// Host-owned wrapper (see apps/reference/src/workflows/swarm.ts):
import { swarmOrchestrator } from "./workflows/swarm.ts";

const harness = await startNetworkHarness({ /* … */ });
provideHarnessForSession(sessionId, harness);
provideOntologyForSession(sessionId, ontology);

const run = await start(swarmOrchestrator, [config]);
```

The hosting process must configure and start the Workflow world before `start(swarmOrchestrator, …)`.

## CLI (reference app)

From the agent-net repo root (reference configures the local Workflow world and wires remote URLs):

```bash
bun run swarm -- \
  --khora-url http://127.0.0.1:8788 \
  --relay-url http://127.0.0.1:8790 \
  --memories-url http://127.0.0.1:8791 \
  --agents 2

bun run swarm:test
```

## Observability

Swarm does not host memories. Agent turn telemetry comes from `installHarnessObservability` in the swarm process (the reference app’s `installReferenceObservability` wires pino logging and noop agent/memories sinks). Memory op and database lifecycle spans (`memories.op.*`, `memories.database.*`) appear in OTLP only when the **memories host** installs real memories telemetry (for example `@khoralabs/memories-otel`) and an OTLP exporter.
