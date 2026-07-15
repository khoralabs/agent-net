import { tool } from "@khoralabs/agent-capabilities";
import type { PublicProfileResult } from "@khoralabs/khora-client";
import { z } from "zod";

import type { HarnessToolkitEnv } from "../types.ts";
import { hasKhoraClient } from "./policies.ts";

const zLookupProfileInput = z.discriminatedUnion("lookupBy", [
  z.object({
    lookupBy: z.literal("username"),
    username: z.string().min(1).describe("Username to look up."),
  }),
  z.object({
    lookupBy: z.literal("did"),
    did: z.string().min(1).describe("DID to look up."),
  }),
]);

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
  policies: [hasKhoraClient],
  handler: async (ctx, input) => {
    const client = ctx.env.khoraClient;
    if (client === undefined) throw new Error("khora client is not configured");

    const profile =
      input.lookupBy === "username"
        ? await client.lookupProfileByUsername(input.username)
        : await client.lookupProfileByDid(input.did);
    return { profile };
  },
});
