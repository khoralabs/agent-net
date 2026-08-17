import { describe, expect, test } from "bun:test";

import { vellumPoolAttachmentDataDir } from "./vellum-pool-paths.ts";

describe("vellumPoolAttachmentDataDir", () => {
  test("encodes did and channelId", () => {
    const dir = vellumPoolAttachmentDataDir("/data", "did:key:a/b", "ch/1");
    expect(dir).toContain(encodeURIComponent("did:key:a/b"));
    expect(dir).toContain(encodeURIComponent("ch/1"));
  });
});
