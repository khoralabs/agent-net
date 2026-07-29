import type { ChatSourceWire } from "@khoralabs/chat";
import { ids } from "@khoralabs/memories-node";
import type { RemoteMemoriesClientAsync } from "@khoralabs/memories-service/client";
import type { ResolvedSource, Store as SourcemapsStore, SourceRef } from "@khoralabs/sourcemaps";
import type { UIMessage } from "ai";

import { loadMemoryTextByKey } from "./tools/memories/_helpers/memory-text.ts";

/** Domain tag for memory citations on chat posts (`ChatSourceWire.sourceRef`). */
export const AGENT_MEMORY_DOMAIN = "agent-memory" as const;

/** Locators addressing an agent memory node (and optional content source key). */
export type AgentMemoryLocators = {
  domain: typeof AGENT_MEMORY_DOMAIN;
  namespace: string;
  memory_key: string;
  memory_id: string;
  source_key?: string;
};

export type AgentMemorySourceRef = SourceRef<AgentMemoryLocators>;

/** Entity returned from {@link AgentMemoryStore.resolve} (`kind: "record"`). */
export type AgentMemoryEntity = {
  namespace: string;
  memory_key: string;
  memory_id: string;
  text: string;
};

export type AgentMemoryEntityMap = {
  [AGENT_MEMORY_DOMAIN]: AgentMemoryEntity;
};

/**
 * Sourcemaps {@link SourcemapsStore} for resolving `agent-memory` refs attached to
 * chat message `metadata.sources`.
 */
export interface AgentMemoryStore
  extends SourcemapsStore<AgentMemorySourceRef, AgentMemoryEntityMap> {
  resolve(ref: AgentMemorySourceRef): Promise<ResolvedSource<AgentMemoryEntityMap>>;
}

export function isAgentMemorySourceRef(value: unknown): value is AgentMemorySourceRef {
  if (value === null || typeof value !== "object") return false;
  const ref = value as Record<string, unknown>;
  return (
    ref.domain === AGENT_MEMORY_DOMAIN &&
    typeof ref.namespace === "string" &&
    ref.namespace.length > 0 &&
    typeof ref.memory_key === "string" &&
    ref.memory_key.length > 0 &&
    typeof ref.memory_id === "string" &&
    ref.memory_id.length > 0 &&
    (ref.source_key === undefined || typeof ref.source_key === "string")
  );
}

export function agentMemorySourceRef(input: {
  namespace: string;
  memoryKey: string;
  memoryId?: string;
  sourceKey?: string;
}): AgentMemorySourceRef {
  const namespace = input.namespace.trim();
  const memory_key = input.memoryKey.trim();
  const memory_id = input.memoryId?.trim() || ids.memory(namespace, memory_key);
  return {
    domain: AGENT_MEMORY_DOMAIN,
    namespace,
    memory_key,
    memory_id,
    ...(input.sourceKey !== undefined && input.sourceKey.trim().length > 0
      ? { source_key: input.sourceKey.trim() }
      : {}),
  };
}

export function agentMemoryChatSource(input: {
  namespace: string;
  memoryKey: string;
  memoryId?: string;
  sourceKey?: string;
}): ChatSourceWire {
  const sourceRef = agentMemorySourceRef(input);
  return {
    id: sourceRef.memory_id,
    title: `${sourceRef.namespace}/${sourceRef.memory_key}`,
    mediaType: "text/plain",
    sourceRef,
  };
}

/** Resolve agent-memory refs via the memories service (text body as `record`). */
export function createAgentMemoryStore(client: RemoteMemoriesClientAsync): AgentMemoryStore {
  return {
    async resolve(ref) {
      if (!isAgentMemorySourceRef(ref)) {
        throw new Error("invalid agent-memory source ref");
      }
      const text = await loadMemoryTextByKey(client, ref.namespace, ref.memory_key);
      if (text === undefined) {
        throw new Error(`memory not found: ${ref.namespace}/${ref.memory_key}`);
      }
      return {
        kind: "record",
        domain: AGENT_MEMORY_DOMAIN,
        entity_id: ref.memory_id,
        value: {
          namespace: ref.namespace,
          memory_key: ref.memory_key,
          memory_id: ref.memory_id,
          text,
        },
      };
    },
  };
}

type ToolPart = {
  type: string;
  state?: string;
  input?: unknown;
  output?: unknown;
};

function asToolParts(parts: UIMessage["parts"]): ToolPart[] {
  const out: ToolPart[] = [];
  for (const part of parts) {
    if (
      typeof part === "object" &&
      part !== null &&
      typeof (part as { type?: unknown }).type === "string" &&
      (part as { type: string }).type.startsWith("tool-")
    ) {
      out.push(part as ToolPart);
    }
  }
  return out;
}

function addSource(
  byId: Map<string, ChatSourceWire>,
  input: {
    namespace: string;
    memoryKey: string;
    memoryId?: string;
    sourceKey?: string;
  },
): void {
  const source = agentMemoryChatSource(input);
  if (!byId.has(source.id)) byId.set(source.id, source);
}

/**
 * Build `ChatSourceWire[]` for memories accessed in this turn via memory tools.
 * Dedupes by `memory_id`. Ignores non-memory tools and incomplete tool parts.
 */
export function sourcesFromMemoryToolParts(parts: UIMessage["parts"]): ChatSourceWire[] {
  const byId = new Map<string, ChatSourceWire>();

  for (const part of asToolParts(parts)) {
    if (part.state !== "output-available") continue;
    const toolName = part.type.slice("tool-".length);
    const input =
      part.input !== null && typeof part.input === "object"
        ? (part.input as Record<string, unknown>)
        : {};
    const output =
      part.output !== null && typeof part.output === "object"
        ? (part.output as Record<string, unknown>)
        : {};

    if (toolName === "searchMemories") {
      const hits = Array.isArray(output.hits) ? output.hits : [];
      for (const hit of hits) {
        if (hit === null || typeof hit !== "object") continue;
        const row = hit as Record<string, unknown>;
        if (row.kind === "edge") continue;
        if (typeof row.namespace !== "string" || typeof row.memory_key !== "string") {
          continue;
        }
        addSource(byId, {
          namespace: row.namespace,
          memoryKey: row.memory_key,
          sourceKey: typeof row.source_key === "string" ? row.source_key : undefined,
        });
      }
      continue;
    }

    if (
      toolName === "writeMemory" ||
      toolName === "replaceMemoryLines" ||
      toolName === "readMemoryLines"
    ) {
      const namespace =
        typeof output.namespace === "string"
          ? output.namespace
          : typeof input.namespace === "string"
            ? input.namespace
            : undefined;
      const memoryKey =
        typeof output.key === "string"
          ? output.key
          : typeof input.key === "string"
            ? input.key
            : undefined;
      if (namespace === undefined || memoryKey === undefined) continue;

      const memoryIds = Array.isArray(output.memoryIds)
        ? output.memoryIds.filter((id): id is string => typeof id === "string")
        : [];
      if (memoryIds.length > 0) {
        for (const memoryId of memoryIds) {
          addSource(byId, { namespace, memoryKey, memoryId });
        }
      } else {
        addSource(byId, { namespace, memoryKey });
      }
    }
  }

  return [...byId.values()];
}
