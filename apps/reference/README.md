# @khoralabs/agent-net-reference

Concrete stack for local development and demos:

- Turso Workflow world bootstrap
- Optional in-process memories + relay servers
- Orchestrator process that starts those services
- **Marketplace CLI** (`marketplace`) — primary demo: buy/sell pool, percolator inbox, LLM evaluate, Vellum connect
- Swarm CLI (`swarm`) — secondary; budgeted multi-agent orchestration

## Layout

```text
src/
  run-marketplace.ts          # marketplace CLI composition root
  patterns/                   # domain-agnostic host glue (promote candidates)
    inbox/                    # subscribe → filter → dispatch / wait
    turn/                     # structured LLM decisions
    negotiate/                # Vellum pair open + cleanup
  marketplace/                # MRO surplus demo domain (not promote-as-is)
    config.ts seed.ts pipeline.ts evaluate-on-inbox.ts GAPS.md
  run-swarm.ts                # secondary swarm demo
  orchestrator.ts             # local memories + relay + Turso
```

`patterns/**` must not import `marketplace/**`. Host-glue pain points live in `marketplace/GAPS.md`.

```bash
# from repo root — terminal 1: infra
bun run reference:start -- --data-dir ./.harness-data

# terminal 2: marketplace (primary demo)
bun run marketplace -- \
  --khora-url http://127.0.0.1:8788 \
  --relay-url http://127.0.0.1:8790 \
  --memories-url http://127.0.0.1:8791

# optional: swarm (secondary)
bun run swarm -- \
  --khora-url http://127.0.0.1:8788 \
  --relay-url http://127.0.0.1:8790 \
  --memories-url http://127.0.0.1:8791 \
  --agents 2
```

Orchestrator prints `memoriesBaseUrl` / `relayBaseUrl`. Point marketplace or swarm at those URLs plus a remote `KHORA_BASE_URL`. Same env as swarm (`KHORA_*`, `RELAY_*`, `MEMORIES_*`, `CHAT_*`, `AI_GATEWAY_API_KEY`).

## Observability

Set `OTEL_EXPORTER_OTLP_ENDPOINT` (and optional `LOG_LEVEL`) to export traces/metrics.

| Process | What emits |
|---------|------------|
| Orchestrator (`reference:start`) | Memories database lifecycle + merge/search/delete via `@khoralabs/memories-otel` on the local SQLite stack |
| Marketplace / swarm | Agent session/tool OTEL via `installReferenceObservability` |

The orchestrator calls `installReferenceObservability` then passes `getHarnessMemoriesTelemetry()` into `startMemoriesService`. CLIs against `--memories-url` observe memory systems through that host’s OTLP export, not through client-side HTTP wrappers.
