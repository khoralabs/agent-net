import { negotiationOutputToWire } from "./action.ts";
import type { AvailablePeerPort } from "./who-should-act.ts";

export type RunNbcModelTurnInput = {
  opening: boolean;
  peerPorts: readonly AvailablePeerPort[];
  generate: () => Promise<unknown>;
  postTurn: (body: Record<string, unknown>) => Promise<void>;
  postLeave: () => Promise<void>;
};

/** Generate one NBC turn, map to wire, and commit via host IO. No workflow semantics. */
export async function runNbcModelTurn(
  input: RunNbcModelTurnInput,
): Promise<{ kind: "offer" | "disconnect" }> {
  const raw = await input.generate();
  const wired = negotiationOutputToWire({
    raw,
    opening: input.opening,
    peerPorts: input.peerPorts,
  });
  if (wired.kind === "disconnect") {
    await input.postLeave();
    return { kind: "disconnect" };
  }
  await input.postTurn(wired.body);
  return { kind: "offer" };
}
