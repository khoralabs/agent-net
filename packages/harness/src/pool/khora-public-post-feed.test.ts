import { describe, expect, test } from "bun:test";
import { KHORA_HTTP_PATH } from "@khoralabs/khora-client";
import { createKhoraPublicPostFeed, KhoraPublicPostFeedError } from "./khora-public-post-feed.ts";

describe("createKhoraPublicPostFeed", () => {
  test("list encodes filters and Bearer auth", async () => {
    let seenUrl = "";
    let auth = "";
    const feed = createKhoraPublicPostFeed({
      baseUrl: "http://khora.test/",
      adminToken: "secret",
      fetchFn: async (input, init) => {
        seenUrl = String(input);
        auth = new Headers(init?.headers).get("Authorization") ?? "";
        return Response.json({
          items: [
            {
              id: "p1",
              kind: "post",
              authorDid: "did:key:a",
              topics: ["buy"],
              visibility: "public",
              publishedAtMs: 42,
            },
          ],
          nextCursor: "c1",
          hasMore: true,
          watermarkMs: 42,
        });
      },
    });

    const page = await feed.list({
      limit: 5,
      cursor: "abc",
      authorDid: "did:key:a",
      tags: ["buy", "ltl"],
    });
    expect(auth).toBe("Bearer secret");
    const u = new URL(seenUrl);
    expect(u.origin + u.pathname).toBe(`http://khora.test${KHORA_HTTP_PATH.opsPosts}`);
    expect(u.searchParams.get("limit")).toBe("5");
    expect(u.searchParams.get("cursor")).toBe("abc");
    expect(u.searchParams.get("authorDid")).toBe("did:key:a");
    expect(u.searchParams.getAll("tag")).toEqual(["buy", "ltl"]);
    expect(page.items[0]?.publishedAtMs).toBe(42);
    expect(page.nextCursor).toBe("c1");
  });

  test("newerCount forwards afterMs and tags", async () => {
    let seenUrl = "";
    const feed = createKhoraPublicPostFeed({
      baseUrl: "http://khora.test",
      adminToken: "secret",
      fetchFn: async (input) => {
        seenUrl = String(input);
        return Response.json({ count: 3 });
      },
    });
    const out = await feed.newerCount({
      afterMs: 99,
      authorDid: "did:key:a",
      tags: ["t1"],
    });
    expect(out.count).toBe(3);
    const u = new URL(seenUrl);
    expect(u.pathname).toBe(KHORA_HTTP_PATH.opsPostsNewerCount);
    expect(u.searchParams.get("afterMs")).toBe("99");
    expect(u.searchParams.get("authorDid")).toBe("did:key:a");
    expect(u.searchParams.getAll("tag")).toEqual(["t1"]);
  });

  test("preserves upstream status and code", async () => {
    const feed = createKhoraPublicPostFeed({
      baseUrl: "http://khora.test",
      adminToken: "secret",
      fetchFn: async () =>
        Response.json({ error: "Unauthorized", code: "unauthorized" }, { status: 401 }),
    });
    try {
      await feed.list();
      expect.unreachable("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(KhoraPublicPostFeedError);
      expect((err as KhoraPublicPostFeedError).status).toBe(401);
      expect((err as KhoraPublicPostFeedError).code).toBe("unauthorized");
      expect((err as KhoraPublicPostFeedError).message).toBe("Unauthorized");
    }
  });

  test("rejects invalid list payloads", async () => {
    const feed = createKhoraPublicPostFeed({
      baseUrl: "http://khora.test",
      adminToken: "secret",
      fetchFn: async () => Response.json({ items: "nope" }),
    });
    await expect(feed.list()).rejects.toBeInstanceOf(KhoraPublicPostFeedError);
  });

  test("wraps network failures", async () => {
    const feed = createKhoraPublicPostFeed({
      baseUrl: "http://khora.test",
      adminToken: "secret",
      fetchFn: async () => {
        throw new Error("ECONNREFUSED");
      },
    });
    await expect(feed.list()).rejects.toMatchObject({
      name: "KhoraPublicPostFeedError",
      message: expect.stringContaining("unreachable"),
    });
  });
});
