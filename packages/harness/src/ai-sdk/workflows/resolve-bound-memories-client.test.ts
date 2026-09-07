import { afterEach, describe, expect, test } from "bun:test";
import type { RemoteMemoriesClientAsync } from "@khoralabs/memories-service/client";
import {
  registerNetworkSession,
  resetNetworkSessionRegistryForTests,
} from "../../pool/network/session-registry.ts";
import {
  hasBoundNetworkSession,
  isOptionalMemoriesUnavailable,
  resolveBoundAgentMemoriesClient,
} from "./resolve-bound-memories-client.ts";

const SENTINEL = { kind: "sentinel-memories-client" } as unknown as RemoteMemoriesClientAsync;

afterEach(() => {
  resetNetworkSessionRegistryForTests();
  delete process.env.MEMORIES_SERVICE_ADMIN_TOKEN;
});

describe("resolveBoundAgentMemoriesClient", () => {
  test("uses session-bound memoriesClient without requiring admin token", async () => {
    const sessionId = "econ-session-1";
    const agentDid = "did:example:alice";
    let resolvedDid: string | undefined;
    registerNetworkSession({
      sessionId,
      dataDir: "/tmp/unused",
      resolveAgentWorkflowDeps: async (did) => {
        resolvedDid = did;
        return { memoriesClient: SENTINEL, sessionId };
      },
    });

    delete process.env.MEMORIES_SERVICE_ADMIN_TOKEN;
    const client = await resolveBoundAgentMemoriesClient({
      agentDid,
      sessionId,
      allowBearerFallback: false,
    });

    expect(client).toBe(SENTINEL);
    expect(resolvedDid).toBe(agentDid);
    expect(hasBoundNetworkSession(sessionId)).toBe(true);
  });

  test("does not fall through to Bearer when session is bound but client missing", async () => {
    const sessionId = "econ-session-missing-client";
    process.env.MEMORIES_SERVICE_ADMIN_TOKEN = "should-not-be-used";
    registerNetworkSession({
      sessionId,
      dataDir: "/tmp/unused",
      resolveAgentWorkflowDeps: async () => ({ sessionId }),
    });

    await expect(
      resolveBoundAgentMemoriesClient({
        agentDid: "did:example:bob",
        sessionId,
      }),
    ).rejects.toThrow(/no memoriesClient/);
  });

  test("Bearer fallback when sessionId is not registered", async () => {
    delete process.env.MEMORIES_SERVICE_ADMIN_TOKEN;
    await expect(
      resolveBoundAgentMemoriesClient({
        agentDid: "did:example:unbound",
        sessionId: "workflow-run-id-not-a-network-session",
        allowMinimalOntology: true,
      }),
    ).rejects.toThrow(/MEMORIES_SERVICE_ADMIN_TOKEN/);
  });

  test("rejects unregistered sessionId when Bearer fallback disabled", async () => {
    await expect(
      resolveBoundAgentMemoriesClient({
        agentDid: "did:example:erin",
        sessionId: "missing-session",
        allowBearerFallback: false,
      }),
    ).rejects.toThrow(/is not active/);
  });

  test("Bearer fallback requires admin token when no sessionId", async () => {
    delete process.env.MEMORIES_SERVICE_ADMIN_TOKEN;
    await expect(
      resolveBoundAgentMemoriesClient({
        agentDid: "did:example:carol",
        allowMinimalOntology: true,
      }),
    ).rejects.toThrow(/MEMORIES_SERVICE_ADMIN_TOKEN/);
  });

  test("rejects missing sessionId when Bearer fallback disabled", async () => {
    await expect(
      resolveBoundAgentMemoriesClient({
        agentDid: "did:example:dave",
        allowBearerFallback: false,
      }),
    ).rejects.toThrow(/sessionId is required/);
  });

  test("isOptionalMemoriesUnavailable classifies config gaps", () => {
    expect(
      isOptionalMemoriesUnavailable(new Error("MEMORIES_SERVICE_ADMIN_TOKEN is required")),
    ).toBe(true);
    expect(isOptionalMemoriesUnavailable(new Error("memories ontology is not installed"))).toBe(
      true,
    );
    expect(
      isOptionalMemoriesUnavailable(new Error("network session x has no memoriesClient")),
    ).toBe(false);
  });
});
