/**
 * Build @khoralabs/agent-net for Node consumers:
 * - JS: bun bundler per export entry (packages external)
 * - types: tsc --emitDeclarationOnly
 */
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

const pkgDir = path.resolve(import.meta.dir, "..");
const distDir = path.join(pkgDir, "dist");
const tsconfigPath = path.join(pkgDir, "tsconfig.build.json");

type ExportTarget = {
  types?: string;
  bun?: string;
  import?: string;
  default?: string;
};

function collectSrcEntries(): string[] {
  const pkg = JSON.parse(readFileSync(path.join(pkgDir, "package.json"), "utf8")) as {
    exports?: Record<string, ExportTarget | string>;
  };
  const entries = new Set<string>();
  for (const value of Object.values(pkg.exports ?? {})) {
    const src =
      typeof value === "string" ? value : value.bun || value.import || value.default || value.types;
    if (!src?.startsWith("./src/") || !/\.tsx?$/.test(src)) continue;
    const abs = path.join(pkgDir, src);
    if (!existsSync(abs)) throw new Error(`export entry missing: ${src}`);
    entries.add(src);
  }
  if (entries.size === 0) throw new Error("no ./src export entries");
  return [...entries];
}

if (!existsSync(tsconfigPath)) throw new Error(`missing ${tsconfigPath}`);

rmSync(distDir, { recursive: true, force: true });

const entries = collectSrcEntries();
for (const entry of entries) {
  const js =
    await Bun.$`bun build ${entry} --outdir=dist --root=src --target=node --format=esm --packages=external`
      .cwd(pkgDir)
      .nothrow();
  if (js.exitCode !== 0) {
    console.error(js.stderr.toString() || js.stdout.toString());
    throw new Error(`bun build failed: ${entry}`);
  }
}

const dts = await Bun.$`tsc -p ${tsconfigPath} --emitDeclarationOnly`.cwd(pkgDir).nothrow();
if (dts.exitCode !== 0) {
  console.error(dts.stderr.toString() || dts.stdout.toString());
  throw new Error("tsc --emitDeclarationOnly failed");
}

console.log(`built ${entries.length} entr(y/ies) → ${distDir}`);
