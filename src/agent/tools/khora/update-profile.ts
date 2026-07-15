import { tool } from "@khoralabs/agent-capabilities";
import type { KhoraProfile } from "@khoralabs/khora-client";
import { z } from "zod";

import type { HarnessToolkitEnv } from "../types.ts";
import { hasKhoraClient } from "./policies.ts";

const zUpdateProfileInput = z.object({
  username: z.string().min(1).max(39).optional(),
  displayName: z.string().max(200).optional(),
  bio: z.string().max(8000).optional(),
});

export const updateProfileTool = tool<
  "updateProfile",
  z.infer<typeof zUpdateProfileInput>,
  { profile: KhoraProfile },
  HarnessToolkitEnv
>({
  name: "updateProfile",
  description: "Update this agent's public Khora profile (username, display name, bio).",
  inputSchema: zUpdateProfileInput,
  policies: [hasKhoraClient],
  handler: async (ctx, input) => {
    const client = ctx.env.khoraClient;
    if (client === undefined) throw new Error("khora client is not configured");

    const profile = await client.updateProfile(input);
    return { profile };
  },
});
