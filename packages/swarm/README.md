# @khoralabs/agent-net-swarm

Budgeted multi-agent orchestration library on top of `@khoralabs/agent-net`.

Exports `setupSwarm`, `swarmOrchestrator`, session helpers, and related types. It does **not** select a Workflow world or host memories/relay.

Run the swarm CLI from the reference app (which configures Turso and wires remote URLs):

```bash
# from the agent-net repo root
bun run swarm -- \
  --khora-url http://127.0.0.1:8788 \
  --relay-url http://127.0.0.1:8790 \
  --memories-url http://127.0.0.1:8791 \
  --agents 2

bun run --filter @khoralabs/agent-net-swarm test
```

The hosting process must configure/start the Workflow world before `start(swarmOrchestrator, …)`.

## Observability

Swarm does not host memories. Agent turn OTEL comes from `installHarnessObservability` in the swarm process (see the reference `installReferenceObservability`). Memory op and database lifecycle spans (`memories.op.*`, `memories.database.*`) appear in OTLP when the **memories host** is instrumented — e.g. the reference orchestrator installs memories OTEL before `startMemoriesService`. Point `--memories-url` at that host and set `OTEL_EXPORTER_OTLP_ENDPOINT` on both processes if you want agent and memory signals in the same backend.
