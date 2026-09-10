import { describe, expect, test } from "bun:test";
import type { MemoriesDatabaseId } from "@khoralabs/memories-service";
import { agentMemoriesDatabase } from "@khoralabs/memories-service/client/agent";
import { createHarnessMemoriesAccess } from "./harness-memories.ts";

describe("createHarnessMemoriesAccess", () => {
  test("forAgent scopes to agentMemoriesDatabase for managed DIDs", () => {
    const did = "did:key:managed";
    const access = createHarnessMemoriesAccess({
      memoriesBaseUrl: "http://memories.test",
      memoriesAdminToken: "secret",
      isManagedAgent: (d) => d === did,
    });
    const model = access.forAgent(did);
    expect(model.database).toEqual(agentMemoriesDatabase(did));
    expect((model as { adminToken?: string }).adminToken).toBeUndefined();
  });

  test("forAgent rejects unknown pool DIDs", () => {
    const access = createHarnessMemoriesAccess({
      memoriesBaseUrl: "http://memories.test",
      memoriesAdminToken: "secret",
      isManagedAgent: () => false,
    });
    expect(() => access.forAgent("did:key:stranger")).toThrow(/not in the managed pool/);
  });

  test("forDatabase allows arbitrary databases explicitly", () => {
    const database: MemoriesDatabaseId = { kind: "account", ownerKey: "workflow-acct" };
    const access = createHarnessMemoriesAccess({
      memoriesBaseUrl: "http://memories.test",
      memoriesAdminToken: "secret",
      isManagedAgent: () => false,
    });
    expect(access.forDatabase(database).database).toEqual(database);
  });
});
