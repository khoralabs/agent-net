# @khoralabs/agent-net-reference

Concrete stack for local development and demos:

- Turso Workflow world bootstrap
- Optional in-process memories + relay servers
- Orchestrator process that starts those services
- **Marketplace CLI** (`marketplace`) — primary demo: buy/sell pool, percolator inbox, seller evaluate, Vellum connect, buyer invite accept/decline (mutual interest; stop before NBC)
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
    config.ts seed.ts pipeline.ts evaluate-on-inbox.ts evaluate-on-invite.ts GAPS.md
  run-swarm.ts                # secondary swarm demo
  orchestrator.ts             # local memories + relay + Turso
```

`patterns/**` must not import `marketplace/**`. Host-glue pain points live in `marketplace/GAPS.md`.

```bash
# terminal 0 — Khora (leave running; default :8788)
cd ../../khora/apps/server && bun run start

# terminal 1 — reference infra (leave running; .data under apps/reference)
bun run start

# terminal 2 — marketplace (values match pinned orchestrator ports + .env)
export KHORA_BASE_URL=http://127.0.0.1:8788
export RELAY_BASE_URL=http://127.0.0.1:8790
export MEMORIES_BASE_URL=http://127.0.0.1:8791
export CHAT_BASE_URL=http://127.0.0.1:8792
export CHAT_INTERNAL_TOKEN=reference-chat-token
export AI_GATEWAY_API_KEY=…

bun run marketplace

# optional: swarm (secondary)
bun run swarm -- --agents 2
```

Marketplace needs **three** long-running processes: Khora, reference orchestrator (`start`), then the CLI. Orchestrator ports are fixed at relay `8790`, memories `8791`, chat `8792` (matching `.env`). Do not stop orchestrator with ^C while marketplace is running.

The marketplace demo ends at **mutual interest**: sellers engage/skip on the RFQ, engagers open Vellum, then the buyer accepts or declines each invite (declines disconnect immediately). Negotiation turns / NBC are out of scope.

## Observability

Set `OTEL_EXPORTER_OTLP_ENDPOINT` (and optional `LOG_LEVEL`) to export traces/metrics.

| Process | What emits |
|---------|------------|
| Orchestrator (`reference:start`) | Memories database lifecycle + merge/search/delete via `@khoralabs/memories-otel` on the local SQLite stack |
| Marketplace / swarm | Agent session/tool OTEL via `installReferenceObservability` |

The orchestrator calls `installReferenceObservability` then passes `getHarnessMemoriesTelemetry()` into `startMemoriesService`. CLIs against `--memories-url` observe memory systems through that host’s OTLP export, not through client-side HTTP wrappers.
