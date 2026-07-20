import { describe, expect, mock, test } from "bun:test";
import { generateIdentity } from "@khoralabs/did-key-identity";

import { HarnessPoolInbox, type InboxConnectionHandle } from "./pool-inbox.ts";

describe("HarnessPoolInbox", () => {
  test("spawning a second principal calls bind on the open handle", async () => {
    const binds: string[][] = [];
    const unbinds: string[][] = [];
    let resolveOpened: (() => void) | undefined;
    const opened = new Promise<void>((r) => {
      resolveOpened = r;
    });

    const handle: InboxConnectionHandle = {
      close: mock(() => {}),
      bind: mock(async (signers: readonly { did: string }[]) => {
        binds.push(signers.map((s) => s.did));
      }),
      unbind: mock(async (dids: readonly string[]) => {
        unbinds.push([...dids]);
      }),
    };

    const a = await generateIdentity();
    const b = await generateIdentity();

    const pool = new HarnessPoolInbox({
      khoraBaseUrl: "http://pool.test",
      openSession: async (signers, handlers) => {
        expect(signers.map((s) => s.did)).toContain(a.did);
        queueMicrotask(() => {
          handlers.onOpen?.();
          resolveOpened?.();
        });
        return handle;
      },
    });

    await pool.add(a);
    await opened;
    await new Promise((r) => setTimeout(r, 20));

    await pool.add(b);
    expect(binds.some((chunk) => chunk.includes(b.did))).toBe(true);
    expect(pool.openSessionCount).toBe(1);

    await pool.remove(b.did);
    expect(unbinds.some((chunk) => chunk.includes(b.did))).toBe(true);
    expect(pool.openSessionCount).toBe(1);

    pool.close();
  });
});
