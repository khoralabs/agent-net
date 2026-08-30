import { afterEach, describe, expect, test } from "bun:test";
import { type HarnessChatFetch, harnessChatFetch, installHarnessChatFetch } from "./chat.ts";

describe("installHarnessChatFetch", () => {
  afterEach(() => {
    installHarnessChatFetch(undefined);
  });

  test("stores and clears the override", () => {
    const stub: HarnessChatFetch = async () => new Response("ok");
    installHarnessChatFetch(stub);
    expect(harnessChatFetch()).toBe(stub);
    installHarnessChatFetch(undefined);
    expect(harnessChatFetch()).toBeUndefined();
  });
});
