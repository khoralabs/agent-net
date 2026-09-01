/**
 * Thin re-export of `@khoralabs/obp-nbc/host` acting-party helpers.
 * `whoShouldAct` aliases `whoShouldActWithChainState` for stable public API.
 */
export {
  type AvailablePeerPort,
  availablePeerPorts,
  clampMaxTurns,
  NBC_DEFAULT_MAX_TURNS,
  NBC_MAX_TURNS_CAP,
  type NegotiationChainView,
  type WhoShouldActResult,
  whoShouldActWithChainState,
} from "@khoralabs/obp-nbc/host";

import { whoShouldActWithChainState } from "@khoralabs/obp-nbc/host";

export const whoShouldAct = whoShouldActWithChainState;
