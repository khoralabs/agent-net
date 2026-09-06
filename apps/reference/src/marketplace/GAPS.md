# Marketplace host-glue gaps

Observed while building the reference marketplace (promote sticky glue into agent-net; leave demo-domain here).

## Promoted (done in harness)

| Item | Where now | Notes |
|---|---|---|
| `resolveGatewayModel` on public barrel | `@khoralabs/agent-net` / `@khoralabs/agent-net/ai-sdk` | Reference `patterns/turn` uses harness export |
| Inbox reactor | `@khoralabs/agent-net` (`createInboxReactor`) | Reference `patterns/inbox` is a thin deprecated re-export |
| `inboxHasPost` / `inboxPostAuthorDid` on barrel | Already on `@khoralabs/agent-net` | Stale gap; `patterns/inbox/match` re-exports only |
| Negotiate pair registry | `@khoralabs/agent-net/negotiate` (`createNegotiatePairRegistry`) | Reference `patterns/negotiate` is a thin deprecated re-export |

## Still open (demo / host-policy)

| Gap | Where felt | Notes |
|---|---|---|
| Structured engage turn without agent registry | evaluate-on-inbox | Used `generateStructured` directly; no agent-capabilities capture for mandate |
| Buyer invite evaluate is pair-list driven | evaluate-on-invite | No Khora inbox kind for negotiation invites; host orchestrates from opened Vellum pairs |
| `social.negotiate.start` needs both parties on host | marketplace open-pair usage | Fine for reference; multi-host `isOnHost` path untested |
| Seed integrate requires full `IntegrateMemoryEvent` wire | `marketplace/seed.ts` | Verbose for “write a memory blurb” host DX |
| Subscription match vs topics | config / seed | Topics are coarse; hosts must keep semantic search text aligned with post bodies manually |

Update this file when new glue pain appears.
