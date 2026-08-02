import { describe, expect, test } from "bun:test";
import {
  createDeferredHarnessMemoriesClient,
  resolveHarnessMemoriesOntology,
} from "./memories-client.ts";

const database = { kind: "account", ownerKey: "did:key:test" } as const;

describe("createDeferredHarnessMemoriesClient", () => {
  test("returns a sync handle that does not materialize until first use", () => {
    const client = createDeferredHarnessMemoriesClient({
      baseUrl: "http://127.0.0.1:9",
      database,
      ontology: { nodeLabels: {}, edgeLabels: {} },
      adminToken: "test-token",
    });

    expect(client).toBeDefined();
    expect(() => client.ontology).toThrow(/ontology.*unavailable/i);
  });

  test("resolveHarnessMemoriesOntology merges app ontology onto harness baseline", () => {
    const resolved = resolveHarnessMemoriesOntology({
      nodeLabels: {},
      edgeLabels: {},
    });
    expect(resolved.nodeLabels).toBeDefined();
    expect(resolved.edgeLabels).toBeDefined();
  });
});
