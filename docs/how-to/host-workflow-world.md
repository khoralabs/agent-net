# How to host a Workflow world

Hosts own Workflow SDK durable wrappers. The harness publishes **directive-free** run helpers only — published `@khoralabs/agent-net` barrels must not contain `"use workflow"` / `"use step"` strings.

## When to use this

You are building an app (or extending the reference app) that runs durable agent or swarm workflows on top of the harness.

## Configure the world before workflows

The process that hosts the workflow worker must configure and start a world **before** running workflows.

Typical local setup:

1. Set `WORKFLOW_TARGET_WORLD=local` (and optionally `WORKFLOW_LOCAL_DATA_DIR`).
2. Call `getWorld().start()` (or the equivalent for your world backend).
3. Keep thin durable wrappers in the **host** — copy or adapt templates from `apps/reference/src/workflows/`.
4. Import directive-free bodies from harness exports such as `@khoralabs/agent-net/agent-response-run` and `@khoralabs/agent-net/swarm-run`.

The reference app uses the [Workflow local world](https://workflow-sdk.dev/worlds/local) (`configureLocalWorldEnv` / `startLocalWorldWorker`) and also starts local memories, relay, chat, and Khora servers so the harness has something to call.

## What the harness does not do

- Select a world backend
- Ship `"use workflow"` / `"use step"` in published packages
- Embed relay / chat / memories / khora (pass base URLs instead)

See [architecture](../explanation/architecture.md) for why Workflow directives stay host-owned.

## Optional peers

Install `ai`, `workflow`, and `@khoralabs/agent-capabilities-ai-sdk` when using `@khoralabs/agent-net/ai-sdk` or host Workflow wrappers. They are optional peer dependencies of the harness.
