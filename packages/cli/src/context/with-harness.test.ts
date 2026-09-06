import { describe, expect, mock, test } from "bun:test";

import type { FlagMap } from "../lib/argv.ts";
import { withHarness } from "./with-harness.ts";

describe("withHarness", () => {
  test("calls stop after success and after failure", async () => {
    const stop = mock(() => {});
    const start = mock(async () => ({ stop }) as never);
    const flags: FlagMap = {
      "chat-token": "t",
      "memories-admin-token": "m",
      "data-dir": "/tmp/agent-net-cli-harness-test",
    };

    await withHarness(flags, async () => "ok", { start });
    expect(stop).toHaveBeenCalledTimes(1);

    stop.mockClear();
    await expect(
      withHarness(
        flags,
        async () => {
          throw new Error("boom");
        },
        { start },
      ),
    ).rejects.toThrow("boom");
    expect(stop).toHaveBeenCalledTimes(1);
  });

  test("rejects missing tokens before start", async () => {
    const start = mock(async () => ({ stop: () => {} }) as never);
    await expect(withHarness({}, async () => null, { start })).rejects.toThrow(/adminToken|token/i);
    expect(start).not.toHaveBeenCalled();
  });
});
