# agent-net workspace

Monorepo for the Khora multi-agent network harness.

| Package | Path | Role |
| --- | --- | --- |
| `@khoralabs/agent-net` | [`packages/harness`](packages/harness) | Abstract harness library (`./swarm` = budgeted multi-agent orchestration) |
| `@khoralabs/agent-net-reference` | [`apps/reference`](apps/reference) | Local Workflow world, embedded Khora + memories/relay/chat, orchestrator + marketplace (primary) / swarm CLIs |

## Setup

```bash
bun install
```

## Quick start

Use **two terminals**. Keep the orchestrator running in the first.

1. Start the reference stack (embedded Khora + memories + relay + chat + local Workflow world; data under `apps/reference/.data`):

```bash
bun run reference:start
```

2. In a **second** terminal, export the printed URLs, then run marketplace:

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

## Release

Publishable package: `@khoralabs/agent-net` ([`packages/harness`](packages/harness)).

GitHub Actions: [`.github/workflows/release.yml`](.github/workflows/release.yml) (`workflow_dispatch` with a semver, or push a `v*` tag). Requires repository secret `NPM_TOKEN` (or `NPM_CONFIG_TOKEN`).

## Workflow world

Harness and swarm workflows use the abstract [Workflow SDK](https://useworkflow.dev) only. The **hosting app** must configure and start a world before running workflows. The reference app uses the [local world](https://workflow-sdk.dev/worlds/local) (`configureLocalWorldEnv` / `startLocalWorldWorker`).

## Scripts

| Script | Description |
| --- | --- |
| `bun run reference:start` | Start Khora + memories + relay + chat + local Workflow world |
| `bun run marketplace` | Marketplace CLI (primary reference demo) |
| `bun run swarm` | Swarm CLI (secondary) |
| `bun run typecheck` | Typecheck all workspace packages |
| `bun run swarm:test` | Swarm + harness unit tests |

Chat, relay, memories, and Khora host are consumed from npm (`@khoralabs/chat`, `@khoralabs/relay`, `@khoralabs/memories-node`, `@khoralabs/memories-service`, `@khoralabs/khora-host`, etc.).
