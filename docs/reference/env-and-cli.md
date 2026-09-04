# Env and CLI

Workspace scripts, reference ports, and environment variables used by the local stack.

## Workspace scripts

From the agent-net repo root:

| Script | Description |
|--------|-------------|
| `bun run reference:start` | Start Khora + memories + relay + chat + local Workflow world |
| `bun run marketplace` | Marketplace CLI (primary reference demo) |
| `bun run swarm` | Swarm CLI (secondary) |
| `bun run typecheck` | Typecheck all workspace packages |
| `bun run swarm:test` | Swarm + harness unit tests |

Inside `apps/reference`, `bun run start` / `bun run marketplace` / `bun run swarm` are the package-local equivalents.

## Reference orchestrator ports

Pinned when using the reference orchestrator (match `.env` / printed URLs):

| Service | Default |
|---------|---------|
| Khora | `http://127.0.0.1:8788` |
| Relay | `http://127.0.0.1:8790` |
| Memories | `http://127.0.0.1:8791` |
| Chat | `http://127.0.0.1:8792` |

Data directory: `apps/reference/.data`.

## Common environment variables

| Variable | Used by | Notes |
|----------|---------|-------|
| `KHORA_BASE_URL` | Harness / CLIs | Khora host HTTP base |
| `RELAY_BASE_URL` | Harness / CLIs | Relay HTTP base |
| `MEMORIES_BASE_URL` | Harness / CLIs | Memories service HTTP base |
| `CHAT_BASE_URL` | Harness / CLIs | Chat HTTP base |
| `CHAT_INTERNAL_TOKEN` | Chat auth | Reference default: `reference-chat-token` |
| `AI_GATEWAY_API_KEY` | Marketplace / LLM demos | Required for marketplace |
| `LOG_LEVEL` | Reference observability | Optional pino level |
| `WORKFLOW_TARGET_WORLD` | Host Workflow world | e.g. `local` |
| `WORKFLOW_LOCAL_DATA_DIR` | Local world | Optional |

Harness `startNetworkHarness` also accepts `memoriesAdminToken`, `chatToken`, optional `khoraAdminToken`, and optional `identitySecret` in code (see package Target DX in the harness README).

## Related

- [Getting started](../tutorials/getting-started.md)
- [Dependency graph](dependency-graph.md)
