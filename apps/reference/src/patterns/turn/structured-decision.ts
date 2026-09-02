import { generateStructured } from "@khoralabs/agent-net/ai-sdk";
import { z } from "zod";

export const engageDecisionSchema = z.object({
  decision: z.enum(["engage", "skip"]),
  reason: z.string().min(1),
});

export type EngageDecision = z.infer<typeof engageDecisionSchema>;

export const inviteDecisionSchema = z.object({
  decision: z.enum(["accept", "decline"]),
  reason: z.string().min(1),
});

export type InviteDecision = z.infer<typeof inviteDecisionSchema>;

/**
 * Resolve a gateway model id (mirrors harness resolveGatewayModel; not yet on public barrel).
 */
export function requireGatewayModelId(modelId: string): string {
  const id = modelId.trim() || process.env.AGENT_DEFAULT_MODEL?.trim();
  if (id === undefined || id.length === 0) throw new Error("model.id is required");
  if (!process.env.AI_GATEWAY_API_KEY?.trim()) {
    throw new Error("AI_GATEWAY_API_KEY environment variable not set");
  }
  return id;
}

/**
 * Domain-agnostic structured LLM decision (no tools).
 * Promote candidate — wraps harness `generateStructured` with string model IDs.
 */
export async function runStructuredDecision<T>(input: {
  label: string;
  modelId: string;
  schema: z.ZodType<T>;
  prompt: string;
}): Promise<T> {
  const modelId = requireGatewayModelId(input.modelId);
  return generateStructured<T>({
    label: input.label,
    model: modelId,
    schema: input.schema,
    prompt: input.prompt,
  });
}

export async function runEngageDecision(input: {
  modelId: string;
  prompt: string;
}): Promise<EngageDecision> {
  return runStructuredDecision({
    label: "marketplace-engage-decision",
    modelId: input.modelId,
    schema: engageDecisionSchema,
    prompt: input.prompt,
  });
}

export async function runInviteDecision(input: {
  modelId: string;
  prompt: string;
}): Promise<InviteDecision> {
  return runStructuredDecision({
    label: "marketplace-invite-decision",
    modelId: input.modelId,
    schema: inviteDecisionSchema,
    prompt: input.prompt,
  });
}
