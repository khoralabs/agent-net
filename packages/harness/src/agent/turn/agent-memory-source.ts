import type { ChatSourceWire } from "@khoralabs/chat";
import type { SourceMap, Store } from "@khoralabs/memories-node";
import { ids } from "@khoralabs/memories-node";
import { createRemoteSourceMapContentStore } from "@khoralabs/memories-node/helpers/agent";
import type { RemoteMemoriesClientAsync } from "@khoralabs/memories-service/client";
import type { ResolvedSource, Store as SourcemapsStore, SourceRef } from "@khoralabs/sourcemaps";
import type { UIMessage } from "ai";
import { SKILLS_NAMESPACE } from "../memories/skills/_helpers/skills.ts";
import { loadMemoryTextByKey } from "../memories/tools/_helpers/memory-text.ts";

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

/**
 * Resolve agent-memory refs via key/`memory_id` lookup, then content
 * {@link Store.resolve} (HTTP → SQLite text preview).
 */
export function createAgentMemoryStore(
  client: RemoteMemoriesClientAsync,
  contentStore: Store = createRemoteSourceMapContentStore(client),
): AgentMemoryStore {
  return {
    async resolve(ref) {
      if (!isAgentMemorySourceRef(ref)) {
        throw new Error("invalid agent-memory source ref");
      }

      let memoryId = ref.memory_id.trim();
      let namespace = ref.namespace.trim();
      let memoryKey = ref.memory_key.trim();

      const byId = await client.persistence.loadMemoryNamespaceKey(memoryId);
      if (byId !== undefined) {
        namespace = byId.namespace;
        memoryKey = byId.key;
      } else {
        const foundId = await client.persistence.findMemoryIdByKey(namespace, memoryKey);
        if (foundId === undefined) {
          throw new Error(`memory not found: ${namespace}/${memoryKey}`);
        }
        memoryId = foundId;
      }

      const sourceKey = ref.source_key?.trim();
      let text = "";
      try {
        if (sourceKey !== undefined && sourceKey.length > 0) {
          const content = await contentStore.resolve({
            memory_id: memoryId,
            source_key: sourceKey,
          } satisfies SourceMap);
          if (content.kind === "string") {
            text = content.string;
          } else if (content.kind === "json") {
            text = typeof content.body === "string" ? content.body : await content.body.text();
          }
        } else {
          text = (await loadMemoryTextByKey(client, namespace, memoryKey)) ?? "";
        }
      } catch {
        // Focus only needs locators; missing body is non-fatal.
      }

      return {
        kind: "record",
        domain: AGENT_MEMORY_DOMAIN,
        entity_id: memoryId,
        value: {
          namespace,
          memory_key: memoryKey,
          memory_id: memoryId,
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
      toolName === "writeSkill" ||
      toolName === "replaceSkillLines"
    ) {
      const namespace =
        typeof output.namespace === "string"
          ? output.namespace
          : typeof input.namespace === "string"
            ? input.namespace
            : toolName === "writeSkill" || toolName === "replaceSkillLines"
              ? SKILLS_NAMESPACE
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
      continue;
    }

    if (toolName === "resolveMemories" || toolName === "resolveSkills") {
      const rows = Array.isArray(output.results) ? output.results : [];
      for (const row of rows) {
        if (row === null || typeof row !== "object") continue;
        const item = row as Record<string, unknown>;
        if (typeof item.error === "string") continue;
        const namespace =
          typeof item.namespace === "string"
            ? item.namespace
            : toolName === "resolveSkills"
              ? SKILLS_NAMESPACE
              : undefined;
        const memoryKey = typeof item.key === "string" ? item.key : undefined;
        if (namespace === undefined || memoryKey === undefined) continue;
        addSource(byId, { namespace, memoryKey });
      }
      continue;
    }

    if (toolName === "searchSkills") {
      const hits = Array.isArray(output.hits) ? output.hits : [];
      const namespace = typeof output.namespace === "string" ? output.namespace : SKILLS_NAMESPACE;
      for (const hit of hits) {
        if (hit === null || typeof hit !== "object") continue;
        const row = hit as Record<string, unknown>;
        if (row.kind === "edge") continue;
        const memoryKey =
          typeof row.memory_key === "string"
            ? row.memory_key
            : typeof row.key === "string"
              ? row.key
              : undefined;
        if (memoryKey === undefined) continue;
        addSource(byId, {
          namespace:
            typeof row.namespace === "string" && row.namespace.length > 0
              ? row.namespace
              : namespace,
          memoryKey,
          sourceKey: typeof row.source_key === "string" ? row.source_key : undefined,
        });
      }
    }
  }

  return [...byId.values()];
}
