import { mkdir } from "node:fs/promises";
import path from "node:path";

export type AgentRecord = {
  did: string;
  keyPath: string;
  /**
   * Optional caller-defined id linking this agent to an external system
   * (tenant, org, account, etc.). Opaque to the harness.
   */
  externalId?: string;
};

type StoreFile = {
  agents: AgentRecord[];
};

function normalizeExternalId(value: string): string {
  return value.trim();
}

/** Coerce legacy `platformCompanyId` field into `externalId` if present. */
function normalizeRecord(raw: AgentRecord & { platformCompanyId?: string }): AgentRecord {
  const externalId =
    typeof raw.externalId === "string" && raw.externalId.trim().length > 0
      ? normalizeExternalId(raw.externalId)
      : typeof raw.platformCompanyId === "string" && raw.platformCompanyId.trim().length > 0
        ? normalizeExternalId(raw.platformCompanyId)
        : undefined;
  return {
    did: raw.did,
    keyPath: raw.keyPath,
    ...(externalId !== undefined ? { externalId } : {}),
  };
}

export class AgentStore {
  readonly #filePath: string;
  #agents: AgentRecord[];

  private constructor(filePath: string, agents: AgentRecord[]) {
    this.#filePath = filePath;
    this.#agents = agents;
  }

  static async open(dataDir: string): Promise<AgentStore> {
    const filePath = path.join(dataDir, "agents.json");
    const file = Bun.file(filePath);
    if (await file.exists()) {
      const data = (await file.json()) as StoreFile;
      const agents = (data.agents ?? []).map((a) =>
        normalizeRecord(a as AgentRecord & { platformCompanyId?: string }),
      );
      return new AgentStore(filePath, agents);
    }
    return new AgentStore(filePath, []);
  }

  all(): readonly AgentRecord[] {
    return this.#agents;
  }

  get(did: string): AgentRecord | undefined {
    return this.#agents.find((a) => a.did === did);
  }

  getByExternalId(externalId: string): AgentRecord | undefined {
    const id = normalizeExternalId(externalId);
    if (id.length === 0) return undefined;
    return this.#agents.find((a) => a.externalId === id);
  }

  async add(record: AgentRecord): Promise<void> {
    this.#agents.push(normalizeRecord(record));
    await this.#flush();
  }

  async setExternalId(did: string, externalId: string): Promise<void> {
    const record = this.#agents.find((a) => a.did === did);
    if (record === undefined) {
      throw new Error(`Agent ${did} is not in the store`);
    }
    const id = normalizeExternalId(externalId);
    if (id.length === 0) {
      throw new Error("externalId is required");
    }
    const existing = this.getByExternalId(id);
    if (existing !== undefined && existing.did !== did) {
      throw new Error(`externalId ${id} is already linked to agent ${existing.did}`);
    }
    record.externalId = id;
    await this.#flush();
  }

  async remove(did: string): Promise<void> {
    this.#agents = this.#agents.filter((a) => a.did !== did);
    await this.#flush();
  }

  async #flush(): Promise<void> {
    await mkdir(path.dirname(this.#filePath), { recursive: true });
    const payload: StoreFile = { agents: this.#agents };
    await Bun.write(this.#filePath, `${JSON.stringify(payload, null, 2)}\n`);
  }

  /** Derive a key file path for a new agent DID. */
  static keyPath(dataDir: string, did: string): string {
    const safe = did.replace(/:/g, "_");
    return path.join(dataDir, "agents", `${safe}.json`);
  }
}
