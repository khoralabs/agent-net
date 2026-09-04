# Documentation

Documentation for the agent-net workspace follows the [Diátaxis](https://diataxis.fr) framework.

| Type | Purpose | Location |
|------|---------|----------|
| Tutorial | First end-to-end walkthrough | [tutorials/](tutorials/) |
| How-to | Task-oriented procedures | [how-to/](how-to/) |
| Explanation | Why systems fit together | [explanation/](explanation/) |
| Reference | Structural maps, entrypoints, env/CLI | [reference/](reference/) |

Architecture decisions that harden for the project live under [adr/](adr/).

## Tutorials

- [Getting started](tutorials/getting-started.md) — two-terminal marketplace path

## How-to

- [Host a Workflow world](how-to/host-workflow-world.md) — durable wrappers and local world setup

## Explanation

- [System roles](explanation/system-roles.md) — why each primary exists in agent-net
- [Architecture](explanation/architecture.md) — control plane vs host, Workflow peel

## Reference

- [Dependency graph](reference/dependency-graph.md) — layers, import surfaces, upgrade cascade
- [Entrypoints](reference/entrypoints.md) — published package exports and migration map
- [Env and CLI](reference/env-and-cli.md) — scripts, ports, environment variables

## ADRs

- [0001: Diátaxis docs layout](adr/0001-diataxis-docs-layout.md)
