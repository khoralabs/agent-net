# AGENTS.md — `@khoralabs/agent-net`

Guidance for coding agents working in this package. Closest [`AGENTS.md`](https://agents.md) wins for nested paths; user chat overrides everything.

## Package overview

- **Control plane** (`src/agent`, `src/pool`, `src/lib`, root `src/index.ts`): identities, pool, inbox, social, memories, durable turns, network events.
- **Orchestration** (`src/swarm`): budgeted multi-agent loops on top of the control plane. Opinionated policy — not part of the root public API.

## Entrypoints

| Consumer import | Source |
|-----------------|--------|
| `@khoralabs/agent-net` | `src/index.ts` |
| `@khoralabs/agent-net/agent` | `src/agent/index.ts` |
| `@khoralabs/agent-net/pool` | `src/pool/index.ts` |
| `@khoralabs/agent-net/swarm` | `src/swarm/index.ts` |

**Do not** re-export swarm symbols from `src/index.ts` or other non-swarm entrypoints.

## Import boundary (required)

Allowed:

- `src/swarm/**` may import from `src/agent/**`, `src/pool/**`, `src/lib/**` (relative paths preferred).

Forbidden:

- `src/agent/**`, `src/pool/**`, `src/lib/**`, and root `src/index.ts` must **never** import anything under `src/swarm/`.

If orchestration needs a new harness capability, add it to agent/pool (or a dedicated harness subpath) and call it from swarm — do not create a reverse dependency.

## Swarm public API

Keep the `src/swarm/index.ts` barrel small:

- `swarmOrchestrator`
- `provideHarnessForSession` / `provideOntologyForSession`
- `SwarmConfig`

Leave setup/teardown, agent loops, and step helpers unexported unless intentionally promoting them.

## Tests

- Swarm unit/integration tests live under `src/swarm/*.test.ts`.
- Harness e2e and pool/agent tests stay under existing harness test dirs (not under `src/swarm/`).

## Verify after structural edits

```bash
bun run --filter @khoralabs/agent-net typecheck
bun run swarm:test   # from agent-net repo root
```
