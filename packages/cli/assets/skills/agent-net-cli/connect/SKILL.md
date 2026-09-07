---
name: agent-net-cli-connect
description: Configure and verify connections to Khora, relay, memories, and chat.
---

# Connect / config

Resolved merge order: flags → config file → env → defaults.

- Config path: `--config` / `AGENT_NET_CONFIG` / `~/.agent-net/cli.config.json`
- Env: `KHORA_BASE_URL`, `RELAY_BASE_URL`, `MEMORIES_BASE_URL`, `CHAT_BASE_URL`,
  `CHAT_INTERNAL_TOKEN`, `MEMORIES_SERVICE_ADMIN_TOKEN`, `HARNESS_IDENTITY_WRAP_KEY`

```bash
agent-net config show --json
agent-net doctor --json
```
