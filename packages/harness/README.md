# @khoralabs/agent-net

Network harness library: agent pool, remote Khora/relay/memories clients, signed chat, agent tools, and durable turn workflows.

## Workflow world

Harness workflows use the abstract [Workflow SDK](https://useworkflow.dev) APIs (`"use workflow"`, `"use step"`, `start`). They do **not** select a world backend.

The process that hosts the workflow worker must configure the world **before** running workflows — for example set `WORKFLOW_TARGET_WORLD` / `WORKFLOW_TURSO_DATABASE_URL` and call `getWorld().start()`. The reference app (`apps/reference`) does this for Turso and also starts optional local memories/relay servers.

## Usage

```ts
import { startNetworkHarness, spawnWithMemories } from "@khoralabs/agent-net";

const harness = await startNetworkHarness({
  dataDir,
  khoraBaseUrl,
  relayBaseUrl,
  memoriesBaseUrl,
});
const agent = await spawnWithMemories(harness);
```
