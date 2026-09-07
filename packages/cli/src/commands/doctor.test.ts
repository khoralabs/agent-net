import { describe, expect, test } from "bun:test";

import { CommandExitError } from "../lib/errors.ts";
import { checkHealth, handleDoctor } from "./doctor.ts";

describe("checkHealth", () => {
  test("accepts HTTP 200 with status ok", async () => {
    const fetchImpl = async () =>
      new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    const r = await checkHealth("svc", "http://example.test", "/health", fetchImpl);
    expect(r.ok).toBe(true);
  });

  test("rejects explicit ok: false", async () => {
    const fetchImpl = async () =>
      new Response(JSON.stringify({ ok: false }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    const r = await checkHealth("svc", "http://example.test", "/health", fetchImpl);
    expect(r.ok).toBe(false);
  });
});

describe("doctor", () => {
  test("reports failures as CommandExitError when services down", async () => {
    await expect(
      handleDoctor({
        "khora-url": "http://127.0.0.1:1",
        "relay-url": "http://127.0.0.1:1",
        "memories-url": "http://127.0.0.1:1",
        "chat-url": "http://127.0.0.1:1",
        "chat-token": "t",
        "memories-admin-token": "m",
        json: true,
      }),
    ).rejects.toBeInstanceOf(CommandExitError);
  });
});
