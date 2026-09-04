# agent-net workspace

Monorepo for the Khora multi-agent network harness.

| Package | Path | Role |
| --- | --- | --- |
| `@khoralabs/agent-net` | [`packages/harness`](packages/harness) | Abstract harness library (`./swarm` = budgeted multi-agent orchestration) |
| `@khoralabs/agent-net-reference` | [`apps/reference`](apps/reference) | Local Workflow world, embedded Khora + memories/relay/chat, orchestrator + marketplace (primary) / swarm CLIs |

## Documentation

Consumer docs live under [`docs/`](docs/README.md) (Diátaxis: tutorials, how-tos, explanation, reference).

- [Getting started](docs/tutorials/getting-started.md) — two-terminal marketplace path
- [System roles](docs/explanation/system-roles.md) — why each primary exists in agent-net
- [Architecture](docs/explanation/architecture.md) — control plane vs host

## Setup

```bash
bun install
```

## Quick start

See [Getting started](docs/tutorials/getting-started.md). Short version: keep the orchestrator running in one terminal (`bun run reference:start`), export the printed URLs in a second terminal, then `bun run marketplace`.

## Release

Publishable package: `@khoralabs/agent-net` ([`packages/harness`](packages/harness)).

GitHub Actions: [`.github/workflows/release.yml`](.github/workflows/release.yml) (`workflow_dispatch` with a semver, or push a `v*` tag). Requires repository secret `NPM_TOKEN` (or `NPM_CONFIG_TOKEN`).

## Scripts

| Script | Description |
| --- | --- |
| `bun run reference:start` | Start Khora + memories + relay + chat + local Workflow world |
| `bun run marketplace` | Marketplace CLI (primary reference demo) |
| `bun run swarm` | Swarm CLI (secondary) |
| `bun run typecheck` | Typecheck all workspace packages |
| `bun run swarm:test` | Swarm + harness unit tests |

Full env/ports table: [Env and CLI](docs/reference/env-and-cli.md).

Chat, relay, memories, and Khora host are consumed from npm (`@khoralabs/chat`, `@khoralabs/relay`, `@khoralabs/memories-node`, `@khoralabs/memories-service`, `@khoralabs/khora-host`, etc.).
