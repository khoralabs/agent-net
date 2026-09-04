# ADR 0001: Diátaxis docs layout

## Status

Accepted

## Context

Consumer documentation was scattered across mixed package READMEs. The dependency graph page under `packages/harness/docs/` was not linked from any README. Agent-review documentation skills already describe Diátaxis quadrants, README roles, and ADRs, but the product tree did not apply them. Without a single hub, new docs tend to grow inside READMEs and mix teaching with reference.

## Decision

We will keep consumer documentation under root `docs/` with four Diátaxis directories — `tutorials/`, `how-to/`, `explanation/`, and `reference/` — plus `docs/README.md` as the index and `docs/adr/` for durable architecture decisions.

Package and app READMEs stay thin: short description, install or run pointers, and links into `docs/`. Contributor files (`AGENTS.md`, `GAPS.md`) stay meta and are not the consumer docs surface. Each page serves one Diátaxis job; cross-link instead of mixing quadrants on one page. Published documentation cites Diátaxis and agent-net facts only.

## Consequences

### Positive

- Predictable place for new tutorials, how-tos, explanations, and reference
- Clear README vs docs ownership reduces mixed pages
- Project ADRs remain after individual workstreams close

### Negative

- Existing README content must be migrated or thinned in a dedicated pass
- Authors must choose a quadrant before writing

### Neutral

- Empty quadrant listings are acceptable until real pages land; do not ship empty stub pages with TODO placeholders
