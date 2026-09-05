import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const packageRoot = path.resolve(import.meta.dir, "..");
const srcRoot = path.join(packageRoot, "src");

describe("root export graph peel", () => {
  test("root does not re-export negotiate/chat/memories/ai-sdk/swarm peels", () => {
    const entry = path.join(srcRoot, "index.ts");
    const indexText = readFileSync(entry, "utf8");
    expect(indexText.includes("social/negotiate")).toBe(false);
    expect(indexText.includes("social/message/chat")).toBe(false);
    expect(indexText.includes("social/message/chat-service")).toBe(false);
    expect(indexText.includes("social/message/message")).toBe(false);
    expect(indexText.includes("memories/integrate")).toBe(false);
    expect(indexText.includes("memories-ontology-install")).toBe(false);
    expect(indexText.includes("memories-types")).toBe(false);
    expect(indexText.includes("ai-sdk")).toBe(false);
    expect(indexText.includes("swarm/")).toBe(false);
  });
});
