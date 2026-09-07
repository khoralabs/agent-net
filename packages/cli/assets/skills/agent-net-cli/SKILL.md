---
name: agent-net-cli
description: >
  Use this skill to operate the agent-net network harness headlessly via the
  agent-net CLI. Activate for setup/config, doctor connectivity checks, spawning
  or listing custodial agents, removing agents, or watching the multiplex inbox.
compatibility: Requires Bun. The agent-net CLI binary must be on PATH (or invoke via bun).
---

# Agent-net CLI (router)

Control-plane CLI for `@khoralabs/agent-net`. Each mutating command opens an ephemeral
harness against configured Khora / relay / memories / chat URLs, then stops.

## Critical: non-interactive mode

```bash
export AGENT_NET_NO_INTERACTIVE=1
```

Prefer `--json` for machine-readable output.

## Sub-skills

| Need | Load |
|------|------|
| Non-interactive recipes | [how-to/SKILL.md](how-to/SKILL.md) |
| Config / doctor / infra URLs | [connect/SKILL.md](connect/SKILL.md) |
| Agent spawn/list/get/remove / inbox | [agents/SKILL.md](agents/SKILL.md) |

## Install this skill

```bash
bunx skills add khoralabs/skills --skill agent-net-cli -y
# or version-matched from the CLI package:
agent-net skills install -y
```
