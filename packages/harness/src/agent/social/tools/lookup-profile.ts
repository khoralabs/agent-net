import { tool } from "@khoralabs/agent-capabilities";
import type { PublicProfileResult } from "@khoralabs/khora-client";
import { z } from "zod";
import { toolEnabled } from "../../turn/tools/_helpers/disable-policies.ts";

import type { HarnessToolkitEnv } from "../../turn/tools/types.ts";
import { hasKhoraClient } from "./policies.ts";

/**
 * Plain object schema (not a top-level union). AI Gateway / Anthropic require
 * `input_schema.type` — zod discriminatedUnion emits `oneOf` without `type`.
 */
const zLookupProfileInput = z
  .object({
    lookupBy: z.enum(["username", "did"]).describe("How to look up the profile."),
    username: z.string().min(1).optional().describe("Username when lookupBy is username."),
    did: z.string().min(1).optional().describe("DID when lookupBy is did."),
  })
  .superRefine((value, ctx) => {
    if (value.lookupBy === "username" && (value.username?.trim() ?? "").length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "username is required when lookupBy is username",
        path: ["username"],
      });
    }
    if (value.lookupBy === "did" && (value.did?.trim() ?? "").length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "did is required when lookupBy is did",
        path: ["did"],
      });
    }
  });

export const lookupProfileTool = tool<
  "lookupProfile",
  z.infer<typeof zLookupProfileInput>,
  { profile: PublicProfileResult | null },
  HarnessToolkitEnv
>({
  name: "lookupProfile",
  description: "Look up a public Khora profile by username or DID. Returns null when not found.",
  instructions: ["Resolve a username or DID to a public profile."],
  inputSchema: zLookupProfileInput,
  policies: [hasKhoraClient, toolEnabled("lookupProfile")],
  handler: async (ctx, input) => {
    const client = ctx.env.khoraClient;
    if (client === undefined) throw new Error("khora client is not configured");

    if (input.lookupBy === "username") {
      const username = input.username?.trim() ?? "";
      if (username.length === 0) throw new Error("username is required");
      return { profile: await client.lookupProfileByUsername(username) };
    }

    const did = input.did?.trim() ?? "";
    if (did.length === 0) throw new Error("did is required");
    return { profile: await client.lookupProfileByDid(did) };
  },
});
