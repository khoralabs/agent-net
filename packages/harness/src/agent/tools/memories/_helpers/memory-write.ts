import { ids } from "@khoralabs/memories-node";
import {
  decomposeLogicalMemoryToContent,
  type EmbeddingModel,
  mergeLogicalMemoryWithMergeSlice,
  type ProcessedLogicalMemory,
} from "@khoralabs/memories-node/helpers";
import {
  type LabelSchemaMap,
  type OntologyDefinition,
  validateEdgeLabel,
  validateNodeLabel,
} from "@khoralabs/memories-node/ontology";
import type { RemoteMemoriesClientAsync } from "@khoralabs/memories-service/client";
import type { IntegrateMemoryEvent } from "../../../../integrate/memory-event.ts";
import type { IntegrateMemoryWriteScope } from "../../../../integrate/write-scope.ts";
import {
  agentDatabaseSourceRef,
  namespaceCatalogSourceRef,
} from "../../../step-context-sources.ts";
import { HARNESS_MEMORY_EDGE_KIND, HARNESS_MEMORY_NODE_KIND } from "./minimal-ontology.ts";

/**
 * Tool-facing link input. These are harness DTOs for the agent tool schema — they are mapped
 * into memories-service `mergeMemory` edge payloads (`peer_memory_id`, `direction`, `label`).
 * Ontology kinds live in the linked OntologyDefinition, not in the memories HTTP client types.
 */
export type MemoryLinkInput = {
  namespace: string;
  key: string;
  direction?: "in" | "out";
  /** Edge label kind. Defaults to ontology `references` when present. */
  label?: string;
  /** Edge label props validated against ontology.edgeLabels[kind]. */
  props?: Record<string, unknown>;
};

export type WriteMemoryNodeInput = {
  namespace: string;
  key: string;
  text: string;
  links?: MemoryLinkInput[];
  /** Ontology node labels keyed by kind. Defaults to `{ memory: {} }` when available. */
  nodeLabels?: Record<string, unknown>;
};

export type WriteMemoryIntegrateEnqueue = {
  baseUrl: string;
  token: string;
  ownerKey: string;
  /** Caller-owned integrate write scope. Defaults to `under`. */
  writeScope?: IntegrateMemoryWriteScope;
  /** Payload.source for the integrate event. */
  source?: string;
};

export type WriteMemoryNodeOptions = {
  embeddingModel: EmbeddingModel;
  ontology: OntologyDefinition<LabelSchemaMap, LabelSchemaMap>;
  /** When set, fire-and-forget a `kind: "memory"` integrate job after merge. */
  integrate?: WriteMemoryIntegrateEnqueue;
};

function defaultNodeLabels(
  ontology: OntologyDefinition<LabelSchemaMap, LabelSchemaMap>,
): Record<string, unknown> {
  if ("memory" in ontology.nodeLabels) return { memory: {} };
  if (HARNESS_MEMORY_NODE_KIND in ontology.nodeLabels) {
    return { [HARNESS_MEMORY_NODE_KIND]: {} };
  }
  const first = Object.keys(ontology.nodeLabels)[0];
  if (first === undefined) {
    throw new Error("ontology has no node label kinds");
  }
  return { [first]: {} };
}

function defaultEdgeKind(ontology: OntologyDefinition<LabelSchemaMap, LabelSchemaMap>): string {
  if ("references" in ontology.edgeLabels) return "references";
  if (HARNESS_MEMORY_EDGE_KIND in ontology.edgeLabels) {
    return HARNESS_MEMORY_EDGE_KIND;
  }
  const first = Object.keys(ontology.edgeLabels)[0];
  if (first === undefined) {
    throw new Error("ontology has no edge label kinds");
  }
  return first;
}

