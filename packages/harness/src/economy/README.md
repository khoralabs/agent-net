# `@khoralabs/agent-net/economy`

Agent-based computational economics (ACE) testbed — a swarm sibling for private-objective actors, rounds, and bilateral encounters.

This entrypoint does **not** export Workflow orchestrators. Hosts own durable directives (see `apps/reference/src/workflows/economy.ts`).

## Entrypoints

| Import | Purpose |
|--------|---------|
| `@khoralabs/agent-net/economy` | Config/session APIs, scenario types, setup handoff helpers |
| `@khoralabs/agent-net/economy-run` | Directive-free runtime (`setupEconomy`, `runEconomyRound`, NBC runner, …) |

```ts
import {
  provideEconomyHarnessForSession,
  provideEconomyOntologyForSession,
  type EconomyConfig,
  type EconomyScenario,
} from "@khoralabs/agent-net/economy";
import { start } from "workflow/api";
import { economyOrchestrator } from "./workflows/economy.ts";

provideEconomyHarnessForSession(sessionId, harness);
provideEconomyOntologyForSession(sessionId, ontology);
await start(economyOrchestrator, [config, "smoke-lifecycle"]);
```

## Contracts

- **`EconomyConfig`** — session, actors, compute token budget, max rounds, model. Never includes service credentials.
- **`EconomyScenario`** — host-injected hooks: `prepareActors`, `prepareRound`, `scheduleEncounters`, `afterEncounter`, `shouldTerminate`. Market institutions (prices, auctions, reputation) stay scenario-owned.
- Private objectives live in personal memories / opaque `scenarioState`. Shared `NetworkEvent` payloads redact them.

## Lifecycle

1. `setupEconomy` — spawn/register actors, bind network session deps, emit `economy.setup.*`
2. `runEconomyRound` / `runEconomyUntilDone` — scenario schedules encounters; optional NBC runner; experience index
3. `teardownEconomy` — unbind session, stop negotiate runtime, emit `economy.teardown`

Compute budgets (`maxTokenBudget`) are distinct from any scenario-defined economic resources.

## Negotiation

`createEconomyNegotiateRuntime` owns a per-session Vellum chain registry + `NbcLoopHost`. Use `createEconomyNbcEncounterRunner` for live turns, or `deferredEncounterRunner` for lifecycle smoke tests.

## Experience index

After each encounter, `indexEconomyExperience` writes immutable per-agent summaries and offer/port repertoire provenance, optionally projecting into the private `economy/encounters` memory namespace. It does not auto-select conventions.

## CLI (reference)

```bash
cd apps/reference
bun run economy -- \
  --khora-url http://127.0.0.1:8788 \
  --relay-url http://127.0.0.1:8790 \
  --memories-url http://127.0.0.1:8791 \
  --actors 2 \
  --scenario smoke-lifecycle
```

Register additional scenarios via `registerEconomyScenario` before starting the Workflow.

## Plugging in experiments

Implement `EconomyScenario`, register it, and pass its id to the host orchestrator. Derive metrics (convention reuse, welfare, reputation) from longitudinal `economy.*` events and experience rows — the harness emits raw data, not scientific summaries.
