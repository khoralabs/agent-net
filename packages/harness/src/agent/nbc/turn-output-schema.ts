/**
 * Host NBC turn schema: OBP opening / continue / leave profiles.
 */
import type { JsonDocument } from "@khoralabs/obp-core";
import {
  continueTurnSchemaForPorts,
  createObpStandardSchema,
  type HostTurnBody,
  type LeaveTurn,
  leaveTurnSchema,
  type ObpStandardSchema,
  type OpeningPort,
  openingTurnSchema,
} from "@khoralabs/obp-nbc";

import type { AvailablePeerPort } from "./who-should-act.ts";

export type NegotiationTurnEnvelopeContext = {
  opening: boolean;
  peerPorts: readonly AvailablePeerPort[];
};

export type NegotiationPortDefinition = OpeningPort;
export type NegotiationTurnEnvelope = HostTurnBody;

function jsonSchemaOf(schema: ObpStandardSchema<HostTurnBody>): Record<string, unknown> {
  return schema["~standard"].jsonSchema.input({ target: "draft-2020-12" });
}

function validateStandard<T>(schema: ObpStandardSchema<T>, value: unknown): T {
  const result = schema["~standard"].validate(value);
  if (result instanceof Promise) {
    throw new Error("turn schema must be sync");
  }
  if (result.issues) {
    throw new Error(result.issues.map((i) => i.message).join("; "));
  }
  return result.value;
}

type SyncResult = Exclude<
  ReturnType<ObpStandardSchema<HostTurnBody>["~standard"]["validate"]>,
  Promise<unknown>
>;

function syncHostResult(
  result: ReturnType<ObpStandardSchema<HostTurnBody>["~standard"]["validate"]>,
): SyncResult {
  if (result instanceof Promise) {
    return { issues: [{ message: "turn schema must be sync" }] };
  }
  return result;
}

/** Continue (or expose-only when nothing is bindable) unioned with leave. */
function laterTurnSchema(peerPorts: readonly AvailablePeerPort[]): ObpStandardSchema<HostTurnBody> {
  const offer = (
    peerPorts.length > 0
      ? continueTurnSchemaForPorts(
          peerPorts.map((p) => ({
            id: p.id,
            bind_policy: p.bind_policy as JsonDocument | null,
          })),
        )
      : openingTurnSchema
  ) as ObpStandardSchema<HostTurnBody>;
  const leave = leaveTurnSchema as ObpStandardSchema<HostTurnBody>;
  return createObpStandardSchema<HostTurnBody>(
    { oneOf: [jsonSchemaOf(leave), jsonSchemaOf(offer)] },
    (value) => {
      const rec =
        value !== null && typeof value === "object" && !Array.isArray(value)
          ? (value as Record<string, unknown>)
          : null;
      return syncHostResult(
        rec?.disconnect === true
          ? leave["~standard"].validate(value)
          : offer["~standard"].validate(value),
      );
    },
  );
}

/** Structured-output schema for this DID's legal NBC turn. */
export function negotiationTurnEnvelopeSchema(
  input: NegotiationTurnEnvelopeContext,
): ObpStandardSchema<HostTurnBody> {
  if (input.opening) return openingTurnSchema as ObpStandardSchema<HostTurnBody>;
  return laterTurnSchema(input.peerPorts);
}

/** Parse and type-check a model turn object. Throws on invalid envelope. */
export function parseNegotiationTurnEnvelope(
  value: unknown,
  ctx: NegotiationTurnEnvelopeContext,
): HostTurnBody {
  return validateStandard(negotiationTurnEnvelopeSchema(ctx), value);
}

export function isDisconnectEnvelope(parsed: HostTurnBody): parsed is LeaveTurn {
  return "disconnect" in parsed && parsed.disconnect === true;
}
