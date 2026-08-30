import { isDisconnectEnvelope, parseNegotiationTurnEnvelope } from "./turn-output-schema.ts";
import type { AvailablePeerPort } from "./who-should-act.ts";

export type RunNbcModelTurnInput = {
  opening: boolean;
  peerPorts: readonly AvailablePeerPort[];
  generate: () => Promise<unknown>;
  postTurn: (body: Record<string, unknown>) => Promise<void>;
  postLeave: () => Promise<void>;
};

/** Generate one NBC turn and post the host-profile body. No workflow semantics. */
export async function runNbcModelTurn(
  input: RunNbcModelTurnInput,
): Promise<{ kind: "offer" | "disconnect" }> {
  const raw = await input.generate();
  const parsed = parseNegotiationTurnEnvelope(raw, {
    opening: input.opening,
    peerPorts: input.peerPorts,
  });
  if (isDisconnectEnvelope(parsed)) {
    await input.postLeave();
    return { kind: "disconnect" };
  }
  await input.postTurn(parsed as Record<string, unknown>);
  return { kind: "offer" };
}
