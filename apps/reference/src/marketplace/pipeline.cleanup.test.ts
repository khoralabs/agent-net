import { describe, expect, mock, test } from "bun:test";

import { withInboxPairCleanup } from "./pipeline.ts";

describe("withInboxPairCleanup", () => {
  test("stops pairs and inbox before rethrowing", async () => {
    const stopInbox = mock(() => {});
    const stopAll = mock(() => {});

    await expect(
      withInboxPairCleanup({ stopInbox }, { stopAll }, async () => {
        throw new Error("evaluate failed");
      }),
    ).rejects.toThrow("evaluate failed");

    expect(stopAll).toHaveBeenCalledTimes(1);
    expect(stopInbox).toHaveBeenCalledTimes(1);
  });

  test("does not stop on success", async () => {
    const stopInbox = mock(() => {});
    const stopAll = mock(() => {});

    const value = await withInboxPairCleanup({ stopInbox }, { stopAll }, async () => 42);
    expect(value).toBe(42);
    expect(stopAll).not.toHaveBeenCalled();
    expect(stopInbox).not.toHaveBeenCalled();
  });
});
