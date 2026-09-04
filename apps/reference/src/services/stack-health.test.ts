import { afterAll, describe, expect, test } from "bun:test";
import { CHAT_HTTP_PATH } from "@khoralabs/chat/http";
import { KHORA_HTTP_PATH } from "@khoralabs/khora-client";
import { MEMORIES_HTTP_PATH } from "@khoralabs/memories-service/client";
import { RELAY_HTTP_PATH } from "@khoralabs/relay/contracts";
import { requireKhoraReachable, requireReferenceStackReachable } from "./stack-health.ts";

describe("requireReferenceStackReachable", () => {
  const servers: Array<ReturnType<typeof Bun.serve>> = [];

  afterAll(() => {
    for (const s of servers) s.stop(true);
  });

  test("accepts versioned relay health and shared path constants", async () => {
    const memories = Bun.serve({
      port: 0,
      fetch(req) {
        const url = new URL(req.url);
        if (url.pathname === MEMORIES_HTTP_PATH.health) return Response.json({ ok: true });
        return new Response("no", { status: 404 });
      },
    });
    const relay = Bun.serve({
      port: 0,
      fetch(req) {
        const url = new URL(req.url);
        if (url.pathname === RELAY_HTTP_PATH.health) {
          return Response.json({ ok: true, version: 1 });
        }
        return new Response("no", { status: 404 });
      },
    });
    const chat = Bun.serve({
      port: 0,
      fetch(req) {
        const url = new URL(req.url);
        if (url.pathname === CHAT_HTTP_PATH.health) return Response.json({ ok: true, version: 1 });
        return new Response("no", { status: 404 });
      },
    });
    servers.push(memories, relay, chat);

    await requireReferenceStackReachable({
      memoriesBaseUrl: `http://127.0.0.1:${memories.port}`,
      relayBaseUrl: `http://127.0.0.1:${relay.port}`,
      chatBaseUrl: `http://127.0.0.1:${chat.port}`,
    });
  });

  test("rejects health JSON without ok: true", async () => {
    const bad = Bun.serve({
      port: 0,
      fetch() {
        return Response.json({ ok: false });
      },
    });
    servers.push(bad);
    await expect(requireKhoraReachable(`http://127.0.0.1:${bad.port}`)).rejects.toThrow(
      /not reachable/,
    );
  });

  test("uses KHORA_HTTP_PATH.health", async () => {
    const khora = Bun.serve({
      port: 0,
      fetch(req) {
        const url = new URL(req.url);
        if (url.pathname === KHORA_HTTP_PATH.health) {
          return Response.json({ ok: true, version: 1 });
        }
        return new Response("no", { status: 404 });
      },
    });
    servers.push(khora);
    await requireKhoraReachable(`http://127.0.0.1:${khora.port}`);
  });
});
