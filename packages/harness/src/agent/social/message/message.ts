import type { AgentChatClient, CreateAgentThreadInput, SendAgentMessageInput } from "./chat.ts";

/** Chat / messaging nested under `agent.social.message`. */
export class AgentSocialMessage {
  readonly #chat: AgentChatClient;

  constructor(chat: AgentChatClient) {
    this.#chat = chat;
  }

  get did(): string {
    return this.#chat.did;
  }

  /** Alias for {@link AgentChatClient.createThread}. */
  thread(input?: CreateAgentThreadInput) {
    return this.#chat.createThread(input);
  }

  createThread(input?: CreateAgentThreadInput) {
    return this.#chat.createThread(input);
  }

  sendMessage(threadId: string, input: SendAgentMessageInput) {
    return this.#chat.sendMessage(threadId, input);
  }

  listPosts(threadId: string, input?: { limit?: number; cursor?: string }) {
    return this.#chat.listPosts(threadId, input);
  }

  listThreads(input?: { limit?: number; cursor?: string }) {
    return this.#chat.listThreads(input);
  }

  getThread(threadId: string) {
    return this.#chat.getThread(threadId);
  }

  grantAccess(...args: Parameters<AgentChatClient["grantAccess"]>) {
    return this.#chat.grantAccess(...args);
  }

  /** Escape hatch to the underlying chat client. */
  get client(): AgentChatClient {
    return this.#chat;
  }
}
