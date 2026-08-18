import { describe, expect, test } from "bun:test";
import { runNbcModelTurn } from "./run-nbc-model-turn.ts";

describe("runNbcModelTurn", () => {
  test("posts host-profile body on offer", async () => {
    const posted: unknown[] = [];
    const result = await runNbcModelTurn({
      opening: true,
      peerPorts: [],
      generate: async () => ({ expose: [{ kind: "slot", promise: "open" }] }),
      postTurn: async (body) => {
        posted.push(body);
      },
      postLeave: async () => {
        throw new Error("leave not expected");
      },
    });
    expect(result).toEqual({ kind: "offer" });
    expect(posted).toEqual([{ expose: [{ kind: "slot", promise: "open" }] }]);
  });

  test("calls postLeave on disconnect", async () => {
    let left = false;
    const result = await runNbcModelTurn({
      opening: false,
      peerPorts: [],
      generate: async () => ({ disconnect: true }),
      postTurn: async () => {
        throw new Error("turn not expected");
      },
      postLeave: async () => {
        left = true;
      },
    });
    expect(result).toEqual({ kind: "disconnect" });
    expect(left).toBe(true);
  });
});
