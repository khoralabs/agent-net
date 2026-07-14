# @khoralabs/agent-net

A local network harness for running an end-to-end Khora environment in a single process. Useful for integration testing, protocol experiments, and agent behavior studies.

The harness composes three things:

- **Khora server** — a full `Bun.serve`-based host node (via `@khoralabs/khora-server`)
- **Memories service** — a local SQLite-backed memories database service (via `@khoralabs/memories-service-storage-sqlite`)
- **Managed agent pool** — agents with persisted Ed25519 identities, each registered on the server (integration layer under `src/agents/`)

All components bind to random free ports by default, so multiple harness instances can run concurrently without collision.

## Quick start

```ts
import { startNetworkHarness, spawnWithMemories } from "@khoralabs/agent-net";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dataDir = mkdtempSync(path.join(tmpdir(), "khora-harness-"));

const harness = await startNetworkHarness({ dataDir });

// Spawn an agent and open their memories database in one step
const agent = await spawnWithMemories(harness);

console.log("Server:", harness.serverBaseUrl);
console.log("Agent DID:", agent.did);

// Connect the agent's inbox
const conn = agent.connectInbox({
  onEvent: (e) => console.log("inbox event", e),
  onLifecycle: (status) => console.log(agent.did, status),
});

// Write to the agent's memories database
await agent.memories.client.mergeMemory({
  namespace: "notes",
  key: "observation-1",
  content: [{ type: "text", text: "..." }],
});

conn.close();
harness.stop();
```

## Spawning agents

### `spawnWithMemories(harness)`

The primary way to add agents to a harness. Registers a new agent on the Khora server, opens a memories database for it, binds chat, and returns a single `AgentHandle` — so you never have to construct or track a `MemoriesDatabaseId` manually.

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

Spawn multiple agents and work with them concurrently:

```ts
const agents = await Promise.all(
  Array.from({ length: 4 }, () => spawnWithMemories(harness))
);

const connections = agents.map((agent) =>
  agent.connectInbox({
    onEvent: (e) => console.log(agent.did, e),
  })
);
```

### Manual pool control

When you need lower-level control, bypass `spawnWithMemories` and use `harness.pool` directly. The `spawn`, `remove`, and `focus` methods each accept an optional positional callback that fires with an `AgentHandle`:

```ts
// spawn — callback fires after registration, before returning DID
const did = await harness.pool.spawn(async (handle) => {
  // set up anything the agent needs at birth
  await harness.memoriesClient.openDatabase({ kind: "account", ownerKey: handle.did });
});

// remove — callback fires before unregistering, while the agent is still live
await harness.pool.remove(did, async (handle) => {
  await harness.memoriesClient.closeDatabase({ kind: "account", ownerKey: handle.did });
});

// focus — load a persisted agent by DID, callback fires before the handle is returned
const handle = await harness.pool.focus(did, async (handle) => {
  // lazy per-focus setup
});
```

## Working with the memories service

### Shared `memoriesClient`

`harness.memoriesClient` is a `MemoriesServiceClient` pointed at the harness memories service. Use it for management operations that span multiple agents or don't go through `spawnWithMemories`:

```ts
// List all open databases
const dbs = await harness.memoriesClient.listDatabases();

// Open a database for an agent that was spawned without spawnWithMemories
await harness.memoriesClient.openDatabase({ kind: "account", ownerKey: did });

// Check whether a database file exists (e.g. after a harness restart)
const live = await harness.memoriesClient.databaseExists({ kind: "account", ownerKey: did });

// Close and delete a database
await harness.memoriesClient.closeDatabase({ kind: "account", ownerKey: did });
await harness.memoriesClient.deleteDatabase({ kind: "account", ownerKey: did });
```

### Per-agent `AgentMemoriesClient`

The `agent.memories` object returned by `spawnWithMemories` is a thin wrapper with `database` pre-bound. Use `agent.memories.client` for runtime memory operations — same typed API agent tools use, with the harness ontology already applied:

