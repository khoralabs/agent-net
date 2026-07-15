# @khoralabs/agent-net

A network harness for integration testing, protocol experiments, and agent behavior studies against a **remote Khora host** and **remote relay**.

The harness starts locally:

- **Memories service** — SQLite-backed (vendored `@khoralabs/memories-service-*`)
- **Managed agent pool** — persisted Ed25519 identities registered on the remote Khora host via `@khoralabs/khora-client`

It does **not** embed `@khoralabs/khora-server` or the relay. Point `khoraBaseUrl` / `relayBaseUrl` (or `KHORA_BASE_URL` / `RELAY_BASE_URL`) at running hosts.

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

// Khora host + relay must already be running
const harness = await startNetworkHarness({
  dataDir,
  khoraBaseUrl: process.env.KHORA_BASE_URL ?? "http://127.0.0.1:8788",
  relayBaseUrl: process.env.RELAY_BASE_URL ?? "http://127.0.0.1:8790",
});

const agent = await spawnWithMemories(harness);

console.log("Khora:", harness.serverBaseUrl);
console.log("Relay:", harness.relayBaseUrl);
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
harness.stop(); // stops local memories only
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
  relayBaseUrl: string;  // required remote relay, e.g. http://127.0.0.1:8790
  memoriesPort?: number;
  sqlCipherKey?: string;
};
```

Env fallbacks used by swarm / tests:

- Khora: `KHORA_SERVER_URL`, `HARNESS_KHORA_BASE_URL`, `KHORA_BASE_URL`
- Relay: `RELAY_SERVER_URL`, `HARNESS_RELAY_BASE_URL`, `RELAY_BASE_URL`

### `NetworkHarnessHandle`

```ts
type NetworkHarnessHandle = {
  serverBaseUrl: string;
  relayBaseUrl: string;
  memoriesBaseUrl: string;
  agentDids: readonly string[];
  memoriesClient: MemoriesServiceClient;
  pool: ManagedAgentPool;
  chat: HarnessChat;
  signedChat: SignedChatBackend;
  stop(): void;

  // Agent facade used by swarm and other orchestrators
  spawn(): Promise<AgentHandle>;
  registerAgent(input): Promise<{ staticHash: string }>;
  ensureAgentRegistered(input): Promise<void>;
  resolveAgentWorkflowDeps(agent, opts): Promise<HarnessAgentWorkflowDeps>;
  bindNetworkSession(input): void;
  unbindNetworkSession(sessionId): void;
};
```

`spawnWithMemories(harness)` remains as a thin wrapper around `harness.spawn()`.

## Workspace packages

| Package | Path | Role |
| --- | --- | --- |
| `@khoralabs/agent-net` | repo root `src/` | Network harness library |
| `@khoralabs/agent-net-swarm` | `packages/swarm` | Budgeted multi-agent orchestration on a harness |

## Data layout

```
dataDir/
  memories/         # Memories service SQLite files
  chat/             # Signed chat DB
  agents/
    agents.json
    agents/
      did_key_...json
```

## Integration tests

Harness e2e tests under `src/tests/` are skipped unless both Khora and relay URLs are set:

```bash
KHORA_BASE_URL=http://127.0.0.1:8788 \
RELAY_BASE_URL=http://127.0.0.1:8790 \
bun test src/tests
```

## Notes

- Memories service uses `createNoneAuthStrategy` — local/trusted use only.
- Each agent's memories database uses `{ kind: "account", ownerKey: did }`.
- `startRelayServer` remains available for local/dev wiring outside the harness.

## Manual network vs automated swarm

**Core harness** (`@khoralabs/agent-net`) — connect to remote Khora + relay, spawn agents, connect inboxes, run signed chat.

**Automated swarm** (`@khoralabs/agent-net-swarm`) — takes a `NetworkHarnessHandle`, spawns N agents, runs agent loops until a shared token budget is exhausted.

```bash
bun run swarm -- \
  --khora-url http://127.0.0.1:8788 \
  --relay-url http://127.0.0.1:8790 \
  --agents 2
# or: export KHORA_BASE_URL=... RELAY_BASE_URL=...
```