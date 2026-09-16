# Host capabilities

Agent-net hosts advertise infrastructure through a **capability manifest** and decide per-agent access through a **host-owned entitlement resolver**. Mesh authentication is not assumed: the same contracts work for in-process embeds and split-container deployments.

Import surface: `@khoralabs/agent-net/capabilities` (not re-exported from the root barrel). This is **orthogonal** to `@khoralabs/agent-capabilities` tool hashes, which fingerprint LLM tool graphs.

## Layers

| Layer | Question | Wire shape |
|-------|----------|------------|
| **Supported** | Does the host know how to provide this? | Capability is registered (unsupported = absent) |
| **Availability** | Is it operational right now? | `available` \| `degraded` \| `unavailable` |
| **Entitlement** | May this DID use it? | `allowed` \| `denied` (+ optional scopes) |

Effective responses retain **both** availability and entitlement. Missing entitlement decisions are **denied**. Hosts that want legacy allow-all must pass `createAllowAllEntitlementResolver` explicitly.

## Registration (topology-neutral)

```ts
import {
  createHostCapabilityRegistry,
  HOST_CAPABILITY,
} from "@khoralabs/agent-net/capabilities";

const registry = createHostCapabilityRegistry();
registry.register({
  id: HOST_CAPABILITY.chat,
  description: "Signed chat",
  version: "1",
  // Optional public endpoint only — never publish tokens or private container URLs.
  endpoint: "https://chat.example.com",
});
```

Descriptors carry `id`, optional `description` / `version` / public `endpoint`, plus `availability`. No credentials, no service-auth details.

## Harness facade

`startNetworkHarness` always exposes `harness.capabilities`:

- `getManifest()` — public discovery document
- `resolveAgentCapabilities(did)` — effective set for one agent
- `registry` — register/update availability after start

Optional options: `capabilityRegistry`, `entitlementResolver`, `capabilitiesBaseUrl`.

## HTTP

Reusable handlers (auth-agnostic):

| Route | Auth |
|-------|------|
| `GET /.well-known/agent-net` | None |
| `GET /health` | None |
| `GET /v1/capabilities/self` | Host-injected principal resolver |

```ts
import {
  dispatchAgentNetCapabilityRequest,
  createHostCapabilitiesFacade,
} from "@khoralabs/agent-net/capabilities";

const facade = createHostCapabilitiesFacade({ registry, baseUrl, entitlementResolver });

Bun.serve({
  async fetch(req) {
    return (
      (await dispatchAgentNetCapabilityRequest(req, {
        getManifest: () => facade.getManifest(),
        resolveAgentCapabilities: (did) => facade.resolveAgentCapabilities(did),
        resolvePrincipal: async (req) => {
          // DID-signed HTTP, Bearer, reverse-proxy identity, or in-process trust —
          // host chooses. Return { ok: false, response } to deny.
          const agentDid = /* … */ "";
          return { ok: true, agentDid };
        },
      })) ?? new Response("Not found", { status: 404 })
    );
  },
});
```

Clients: `discoverAgentNet({ baseUrl })`, `fetchAgentCapabilitiesSelf({ baseUrl, headers })`.

## Reference app

The reference orchestrator starts a fifth listener (default `:8793`) that registers pool/khora/memories/relay/chat/negotiate and publishes well-known discovery. `/v1/capabilities/self` returns **401** until a production host injects a real principal resolver — the reference stack does not invent an insecure identity header.

Env: `AGENT_NET_BASE_URL` (printed at orchestrator start).

## Non-goals (this foundation)

- Making chat/memories optional at harness startup
- Rewriting service credentials to DID principal auth
- Mapping infrastructure entitlements into LLM toolkit disable lists
- Cross-agent admin entitlement enumeration (`GET /v1/agents/:did/capabilities`)
