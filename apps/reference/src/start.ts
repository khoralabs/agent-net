import { mkdirSync, openSync, writeFileSync } from "node:fs";
import path from "node:path";

import { ORCHESTRATOR_LOG_FILE, ORCHESTRATOR_PID_FILE } from "./stack-files.ts";
import { resolveHarnessDataDir } from "./world/paths.ts";

function splitArgs(argv: string[]): { detached: boolean; forward: string[] } {
  const forward: string[] = [];
  let detached = false;
  for (const token of argv) {
    if (token === "-d" || token === "--detached") {
      detached = true;
      continue;
    }
    forward.push(token);
  }
  return { detached, forward };
}

function dataDirFromArgs(forward: string[]): string {
  for (let i = 0; i < forward.length; i++) {
    if (forward[i] === "--data-dir" && forward[i + 1] !== undefined) {
      return resolveHarnessDataDir(forward[i + 1]);
    }
  }
  return resolveHarnessDataDir(undefined);
}

function khoraPortFromArgs(forward: string[]): number {
  for (let i = 0; i < forward.length; i++) {
    if (forward[i] === "--khora-port") {
      const raw = forward[i + 1];
      if (raw === undefined) continue;
      const n = Number.parseInt(raw, 10);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return 8788;
}

async function waitForHealth(url: string, timeoutMs: number, childPid: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    try {
      process.kill(childPid, 0);
    } catch {
      throw new Error(
        `Detached orchestrator (pid ${childPid}) exited before becoming healthy at ${url}` +
          (last.length > 0 ? ` (last: ${last})` : ""),
      );
    }
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1_500) });
      if (res.ok) return;
      last = `HTTP ${res.status}`;
    } catch (err) {
      last = err instanceof Error ? err.message : String(err);
    }
    await Bun.sleep(200);
  }
  throw new Error(`Stack did not become healthy at ${url} (${last})`);
}

async function startDetached(forward: string[]): Promise<void> {
  const dataDir = path.resolve(dataDirFromArgs(forward));
  mkdirSync(dataDir, { recursive: true });
  const logPath = path.join(dataDir, ORCHESTRATOR_LOG_FILE);
  const pidPath = path.join(dataDir, ORCHESTRATOR_PID_FILE);
  const logFd = openSync(logPath, "a");

  const child = Bun.spawn(
    [process.execPath, "run", path.join(import.meta.dir, "orchestrator.ts"), "--", ...forward],
    {
      cwd: process.cwd(),
      env: process.env,
      stdin: "ignore",
      stdout: logFd,
      stderr: logFd,
      detached: true,
    },
  );

  if (child.pid === undefined) {
    throw new Error("Failed to spawn detached orchestrator (no pid)");
  }
  writeFileSync(pidPath, `${child.pid}\n`, "utf8");
  child.unref();

  const khoraPort = khoraPortFromArgs(forward);
  try {
    await waitForHealth(`http://127.0.0.1:${khoraPort}/health`, 45_000, child.pid);
  } catch (err) {
    try {
      process.kill(child.pid, "SIGTERM");
    } catch {
      /* ignore */
    }
    throw err;
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        detached: true,
        pid: child.pid,
        dataDir,
        pidPath,
        logPath,
        stop: "bun run stop",
      },
      null,
      2,
    )}\n`,
  );
}

async function main(): Promise<void> {
  const { detached, forward } = splitArgs(process.argv.slice(2));
  if (!detached) {
    // Foreground: load orchestrator entry (runs its own main).
    await import("./orchestrator.ts");
    return;
  }
  await startDetached(forward);
}

if (import.meta.main) {
  await main();
}
