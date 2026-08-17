import { describe, expect, test } from "bun:test";
import { runNbcModelTurn } from "./run-nbc-model-turn.ts";

describe("runNbcModelTurn", () => {
  test("posts wire body on offer", async () => {
    const posted: unknown[] = [];
    const result = await runNbcModelTurn({
      opening: true,
      peerPorts: [],
      remainingTurns: 4,
      generate: async () => ({ expose: [{ kind: "slot", promise: "open" }] }),
      postTurn: async (body) => {
        posted.push(body);
      },
      postLeave: async () => {
        throw new Error("leave not expected");
      },
    });
    expect(result).toEqual({ kind: "offer" });
    expect(posted.length).toBe(1);
  });

  test("calls postLeave on disconnect", async () => {
    let left = false;
    const result = await runNbcModelTurn({
      opening: false,
      peerPorts: [],
      remainingTurns: 3,
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
