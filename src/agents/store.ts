import { mkdir } from "node:fs/promises";
import path from "node:path";

export type AgentRecord = {
  did: string;
  keyPath: string;
};

type StoreFile = {
  agents: AgentRecord[];
};

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
      return new AgentStore(filePath, data.agents ?? []);
    }
    return new AgentStore(filePath, []);
  }

  all(): readonly AgentRecord[] {
    return this.#agents;
  }

  get(did: string): AgentRecord | undefined {
    return this.#agents.find((a) => a.did === did);
  }

  async add(record: AgentRecord): Promise<void> {
    this.#agents.push(record);
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
