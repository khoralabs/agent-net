# Getting started

Run the reference stack and the marketplace demo. Success means the orchestrator stays up in one terminal and marketplace starts in a second terminal against the printed service URLs.

## Prerequisites

- [Bun](https://bun.sh) installed
- From the agent-net workspace root: `bun install`
- An `AI_GATEWAY_API_KEY` for marketplace LLM calls

## Lesson

### 1. Start the reference orchestrator

In **terminal 1**, leave this process running. Data lands under `apps/reference/.data`.

```bash
bun run reference:start
```

The orchestrator embeds Khora, memories, relay, chat, and a Workflow local world. Note the base URLs it prints (or use the pinned ports below).

### 2. Export service URLs

In **terminal 2**, export values that match the orchestrator (pinned reference ports):

```bash
export KHORA_BASE_URL=http://127.0.0.1:8788
export RELAY_BASE_URL=http://127.0.0.1:8790
export MEMORIES_BASE_URL=http://127.0.0.1:8791
export CHAT_BASE_URL=http://127.0.0.1:8792
export CHAT_INTERNAL_TOKEN=reference-chat-token
export AI_GATEWAY_API_KEY=…
```

Do not stop the orchestrator with ^C while marketplace is running.

### 3. Run marketplace

```bash
bun run marketplace
```

Marketplace is the primary demo: buy/sell pool, percolator inbox, seller evaluate, Vellum connect, buyer invite accept/decline. It ends at **mutual interest** (stop before NBC negotiation turns).

Optional secondary demo:

```bash
bun run swarm -- --agents 2
```

## What you just composed

The reference host wires servers; marketplace CLIs consume `@khoralabs/agent-net`, which calls those services as clients. See [architecture](../explanation/architecture.md) and [system roles](../explanation/system-roles.md).

## Next

- [How to host a Workflow world](../how-to/host-workflow-world.md)
- [Env and CLI reference](../reference/env-and-cli.md)
