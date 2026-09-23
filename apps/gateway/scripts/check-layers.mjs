#!/usr/bin/env node
// Enforce the hexagonal dependency direction of src/ with no dependencies (the TypeScript
// counterpart of autoresearcher/scripts/check_architecture.py). Rules:
//   domain/       imports only domain/; no packages, no node: modules
//   application/  imports only domain/ and application/; no packages, no node: modules
//   adapters/     must live under inbound/ or outbound/; may import anything
//   main.ts       imports only adapters/inbound/bootstrap and packages
//   domain/ and application/ never touch process, fetch, the wall clock or require
// Exports checkLayers(srcDir) for the test suite; run directly it prints violations and exits 1.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const IMPORT_PATTERN =
  /(?:^|\n)\s*(?:import|export)\s[^'";]*?\sfrom\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
const CONTENT_RULES = [
  [/\bprocess\./, "reads process or the environment (settings belong to bootstrap.ts)"],
  [/\bfetch\(/, "performs network I/O (use the UpstreamHttp or RegistrySource port)"],
  [/\bDate\.now\(/, "reads the wall clock (inject a Clock)"],
  [/\brequire\(/, "uses CommonJS require"],
];
const PURE_LAYERS = new Set(["domain", "application"]);

/** Walk `dir` and return every .ts file (not .d.ts) beneath it. */
function sourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir).sort()) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) out.push(path);
  }
  return out;
}

/** The layer of a path relative to src: domain | application | adapters | root | misplaced. */
function layerOf(rel) {
  const parts = rel.split(sep);
  if (parts.length === 1) return rel === "main.ts" ? "root" : "misplaced";
  if (parts[0] === "domain" || parts[0] === "application") return parts[0];
  if (parts[0] === "adapters") return parts[1] === "inbound" || parts[1] === "outbound" ? "adapters" : "misplaced";
  return "misplaced";
}

/** Import specifiers of one file, as written. */
function importsOf(text) {
  const specs = [];
  for (const match of text.matchAll(IMPORT_PATTERN)) specs.push(match[1] ?? match[2] ?? match[3]);
  return specs;
}

/** Code with comments removed, so a doc comment may mention fetch( without tripping the check. */
function withoutComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function importViolation(layer, file, spec, srcDir) {
  const isRelative = spec.startsWith(".");
  if (!isRelative) {
    return PURE_LAYERS.has(layer) ? `${layer} must not import package or runtime module "${spec}"` : undefined;
  }
  const target = relative(srcDir, resolve(dirname(file), spec));
  const targetLayer = layerOf(target);
  if (layer === "domain" && targetLayer !== "domain") return `domain must not import ${target}`;
  if (layer === "application" && !PURE_LAYERS.has(targetLayer)) return `application must not import ${target}`;
  if (layer === "root" && !target.startsWith(join("adapters", "inbound", "bootstrap"))) {
    return `main.ts must only import the composition root, not ${target}`;
  }
  return undefined;
}

/**
 * Return every violation in `srcDir` as "relative/path.ts: detail". Empty means the layout and
 * the dependency direction hold.
 */
export function checkLayers(srcDir) {
  const violations = [];
  for (const file of sourceFiles(srcDir)) {
    const rel = relative(srcDir, file);
    const layer = layerOf(rel);
    if (layer === "misplaced") {
      violations.push(`${rel}: place modules under domain/, application/ or adapters/{inbound,outbound}/`);
      continue;
    }
    const text = readFileSync(file, "utf8");
    for (const spec of importsOf(text)) {
      const detail = importViolation(layer, file, spec, srcDir);
      if (detail) violations.push(`${rel}: ${detail}`);
    }
    if (PURE_LAYERS.has(layer)) {
      const code = withoutComments(text);
      for (const [pattern, detail] of CONTENT_RULES) if (pattern.test(code)) violations.push(`${rel}: ${detail}`);
    }
  }
  return violations;
}

const invokedDirectly = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const srcDir = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), "..", "src"));
  const violations = checkLayers(srcDir);
  if (violations.length > 0) {
    console.error(`layers: ${violations.length} violation(s)`);
    for (const violation of violations) console.error(`  - ${violation}`);
    process.exit(1);
  }
  console.log(`layers: ok (${srcDir})`);
}
