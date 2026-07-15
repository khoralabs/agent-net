# @khoralabs/agent-net-swarm

Budgeted multi-agent orchestration library on top of `@khoralabs/agent-net`.

Exports `setupSwarm`, `swarmOrchestrator`, session helpers, and related types. It does **not** select a Workflow world or host memories/relay.

Run the swarm CLI from the reference app (which configures Turso and wires remote URLs):

```bash
# from the agent-net repo root
bun run swarm -- \
  --khora-url http://127.0.0.1:8788 \
  --relay-url http://127.0.0.1:8790 \
  --memories-url http://127.0.0.1:8791 \
  --agents 2

bun run --filter @khoralabs/agent-net-swarm test
```

The hosting process must configure/start the Workflow world before `start(swarmOrchestrator, …)`.
