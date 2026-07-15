import { emitNetworkEvent, networkEventId } from "../../../../network/index.ts";
import { getCurrentAttribution } from "../../../../observability/network-log.ts";
import type { HarnessToolkitEnv } from "../../types.ts";

export async function emitChatNetworkEvent(input: {
  env: HarnessToolkitEnv;
  kind: "chat.message.sent" | "chat.thread.created";
  payload: Record<string, unknown>;
  extra: string;
}): Promise<void> {
  const sessionId = input.env.sessionId?.trim();
  const agentDid = input.env.agentChat?.did;
  if (sessionId === undefined || sessionId.length === 0) {
    return;
  }
  await emitNetworkEvent({
    eventId: networkEventId({
      sessionId,
      kind: input.kind,
      agentDid,
      extra: input.extra,
    }),
    sessionId,
    tsMs: Date.now(),
    source: "chat",
    kind: input.kind,
    agentDid,
    payload: input.payload,
    attribution: getCurrentAttribution(),
  });
}
