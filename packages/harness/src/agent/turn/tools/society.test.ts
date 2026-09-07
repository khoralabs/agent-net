import { describe, expect, test } from "bun:test";
import {
  evaluateComposable,
  type ToolRuntimeContext,
  type ToolSpec,
} from "@khoralabs/agent-capabilities";

import { createEphemeralRecentNamespacesTracker } from "../../memories/tools/_helpers/recent-namespaces.ts";
import { harnessToolkit } from "./_toolkit.ts";
import {
  emptyDisabledToolSets,
  type HarnessToolkitEnv,
  type SocietyToolkitContext,
} from "./types.ts";

function env(society?: SocietyToolkitContext): HarnessToolkitEnv {
  return {
    skills: [],
    activatedSkillNames: new Set(),
    embeddingCache: new Map(),
    recentNamespaces: createEphemeralRecentNamespacesTracker(),
    ...emptyDisabledToolSets(),
    ...(society !== undefined ? { society } : {}),
  };
}

describe("society actor tools", () => {
  test("are hidden outside a society turn", async () => {
    const { tools } = await evaluateComposable(harnessToolkit, { env: env() });
    expect((tools as Record<string, unknown>).requestSocietyWake).toBeUndefined();
    expect((tools as Record<string, unknown>).inviteNegotiation).toBeUndefined();
  });

  test("bind every action to the actor-scoped callbacks", async () => {
    const calls: Array<[string, unknown]> = [];
    const society: SocietyToolkitContext = {
      requestWake: async (input) => calls.push(["wake", input]),
      inviteNegotiation: async (input) => calls.push(["invite", input]),
      listInvitations: async () => calls.push(["list", undefined]),
      respondInvitation: async (input) => calls.push(["respond", input]),
      cancelInvitation: async (input) => calls.push(["cancel", input]),
    };
    const runtimeEnv = env(society);
    const { tools } = await evaluateComposable(harnessToolkit, { env: runtimeEnv });
    const invoke = async (name: string, input: unknown) => {
      const spec = (tools as Record<string, ToolSpec>)[name];
      if (spec === undefined) throw new Error(`missing tool ${name}`);
      return spec.handler.bind(spec)(
        {
          env: runtimeEnv,
          agentId: "actor",
          agentName: "Actor",
        } as ToolRuntimeContext<HarnessToolkitEnv>,
        input,
      );
    };

    await invoke("requestSocietyWake", { delayMs: 10, payload: { reason: "later" } });
    await invoke("inviteNegotiation", { peerDid: " did:peer ", message: "trade?" });
    await invoke("listNegotiationInvitations", {});
    await invoke("respondNegotiationInvitation", { invitationId: "i1", accept: true });
    await invoke("cancelNegotiationInvitation", { invitationId: "i2" });

    expect(calls).toEqual([
      ["wake", { delayMs: 10, payload: { reason: "later" } }],
      ["invite", { peerDid: "did:peer", message: "trade?" }],
      ["list", undefined],
      ["respond", { invitationId: "i1", accept: true }],
      ["cancel", { invitationId: "i2" }],
    ]);
  });
});
