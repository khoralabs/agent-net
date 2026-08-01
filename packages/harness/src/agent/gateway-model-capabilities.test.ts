import { describe, expect, test } from "bun:test";

import {
  capabilitiesFromGatewayEntry,
  clearGatewayModelCatalogCache,
  parseGatewayModelsResponse,
  resolveResponseModelCapabilities,
} from "./gateway-model-capabilities.ts";

describe("parseGatewayModelsResponse", () => {
  test("extracts id, tags, supported_parameters, max_tokens", () => {
    const entries = parseGatewayModelsResponse({
      data: [
        {
          id: "zai/glm-5.2-fast",
          tags: ["reasoning", "tools"],
          supported_parameters: ["temperature"],
          max_tokens: 128000,
        },
        { id: "acme/fast-chat", supported_parameters: ["temperature"] },
        { notAnId: true },
      ],
    });
    expect(entries).toEqual([
      {
        id: "zai/glm-5.2-fast",
        tags: ["reasoning", "tools"],
        supported_parameters: ["temperature"],
        max_tokens: 128000,
      },
      {
        id: "acme/fast-chat",
        supported_parameters: ["temperature"],
      },
    ]);
  });

  test("returns empty for invalid payload", () => {
    expect(parseGatewayModelsResponse(null)).toEqual([]);
    expect(parseGatewayModelsResponse({})).toEqual([]);
  });
});

describe("capabilitiesFromGatewayEntry", () => {
  test("supportsReasoning from tags", () => {
    expect(
      capabilitiesFromGatewayEntry("m", {
        id: "m",
        tags: ["reasoning"],
      }),
    ).toEqual({
      modelId: "m",
      supportsReasoning: true,
      maxOutputTokens: null,
      unknown: false,
    });
  });

  test("supportsReasoning from supported_parameters", () => {
    expect(
      capabilitiesFromGatewayEntry("m", {
        id: "m",
        supported_parameters: ["reasoning", "temperature"],
        max_tokens: 4096,
      }),
    ).toEqual({
      modelId: "m",
      supportsReasoning: true,
      maxOutputTokens: 4096,
      unknown: false,
    });
  });

  test("false when neither has reasoning", () => {
    expect(
      capabilitiesFromGatewayEntry("m", {
        id: "m",
        tags: ["tools"],
        supported_parameters: ["temperature"],
      }).supportsReasoning,
    ).toBe(false);
  });

  test("missing entry is unknown optimistic", () => {
    expect(capabilitiesFromGatewayEntry("missing/model", undefined)).toEqual({
      modelId: "missing/model",
      supportsReasoning: true,
      maxOutputTokens: null,
      unknown: true,
    });
  });
});

describe("resolveResponseModelCapabilities", () => {
  test("uses catalog and returns known caps", async () => {
    clearGatewayModelCatalogCache();
    const caps = await resolveResponseModelCapabilities("acme/fast-chat", {
      catalog: [
        { id: "acme/fast-chat", tags: ["tools"] },
        { id: "zai/glm", tags: ["reasoning"] },
      ],
    });
    expect(caps).toEqual({
      modelId: "acme/fast-chat",
      supportsReasoning: false,
      maxOutputTokens: null,
      unknown: false,
    });
  });

  test("missing model in catalog is unknown optimistic", async () => {
    const caps = await resolveResponseModelCapabilities("gone/model", {
      catalog: [{ id: "other", tags: ["reasoning"] }],
    });
    expect(caps.unknown).toBe(true);
    expect(caps.supportsReasoning).toBe(true);
  });

  test("fetch failure is unknown optimistic", async () => {
    clearGatewayModelCatalogCache();
    const caps = await resolveResponseModelCapabilities("any/model", {
      fetchFn: (async () => new Response("nope", { status: 503 })) as typeof fetch,
    });
    expect(caps).toEqual({
      modelId: "any/model",
      supportsReasoning: true,
      maxOutputTokens: null,
      unknown: true,
    });
  });

  test("empty model id is unknown optimistic", async () => {
    const caps = await resolveResponseModelCapabilities("  ");
    expect(caps.unknown).toBe(true);
    expect(caps.supportsReasoning).toBe(true);
  });
});
