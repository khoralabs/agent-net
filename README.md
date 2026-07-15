# agent-net workspace

Monorepo for the Khora multi-agent network harness.

| Package | Path | Role |
| --- | --- | --- |
| `@khoralabs/agent-net` | [`packages/harness`](packages/harness) | Abstract harness library |
| `@khoralabs/agent-net-swarm` | [`packages/swarm`](packages/swarm) | Budgeted multi-agent orchestration |
| `@khoralabs/agent-net-reference` | [`apps/reference`](apps/reference) | Turso world, local memories/relay, nitro agent, orchestrator + swarm CLI |

## Setup

```bash
git submodule update --init --recursive   # or: bun run submodules:init
bun install
```

## Quick start

1. Start the reference stack (local memories + relay + Turso world):

```bash
bun run reference:start -- --data-dir ./.harness-data
```

2. Point a harness or swarm at those URLs plus a running Khora host:

```bash
export KHORA_BASE_URL=http://127.0.0.1:8788
export RELAY_BASE_URL=…       # from orchestrator output
export MEMORIES_BASE_URL=…    # from orchestrator output

bun run swarm -- --agents 2
```

## Workflow world

Harness and swarm workflows use the abstract [Workflow SDK](https://useworkflow.dev) only. The **hosting app** must configure and start a world before running workflows. The reference app selects Turso (`configureTursoWorldEnv` / `startTursoWorldWorker`).

## Scripts

| Script | Description |
| --- | --- |
| `bun run reference:start` | Start memories + relay + Turso world |
| `bun run agent:dev` | Nitro agent HTTP (reference) |
| `bun run swarm` | Swarm CLI (reference app) |
| `bun run typecheck` | Typecheck all workspace packages |
| `bun run swarm:test` | Swarm + harness unit tests |

## Vendored submodules

| Path | Repo |
| --- | --- |
| `vendor/memories` | memories |
| `vendor/relay` | relay |
| `vendor/chat` | chat |
| `vendor/libs` | libs |
