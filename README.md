# @khoralabs/agent-net

A network harness for integration testing, protocol experiments, and agent behavior studies against a **remote Khora host**.

The harness starts locally:

- **Memories service** — SQLite-backed (vendored `@khoralabs/memories-service-*`)
- **Relay server** — for Vellum/OBP channels (vendored `@khoralabs/relay-server-http`)
- **Managed agent pool** — persisted Ed25519 identities registered on the remote Khora host via `@khoralabs/khora-client`

It does **not** embed `@khoralabs/khora-server`. Point `khoraBaseUrl` (or `KHORA_BASE_URL`) at a running host.

## Setup

```bash
git submodule update --init --recursive   # or: bun run submodules:init
bun install
```

Vendored git submodules under `vendor/`:

| Path | Repo |
| --- | --- |
| `vendor/memories` | memories |
| `vendor/relay` | relay |
| `vendor/chat` | chat |
| `vendor/libs` | libs (observability, …) |

Published clients (npm): `@khoralabs/khora-client@^0.1.0`, `@khoralabs/vellum-client@^0.1.0` (contracts re-exported from those packages).

## Quick start

```ts
import { startNetworkHarness, spawnWithMemories } from "@khoralabs/agent-net";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dataDir = mkdtempSync(path.join(tmpdir(), "khora-harness-"));

// Khora host must already be running (e.g. apps/khora/server on :8788)
const harness = await startNetworkHarness({
  dataDir,
  khoraBaseUrl: process.env.KHORA_BASE_URL ?? "http://127.0.0.1:8788",
});

const agent = await spawnWithMemories(harness);

console.log("Khora:", harness.serverBaseUrl);
console.log("Agent DID:", agent.did);

const conn = agent.connectInbox({
  onEvent: (e) => console.log("inbox event", e),
  onLifecycle: (status) => console.log(agent.did, status),
});

await agent.memories.client.mergeMemory({
  namespace: "notes",
  key: "observation-1",
  content: [{ type: "text", text: "..." }],
});

conn.close();
harness.stop(); // stops memories + relay only
```

## Spawning agents

### `spawnWithMemories(harness)`

Registers a new agent on the remote Khora host, opens a memories database, binds chat, and returns an `AgentHandle`.

```ts
const agent = await spawnWithMemories(harness);

agent.did                   // "did:key:z6Mk..."
agent.client                // KhoraClient
agent.connectInbox(...)     // reconnecting inbox WebSocket
agent.vellum(...)           // Vellum channel handle
agent.chat                  // AgentChatClient for this DID
agent.memories.database     // { kind: "account", ownerKey: "did:key:..." }
agent.memories.open()       // re-open after close
agent.memories.close()      // checkpoint and release the SQLite file
agent.memories.checkpoint() // flush WAL without closing
agent.memories.exists()     // boolean — useful after harness restarts
agent.memories.delete()     // permanently delete the database file
agent.memories.client       // RemoteMemoriesClientAsync — search, merge, delete (lazy-init)
agent.memories.serviceClient // MemoriesServiceClient for lifecycle and wire escape hatches
```

### Manual pool control

```ts
const did = await harness.pool.spawn(async (handle) => {
  await harness.memoriesClient.openDatabase({ kind: "account", ownerKey: handle.did });
});

await harness.pool.remove(did, async (handle) => {
  await harness.memoriesClient.closeDatabase({ kind: "account", ownerKey: handle.did });
});

const handle = await harness.pool.focus(did);
```

## API reference

### `startNetworkHarness(opts)`

```ts
type NetworkHarnessOptions = {
  dataDir: string;
  khoraBaseUrl: string;  // required remote host, e.g. http://127.0.0.1:8788
  memoriesPort?: number;
  relayPort?: number;
  sqlCipherKey?: string;
};
```

Env fallbacks used by swarm / tests: `KHORA_SERVER_URL`, `HARNESS_KHORA_BASE_URL`, `KHORA_BASE_URL`.

### `NetworkHarnessHandle`

```ts
type NetworkHarnessHandle = {
  serverBaseUrl: string;              // configured remote Khora URL
  relayBaseUrl: string;
  memoriesBaseUrl: string;
  agentDids: readonly string[];
  memoriesClient: MemoriesServiceClient;
  pool: ManagedAgentPool;
  chat: HarnessChat;
  stop(): void;                       // memories + relay only (not the remote host)
};
```

## Data layout

```
dataDir/
  memories/         # Memories service SQLite files
  relay/            # Local relay DB
  chat/             # Signed chat DB
  agents/
    agents.json
    agents/
      did_key_...json
```

## Integration tests

Harness e2e tests under `src/tests/` are skipped unless a Khora URL is set:

```bash
KHORA_BASE_URL=http://127.0.0.1:8788 bun test src/tests
```

## Notes

- Memories service uses `createNoneAuthStrategy` — local/trusted use only.
- Each agent's memories database uses `{ kind: "account", ownerKey: did }`.

## Manual network vs automated swarm

**Core harness** (`@khoralabs/agent-net`) — connect to a remote Khora host, spawn agents, connect inboxes, run signed chat.

**Automated swarm** (`@khoralabs/agent-net/swarm`) — spawns N agents on that harness, runs agent loops until a shared token budget is exhausted.

```bash
bun run swarm -- --khora-url http://127.0.0.1:8788 --agents 2
# or: export KHORA_BASE_URL=http://127.0.0.1:8788
```
