import { generateText, Output, stepCountIs } from "ai";

import { runNbcModelTurn } from "../../social/negotiate/nbc/run-nbc-model-turn.ts";
import { negotiationTurnEnvelopeSchema } from "../../social/negotiate/nbc/turn-output-schema.ts";
import {
  buildNbcToolSet,
  executeNbcTool,
  type NbcNegotiationTurnParams,
  nbcMeshPostLeave,
  nbcMeshPostTurn,
  type PreparedNbcNegotiationTurn,
} from "./nbc-prepare-turn-run.ts";

const MAX_MODEL_STEPS = 8;

function resolveModelId(modelId: string): string {
  const id = modelId.trim() || process.env.AGENT_DEFAULT_MODEL?.trim();
  if (id === undefined || id.length === 0) {
    throw new Error("modelId is required");
  }
  if (!process.env.AI_GATEWAY_API_KEY?.trim()) {
    throw new Error("AI_GATEWAY_API_KEY environment variable not set");
  }
  return id;
}

export type RunNbcNegotiationModelTurnInput = {
  params: NbcNegotiationTurnParams;
  prepared: PreparedNbcNegotiationTurn;
  runId: string;
  timeoutMs: number;
  describeFailure: (err: unknown) => string;
  onRetryableTimeout: (err: unknown, label: string) => never;
  isAbortError: (err: unknown) => boolean;
  maxAttempts: number;
  onExhausted: (detail: string, attempts: number) => never;
};

/** Run generate → host-profile → mesh commit for one NBC turn. No workflow directive. */
export async function runNbcNegotiationModelTurn(
  input: RunNbcNegotiationModelTurnInput,
): Promise<{ ok: true }> {
  const tools = buildNbcToolSet(input.prepared.tools, {
    chainId: input.params.chainId,
    asDid: input.params.asDid,
    runId: input.runId,
    peerDid: input.params.peerDid,
    initiatorDid: input.params.initiatorDid,
    execute: executeNbcTool,
  });

  let lastError: unknown;
  for (let attempt = 1; attempt <= input.maxAttempts; attempt++) {
    try {
      await runNbcModelTurn({
        opening: input.prepared.opening,
        peerPorts: input.prepared.peerPorts,
        generate: async () => {
          const result = await generateText({
            model: resolveModelId(input.params.modelId),
            system: input.prepared.instructions,
            messages: [{ role: "user", content: input.prepared.userMessage }],
            tools,
            output: Output.object({
              name: "NbcTurn",
              description:
                "One NBC turn: expose ports, optionally bind one peer port, or disconnect.",
              schema: negotiationTurnEnvelopeSchema({
                opening: input.prepared.opening,
                peerPorts: input.prepared.peerPorts,
              }),
            }),
            stopWhen: stepCountIs(MAX_MODEL_STEPS),
            abortSignal: AbortSignal.timeout(input.timeoutMs),
          });

          if (result.output === undefined || result.output === null) {
            throw new Error("negotiation turn produced no structured output");
          }
          return result.output;
        },
        postTurn: async (body) => {
          await nbcMeshPostTurn(input.params.chainId, input.params.asDid, body);
        },
        postLeave: async () => {
          await nbcMeshPostLeave(input.params.chainId, input.params.asDid);
        },
      });
      lastError = undefined;
      break;
    } catch (err) {
      if (input.isAbortError(err)) {
        input.onRetryableTimeout(err, "negotiation model turn");
      }
      lastError = err;
    }
  }
  if (lastError !== undefined) {
    input.onExhausted(input.describeFailure(lastError), input.maxAttempts);
  }

  return { ok: true };
}
