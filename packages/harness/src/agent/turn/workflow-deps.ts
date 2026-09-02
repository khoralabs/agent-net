import type { ChatSigner } from "@khoralabs/chat";
import type { KhoraClient } from "@khoralabs/khora-client";
import type { EmbeddingModel } from "@khoralabs/memories-node/helpers";
import type { RemoteMemoriesClientAsync } from "@khoralabs/memories-service/client";
import type { AgentChatClient, ChatServiceClient } from "../social/message/chat.ts";

/**
 * Host-injected deps for chat / durable turn runs (framework-free).
 * AI SDK `streamText` override is added on `@khoralabs/agent-net/ai-sdk`.
 */
export type RunAgentWorkflowDependencies = {
  chatService?: ChatServiceClient;
  chatSigner?: ChatSigner;
  agentChat?: AgentChatClient;
  sessionId?: string;
  networkDataDir?: string;
  memoriesClient?: RemoteMemoriesClientAsync;
  khoraClient?: KhoraClient;
  embeddingModel?: EmbeddingModel;
};
