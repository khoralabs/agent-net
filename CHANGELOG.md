# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This repo publishes one package, `@khoralabs/agent-net` (`packages/harness`).
Entries without a prefix describe that package; entries prefixed **reference**
describe the `apps/reference` example host and do not affect consumers.

## [Unreleased]

### Added

- `mintInvite?: () => Promise<string>` on `startNetworkHarness`. Spawn mints an invite and registers with it, so hosts own the operator mint request and the package hardcodes no other service's routes.
- `./ai-sdk` entrypoint for LLM helpers: `generateStructured`, `runHarnessAgentStep`, `prepareHarnessStepRuntime`, `captureHarnessCapabilities`, `runAgentResponseWithSession`.
- Directive-free run entrypoints `./agent-response-run` and `./swarm-run` for hosts that own their durable Workflow wrappers.
- `commitNbcTurn` and `NbcTurnCommitResult` — shared NBC turn commit (party checks, Vellum commit, turn counting, turn-limit detection, error classification). Rejections are returned rather than thrown so each transport maps its own status codes.
- `nbcNegotiationStatusFields` — map an `NbcLoopStatusPatch` onto negotiation columns for host storage.
- `openVellumChainForDids` — focus both parties by DID, then open the chain session between them.
- SSE fan-outs for control-plane hosts: `createInboxFanout`, `createNetworkEventsFanout` with `networkEventsSseOptions` and `agentNetworkEventFilter`, and the generic `createSseFanout` core (replay ring, per-connection dedupe, catch-up poll, keepalive).
- `recordNetworkEvent` — persist a network event, deriving `eventId` and `tsMs`.
- `memorySearchToolkit` in the harness and negotiation toolkits, plus integrate-memory event and write-scope re-exports from `@khoralabs/memories-agents`.

### Changed

- **Breaking:** `startNetworkHarness` takes `mintInvite` instead of `khoraAdminToken`, and no longer reads `KHORA_ADMIN_TOKEN` / `ADMIN_ROOT_TOKEN` / `KHORA_CONSOLE_ROOT_TOKEN` from the environment.
- **Breaking:** AI SDK-dependent turn execution, workflow steps, capability capture, and structured output helpers moved from the root barrel to `./ai-sdk`.
- **Breaking:** The published package no longer carries `"use workflow"` / `"use step"` directives. It exports directive-free run helpers and types; hosts own the durable wrappers (see `apps/reference/src/workflows/`). `swarmOrchestrator` is no longer exported from `./swarm`.
- **Breaking:** `ai`, `workflow`, and `@khoralabs/agent-capabilities-ai-sdk` are optional peer dependencies. Install them only when using `./ai-sdk` or host Workflow wrappers.
- **Breaking:** Structured helpers take a gateway model id as `model: string` instead of a `LanguageModel` instance or `gateway(modelId)`.
- The NBC internal turn route delegates to `commitNbcTurn`, so operator hosts with their own turn API cannot drift from mesh turn-limit and chain-changed semantics. HTTP status codes are unchanged.
- Chat writer, chat client, memory source helpers, and swarm context assembly use the internal `AgentUIMessage` type rather than importing `UIMessage` from `ai`.
- Dependencies: khora 0.1.9, memories 0.10.0.

### Removed

- **Breaking:** `mintKhoraInviteTokens`, `requireKhoraAdminToken`, and `resolveKhoraAdminTokenFromEnv`. Call your network's operator invite-mint endpoint from `mintInvite`; `apps/reference/src/services/khora/mint-invite.ts` is a worked example.

### Fixed

- Spawning against a current Khora host no longer fails on a stale invite route. The package previously posted to `/admin/api/invites/mint`, which forced consumers to patch published `dist/` after Khora moved the endpoint; the path now lives in host code.

## [0.1.1] - 2026-09-02

### Added

- **reference:** The orchestrator embeds a Khora host in-process, giving a two-terminal local stack (documented in the reference README).

### Changed

- **reference:** Workflow world switched from Turso to the local world.
- Dependencies: khora-client bumped and khora-host 0.1.8 added.

## [0.1.0] - 2026-09-01

### Added

- Initial `@khoralabs/agent-net` release: custodial multi-agent network harness with agent pool and identities, per-agent social fabric and memories, signed chat, tools, and durable turn workflows.
- `apps/reference` example host and the release workflow that publishes the package.

[unreleased]: https://github.com/khoralabs/agent-net/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/khoralabs/agent-net/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/khoralabs/agent-net/releases/tag/v0.1.0
