# Architecture

How agent-net splits **library control plane** from **host process**, and how the reference app wires the stack the harness calls.

For why each primary package exists, see [system roles](system-roles.md). For dependency edges and upgrade planning, see the [dependency graph](../reference/dependency-graph.md).

## Control plane vs host

```text
reference orchestrator
  ├─ wires servers: khora-host, memories-service, relay/server, chat/http
  ├─ configures Workflow world (local world in the reference app)
  └─ CLIs import harness → which calls clients:
        khora-client, chat HTTP client, memories-service client,
        relay/client + vellum-client, memories-node, memories-agents
```

| Layer | Package | Owns |
|-------|---------|------|
| **Client / control plane** | `@khoralabs/agent-net` | Identities, pool, inbox, social, memories tools, negotiate, directive-free run helpers |
| **Host / process wiring** | `@khoralabs/agent-net-reference` (or any host) | Embedded or remote servers, Workflow durable wrappers, CLIs, demo domains |

The harness assumes base URLs and tokens; it does **not** embed relay, chat, memories, or khora. A host that already runs those services can point the harness at them. The reference app embeds them for zero-config local demos.

## Two foundation stacks

Transport/negotiate (`relay` → `chat`, `vellum-client`) and social/memory (`memories` → `khora`) are independent until a host + harness compose them. That meeting point is intentional: agents discover and socialize on Khora, remember in memories, message on chat, and negotiate on Vellum over relay.

## Workflow peel

Published harness barrels must contain **zero** `"use workflow"` / `"use step"` strings. The library ships directive-free run helpers and types. Thin durable wrappers (`start`, durable steps) live in the **host** — the reference templates are under `apps/reference/src/workflows/`.

Why peel: Workflow directives bind a package to a world backend and to the Workflow SDK’s bundling model. Keeping them host-owned lets `@khoralabs/agent-net` stay a control-plane library while apps choose local world, a remote world, or no Workflow at all.

The process that hosts the workflow worker must configure the world **before** running workflows (for example `WORKFLOW_TARGET_WORLD=local` and `getWorld().start()`).

## Harness internal layout (mental model)

| Area | Role |
|------|------|
| `pool/` | Identities, registry, invite bank, multiplex inbox, network events, observability install |
| `agent/` | One network actor: handle, social, memories, turn |
| `swarm/` | Budgeted orchestration **session/config** on top of the control plane (orchestrator wrappers stay host-owned) |
| `ai-sdk/` | Optional LLM helpers behind a separate export |

Swarm is **not** re-exported from the root entrypoint. Import boundaries and contributor rules live in `packages/harness/AGENTS.md`; this page explains the architectural why.

## Reference app shape

The reference app starts an orchestrator that brings up embedded Khora, memories, relay, chat, and a Workflow local world. Marketplace and swarm CLIs then talk to those services through the harness. Host-glue patterns that might promote into the library live under `apps/reference/src/patterns/`; marketplace domain code stays demo-specific (`marketplace/GAPS.md` tracks promotion candidates).
