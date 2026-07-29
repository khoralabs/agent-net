import { describe, expect, test } from "bun:test";
import { evaluateComposable } from "@khoralabs/agent-capabilities";
import type { KhoraClient } from "@khoralabs/khora-client";

import type { AgentChatClient } from "../../chat.ts";
import { harnessToolkit } from "./_toolkit.ts";
import { HARNESS_TOOLKIT } from "./ids.ts";
import { createEphemeralRecentNamespacesTracker } from "./memories/_helpers/recent-namespaces.ts";
import { emptyDisabledToolSets, type HarnessToolkitEnv } from "./types.ts";

function createEnv(overrides: Partial<HarnessToolkitEnv> = {}): HarnessToolkitEnv {
  return {
    skills: [],
    activatedSkillNames: new Set(),
    embeddingCache: new Map(),
    recentNamespaces: createEphemeralRecentNamespacesTracker(),
    ...emptyDisabledToolSets(),
    ...overrides,
  };
}

function mockKhoraClient(): KhoraClient {
  return {
    search: async () => ({ hits: [] }),
  } as unknown as KhoraClient;
}

function mockChat(): AgentChatClient {
  return {
    did: "did:key:agent",
    createThread: async () => ({ id: "thread-1" }) as never,
    grantAccess: async () => undefined,
    sendMessage: async () => ({ id: "post-1" }) as never,
    listPosts: async () => ({ items: [], nextCursor: null }),
    listThreads: async () => ({ items: [], nextCursor: null }),
    getThread: async (threadId) => ({ id: threadId }) as never,
    listParticipants: async () => [],
  };
}

describe("tool/toolkit disable policies", () => {
  test("disabledToolkits hides khora tools even when khoraClient is set", async () => {
    const { tools } = await evaluateComposable(harnessToolkit, {
      env: createEnv({
        khoraClient: mockKhoraClient(),
        disabledToolkits: new Set([HARNESS_TOOLKIT.khora]),
      }),
    });
    const typed = tools as Record<string, unknown>;
    expect(typed.searchNetwork).toBeUndefined();
    expect(typed.createPost).toBeUndefined();
    expect(typed.lookupProfile).toBeUndefined();
  });

  test("disabledToolkits hides chat tools even when agentChat is set", async () => {
    const { tools } = await evaluateComposable(harnessToolkit, {
      env: createEnv({
        agentChat: mockChat(),
        disabledToolkits: new Set([HARNESS_TOOLKIT.chat]),
      }),
    });
    const typed = tools as Record<string, unknown>;
    expect(typed.sendThreadMessage).toBeUndefined();
    expect(typed.createAgentThread).toBeUndefined();
    expect(typed.listAccessibleThreads).toBeUndefined();
  });

  test("disabledTools hides a single tool while peers remain", async () => {
    const { tools } = await evaluateComposable(harnessToolkit, {
      env: createEnv({
        khoraClient: mockKhoraClient(),
        disabledTools: new Set(["searchNetwork"]),
      }),
    });
    const typed = tools as Record<string, unknown>;
    expect(typed.searchNetwork).toBeUndefined();
    expect(typed.createPost).toBeDefined();
    expect(typed.lookupProfile).toBeDefined();
  });
});
