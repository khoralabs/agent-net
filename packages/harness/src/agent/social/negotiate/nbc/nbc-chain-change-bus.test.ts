import { describe, expect, test } from "bun:test";
import { createNbcChainChangeBus } from "./nbc-chain-change-bus.ts";

describe("nbc chain-change bus", () => {
  test("publish delivers to subscribers and unsubscribe stops delivery", () => {
    const bus = createNbcChainChangeBus();
    const seen: string[] = [];
    const unsub = bus.subscribe((event) => {
      seen.push(`${event.cause}:${event.turnSeq}`);
    });
    bus.publish({ chainId: "c1", turnSeq: 0, cause: "opened" });
    unsub();
    bus.publish({ chainId: "c1", turnSeq: 1, cause: "turn" });
    expect(seen).toEqual(["opened:0"]);
  });
});
