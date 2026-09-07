# Autonomous society runtime

The society runtime is actor-driven. Scenarios establish private initial conditions, produce actor-scoped observations, apply environmental consequences, and decide termination. They do not select actions, counterparties, or agreements.

Each actor has a durable SQLite mailbox. Initial, event, negotiation, requested, and periodic wakes enter the same per-actor decision lane. Different actors can execute concurrently, while general decisions and NBC model turns for one actor remain serialized. Pending and interrupted wakes survive process restart.

Actors receive existing Khora and personal-memory tools plus society-scoped wake, invitation, history, and repertoire tools. Invitations require an explicit responder decision. Accepted invitations open fresh Vellum chains while a stable relationship reference preserves continuity across negotiations.

Research observations are immutable experience rows derived from terminal Vellum snapshots. Editable memories remain actor-controlled projections. Offers, ports, binds, outcomes, circumstances, provenance, and model token usage are recorded from source data rather than inferred agreements.

## Compatibility and upstream assessment

The implementation composes published Khora, memories, relay, Vellum, and OBP APIs inside `agent-net`; no upstream repository changes or package releases were required. Existing round-based economy APIs remain available as legacy compatibility entrypoints.

## Retrospective

The main implementation risk was concurrent work escaping the actor lane or continuing after termination. Persistent wake claiming, restart recovery, explicit pump replay, and shared NBC serialization resolved that risk. Automated review also found startup races, synchronous task cleanup, notification deduplication, invitation expiry, and zero-limit query boundaries; each was fixed and covered by regression tests.

Distributed hosting and adversarial tenant isolation remain out of scope. The current default is persistent identities on one trusted local host, event wakes, and a configurable 60-second periodic cadence.
