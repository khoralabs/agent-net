export type {
  AgentHandleOptions,
  BindAgentServicesOptions,
  VellumHandle,
} from "../handle/handle.ts";
export { AgentHandle } from "../handle/handle.ts";
export type { AgentMemoriesClient } from "../handle/memories-types.ts";
export { createBoundAgentMemoriesClient } from "../handle/memories-types.ts";
export type {
  HarnessPoolInboxOptions,
  InboxConnection,
  InboxConnectionHandle,
  PoolInboxEvent,
  PoolInboxLifecycleHandler,
  PoolInboxOptions,
} from "../inbox/pool-inbox.ts";
/** @deprecated Prefer {@link HarnessPoolInbox} / harness.subscribeInbox. */
export { connectPoolInbox, HarnessPoolInbox } from "../inbox/pool-inbox.ts";
export type { AgentCallback, ManagedAgentPoolOptions } from "./pool.ts";
export { ManagedAgentPool } from "./pool.ts";
export {
  type AgentMemoriesFraming,
  type AgentRecord,
  AgentStore,
  type PoolAgentRegistry,
} from "./store.ts";
