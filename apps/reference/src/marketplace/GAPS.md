# Marketplace host-glue gaps

Observed while building the reference marketplace (promote `patterns/` later; fix agent-net when sticky).

| Gap | Where felt | Notes |
|---|---|---|
| `resolveGatewayModel` not on harness public barrel | `patterns/turn/structured-decision.ts` | Duplicated env check; should export from harness |
| No first-class “inbox reactor” | `patterns/inbox/reactor.ts` | Hosts reinvent subscribe demux / wait / dedupe |
| `inboxHasPost` / `inboxPostAuthorDid` not on barrel | `patterns/inbox/match.ts` | Copied from harness `lib/inbox.ts` |
| Structured engage turn without agent registry | evaluate-on-inbox | Used `generateStructured` directly; no agent-capabilities capture for mandate |
| `social.negotiate.start` needs both parties on host | open-pair | Fine for reference; multi-host `isOnHost` path untested |
| Seed integrate requires full `IntegrateMemoryEvent` wire | `marketplace/seed.ts` | Verbose for “write a memory blurb” host DX |
| Subscription match vs topics | config / seed | Topics are coarse; hosts must keep semantic search text aligned with post bodies manually |

Update this file when new glue pain appears.
