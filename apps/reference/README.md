# @khoralabs/agent-net-reference

Concrete stack for local development and demos:

- Turso Workflow world bootstrap
- Optional in-process memories + relay servers
- Nitro agent HTTP (`agent:dev`)
- Orchestrator process that starts those services
- Swarm CLI (`swarm`) that boots Turso then runs `@khoralabs/agent-net-swarm`

```bash
# from repo root
bun run reference:start -- --data-dir ./.harness-data

# nitro agent (configures Turso world on boot)
bun run agent:dev

# swarm (configures Turso, connects to Khora + memories + relay)
bun run swarm -- \
  --khora-url http://127.0.0.1:8788 \
  --relay-url http://127.0.0.1:8790 \
  --memories-url http://127.0.0.1:8791 \
  --agents 2
```

Orchestrator prints `memoriesBaseUrl` / `relayBaseUrl`. Point the harness or swarm CLI at those URLs plus a remote `KHORA_BASE_URL`.

## Observability

Set `OTEL_EXPORTER_OTLP_ENDPOINT` (and optional `LOG_LEVEL`) to export traces/metrics.

| Process | What emits |
|---------|------------|
| Orchestrator (`reference:start`) | Memories database lifecycle + merge/search/delete via `@khoralabs/memories-otel` on the local SQLite stack |
| Swarm / agent (`swarm`, `agent:dev`) | Agent session/tool OTEL via `installReferenceObservability` |

The orchestrator calls `installReferenceObservability` then passes `getHarnessMemoriesTelemetry()` into `startMemoriesService`. Swarm against `--memories-url` observes memory systems through that host’s OTLP export, not through client-side HTTP wrappers.
