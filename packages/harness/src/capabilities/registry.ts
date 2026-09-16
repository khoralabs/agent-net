import { AGENT_NET_HTTP_PATH } from "./http/routes.ts";
import type { HostCapabilityId } from "./ids.ts";
import {
  AGENT_NET_DISCOVERY_PROTOCOL_VERSION,
  type AgentNetHostManifest,
  type HostCapabilityAvailability,
  type HostCapabilityDescriptor,
  type HostCapabilityEntry,
  zHostCapabilityDescriptor,
} from "./manifest.ts";

export type RegisterHostCapabilityInput = HostCapabilityDescriptor & {
  /**
   * Initial availability. Defaults to `"available"`.
   * Unsupported capabilities are represented by not registering them.
   */
  availability?: HostCapabilityAvailability;
  statusDetail?: string;
};

export type HostCapabilityRegistry = {
  register(input: RegisterHostCapabilityInput): void;
  /** Replace an existing registration; throws if the id is unknown. */
  update(input: RegisterHostCapabilityInput): void;
  unregister(capabilityId: HostCapabilityId): boolean;
  setAvailability(
    capabilityId: HostCapabilityId,
    availability: HostCapabilityAvailability,
    statusDetail?: string,
  ): void;
  get(capabilityId: HostCapabilityId): HostCapabilityEntry | undefined;
  list(): readonly HostCapabilityEntry[];
  /** Opaque revision; changes whenever the registered set or availability changes. */
  revision(): string;
  getManifest(opts: { baseUrl: string }): AgentNetHostManifest;
};

type StoredEntry = {
  descriptor: HostCapabilityDescriptor;
  availability: HostCapabilityAvailability;
  statusDetail?: string;
};

function toEntry(stored: StoredEntry): HostCapabilityEntry {
  const entry: HostCapabilityEntry = {
    ...stored.descriptor,
    supported: true,
    availability: stored.availability,
  };
  if (stored.statusDetail !== undefined) {
    entry.statusDetail = stored.statusDetail;
  }
  return entry;
}

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (trimmed.length === 0) {
    throw new Error("baseUrl is required");
  }
  return trimmed;
}

/**
 * Process-local host capability registry.
 * Registration is topology-neutral: embedded and remote providers use the same descriptor shape.
 */
export function createHostCapabilityRegistry(): HostCapabilityRegistry {
  const byId = new Map<string, StoredEntry>();
  let rev = 0;

  const bump = () => {
    rev += 1;
  };

  const requireKnown = (capabilityId: HostCapabilityId): StoredEntry => {
    const existing = byId.get(capabilityId);
    if (existing === undefined) {
      throw new Error(`Unknown capability: ${capabilityId}`);
    }
    return existing;
  };

  const parseInput = (input: RegisterHostCapabilityInput): StoredEntry => {
    const descriptor = zHostCapabilityDescriptor.parse({
      id: input.id,
      description: input.description,
      version: input.version,
      endpoint: input.endpoint,
    });
    const stored: StoredEntry = {
      descriptor,
      availability: input.availability ?? "available",
    };
    if (input.statusDetail !== undefined) {
      stored.statusDetail = input.statusDetail;
    }
    return stored;
  };

  return {
    register(input) {
      if (byId.has(input.id)) {
        throw new Error(`Capability already registered: ${input.id}`);
      }
      byId.set(input.id, parseInput(input));
      bump();
    },

    update(input) {
      requireKnown(input.id);
      byId.set(input.id, parseInput(input));
      bump();
    },

    unregister(capabilityId) {
      const removed = byId.delete(capabilityId);
      if (removed) bump();
      return removed;
    },

    setAvailability(capabilityId, availability, statusDetail) {
      const existing = requireKnown(capabilityId);
      existing.availability = availability;
      if (statusDetail === undefined) {
        delete existing.statusDetail;
      } else {
        existing.statusDetail = statusDetail;
      }
      bump();
    },

    get(capabilityId) {
      const stored = byId.get(capabilityId);
      return stored === undefined ? undefined : toEntry(stored);
    },

    list() {
      return [...byId.values()].map(toEntry).sort((a, b) => a.id.localeCompare(b.id));
    },

    revision() {
      return String(rev);
    },

    getManifest(opts) {
      const baseUrl = normalizeBaseUrl(opts.baseUrl);
      const capabilities = [...this.list()];
      return {
        version: AGENT_NET_DISCOVERY_PROTOCOL_VERSION,
        baseUrl,
        revision: this.revision(),
        endpoints: {
          health: AGENT_NET_HTTP_PATH.health,
          wellKnown: AGENT_NET_HTTP_PATH.wellKnown,
          capabilitiesSelf: AGENT_NET_HTTP_PATH.capabilitiesSelf,
        },
        capabilities,
      };
    },
  };
}
