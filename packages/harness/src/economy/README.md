# `@khoralabs/agent-net/economy`

Agent-based computational economics (ACE) testbed — a swarm sibling for autonomous private-objective actors. The actor-driven society runtime is primary; round APIs remain available for legacy experiments.

This entrypoint does **not** export Workflow orchestrators. Hosts own durable directives (see `apps/reference/src/workflows/economy.ts`).

## Entrypoints

| Import | Purpose |
|--------|---------|
| `@khoralabs/agent-net/economy` | Config/session APIs, scenario types, setup handoff helpers |
| `@khoralabs/agent-net/economy-run` | Directive-free runtime (`setupEconomy`, `runEconomyRound`, NBC runner, …) |

```ts
import {
  deferredEncounterRunner,
  runEconomyUntilDone,
  setupEconomy,
  teardownEconomy,
  type EconomyConfig,
  type EconomyScenario,
} from "@khoralabs/agent-net/economy-run";

const { sessionId } = await setupEconomy({ harness, config, ontology, scenario });
try {
  await runEconomyUntilDone({ sessionId, encounterRunner: deferredEncounterRunner });
} finally {
  await teardownEconomy(sessionId);
}
```

Hosts that wire the Workflow SDK Bun client transform can instead `start(economyOrchestrator, …)` from `apps/reference/src/workflows/economy.ts`.

## Contracts

- **`EconomyConfig`** — session, actors, compute token budget, max rounds, model. Never includes service credentials.
- **`EconomyScenario`** — host-injected hooks: `prepareActors`, `prepareRound`, `scheduleEncounters`, `afterEncounter`, `shouldTerminate`. Market institutions (prices, auctions, reputation) stay scenario-owned.
- **`SocietyConfig`** — persistent actor identities, compute admission, per-actor turn limits, concurrency, and wake cadence.
- **`SocietyScenario`** — initial conditions, private observations, environmental consequences, and termination only. Actors choose actions and peers.
- Private objectives live in personal memories / opaque `scenarioState`. Shared `NetworkEvent` payloads redact them.

## Integration boundary

The published dependencies already provide Khora posts/search/relationships, personal memory search/write/edit, relay channels, Vellum chains, and OBP replicas. Economy composes those APIs locally; it does not patch installed packages or infer durable relationships from ephemeral Vellum session ids. Protocol offers, ports, binds, outcomes, and model usage must come from their source records rather than harness defaults.

## Lifecycle

1. `setupEconomy` spawns/registers persistent actors and binds network dependencies.
2. `createSocietyRuntime` delivers durable mailbox wakes and runs one serialized decision lane per actor.
3. Actor tools create invitations; accepted invitations open explicitly addressed Vellum/NBC chains.
4. `teardownEconomy` stops negotiation, unbinds the session, and releases the harness.

`runEconomyRound` and `runEconomyUntilDone` remain compatibility APIs for legacy scheduled experiments.

Compute budgets (`maxTokenBudget`) are distinct from any scenario-defined economic resources.

## Negotiation

`createEconomyNegotiateRuntime` owns a per-session Vellum chain registry + `NbcLoopHost`. Use `createEconomyNbcEncounterRunner` for live turns, or `deferredEncounterRunner` for lifecycle smoke tests.

## Experience index

After each encounter, `indexEconomyExperience` writes immutable per-agent summaries and offer/port repertoire provenance, optionally projecting into the private `economy/encounters` memory namespace. It does not auto-select conventions.

## CLI (reference)

Economy does not start Khora/memories/relay/chat. Start the reference stack in one terminal, then run economy in another (same pattern as marketplace/swarm):

```bash
cd apps/reference
bun run start          # khora :8788 + memories/relay/chat
# other terminal:
bun run economy -- \
  --actors 2 \
  --max-actor-turns 2 \
  --cadence-ms 1000
```

The production cadence default is 60 seconds. The shorter smoke cadence above makes periodic wakes visible quickly.

## Plugging in experiments

Implement `EconomyScenario`, register it, and pass its id to the host orchestrator. Derive metrics (convention reuse, welfare, reputation) from longitudinal `economy.*` events and experience rows — the harness emits raw data, not scientific summaries.
