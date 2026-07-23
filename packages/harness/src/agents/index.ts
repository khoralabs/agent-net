export type { AgentHandleOptions, VellumHandle } from "./handle.ts";
export { AgentHandle } from "./handle.ts";
export type { AgentMemoriesClient } from "./memories-types.ts";
export type { AgentCallback, ManagedAgentPoolOptions } from "./pool.ts";
export { ManagedAgentPool } from "./pool.ts";
export type {
  HarnessPoolInboxOptions,
  InboxConnection,
  InboxConnectionHandle,
  PoolInboxEvent,
  PoolInboxLifecycleHandler,
  PoolInboxOptions,
} from "./pool-inbox.ts";
export { connectPoolInbox, HarnessPoolInbox } from "./pool-inbox.ts";
export type { AgentRecord } from "./store.ts";
export { AgentStore } from "./store.ts";
