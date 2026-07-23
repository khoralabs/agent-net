import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dir, "../src");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith(".ts") && !name.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

function rewriteSpec(fromFile, spec) {
  if (!spec.startsWith("./") && !spec.startsWith("../")) return spec;
  if (/\.(ts|tsx|js|mjs|cjs|json)$/.test(spec)) return spec;
  const resolved = path.resolve(path.dirname(fromFile), spec);
  if (existsSync(resolved) && statSync(resolved).isDirectory()) {
    if (existsSync(path.join(resolved, "index.ts"))) return `${spec}/index.ts`;
    if (existsSync(path.join(resolved, "index.tsx"))) return `${spec}/index.tsx`;
  }
  if (existsSync(`${resolved}.ts`)) return `${spec}.ts`;
  if (existsSync(`${resolved}.tsx`)) return `${spec}.tsx`;
  return spec;
}

const re =
  /((?:from|import)\s*\(?\s*|(?:export\s+\*\s+from\s+))(["'])(\.\.?\/[^"']+)\2/g;
let filesChanged = 0;
let specsChanged = 0;

for (const file of walk(root)) {
  const src = readFileSync(file, "utf8");
  let changed = false;
  const next = src.replace(re, (full, prefix, quote, spec) => {
    const rewritten = rewriteSpec(file, spec);
    if (rewritten === spec) return full;
    changed = true;
    specsChanged++;
    return `${prefix}${quote}${rewritten}${quote}`;
  });
  if (changed) {
    writeFileSync(file, next);
    filesChanged++;
  }
}

console.log(JSON.stringify({ filesChanged, specsChanged }, null, 2));
