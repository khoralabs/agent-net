# AGENTS.md — `@khoralabs/agent-net`

Guidance for coding agents working in this package. Closest [`AGENTS.md`](https://agents.md) wins for nested paths; user chat overrides everything.

Consumer-facing architecture (control plane vs host, Workflow peel): [`docs/explanation/architecture.md`](../../docs/explanation/architecture.md). Docs hub: [`docs/README.md`](../../docs/README.md).

## Package overview

- **Control plane** (`src/agent`, `src/pool`, `src/lib`, root `src/index.ts`): identities, pool, inbox, social, memories, network events — framework-free of AI SDK / Workflow directives.
- **AI SDK** (`src/ai-sdk`, `@khoralabs/agent-net/ai-sdk`): streamText turns, structured helpers, tool capture. No Workflow directives.
- **Swarm session/config** (`src/swarm`, `@khoralabs/agent-net/swarm`): `provideHarnessForSession`, `provideOntologyForSession`, `SwarmConfig`.
- **Swarm run helpers** (`@khoralabs/agent-net/swarm-run`): directive-free setup/assemble/state helpers for hosts that own durable wrappers.

## Entrypoints

| Consumer import | Source |
|-----------------|--------|
| `@khoralabs/agent-net` | `src/index.ts` |
| `@khoralabs/agent-net/agent` | `src/agent/index.ts` |
| `@khoralabs/agent-net/pool` | `src/pool/index.ts` |
| `@khoralabs/agent-net/ai-sdk` | `src/ai-sdk/index.ts` |
| `@khoralabs/agent-net/swarm` | `src/swarm/index.ts` |
| `@khoralabs/agent-net/swarm-run` | `src/swarm/run.ts` |

**Do not** re-export swarm symbols from `src/index.ts` or other non-swarm entrypoints. Published export map: [`docs/reference/entrypoints.md`](../../docs/reference/entrypoints.md).

## Hosts own Workflow directives

Published barrels and `dist` must contain **zero** `"use workflow"` / `"use step"` strings. Library = run helpers + types + toolkits. Thin durable wrappers live in the host (reference template: `apps/reference/src/workflows/`).

## Import boundary (required)

Allowed:

- `src/swarm/**` may import from `src/agent/**`, `src/pool/**`, `src/lib/**` (relative paths preferred).
- `src/ai-sdk/**` may import from agent/pool/lib.

Forbidden:

- `src/agent/**`, `src/pool/**`, `src/lib/**`, and root `src/index.ts` must **never** import anything under `src/swarm/` or `src/ai-sdk/`.

## Swarm public API

`src/swarm/index.ts` barrel (session/config only):

- `provideHarnessForSession` / `provideOntologyForSession`
- `SwarmConfig`

Run helpers (setup, assemble, state) are on `@khoralabs/agent-net/swarm-run`. Orchestrator / step wrappers are host-owned.

## Tests

- Swarm unit/integration tests live under `src/swarm/*.test.ts`.
- Harness e2e and pool/agent tests stay under existing harness test dirs (not under `src/swarm/`).

## Verify after structural edits

```bash
bun run --filter @khoralabs/agent-net typecheck
bun run swarm:test   # from agent-net repo root
rg '"use workflow"|"use step"' packages/harness/dist
```
