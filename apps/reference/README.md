# @khoralabs/agent-net-reference

Concrete stack for local development and demos:

- Zero-config [Workflow local world](https://workflow-sdk.dev/worlds/local)
- In-process Khora host + memories + relay + chat
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
  orchestrator.ts             # local khora + memories + relay + chat + Workflow world
```

`patterns/**` must not import `marketplace/**`. Host-glue pain points live in `marketplace/GAPS.md`.

```bash
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

Marketplace needs **two** long-running processes: reference orchestrator (`start`, which embeds Khora on `:8788`), then the CLI. Orchestrator ports are fixed at khora `8788`, relay `8790`, memories `8791`, chat `8792` (matching `.env`). Do not stop orchestrator with ^C while marketplace is running.

The marketplace demo ends at **mutual interest**: sellers engage/skip on the RFQ, engagers open Vellum, then the buyer accepts or declines each invite (declines disconnect immediately). Negotiation turns / NBC are out of scope.

## Observability

`installReferenceObservability` wires pino (optional `LOG_LEVEL`, optional session JSONL dual-write) into the harness host surface. Agent and memories telemetry use harness noops — the reference app does not export OTLP.
