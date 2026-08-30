import type { AgentActor } from "../../../agent/actor.ts";
import { type NbcLoopHandle, type StartNbcLoopInput, startNbcLoop } from "./nbc/nbc-loop.ts";
import {
  disconnectVellum,
  openVellumChain,
  type VellumHandle,
  type VellumPairOptions,
} from "./vellum.ts";

export type { VellumHandle } from "./vellum.ts";

export type NegotiateStartResult = {
  sessionId: string;
  channelId: string;
  initiatorVellum: VellumHandle;
  responderVellum: VellumHandle;
};

/**
 * Negotiation nested under `agent.social.negotiate`.
 * Thin wrap over existing Vellum/NBC host helpers.
 */
export class AgentSocialNegotiate {
  readonly #self: AgentActor;
  #last: NegotiateStartResult | undefined;

  constructor(self: AgentActor) {
    this.#self = self;
  }

  get did(): string {
    return this.#self.did;
  }

  /**
   * Open a Vellum chain with `peer` (this agent as initiator).
   */
  async start(peer: AgentActor, options: VellumPairOptions): Promise<NegotiateStartResult> {
    const opened = await openVellumChain(this.#self, peer, options);
    const result: NegotiateStartResult = {
      sessionId: opened.sessionId,
      channelId: opened.channelId,
      initiatorVellum: opened.initiatorVellum,
      responderVellum: opened.responderVellum,
    };
    this.#last = result;
    return result;
  }

  /** Commit a turn on the last opened initiator session (if any). */
  async commitTurn(body: Record<string, unknown>, sessionId?: string): Promise<void> {
    const live = this.#last;
    if (live === undefined) {
      throw new Error("social.negotiate.commitTurn: no active negotiation (call start first)");
    }
    const sid = sessionId ?? live.sessionId;
    await live.initiatorVellum.sendTurn(sid, body);
  }

  status(): NegotiateStartResult | undefined {
    return this.#last;
  }

  stop(...handles: VellumHandle[]): void {
    if (handles.length > 0) {
      disconnectVellum(...handles);
    } else if (this.#last !== undefined) {
      disconnectVellum(this.#last.initiatorVellum, this.#last.responderVellum);
    }
    this.#last = undefined;
  }

  /** Host-level NBC loop helper (multi-process deployments). */
  startLoop(input: StartNbcLoopInput): NbcLoopHandle {
    return startNbcLoop(input);
  }
}
