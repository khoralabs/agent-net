import { describe, expect, test } from "bun:test";

import { parseIntegrateMemoryEvent } from "./memory-event.ts";

describe("parseIntegrateMemoryEvent", () => {
  test("parses interaction with writeScope under", () => {
    const event = parseIntegrateMemoryEvent({
      kind: "interaction",
      ownerKey: "did:key:abc",
      namespace: "notes",
      writeScope: "under",
      correlationId: "c1",
      occurredAtMs: 1,
      payload: { summary: "x" },
      features: { lexical: ["x"], vector: [] },
      instructions: "",
    });
    expect(event.kind).toBe("interaction");
    expect(event.ownerKey).toBe("did:key:abc");
    expect(event.namespace).toBe("notes");
    expect(event.writeScope).toBe("under");
    expect(event.features.lexical).toEqual(["x"]);
  });

  test("parses kind memory with memoryKey and caller writeScope", () => {
    const event = parseIntegrateMemoryEvent({
      kind: "memory",
      ownerKey: "c",
      namespace: "notes",
      memoryKey: "gia-kim",
      writeScope: "under",
      correlationId: "c1",
      occurredAtMs: 1,
      payload: { source: "writeMemory" },
      features: { lexical: ["Name: Gia"], vector: [] },
      instructions: "",
    });
    expect(event.kind).toBe("memory");
    expect(event.memoryKey).toBe("gia-kim");
    expect(event.writeScope).toBe("under");
    expect(event.features.lexical).toEqual(["Name: Gia"]);
  });

  test("parses writeScope cross", () => {
    const event = parseIntegrateMemoryEvent({
      kind: "memory",
      ownerKey: "host",
      namespace: "did_key_co",
      memoryKey: "overview",
      writeScope: "cross",
      correlationId: "c1",
      occurredAtMs: 1,
      payload: { source: "ops-deepen" },
      features: { lexical: ["About Acme"], vector: [] },
      instructions: "",
    });
    expect(event.writeScope).toBe("cross");
    expect(event.features.lexical).toEqual(["About Acme"]);
  });

  test("requires memoryKey when kind is memory", () => {
    expect(() =>
      parseIntegrateMemoryEvent({
        kind: "memory",
        ownerKey: "c",
        namespace: "n",
        correlationId: "c1",
        occurredAtMs: 1,
        payload: {},
        features: { lexical: ["x"], vector: [] },
        instructions: "",
      }),
    ).toThrow(/memoryKey/);
  });

  test("rejects invalid writeScope", () => {
    expect(() =>
      parseIntegrateMemoryEvent({
        kind: "interaction",
        ownerKey: "c",
        namespace: "n",
        writeScope: "subtree",
        correlationId: "c1",
        occurredAtMs: 1,
        payload: {},
        features: { lexical: ["x"], vector: [] },
        instructions: "",
      }),
    ).toThrow(/writeScope/);
  });

  test("rejects legacy text-only wire", () => {
    expect(() =>
      parseIntegrateMemoryEvent({
        kind: "interaction",
        ownerKey: "c",
        namespace: "notes",
        correlationId: "c1",
        occurredAtMs: 1,
        payload: {},
        text: "legacy",
      }),
    ).toThrow(/features/);
  });

  test("rejects companyId wire alias", () => {
    expect(() =>
      parseIntegrateMemoryEvent({
        kind: "interaction",
        companyId: "did:key:legacy",
        namespace: "notes",
        correlationId: "e1",
        occurredAtMs: 1,
        payload: {},
        features: { lexical: ["x"], vector: [] },
        instructions: "",
      }),
    ).toThrow(/ownerKey/);
  });

  test("rejects non-object body", () => {
    expect(() => parseIntegrateMemoryEvent(null)).toThrow(/object/);
    expect(() => parseIntegrateMemoryEvent([])).toThrow(/object/);
  });
});
