import { resolveAgentEmbeddingModel } from "@khoralabs/memories-node/helpers/agent";
import {
  agentMemoriesDatabase,
  createAgentMemoriesClient,
} from "@khoralabs/memories-service/client/agent";
import type { ToolSet } from "ai";
import { jsonSchema, tool } from "ai";
import { getInstalledMemoriesOntology } from "../../memories/tools/_helpers/memories-ontology-install.ts";
import { createNbcMeshClient } from "../../social/negotiate/nbc/nbc-mesh-client.ts";
import { nbcTurnContext } from "../../social/negotiate/nbc/nbc-turn-context.ts";
import {
  buildNegotiationInstructions,
  buildNegotiationUserMessage,
  summarizeNbcGraph,
} from "../../social/negotiate/nbc/prompt.ts";
import type { AvailablePeerPort } from "../../social/negotiate/nbc/who-should-act.ts";
import { NETWORK_NEGOTIATION_AGENT_ID } from "../capability-agents/network-negotiation-agent.ts";
import { prepareHarnessStepRuntime } from "../prepare-harness-step.ts";
import { HARNESS_TOOLKIT } from "../tools/ids.ts";
import type { AgentWorkflowParams } from "../types.ts";

const DISABLED_TOOLKITS = [
  HARNESS_TOOLKIT.chat,
  HARNESS_TOOLKIT.khora,
  HARNESS_TOOLKIT.nbc,
] as const;

export type NbcNegotiationTurnParams = {
  chainId: string;
  asDid: string;
  peerDid: string;
  initiatorDid: string;
  turnIndex: number;
  maxTurns: number;
  modelId: string;
  runId?: string;
  objective?: string;
  constraints?: string;
};

export type SerializableNbcToolDef = {
  key: string;
  description: string;
  jsonSchema: Record<string, unknown>;
};

export type PreparedNbcNegotiationTurn = {
  instructions: string;
  userMessage: string;
  tools: SerializableNbcToolDef[];
  peerPorts: AvailablePeerPort[];
  opening: boolean;
  capabilities: {
    staticHash: string;
    runtimeHash: string;
    invocationHash?: string;
    toolRefs: Array<{ toolKey: string; toolHash: string }>;
  };
  memoriesProvenanceRootHex: string;
  remainingTurns: number;
};

let meshClient: ReturnType<typeof createNbcMeshClient> | undefined;

function nbcMesh() {
  if (meshClient === undefined) {
    const token = process.env.AGENTS_INTERNAL_TOKEN?.trim();
    if (token === undefined || token.length === 0) {
      throw new Error("AGENTS_INTERNAL_TOKEN is required");
    }
    meshClient = createNbcMeshClient({
      baseUrl: process.env.AGENTS_BASE_URL?.trim() || "http://127.0.0.1:8787",
      token,
    });
  }
  return meshClient;
}

function serializeAiTools(aiTools: ToolSet): SerializableNbcToolDef[] {
  const out: SerializableNbcToolDef[] = [];
  for (const [key, def] of Object.entries(aiTools)) {
    const description =
      def !== null &&
      typeof def === "object" &&
      "description" in def &&
      typeof def.description === "string"
        ? def.description
        : key;
    out.push({ key, description, jsonSchema: extractJsonSchema(def) });
  }
  return out;
}

function extractJsonSchema(def: unknown): Record<string, unknown> {
  if (def === null || typeof def !== "object") {
    return { type: "object", additionalProperties: true };
  }
  const rec = def as Record<string, unknown>;
  if (rec.jsonSchema !== null && typeof rec.jsonSchema === "object") {
    return rec.jsonSchema as Record<string, unknown>;
  }
  const inputSchema = rec.inputSchema;
  if (
    inputSchema !== null &&
    typeof inputSchema === "object" &&
    "jsonSchema" in inputSchema &&
    (inputSchema as { jsonSchema?: unknown }).jsonSchema !== null &&
    typeof (inputSchema as { jsonSchema?: unknown }).jsonSchema === "object"
  ) {
    return (inputSchema as { jsonSchema: Record<string, unknown> }).jsonSchema;
  }
  return { type: "object", additionalProperties: true };
}

