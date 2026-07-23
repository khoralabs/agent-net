/**
 * Build @khoralabs/agent-net-harness for Node consumers (Nitro workflows):
 * - JS: bun bundler (packages external — chat/relay/memories already ship dist)
 * - types: tsc --emitDeclarationOnly
 */
import { existsSync, rmSync } from "node:fs";
import path from "node:path";

const pkgDir = path.resolve(import.meta.dir, "..");
const distDir = path.join(pkgDir, "dist");
const entry = path.join(pkgDir, "src/index.ts");
const tsconfigPath = path.join(pkgDir, "tsconfig.build.json");

if (!existsSync(entry)) throw new Error(`missing entry ${entry}`);
if (!existsSync(tsconfigPath)) throw new Error(`missing ${tsconfigPath}`);

rmSync(distDir, { recursive: true, force: true });

const js =
  await Bun.$`bun build ${entry} --outdir=dist --root=src --target=node --format=esm --packages=external`
    .cwd(pkgDir)
    .nothrow();
if (js.exitCode !== 0) {
  console.error(js.stderr.toString() || js.stdout.toString());
  throw new Error("bun build failed");
}

const dts = await Bun.$`tsc -p ${tsconfigPath} --emitDeclarationOnly`.cwd(pkgDir).nothrow();
if (dts.exitCode !== 0) {
  console.error(dts.stderr.toString() || dts.stdout.toString());
  throw new Error("tsc --emitDeclarationOnly failed");
}

console.log(`built ${distDir}`);
