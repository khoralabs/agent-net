export function networkEventId(input: {
  sessionId: string;
  kind: string;
  runId?: string;
  agentDid?: string;
  turnIndex?: number;
  extra?: string;
}): string {
  return [
    input.sessionId,
    input.kind,
    input.runId ?? "",
    input.agentDid ?? "",
    input.turnIndex !== undefined ? String(input.turnIndex) : "",
    input.extra ?? "",
  ].join(":");
}
