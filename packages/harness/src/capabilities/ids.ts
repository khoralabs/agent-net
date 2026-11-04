/**
 * Built-in host infrastructure capability ids.
 * Hosts may register additional string ids; these are the known defaults.
 */
export const HOST_CAPABILITY = {
  pool: "pool",
  khora: "khora",
  memories: "memories",
  chat: "chat",
  relay: "relay",
  negotiate: "negotiate",
} as const;

export type BuiltInHostCapabilityId = (typeof HOST_CAPABILITY)[keyof typeof HOST_CAPABILITY];

/** Any host capability id (built-in or host-defined extension). */
export type HostCapabilityId = BuiltInHostCapabilityId | (string & {});
