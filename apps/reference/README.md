# @khoralabs/agent-net-reference

Concrete stack for local development and demos:

- Zero-config [Workflow local world](https://workflow-sdk.dev/worlds/local)
- In-process Khora host + memories + relay + chat
- Orchestrator process that starts those services
- **Marketplace CLI** (`marketplace`) — primary demo
- Swarm CLI (`swarm`) — secondary; budgeted multi-agent orchestration

## Documentation

- [Getting started](../../docs/tutorials/getting-started.md)
- [Docs hub](../../docs/README.md)
- [Architecture](../../docs/explanation/architecture.md)
- [Env and CLI](../../docs/reference/env-and-cli.md)
- Host-glue backlog: [`marketplace/GAPS.md`](src/marketplace/GAPS.md)

## Run

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

From the workspace root you can use `bun run reference:start` and `bun run marketplace` instead.

Marketplace needs **two** long-running processes. Do not stop the orchestrator with ^C while marketplace is running. The demo ends at **mutual interest** (before NBC).

## Layout

```text
src/
  run-marketplace.ts          # marketplace CLI composition root
  patterns/                   # domain-agnostic host glue (promote candidates)
  marketplace/                # MRO surplus demo domain (not promote-as-is)
  run-swarm.ts                # secondary swarm demo
  orchestrator.ts             # local khora + memories + relay + chat + Workflow world
  workflows/                  # host-owned Workflow durable wrappers
```

`patterns/**` must not import `marketplace/**`.

## Observability

`installReferenceObservability` wires pino (optional `LOG_LEVEL`, optional session JSONL dual-write) into the harness host surface. Agent and memories telemetry use harness noops — the reference app does not export OTLP.
