import { z } from "zod";

/** Protocol version for `GET /.well-known/agent-net` (additive fields stay on v1). */
export const AGENT_NET_DISCOVERY_PROTOCOL_VERSION = 1 as const;

export const zHostCapabilityAvailability = z.enum(["available", "degraded", "unavailable"]);

export type HostCapabilityAvailability = z.infer<typeof zHostCapabilityAvailability>;

/**
 * Public capability descriptor. Topology-neutral: no credentials, no internal
 * container URLs, no service-auth details.
 */
export const zHostCapabilityDescriptor = z.object({
  id: z.string().min(1),
  /** Optional human-readable label. */
  description: z.string().optional(),
  /** Provider contract / feature version (opaque string, often semver). */
  version: z.string().optional(),
  /**
   * Optional public endpoint clients may call for this capability.
   * Internal or private service URLs must not be published here.
   */
  endpoint: z.string().url().optional(),
});

export type HostCapabilityDescriptor = z.infer<typeof zHostCapabilityDescriptor>;

export const zHostCapabilityEntry = zHostCapabilityDescriptor.extend({
  /** Host implementation knows how to provide this capability. */
  supported: z.literal(true),
  /** Operational status right now. */
  availability: zHostCapabilityAvailability,
  /** Optional short status note (never secrets). */
  statusDetail: z.string().optional(),
});

export type HostCapabilityEntry = z.infer<typeof zHostCapabilityEntry>;

export const zAgentNetDiscovery = z.object({
  version: z.literal(AGENT_NET_DISCOVERY_PROTOCOL_VERSION),
  /** Public base URL of the agent-net capability HTTP surface. */
  baseUrl: z.string().url(),
  /** Opaque revision that changes when the published capability set changes. */
  revision: z.string().min(1),
  endpoints: z.object({
    health: z.string(),
    wellKnown: z.string(),
    capabilitiesSelf: z.string(),
  }),
  capabilities: z.array(zHostCapabilityEntry),
});

export type AgentNetDiscovery = z.infer<typeof zAgentNetDiscovery>;

/** Full host manifest (currently identical to the public discovery document). */
export type AgentNetHostManifest = AgentNetDiscovery;