/** Prepare one NBC turn (memories, tools, prompts). No workflow directive. */
export async function runPrepareNbcTurn(
  params: NbcNegotiationTurnParams,
): Promise<PreparedNbcNegotiationTurn> {
  const state = await nbcMesh().fetchState(params.chainId, params.asDid);
  if (params.asDid !== state.chain.initiatorDid && params.asDid !== state.chain.counterpartyDid) {
    throw new Error("asDid is not a party on this chain");
  }
  const { peerPorts, opening, remainingTurns } = nbcTurnContext({
    graph: state.graph,
    asDid: params.asDid,
    initiatorDid: params.initiatorDid,
    maxTurns: state.chain.maxTurns,
    turnsCompleted: state.chain.turnsCompleted,
  });
  const brief =
    params.asDid === params.initiatorDid
      ? {
          ...(params.objective !== undefined ? { objective: params.objective } : {}),
          ...(params.constraints !== undefined ? { constraints: params.constraints } : {}),
        }
      : undefined;

  const ontology = getInstalledMemoriesOntology();
  if (ontology === undefined) {
    throw new Error("memories ontology is not installed");
  }
  const memoriesBaseUrl = process.env.MEMORIES_BASE_URL?.trim() || "http://127.0.0.1:8791";
  const memoriesAdminToken = process.env.MEMORIES_SERVICE_ADMIN_TOKEN?.trim();
  if (memoriesAdminToken === undefined || memoriesAdminToken.length === 0) {
    throw new Error("MEMORIES_SERVICE_ADMIN_TOKEN is required");
  }
  const memoriesClient = await createAgentMemoriesClient({
    baseUrl: memoriesBaseUrl,
    database: agentMemoriesDatabase(params.asDid),
    ontology,
    adminToken: memoriesAdminToken,
  });

  const runId = params.runId?.trim() || crypto.randomUUID();
  const workflowParams: AgentWorkflowParams = {
    runId,
    agent: {
      id: NETWORK_NEGOTIATION_AGENT_ID,
      name: "Network Negotiation Agent",
      actingFor: { type: "agent", id: params.asDid },
    },
    model: { id: params.modelId },
    context: {
      sessionId: runId,
      chainId: params.chainId,
      asDid: params.asDid,
      messages: [],
      instructions: buildNegotiationInstructions({
        asDid: params.asDid,
        peerDid: params.peerDid,
        initiatorDid: params.initiatorDid,
        turnIndex: params.turnIndex,
        remainingTurns,
        opening,
        availablePeerPortIds: peerPorts.map((p) => p.id),
      }),
    },
    tools: {
      disableToolkits: [...DISABLED_TOOLKITS],
    },
  };

  const prepared = await prepareHarnessStepRuntime({
    turnInstructions: workflowParams.context.instructions,
    runtime: {
      agentId: NETWORK_NEGOTIATION_AGENT_ID,
      agentDid: params.asDid,
      runId,
      sessionId: runId,
      memoriesClient,
      embeddingModel: resolveAgentEmbeddingModel(),
      disableToolkits: [...DISABLED_TOOLKITS],
      captureTools: true,
      workflowParams,
    },
  });

  if (prepared.aiTools === undefined || prepared.capabilities === undefined) {
    throw new Error("failed to capture negotiation tools");
  }

  const instructions = [
    ...(prepared.contextInstructions ?? []),
    ...(workflowParams.context.instructions ?? []),
  ].join("\n");

  return {
    instructions,
    userMessage: buildNegotiationUserMessage({
      asDid: params.asDid,
      initiatorDid: params.initiatorDid,
      brief,
      graphSummary: summarizeNbcGraph(state.graph),
    }),
    tools: serializeAiTools(prepared.aiTools),
    peerPorts,
    opening,
    capabilities: prepared.capabilities,
    memoriesProvenanceRootHex: prepared.env?.memoriesSnapshotRootHex ?? "",
    remainingTurns,
  };
}

