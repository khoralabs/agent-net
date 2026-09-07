# @khoralabs/agent-net-cli

Headless CLI for the [`@khoralabs/agent-net`](../harness) network harness.

## Install

```bash
bun add -g @khoralabs/agent-net-cli
# or from this workspace:
bun run cli -- help
```

## Quick start

```bash
export AGENT_NET_NO_INTERACTIVE=1

agent-net setup -y \
  --khora-url http://127.0.0.1:8788 \
  --relay-url http://127.0.0.1:8790 \
  --memories-url http://127.0.0.1:8791 \
  --chat-url http://127.0.0.1:8792 \
  --chat-token "$CHAT_INTERNAL_TOKEN" \
  --memories-admin-token "$MEMORIES_SERVICE_ADMIN_TOKEN" \
  --json

agent-net doctor --json
agent-net agent list --json
```

## Skills

```bash
agent-net skills install -y
# or from the central catalog after publish:
bunx skills add khoralabs/skills --skill agent-net-cli -y
```

Skills publish to `khoralabs/skills` is a **separate** workflow (`publish-agent-net-cli-skills`) and does not block npm release. See [RELEASE.md](./RELEASE.md).

## Commands

| Command | Purpose |
|---------|---------|
| `setup` | Write config under dataDir |
| `config show` / `config set` | Inspect / patch config |
| `doctor` | Connectivity + token checks |
| `agent spawn\|list\|get\|remove` | Custodial agent lifecycle |
| `inbox watch` | NDJSON inbox stream |
| `skills install` | Install bundled skill via `bunx skills` |
