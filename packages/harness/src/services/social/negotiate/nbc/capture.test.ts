import { afterEach, describe, expect, test } from "bun:test";
import { evaluateComposable } from "@khoralabs/agent-capabilities";

import {
  captureHarnessCapabilities,
  resetHarnessAgentRegistryForTests,
} from "../../../../runtime/agent-runtime.ts";
import { defineNegotiationAgent } from "../../../../runtime/capability-agents/network-negotiation-agent.ts";
import { HARNESS_TOOLKIT } from "../../../../runtime/tools/ids.ts";
import { emptyDisabledToolSets, type HarnessToolkitEnv } from "../../../../runtime/tools/types.ts";
import type { AgentWorkflowParams } from "../../../../runtime/types.ts";
import { createEphemeralRecentNamespacesTracker } from "../../../memories/tools/_helpers/recent-namespaces.ts";

function env(overrides: Partial<HarnessToolkitEnv> = {}): HarnessToolkitEnv {
  return {
    skills: [],
    activatedSkillNames: new Set(),
    embeddingCache: new Map(),
    recentNamespaces: createEphemeralRecentNamespacesTracker(),
    memoriesClient: {} as HarnessToolkitEnv["memoriesClient"],
    ...emptyDisabledToolSets(),
    ...overrides,
  };
}

function params(): AgentWorkflowParams {
  return {
    runId: "run-1",
    agent: {
      id: "network-negotiation-agent",
      name: "Network Negotiation Agent",
      actingFor: { type: "agent", id: "did:key:alice" },
    },
    model: { id: "test-model" },
    context: {
      sessionId: "run-1",
      chainId: "chain-1",
      asDid: "did:key:alice",
      messages: [],
    },
    tools: {
      disableToolkits: [HARNESS_TOOLKIT.chat, HARNESS_TOOLKIT.khora],
    },
  };
}

describe("negotiation capability capture", () => {
  afterEach(() => {
    resetHarnessAgentRegistryForTests();
  });

  test("memories tools present; NBC, chat, and khora absent", async () => {
    const defined = await defineNegotiationAgent();
    const { tools } = await evaluateComposable(defined.agent.rootComposable, {
      env: env({
        disabledToolkits: new Set([HARNESS_TOOLKIT.chat, HARNESS_TOOLKIT.khora]),
      }),
    });
    const typed = tools as Record<string, unknown>;
    expect(typed.searchMemories).toBeDefined();
    expect(typed.submitNbcAction).toBeUndefined();
    expect(typed.leave).toBeUndefined();
    expect(typed.sendThreadMessage).toBeUndefined();
    expect(typed.searchNetwork).toBeUndefined();

    const captured = await captureHarnessCapabilities({
      agent: defined.agent,
      env: env({
        disabledToolkits: new Set([HARNESS_TOOLKIT.chat, HARNESS_TOOLKIT.khora]),
      }),
      params: params(),
    });
    const keys = captured.capabilities.toolRefs.map((t) => t.toolKey);
    expect(keys).toContain("searchMemories");
    expect(keys).not.toContain("submitNbcAction");
    expect(keys).not.toContain("leave");
    expect(keys).not.toContain("sendThreadMessage");
    expect(captured.capabilities.staticHash.length).toBeGreaterThan(0);
  });
});
