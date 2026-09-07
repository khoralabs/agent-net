---
name: agent-net-cli-agents
description: Spawn, list, get, remove custodial agents and watch the pool inbox.
---

# Agents / inbox

```bash
agent-net agent spawn --json [--ontology ./ontology.json] [--external-id name]
agent-net agent list --json
agent-net agent get --did did:key:… --json
agent-net agent remove --did did:key:… --json
agent-net inbox watch --json   # NDJSON until SIGINT
```

Default ontology is `minimalAgentMemoriesOntology` when `--ontology` is omitted.
