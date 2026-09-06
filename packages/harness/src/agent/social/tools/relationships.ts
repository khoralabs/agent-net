import { tool } from "@khoralabs/agent-capabilities";
import type { KhoraRelationship } from "@khoralabs/khora-client";
import { z } from "zod";
import { toolEnabled } from "../../turn/tools/_helpers/disable-policies.ts";
import type { HarnessToolkitEnv } from "../../turn/tools/types.ts";
import { hasKhoraClient } from "./policies.ts";

const channelInput = z.object({
  channelId: z.string().min(1).describe("Khora relationship channel ID."),
});

function client(ctx: { env: HarnessToolkitEnv }) {
  const value = ctx.env.khoraClient;
  if (value === undefined) throw new Error("khora client is not configured");
  return value;
}

export const inviteRelationshipTool = tool<
  "inviteRelationship",
  { peerDid: string },
  { relationship: KhoraRelationship },
  HarnessToolkitEnv
>({
  name: "inviteRelationship",
  description: "Invite a registered Khora principal to a peer relationship.",
  instructions: ["Create peer relationships separately from registration invite tokens."],
  inputSchema: z.object({ peerDid: z.string().min(1).describe("Registered peer DID.") }),
  policies: [hasKhoraClient, toolEnabled("inviteRelationship")],
  handler: async (ctx, input) => client(ctx).createRelationship({ peerDid: input.peerDid.trim() }),
});

export const listRelationshipsTool = tool<
  "listRelationships",
  Record<string, never>,
  { relationships: KhoraRelationship[] },
  HarnessToolkitEnv
>({
  name: "listRelationships",
  description: "List pending and accepted Khora peer relationships.",
  instructions: ["Inspect relationship state before using network visibility."],
  inputSchema: z.object({}),
  policies: [hasKhoraClient, toolEnabled("listRelationships")],
  handler: async (ctx) => client(ctx).listRelationships(),
});

export const acceptRelationshipTool = tool<
  "acceptRelationship",
  { channelId: string },
  { relationship: KhoraRelationship },
  HarnessToolkitEnv
>({
  name: "acceptRelationship",
  description: "Accept a pending Khora peer relationship invitation.",
  instructions: ["Accept an incoming peer edge before relying on network visibility."],
  inputSchema: channelInput,
  policies: [hasKhoraClient, toolEnabled("acceptRelationship")],
  handler: async (ctx, input) => client(ctx).acceptRelationship(input.channelId),
});

export const declineRelationshipTool = tool<
  "declineRelationship",
  { channelId: string },
  { ok: true },
  HarnessToolkitEnv
>({
  name: "declineRelationship",
  description: "Decline a pending Khora peer relationship invitation.",
  instructions: ["Decline an incoming peer relationship."],
  inputSchema: channelInput,
  policies: [hasKhoraClient, toolEnabled("declineRelationship")],
  handler: async (ctx, input) => {
    await client(ctx).declineRelationship(input.channelId);
    return { ok: true };
  },
});

export const revokeRelationshipTool = tool<
  "revokeRelationship",
  { channelId: string },
  { ok: true },
  HarnessToolkitEnv
>({
  name: "revokeRelationship",
  description: "Revoke a pending Khora peer relationship invitation you created.",
  instructions: ["Revoke an outgoing pending peer relationship."],
  inputSchema: channelInput,
  policies: [hasKhoraClient, toolEnabled("revokeRelationship")],
  handler: async (ctx, input) => {
    await client(ctx).revokeRelationship(input.channelId);
    return { ok: true };
  },
});

export const deleteRelationshipTool = tool<
  "deleteRelationship",
  { channelId: string },
  { ok: true },
  HarnessToolkitEnv
>({
  name: "deleteRelationship",
  description: "Delete a pending or accepted Khora peer relationship.",
  instructions: ["Remove a peer edge when it is no longer wanted."],
  inputSchema: channelInput,
  policies: [hasKhoraClient, toolEnabled("deleteRelationship")],
  handler: async (ctx, input) => {
    await client(ctx).deleteRelationship(input.channelId);
    return { ok: true };
  },
});
