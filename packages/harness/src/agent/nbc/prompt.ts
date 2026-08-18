/**
 * NBC negotiation prompts (system + user messages).
 *
 * **Temporary** — instructions refer to port `kind` instead of wire `type` so
 * models do not emit JSON Schema documents as ports. Drop alias language when
 * OBP/Vellum rename the affordance field.
 */
export type NegotiationBrief = {
  objective?: string;
  constraints?: string;
};

/**
 * System instructions for one NBC model turn.
 *
 * TODO(nbc): Prompts name port `kind` (not wire `type`) so the model does not
 * emit a JSON Schema document as `expose[0]`. Map `kind` → `NbcPortSpec.type`
 * in `negotiationOutputToWire` until upstream renames the affordance field.
 */
export function buildNegotiationInstructions(input: {
  asDid: string;
  peerDid: string;
  initiatorDid: string;
  turnIndex: number;
  remainingTurns: number;
  opening: boolean;
  availablePeerPortIds: string[];
}): string[] {
  const role = input.asDid === input.initiatorDid ? "initiator" : "counterparty";
  const lines = [
    "You are negotiating on an NBC chain. Produce exactly one structured turn object.",
    `You act as ${role} (${input.asDid}). Peer is ${input.peerDid}.`,
    `Turn index ${input.turnIndex}; ${input.remainingTurns} protocol turns remain.`,
    "You may search memories first. The final output must match the turn schema — do not write prose.",
    "Do not impersonate the peer. Do not wait for another turn inside this run.",
    // TODO(nbc): `kind` is the host alias for NBC wire `type` (JSON Schema collision).
    'Each exposed port must include kind (affordance such as "slot", not a JSON Schema type) and promise.',
  ];
  if (input.opening) {
    lines.push(
      "This is the opening turn. Return { expose: [{ kind, promise, bind_policy? }] } with at least one port. You cannot disconnect.",
    );
  } else if (input.availablePeerPortIds.length > 0) {
    lines.push(
      `Bind exactly one peer port by returning { bind: { "<portId>": <payload> }, expose: [{ kind, promise, bind_policy? }] }, or { disconnect: true } to leave.`,
      "If the port has no bind_policy, payload must be {}. Otherwise payload must match that port's bind_policy.",
      `Available peer ports you may bind: ${input.availablePeerPortIds.join(", ")}.`,
    );
  } else {
    lines.push(
      "No peer ports are available to bind. Return { expose: [{ kind, promise, bind_policy? }] } or { disconnect: true } to leave.",
    );
  }
  return lines;
}

export function buildNegotiationUserMessage(input: {
  asDid: string;
  initiatorDid: string;
  brief?: NegotiationBrief;
  graphSummary: string;
}): string {
  const lines = ["Current NBC graph:", input.graphSummary];
  if (input.asDid === input.initiatorDid) {
    if (input.brief?.objective !== undefined && input.brief.objective.length > 0) {
      lines.push(`Private objective: ${input.brief.objective}`);
    }
    if (input.brief?.constraints !== undefined && input.brief.constraints.length > 0) {
      lines.push(`Private constraints: ${input.brief.constraints}`);
    }
  }
  lines.push("Produce one NBC turn object now.");
  return lines.join("\n");
}

export function summarizeNbcGraph(graph: {
  offers: readonly { id: string; partyId: string; type: string }[];
  ports: readonly {
    id: string;
    kind: string;
    bindCount: number;
    bind_policy?: unknown;
  }[];
  binds: readonly unknown[];
}): string {
  const offers = graph.offers.map((o) => `${o.id} by ${o.partyId} (${o.type})`).join("; ");
  const ports = graph.ports
    .map((p) => {
      const policy =
        p.bind_policy !== null &&
        p.bind_policy !== undefined &&
        typeof p.bind_policy === "object" &&
        !Array.isArray(p.bind_policy) &&
        Object.keys(p.bind_policy as object).length > 0
          ? " policy"
          : " no-policy";
      return `${p.id} ${p.kind} binds=${p.bindCount}${policy}`;
    })
    .join("; ");
  return `offers=[${offers}] ports=[${ports}] binds=${graph.binds.length}`;
}
