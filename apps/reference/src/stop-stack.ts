/**
 * Tear down a local reference stack by pid file and/or pinned ports.
 * Defaults match `orchestrator.ts` / `.env` (8788, 8790, 8791, 8792).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import path from "node:path";

import { ORCHESTRATOR_PID_FILE } from "./stack-files.ts";
import { resolveHarnessDataDir } from "./world/paths.ts";

const DEFAULT_PORTS = [8788, 8790, 8791, 8792] as const;
const GRACE_MS = 2_000;

export function parseStopStackArgs(argv: string[]): { ports: number[]; dataDir: string } {
  const portsOverride: number[] = [];
  let sawPorts = false;
  let dataDirArg: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--ports" && argv[i + 1]) {
      sawPorts = true;
      const raw = argv[i + 1] ?? "";
      i++;
      for (const part of raw.split(",")) {
        const n = Number.parseInt(part.trim(), 10);
        if (Number.isFinite(n) && n > 0) portsOverride.push(n);
      }
    } else if (token === "--data-dir" && argv[i + 1]) {
      dataDirArg = argv[++i];
    }
  }
  const ports = sawPorts ? portsOverride : [...DEFAULT_PORTS];
  return {
    ports: [...new Set(ports)].sort((a, b) => a - b),
    dataDir: resolveHarnessDataDir(dataDirArg),
  };
}

function pidsListeningOnPort(port: number): number[] {
  const result = spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], {
    encoding: "utf8",
  });
  if (result.status !== 0 && result.status !== 1) {
    const err = (result.stderr || result.error?.message || "").trim();
    if (err.length > 0) process.stderr.write(`lsof :${port}: ${err}\n`);
    return [];
  }
  return (result.stdout ?? "")
    .split(/\s+/)
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function readPidFile(dataDir: string): number | undefined {
  const pidPath = path.join(dataDir, ORCHESTRATOR_PID_FILE);
  if (!existsSync(pidPath)) return undefined;
  const raw = readFileSync(pidPath, "utf8").trim();
  const pid = Number.parseInt(raw, 10);
  return Number.isFinite(pid) && pid > 0 ? pid : undefined;
}

function clearPidFile(dataDir: string): void {
  const pidPath = path.join(dataDir, ORCHESTRATOR_PID_FILE);
  try {
    unlinkSync(pidPath);
  } catch {
    /* ignore */
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function killPid(pid: number, signal: NodeJS.Signals = "SIGTERM"): boolean {
  try {
    process.kill(pid, signal);
    return true;
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? String(err.code) : "";
    return code !== "ESRCH";
  }
}

async function waitForExit(pids: Iterable<number>, timeoutMs: number): Promise<Set<number>> {
  const remaining = new Set(pids);
  const deadline = Date.now() + timeoutMs;
  while (remaining.size > 0 && Date.now() < deadline) {
    for (const pid of [...remaining]) {
      if (!isAlive(pid)) remaining.delete(pid);
    }
    if (remaining.size === 0) break;
    await Bun.sleep(100);
  }
  return remaining;
}

async function main(): Promise<void> {
  const { ports, dataDir } = parseStopStackArgs(process.argv.slice(2));
  const killed = new Set<number>();
  const byPort: Array<{ port: number; pids: number[] }> = [];

  const filePid = readPidFile(dataDir);
  if (filePid !== undefined && killPid(filePid)) killed.add(filePid);

  for (const port of ports) {
    const pids = pidsListeningOnPort(port);
    byPort.push({ port, pids });
    for (const pid of pids) {
      if (killed.has(pid)) continue;
      if (killPid(pid)) killed.add(pid);
    }
  }

  if (killed.size > 0) {
    const stillAlive = await waitForExit(killed, GRACE_MS);
    for (const pid of stillAlive) {
      killPid(pid, "SIGKILL");
    }
    for (const port of ports) {
      for (const pid of pidsListeningOnPort(port)) {
        if (killPid(pid, "SIGKILL")) killed.add(pid);
      }
    }
  }

  clearPidFile(dataDir);

  const stillUp = ports.filter((port) => pidsListeningOnPort(port).length > 0);
  process.stdout.write(
    `${JSON.stringify(
      {
        ok: stillUp.length === 0,
        killedPids: [...killed].sort((a, b) => a - b),
        pidFile: filePid ?? null,
        dataDir: path.resolve(dataDir),
        ports: byPort,
        stillListening: stillUp,
      },
      null,
      2,
    )}\n`,
  );
  if (stillUp.length > 0) process.exitCode = 1;
}

if (import.meta.main) {
  await main();
}
