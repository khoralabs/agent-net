import { afterEach, describe, expect, test } from "bun:test";
import type { MemoriesServiceFetch } from "@khoralabs/memories-service/client";
import {
  createDeferredAgentMemoriesClient,
  installMemoriesServiceFetch,
  memoriesServiceFetch,
  resolveAgentMemoriesOntology,
} from "@khoralabs/memories-service/client/agent";

const database = { kind: "account", ownerKey: "did:key:test" } as const;

describe("installMemoriesServiceFetch", () => {
  afterEach(() => {
    installMemoriesServiceFetch(undefined);
  });

  test("overrides the default fetch used by agent memories clients", () => {
    const stub: MemoriesServiceFetch = async () => new Response("ok");
    installMemoriesServiceFetch(stub);
    expect(memoriesServiceFetch()).toBe(stub);
  });
});

describe("createDeferredAgentMemoriesClient", () => {
  test("returns a sync handle that does not materialize until first use", () => {
    const client = createDeferredAgentMemoriesClient({
      baseUrl: "http://127.0.0.1:9",
      database,
      ontology: { nodeLabels: {}, edgeLabels: {} },
      adminToken: "test-token",
    });

    expect(client).toBeDefined();
    expect(() => client.ontology).toThrow(/ontology.*unavailable/i);
  });

  test("resolveAgentMemoriesOntology merges app ontology onto agent baseline", () => {
    const resolved = resolveAgentMemoriesOntology({
      nodeLabels: {},
      edgeLabels: {},
    });
    expect(resolved.nodeLabels).toBeDefined();
    expect(resolved.edgeLabels).toBeDefined();
  });
});
