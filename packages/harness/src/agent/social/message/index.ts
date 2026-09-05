/**
 * Harness signed-chat helpers.
 * Prefer this entry over the package root for chat backends and agents.
 */
export {
  type AgentChatClient,
  type ChatServiceClient,
  type CreateAgentThreadInput,
  type CreateHarnessChatBackendOptions,
  type CreateRemoteHarnessChatOptions,
  createHarnessChatBackend,
  createRemoteHarnessChat,
  HARNESS_CHAT_CHANNEL_ID,
  type HarnessChatFetch,
  harnessChatFetch,
  installHarnessChatFetch,
  type SignedChatBackend,
} from "./chat.ts";
export {
  ensureThread,
  getAgentChatClient,
  getAgentChatClientForDid,
  getAgentChatService,
  getDevAgentDid,
  installAgentChat,
  resolveAgentChatSigner,
} from "./chat-service.ts";
export { AgentSocialMessage } from "./message.ts";
