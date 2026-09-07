import { z } from "zod";

const serviceUrl = z.string().min(1);

export const zAgentNetCliConfig = z.object({
  dataDir: z.string().min(1),
  khora: z.object({
    baseUrl: serviceUrl,
    adminToken: z.string().optional(),
  }),
  relay: z.object({
    baseUrl: serviceUrl,
  }),
  memories: z.object({
    baseUrl: serviceUrl,
    /** May be empty until setup/doctor; harness start requires non-empty. */
    adminToken: z.string(),
  }),
  chat: z.object({
    baseUrl: serviceUrl,
    /** May be empty until setup/doctor; harness start requires non-empty. */
    token: z.string(),
    channelId: z.string().optional(),
  }),
  identitySecret: z.string().optional(),
});

export type AgentNetCliConfig = z.infer<typeof zAgentNetCliConfig>;

export const zAgentNetCliConfigPartial = z.object({
  dataDir: z.string().min(1).optional(),
  khora: z
    .object({
      baseUrl: serviceUrl.optional(),
      adminToken: z.string().optional(),
    })
    .optional(),
  relay: z
    .object({
      baseUrl: serviceUrl.optional(),
    })
    .optional(),
  memories: z
    .object({
      baseUrl: serviceUrl.optional(),
      adminToken: z.string().optional(),
    })
    .optional(),
  chat: z
    .object({
      baseUrl: serviceUrl.optional(),
      token: z.string().optional(),
      channelId: z.string().optional(),
    })
    .optional(),
  identitySecret: z.string().optional(),
});

export type AgentNetCliConfigPartial = z.infer<typeof zAgentNetCliConfigPartial>;

export function assertHarnessTokens(config: AgentNetCliConfig): void {
  if (config.memories.adminToken.trim().length === 0) {
    throw new Error(
      "memories.adminToken is required (set MEMORIES_SERVICE_ADMIN_TOKEN or --memories-admin-token)",
    );
  }
  if (config.chat.token.trim().length === 0) {
    throw new Error("chat.token is required (set CHAT_INTERNAL_TOKEN or --chat-token)");
  }
}