export type NbcToolExecuteCtx = {
  chainId: string;
  asDid: string;
  runId: string;
  peerDid: string;
  initiatorDid: string;
  toolKey: string;
  input: unknown;
};

export function buildNbcToolSet(
  defs: SerializableNbcToolDef[],
  ctx: {
    chainId: string;
    asDid: string;
    runId: string;
    peerDid: string;
    initiatorDid: string;
    execute: (input: NbcToolExecuteCtx) => Promise<unknown>;
  },
): ToolSet {
  const tools: ToolSet = {};
  for (const def of defs) {
    const key = def.key;
    tools[key] = tool({
      description: def.description,
      inputSchema: jsonSchema(def.jsonSchema),
      execute: async (input: unknown) =>
        ctx.execute({
          chainId: ctx.chainId,
          asDid: ctx.asDid,
          runId: ctx.runId,
          peerDid: ctx.peerDid,
          initiatorDid: ctx.initiatorDid,
          toolKey: key,
          input,
        }),
    });
  }
  return tools;
}

export async function executeNbcTool(input: NbcToolExecuteCtx): Promise<unknown> {
  if (input.asDid.trim().length === 0) {
    throw new Error("asDid is required");
  }

  const ontology = getInstalledMemoriesOntology();
  if (ontology === undefined) {
    throw new Error("memories ontology is not installed");
  }
  const memoriesBaseUrl = process.env.MEMORIES_BASE_URL?.trim() || "http://127.0.0.1:8791";
  const memoriesAdminToken = process.env.MEMORIES_SERVICE_ADMIN_TOKEN?.trim();
  if (memoriesAdminToken === undefined || memoriesAdminToken.length === 0) {
    throw new Error("MEMORIES_SERVICE_ADMIN_TOKEN is required");
  }
  const memoriesClient = await createAgentMemoriesClient({
    baseUrl: memoriesBaseUrl,
    database: agentMemoriesDatabase(input.asDid),
    ontology,
    adminToken: memoriesAdminToken,
  });

  const workflowParams: AgentWorkflowParams = {
    runId: input.runId,
    agent: {
      id: NETWORK_NEGOTIATION_AGENT_ID,
      name: "Network Negotiation Agent",
      actingFor: { type: "agent", id: input.asDid },
    },
    model: {
      id: process.env.AGENT_DEFAULT_MODEL?.trim() || "zai/glm-5.2-fast",
    },
    context: {
      sessionId: input.runId,
      chainId: input.chainId,
      asDid: input.asDid,
      messages: [],
    },
    tools: {
      disableToolkits: [...DISABLED_TOOLKITS],
    },
  };

  const prepared = await prepareHarnessStepRuntime({
    runtime: {
      agentId: NETWORK_NEGOTIATION_AGENT_ID,
      agentDid: input.asDid,
      runId: input.runId,
      sessionId: input.runId,
      memoriesClient,
      embeddingModel: resolveAgentEmbeddingModel(),
      disableToolkits: [...DISABLED_TOOLKITS],
      captureTools: true,
      workflowParams,
    },
  });

  const aiTool = prepared.aiTools?.[input.toolKey];
  if (aiTool === undefined || typeof aiTool.execute !== "function") {
    throw new Error(`unknown negotiation tool ${input.toolKey}`);
  }
  return aiTool.execute(input.input as never, {
    toolCallId: `${input.runId}:${input.toolKey}`,
    messages: [],
    context: {},
  });
}

export function nbcMeshPostTurn(
  chainId: string,
  asDid: string,
  turn: Record<string, unknown>,
): Promise<void> {
  return nbcMesh().postTurn(chainId, asDid, turn);
}

export function nbcMeshPostLeave(chainId: string, asDid: string): Promise<void> {
  return nbcMesh().postLeave(chainId, asDid);
}