```ts
// Search the agent's memories database
const results = await agent.memories.client.search({
  query: "...",
  namespace: "notes",
});

// Merge a memory into the agent's database
await agent.memories.client.mergeMemory({
  namespace: "notes",
  key: "observation-1",
  content: [{ type: "text", text: "..." }],
});
```

`agent.memories.client` is lazy-init: the capabilities handshake runs on the first search/merge/delete call, not at spawn time. Use `agent.memories.serviceClient` for lifecycle operations and other wire routes not covered by `MemoriesClientAsync`.

## Connecting agent inboxes

`agent` from `spawnWithMemories` is an integration-layer `AgentHandle`. Call `connectInbox` to open a reconnecting WebSocket to the server:

```ts
const conn = agent.connectInbox({
  onEvent(event) {
    // fired for each inbox event (excluding derived/internal kinds)
    console.log(event.type, event);
  },
  onLifecycle(status, detail) {
    // "connected" | "disconnected" | "connect_failed" | "reconnecting" | "stopped"
    console.log(agent.did, status, detail);
  },
});

// Tear down when done
conn.close();
```

Multiple agents' connections run independently and can be open simultaneously.

## Standalone memories service

Use `startMemoriesService` if you want a memories HTTP server without the full harness:

```ts
import { startMemoriesService } from "@khoralabs/agent-net";

const svc = startMemoriesService({ dataDir: "/tmp/memories", sqlCipherKey: "my-key" });
// svc.baseUrl  — "http://localhost:<port>"
// svc.port
// svc.stop()
```

## API reference

### `startNetworkHarness(opts)`

```ts
type NetworkHarnessOptions = {
  dataDir: string;       // Root directory for all persisted state
  serverPort?: number;   // Khora server port (default: random)
  memoriesPort?: number; // Memories service port (default: random)
  sqlCipherKey?: string; // SQLCipher passphrase for all databases
  outboxKeyHex?: string; // 64-char hex outbox field encryption key
  cellPoolCount?: number;// Colonnade cell pool size (default: 2)
};
```

Default encryption keys are baked in for local use — override them for any environment where data must be protected.

### `NetworkHarnessHandle`

```ts
type NetworkHarnessHandle = {
  serverBaseUrl: string;              // e.g. "http://localhost:54321"
  memoriesBaseUrl: string;            // e.g. "http://localhost:54322"
  agentDids: readonly string[];       // DIDs of all agents currently in the pool
  memoriesClient: MemoriesServiceClient; // Shared management client
  pool: ManagedAgentPool;             // Direct pool access
  stop(): void;                       // Shut down server + memories service
};
```

`stop()` does **not** unregister agents — their persisted key material under `dataDir` survives for the next run. Call `pool.remove(did)` first if you want clean network teardown.

## Data layout

```
dataDir/
  server/           # Khora catalog + colonnade cell files
  memories/         # Memories service SQLite files (one per agent database)
  agents/
    agents.json     # Registry of managed agent DIDs → key file paths
    agents/
      did_key_...json   # Persisted Ed25519 key material per agent
```

## Notes

- The memories service uses `createNoneAuthStrategy` — it is intended for local/trusted use only.
- `useCellWorkers` is always `false` in the harness; Bun worker threads are unnecessary for local experiments.
- Each agent's memories database uses `{ kind: "account", ownerKey: did }` as its `MemoriesDatabaseId`.

## Manual network vs automated swarm

This package has two layers:

**Core harness** (default export `@khoralabs/agent-net`) — start a local Khora network, spawn agents with handles, connect inboxes, and run signed chat manually. You own lifecycle and orchestration.

**Automated swarm** (`@khoralabs/agent-net/swarm`) — a recipe on top of the same harness: spawns N agents, assembles turn context from inbox + threads, runs agent loops until a shared token budget is exhausted, and records attribution events.

```ts
import { startNetworkHarness, spawnWithMemories } from "@khoralabs/agent-net";
import { swarmOrchestrator } from "@khoralabs/agent-net/swarm";
```

Shared observability and session types live under `@khoralabs/agent-net/network`.
