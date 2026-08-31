# agent-net workspace

Monorepo for the Khora multi-agent network harness.

| Package | Path | Role |
| --- | --- | --- |
| `@khoralabs/agent-net` | [`packages/harness`](packages/harness) | Abstract harness library |
| `@khoralabs/agent-net-swarm` | [`packages/swarm`](packages/swarm) | Budgeted multi-agent orchestration |
| `@khoralabs/agent-net-reference` | [`apps/reference`](apps/reference) | Turso world, local memories/relay, orchestrator + marketplace (primary) / swarm CLIs |

## Setup

```bash
git submodule update --init --recursive   # or: bun run submodules:init
bun install
```

## Quick start

Use **two terminals**. Keep the orchestrator running in the first.

1. Start the reference stack (local memories + relay + chat + Turso world; data under `apps/reference/.data`):

```bash
bun run reference:start
```

2. In a **second** terminal, export the printed URLs (and a running Khora host), then run marketplace:

```bash
export KHORA_BASE_URL=http://127.0.0.1:8788
export RELAY_BASE_URL=…       # from orchestrator output
export MEMORIES_BASE_URL=…    # from orchestrator output
export CHAT_BASE_URL=…        # from orchestrator output
export CHAT_INTERNAL_TOKEN=reference-chat-token
export AI_GATEWAY_API_KEY=…

bun run marketplace
```

Optional secondary demo: `bun run swarm -- --agents 2`.

## Workflow world

Harness and swarm workflows use the abstract [Workflow SDK](https://useworkflow.dev) only. The **hosting app** must configure and start a world before running workflows. The reference app selects Turso (`configureTursoWorldEnv` / `startTursoWorldWorker`).

## Scripts

| Script | Description |
| --- | --- |
| `bun run reference:start` | Start memories + relay + Turso world |
| `bun run marketplace` | Marketplace CLI (primary reference demo) |
| `bun run swarm` | Swarm CLI (secondary) |
| `bun run typecheck` | Typecheck all workspace packages |
| `bun run swarm:test` | Swarm + harness unit tests |

## Vendored submodules

| Path | Repo |
| --- | --- |
| `vendor/libs` | libs |

Chat, relay, and memories are consumed from npm (`@khoralabs/chat`, `@khoralabs/relay`, `@khoralabs/memories-node`, `@khoralabs/memories-service`, etc.).
