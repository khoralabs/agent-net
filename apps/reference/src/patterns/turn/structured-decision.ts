import { resolveGatewayModel } from "@khoralabs/agent-net";
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
 * Domain-agnostic structured LLM decision (no tools).
 * Uses harness {@link resolveGatewayModel} for gateway env checks.
 */
export async function runStructuredDecision<T>(input: {
  label: string;
  modelId: string;
  schema: z.ZodType<T>;
  prompt: string;
}): Promise<T> {
  const modelId = resolveGatewayModel(input.modelId);
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
