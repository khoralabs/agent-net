import { dynamicToolkit, policy, tool, toolkit } from "@khoralabs/agent-capabilities";
import { z } from "zod";

import { toolEnabled, toolkitEnabled } from "./_helpers/disable-policies.ts";
import { HARNESS_TOOLKIT } from "./ids.ts";
import type { HarnessToolkitEnv, SocietyToolkitContext } from "./types.ts";

function society(env: HarnessToolkitEnv): SocietyToolkitContext {
  if (env.society === undefined) throw new Error("society runtime is not configured");
  return env.society;
}

const hasSocietyRuntime = policy<HarnessToolkitEnv>("has-society-runtime", async (env) =>
  Promise.resolve(env.society !== undefined),
);

const requestSocietyWakeTool = tool<
  "requestSocietyWake",
  { delayMs?: number; payload?: unknown },
  unknown,
  HarnessToolkitEnv
>({
  name: "requestSocietyWake",
  description: "Ask the society runtime to wake this actor again, optionally after a delay.",
  inputSchema: z.object({
    delayMs: z.number().int().min(0).optional(),
    payload: z.unknown().optional(),
  }),
  policies: [toolEnabled("requestSocietyWake")],
  handler: (ctx, input) => society(ctx.env).requestWake(input),
});

const inviteNegotiationTool = tool<
  "inviteNegotiation",
  { peerDid: string; message?: string },
  unknown,
  HarnessToolkitEnv
>({
  name: "inviteNegotiation",
  description:
    "Invite a peer into a new bilateral negotiation. The peer decides whether to accept.",
  inputSchema: z.object({
    peerDid: z.string().min(1),
    message: z.string().max(4_000).optional(),
  }),
  policies: [toolEnabled("inviteNegotiation")],
  handler: (ctx, input) =>
    society(ctx.env).inviteNegotiation({
      peerDid: input.peerDid.trim(),
      ...(input.message !== undefined ? { message: input.message } : {}),
    }),
});

const listNegotiationInvitationsTool = tool<
  "listNegotiationInvitations",
  Record<string, never>,
  unknown,
  HarnessToolkitEnv
>({
  name: "listNegotiationInvitations",
  description: "List this actor's pending and recent negotiation invitations.",
  inputSchema: z.object({}),
  policies: [toolEnabled("listNegotiationInvitations")],
  handler: (ctx) => society(ctx.env).listInvitations(),
});

const respondNegotiationInvitationTool = tool<
  "respondNegotiationInvitation",
  { invitationId: string; accept: boolean },
  unknown,
  HarnessToolkitEnv
>({
  name: "respondNegotiationInvitation",
  description: "Accept or reject a negotiation invitation addressed to this actor.",
  inputSchema: z.object({
    invitationId: z.string().min(1),
    accept: z.boolean(),
  }),
  policies: [toolEnabled("respondNegotiationInvitation")],
  handler: (ctx, input) => society(ctx.env).respondInvitation(input),
});

const cancelNegotiationInvitationTool = tool<
  "cancelNegotiationInvitation",
  { invitationId: string },
  unknown,
  HarnessToolkitEnv
>({
  name: "cancelNegotiationInvitation",
  description: "Cancel a pending negotiation invitation created by this actor.",
  inputSchema: z.object({ invitationId: z.string().min(1) }),
  policies: [toolEnabled("cancelNegotiationInvitation")],
  handler: (ctx, input) => society(ctx.env).cancelInvitation(input),
});

export const societyToolkit = dynamicToolkit<"society-runtime", HarnessToolkitEnv>({
  name: HARNESS_TOOLKIT.society,
  policies: [toolkitEnabled(HARNESS_TOOLKIT.society), hasSocietyRuntime],
  create: async () => [
    toolkit(
      [
        requestSocietyWakeTool,
        inviteNegotiationTool,
        listNegotiationInvitationsTool,
        respondNegotiationInvitationTool,
        cancelNegotiationInvitationTool,
      ],
      {
        name: "society-runtime-core",
        instructions: [
          "Choose peers and whether to negotiate. Invitations never auto-accept. Request future wakes only when useful.",
        ],
      },
    ),
  ],
});
