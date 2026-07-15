# @khoralabs/agent-net-swarm

Budgeted multi-agent orchestration on top of `@khoralabs/agent-net`.

The CLI creates a `NetworkHarnessHandle` (remote Khora + remote relay + local memories), then `setupSwarm({ harness, config })` spawns agents and runs durable workflow loops until the shared token budget is exhausted.

```bash
# from the agent-net repo root
bun run swarm -- \
  --khora-url http://127.0.0.1:8788 \
  --relay-url http://127.0.0.1:8790 \
  --agents 2

bun run --filter @khoralabs/agent-net-swarm test
```

```ts
import { startNetworkHarness, requireKhoraBaseUrl, requireRelayBaseUrl } from "@khoralabs/agent-net";
import { provideHarnessForSession, setupSwarm, swarmOrchestrator } from "@khoralabs/agent-net-swarm";

const harness = await startNetworkHarness({
  dataDir,
  khoraBaseUrl: requireKhoraBaseUrl(undefined),
  relayBaseUrl: requireRelayBaseUrl(undefined),
});
provideHarnessForSession(config.sessionId, harness);
await setupSwarm({ harness, config });
```
