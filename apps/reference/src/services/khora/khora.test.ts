import { afterEach, describe, expect, test } from "bun:test";

import { KHORA_HTTP_PATH } from "@khoralabs/khora-client";
import {
  assertKhoraMemoriesDbPathUnset,
  envMemoriesEnabled,
  readKhoraMemoriesNamespaceRoot,
} from "./memories-env.ts";
import { resolveKhoraPersistencePaths } from "./persistence-paths.ts";
import { startKhoraHost } from "./start-khora-host.ts";

describe("khora persistence paths", () => {
  test("resolves default layout under KHORA_DATA_DIR", () => {
    const paths = resolveKhoraPersistencePaths({ KHORA_DATA_DIR: "/tmp/ref-khora" }, "/tmp");
    expect(paths.dataDir).toBe("/tmp/ref-khora");
    expect(paths.hostDbPath).toBe("/tmp/ref-khora/khora-host.sqlite");
    expect(paths.memoriesDataDir).toBe("/tmp/ref-khora/memories");
  });

  test("honors per-path overrides", () => {
    const paths = resolveKhoraPersistencePaths(
      {
        KHORA_DATA_DIR: "/tmp/ref-khora",
        KHORA_HOST_DB_PATH: "/tmp/custom-host.sqlite",
        KHORA_CELLS_DIR: "/tmp/custom-cells",
      },
      "/tmp",
    );
    expect(paths.hostDbPath).toBe("/tmp/custom-host.sqlite");
    expect(paths.cellsDir).toBe("/tmp/custom-cells");
  });
});

describe("khora memories env", () => {
  test("envMemoriesEnabled defaults on", () => {
    expect(envMemoriesEnabled({})).toBe(true);
    expect(envMemoriesEnabled({ KHORA_MEMORIES: "0" })).toBe(false);
  });

  test("namespace root defaults to global", () => {
    expect(readKhoraMemoriesNamespaceRoot({})).toBe("global");
    expect(readKhoraMemoriesNamespaceRoot({ KHORA_MEMORIES_NAMESPACE_ROOT: "lab" })).toBe("lab");
  });

  test("assertKhoraMemoriesDbPathUnset rejects legacy path", () => {
    expect(() => assertKhoraMemoriesDbPathUnset({ KHORA_MEMORIES_DB_PATH: "./x.db" })).toThrow(
      /KHORA_MEMORIES_DB_PATH/,
    );
  });
});

describe("startKhoraHost", () => {
  const prevKey = process.env.KHORA_OUTBOX_ENCRYPTION_KEY;
  afterEach(() => {
    if (prevKey === undefined) delete process.env.KHORA_OUTBOX_ENCRYPTION_KEY;
    else process.env.KHORA_OUTBOX_ENCRYPTION_KEY = prevKey;
  });

  test("serves /health and stops cleanly", async () => {
    process.env.KHORA_OUTBOX_ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const dataDir = `/tmp/agent-net-khora-test-${process.pid}-${Date.now()}`;
    const host = await startKhoraHost({ dataDir, port: 0 });
    try {
      const res = await fetch(`${host.baseUrl}${KHORA_HTTP_PATH.health}`);
      expect(res.ok).toBe(true);
      expect(await res.json()).toEqual({ ok: true });
    } finally {
      host.stop();
    }
  });
});
