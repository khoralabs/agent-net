---
name: agent-net-cli-how-to
description: Non-interactive agent-net CLI recipes with --json.
---

# How-to (non-interactive)

```bash
export AGENT_NET_NO_INTERACTIVE=1

agent-net setup -y \
  --data-dir "$PWD/.data" \
  --khora-url http://127.0.0.1:8788 \
  --relay-url http://127.0.0.1:8790 \
  --memories-url http://127.0.0.1:8791 \
  --chat-url http://127.0.0.1:8792 \
  --chat-token "$CHAT_INTERNAL_TOKEN" \
  --memories-admin-token "$MEMORIES_SERVICE_ADMIN_TOKEN" \
  --json

agent-net doctor --json
agent-net agent list --json
agent-net agent spawn --json
agent-net inbox watch --json
```