function buildValidatedLabels(
  ontology: OntologyDefinition<LabelSchemaMap, LabelSchemaMap>,
  nodeLabels: Record<string, unknown>,
): Array<{ kind: string; props: Record<string, unknown> }> {
  const labels: Array<{ kind: string; props: Record<string, unknown> }> = [];
  for (const [kind, props] of Object.entries(nodeLabels)) {
    if (props === undefined) continue;
    try {
      const validated = validateNodeLabel(ontology, {
        kind,
        props: (props ?? {}) as Record<string, unknown>,
      });
      labels.push({
        kind: validated.kind,
        props: validated.props as Record<string, unknown>,
      });
    } catch (err) {
      const detail =
        err instanceof Error && err.message.trim().length > 0 ? err.message.trim() : String(err);
      throw new Error(`writeMemory nodeLabels.${kind} invalid: ${detail}`);
    }
  }
  if (labels.length === 0) {
    throw new Error("writeMemory requires at least one ontology node label");
  }
  return labels;
}

async function enqueueMemoryIntegrate(
  integrate: WriteMemoryIntegrateEnqueue,
  args: { namespace: string; memoryKey: string; text: string },
): Promise<void> {
  const base = integrate.baseUrl.replace(/\/$/, "");
  const url = `${base}/api/memories/events`;
  const correlationId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `write-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const body: IntegrateMemoryEvent = {
    kind: "memory",
    ownerKey: integrate.ownerKey,
    namespace: args.namespace,
    memoryKey: args.memoryKey,
    writeScope: integrate.writeScope ?? "under",
    correlationId,
    occurredAtMs: Date.now(),
    payload: { source: integrate.source ?? "writeMemory" },
    text: args.text,
    memoriesContextRefs: {
      database: agentDatabaseSourceRef(integrate.ownerKey),
      namespaces: namespaceCatalogSourceRef(integrate.ownerKey),
    },
  };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${integrate.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[writeMemory] integrate enqueue failed: HTTP ${res.status} ${text}`);
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[writeMemory] integrate enqueue failed: ${detail}`);
  }
}

/**
 * Embed + merge a memory node with ontology labels/edges, then optionally
 * fire-and-forget a deepen integrate job on the written key.
 */
export async function writeMemoryNode(
  client: RemoteMemoriesClientAsync,
  input: WriteMemoryNodeInput,
  options: WriteMemoryNodeOptions,
): Promise<string[]> {
  const namespace = input.namespace.trim();
  const key = input.key.trim();
  const text = input.text;
  const { embeddingModel, ontology } = options;

  const nodeLabels =
    input.nodeLabels !== undefined && Object.keys(input.nodeLabels).length > 0
      ? input.nodeLabels
      : defaultNodeLabels(ontology);
  const labels = buildValidatedLabels(ontology, nodeLabels);
  const edgeKindDefault = defaultEdgeKind(ontology);

  const edges =
    input.links?.map((link) => {
      const kind = link.label?.trim() || edgeKindDefault;
      try {
        const validated = validateEdgeLabel(ontology, {
          kind,
          props: (link.props ?? {}) as Record<string, unknown>,
        });
        return {
          peer_memory_id: ids.memory(link.namespace.trim(), link.key.trim()),
          direction: (link.direction ?? "out") as "in" | "out",
          label: {
            kind: validated.kind,
            props: validated.props as Record<string, unknown>,
          },
        };
      } catch (err) {
        const detail =
          err instanceof Error && err.message.trim().length > 0 ? err.message.trim() : String(err);
        throw new Error(`writeMemory link edge "${kind}" invalid: ${detail}`);
      }
    }) ?? [];

  const content = await decomposeLogicalMemoryToContent({
    key,
    namespace,
    plaintext: text,
    embedding: { embeddingModel, multimodal: false },
  });
  const processed: ProcessedLogicalMemory = {
    key,
    namespace,
    plaintext: text,
    content,
  };

  await mergeLogicalMemoryWithMergeSlice(
    client as never,
    processed,
    {
      labels,
      ...(edges.length > 0 ? { edges } : {}),
    } as never,
    embeddingModel,
  );

  const memoryId = await client.persistence.findMemoryIdByKey(namespace, key);
  const memoryIds = typeof memoryId === "string" && memoryId.length > 0 ? [memoryId] : [];

  if (options.integrate !== undefined) {
    // Fire-and-forget — do not block the agent turn on deepen completion.
    void enqueueMemoryIntegrate(options.integrate, {
      namespace,
      memoryKey: key,
      text,
    });
  }

  return memoryIds;
}
