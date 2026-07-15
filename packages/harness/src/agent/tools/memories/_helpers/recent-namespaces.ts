import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const RECENT_NAMESPACES_TOP_K = 8;

export type RecentNamespacesSnapshot = {
  namespaces: string[];
  updatedAtMs: number;
};

export type RecentNamespacesTracker = {
  touch: (namespaces: string | readonly string[]) => void;
  top: (limit?: number) => string[];
  persist: () => Promise<void>;
};

const processCache = new Map<string, string[]>();

function canonicalize(namespace: string): string | undefined {
  const trimmed = namespace.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function moveToFront(list: string[], namespace: string): string[] {
  const next = [namespace, ...list.filter((item) => item !== namespace)];
  return next;
}

export function recentNamespacesDiskPath(networkDataDir: string, agentDid: string): string {
  return join(networkDataDir, "agents", agentDid, "recent-namespaces.json");
}

export async function loadRecentNamespacesFromDisk(
  networkDataDir: string,
  agentDid: string,
): Promise<string[] | undefined> {
  try {
    const raw = await readFile(recentNamespacesDiskPath(networkDataDir, agentDid), "utf8");
    const parsed = JSON.parse(raw) as Partial<RecentNamespacesSnapshot>;
    if (!Array.isArray(parsed.namespaces)) return undefined;
    return parsed.namespaces
      .filter((item): item is string => typeof item === "string")
      .map(canonicalize)
      .filter((item): item is string => item !== undefined);
  } catch {
    return undefined;
  }
}

export async function saveRecentNamespacesToDisk(
  networkDataDir: string,
  agentDid: string,
  namespaces: readonly string[],
): Promise<void> {
  const path = recentNamespacesDiskPath(networkDataDir, agentDid);
  await mkdir(join(networkDataDir, "agents", agentDid), { recursive: true });
  const snapshot: RecentNamespacesSnapshot = {
    namespaces: [...namespaces],
    updatedAtMs: Date.now(),
  };
  await writeFile(path, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}

export function formatRecentNamespacesInstruction(
  namespaces: readonly string[],
): string | undefined {
  if (namespaces.length === 0) return undefined;
  return `Recently used namespaces: ${namespaces.join(", ")}`;
}

/** In-memory tracker for tests (no process cache / disk). */
export function createEphemeralRecentNamespacesTracker(
  initial: readonly string[] = [],
): RecentNamespacesTracker {
  let namespaces = initial.map(canonicalize).filter((item): item is string => item !== undefined);
  return {
    touch(inputNamespaces) {
      const values = Array.isArray(inputNamespaces) ? inputNamespaces : [inputNamespaces];
      for (const value of values) {
        const ns = canonicalize(value);
        if (ns === undefined) continue;
        namespaces = moveToFront(namespaces, ns);
      }
    },
    top(limit = RECENT_NAMESPACES_TOP_K) {
      return namespaces.slice(0, Math.max(0, limit));
    },
    async persist() {},
  };
}

export async function touchRecentNamespaces(
  tracker: RecentNamespacesTracker,
  namespaces: string | readonly string[],
): Promise<void> {
  tracker.touch(namespaces);
  await tracker.persist();
}

/** Cleared between tests. */
export function clearRecentNamespacesProcessCache(): void {
  processCache.clear();
}

export async function resolveRecentNamespacesTracker(input: {
  agentDid?: string;
  networkDataDir?: string;
}): Promise<RecentNamespacesTracker> {
  const agentDid = input.agentDid?.trim();
  const networkDataDir = input.networkDataDir?.trim();
  const cacheKey = agentDid !== undefined && agentDid.length > 0 ? agentDid : undefined;

  let namespaces: string[] = cacheKey !== undefined ? [...(processCache.get(cacheKey) ?? [])] : [];

  if (
    namespaces.length === 0 &&
    cacheKey !== undefined &&
    networkDataDir !== undefined &&
    networkDataDir.length > 0
  ) {
    const fromDisk = await loadRecentNamespacesFromDisk(networkDataDir, cacheKey);
    if (fromDisk !== undefined) namespaces = [...fromDisk];
  }

  if (cacheKey !== undefined) processCache.set(cacheKey, namespaces);

  const tracker: RecentNamespacesTracker = {
    touch(inputNamespaces) {
      const values = Array.isArray(inputNamespaces) ? inputNamespaces : [inputNamespaces];
      for (const value of values) {
        const ns = canonicalize(value);
        if (ns === undefined) continue;
        namespaces = moveToFront(namespaces, ns);
      }
      if (cacheKey !== undefined) processCache.set(cacheKey, namespaces);
    },
    top(limit = RECENT_NAMESPACES_TOP_K) {
      return namespaces.slice(0, Math.max(0, limit));
    },
    async persist() {
      if (cacheKey === undefined || networkDataDir === undefined || networkDataDir.length === 0) {
        return;
      }
      await saveRecentNamespacesToDisk(networkDataDir, cacheKey, namespaces);
    },
  };

  return tracker;
}
