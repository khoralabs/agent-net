import { describe, expect, test } from "bun:test";
import { MemoriesServiceClientError } from "@khoralabs/memories-service/client";
import { RelayClientError } from "@khoralabs/relay/client";
import { VellumClientError } from "@khoralabs/vellum-client";
import { boundaryClientErrorFields, boundaryClientErrorMessage } from "./boundary-client-error.ts";

describe("boundaryClientErrorFields", () => {
  test("preserves RelayClientError status and code", () => {
    const err = new RelayClientError("missing", 404, { code: "not_found" });
    expect(boundaryClientErrorFields(err)).toEqual({
      message: "missing",
      status: 404,
      code: "not_found",
    });
    expect(boundaryClientErrorMessage(err)).toContain("code=not_found");
  });

  test("preserves VellumClientError status and code", () => {
    const err = new VellumClientError("unavailable", 503, undefined, "unavailable");
    expect(boundaryClientErrorFields(err)).toEqual({
      message: "unavailable",
      status: 503,
      code: "unavailable",
    });
  });

  test("preserves MemoriesServiceClientError code", () => {
    const err = new MemoriesServiceClientError("nope", 404, undefined, "not_found");
    expect(boundaryClientErrorFields(err).code).toBe("not_found");
  });
});
