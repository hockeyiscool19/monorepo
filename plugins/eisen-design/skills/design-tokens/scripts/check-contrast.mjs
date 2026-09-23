#!/usr/bin/env node
/**
 * check-contrast.mjs — verify one or more tokens.css files against the design-token contract.
 *
 * Zero dependencies (Node 18+). Usage:
 *   node check-contrast.mjs [--neutral <tokens.css>] <tokens.css> [<tokens.css> ...]
 *
 * For each file it parses the `:root {}` block (light) and the `:root[data-theme="dark"] {}` block
 * (dark; a name the dark block leaves out inherits the light value, as the cascade does), resolves
 * var() references (chains up to 8 deep, fallbacks honoured), and checks the WCAG 2.x contrast pairs
 * listed in PAIRS in both modes. It also checks that every token name the neutral tokens.css defines
 * is defined in the checked file (light names in `:root`, dark names in the dark block), and that the
 * two dark blocks required by contract rule 2 assign the same values.
 *
 * Colors: #rgb #rgba #rrggbb #rrggbbaa (alpha ignored), rgb()/rgba() with commas or spaces and an
 * optional "/ alpha", hsl()/hsla(), and the keywords white/black. Anything else (oklch, color-mix,
 * named colors) cannot be verified here and counts as a failure.
 *
 * Exit 0: every check passes · 1: any failure · 2: usage error.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_NEUTRAL = resolve(dirname(fileURLToPath(import.meta.url)), "..", "tokens.css");
const MAX_VAR_DEPTH = 8;

/** [foreground token, background token, minimum ratio] */
const PAIRS = [
  ["--color-text", "--color-bg", 4.5],
  ["--color-text", "--color-surface", 4.5],
  ["--color-text-muted", "--color-bg", 4.5],
  ["--color-text-muted", "--color-surface", 4.5],
  ["--color-on-accent", "--color-accent", 4.5],
  // contract 1.1: tints carry text
  ["--color-on-accent-soft", "--color-accent-soft", 4.5],
  ["--color-text", "--color-success-soft", 4.5],
  ["--color-text", "--color-warning-soft", 4.5],
  ["--color-text", "--color-danger-soft", 4.5],
  ["--color-text", "--color-info-soft", 4.5],
  ["--color-focus", "--color-bg", 3],
  ["--color-border-strong", "--color-bg", 3],
  ["--color-success", "--color-bg", 3],
  ["--color-warning", "--color-bg", 3],
  ["--color-danger", "--color-bg", 3],
  ["--color-info", "--color-bg", 3],
];

// ---------- CSS parsing ----------

const normalize = (s) =>
  s.replace(/["']/g, "").replace(/\s+/g, " ").replace(/\s*([(),:[\]])\s*/g, "$1").trim().toLowerCase();

function matchBrace(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return i;
  }
  throw new Error("unbalanced braces");
}

/** Flat list of {selector, media, body}; `media` is the normalized enclosing @media prelude or "". */
function parseBlocks(css) {
  const out = [];
  const walk = (text, media) => {
    let i = 0;
    for (;;) {
      const open = text.indexOf("{", i);
      if (open < 0) return;
      const close = matchBrace(text, open);
      // Block-less statements (@import …; @layer a, b;) end with ";" — only the text after the last one is the prelude.
      const raw = text.slice(i, open);
      const prelude = raw.slice(raw.lastIndexOf(";") + 1).trim();
      const body = text.slice(open + 1, close);
      if (prelude.startsWith("@")) {
        if (/^@media\b/i.test(prelude)) walk(body, normalize(prelude));
      } else {
        out.push({ selector: normalize(prelude), media, body });
      }
      i = close + 1;
    }
  };
  walk(css.replace(/\/\*[\s\S]*?\*\//g, ""), "");
  return out;
}

/** Split on `sep` outside parentheses and quotes. */
function splitTop(text, sep) {
  const parts = [];
  let depth = 0, quote = null, cur = "";
  for (const ch of text) {
    if (quote) { cur += ch; if (ch === quote) quote = null; continue; }
    if (ch === sep && depth === 0) { parts.push(cur); cur = ""; continue; }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(") depth++;
    else if (ch === ")") depth--;
    cur += ch;
  }
  parts.push(cur);
  return parts;
}

/** Map of custom-property name → raw value across the given blocks (later declarations win). */
function declsOf(blocks) {
  const m = new Map();
  for (const { body } of blocks) {
    for (const part of splitTop(body, ";")) {
      const idx = part.indexOf(":");
      if (idx < 0) continue;
      const name = part.slice(0, idx).trim();
      if (name.startsWith("--")) m.set(name, part.slice(idx + 1).trim());
    }
  }
  return m;
}

function pickBlocks(css) {
  const blocks = parseBlocks(css);
  const isLight = (b) => b.media === "" && b.selector.split(",").includes(":root");
  const isDark = (b) => b.media === "" && b.selector === ":root[data-theme=dark]";
  const isDarkMedia = (b) =>
    b.media.includes("prefers-color-scheme:dark") && b.selector === ":root:not([data-theme=light])";
  const pick = (pred) => { const hit = blocks.filter(pred); return hit.length ? declsOf(hit) : null; };
  return { light: pick(isLight), dark: pick(isDark), darkMedia: pick(isDarkMedia) };
}

// ---------- values ----------

const VAR_RE = /^var\(\s*(--[\w-]+)\s*(?:,\s*([\s\S]*))?\)$/;

/** Follow var() chains (up to MAX_VAR_DEPTH) through `lookup(name)`; returns the final raw value. */
function resolveVar(value, lookup) {
  let v = value;
  for (let depth = 0; depth < MAX_VAR_DEPTH; depth++) {
    const m = VAR_RE.exec(v.trim());
    if (!m) return v;
    const ref = lookup(m[1]);
    if (ref !== undefined) v = ref;
    else if (m[2] !== undefined) v = m[2];
    else return v; // unresolvable reference: leave as-is so the color parser reports it
  }
  return v;
}

const angle = (t) =>
  t.endsWith("turn") ? parseFloat(t) * 360
  : t.endsWith("grad") ? parseFloat(t) * 0.9
  : t.endsWith("rad") ? (parseFloat(t) * 180) / Math.PI
  : parseFloat(t);

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r, g, b].map((v) => Math.round((v + m) * 255));
}

/** "r, g, b[, a]" or "r g b [/ a]" → the first three channel strings. */
const channels = (inner) => inner.split("/")[0].trim().split(/[\s,]+/).filter(Boolean).slice(0, 3);

/** Returns [r, g, b] (0–255) or null when the value is not a color this script understands. */
function parseColor(raw) {
  const s = raw.trim().toLowerCase();
  if (s === "white") return [255, 255, 255];
  if (s === "black") return [0, 0, 0];
  let m;
  if ((m = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(s))) {
    const h = m[1];
    return h.length <= 4
      ? [0, 1, 2].map((i) => parseInt(h[i] + h[i], 16))
      : [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  let rgb = null;
  if ((m = /^rgba?\((.*)\)$/.exec(s))) {
    const ch = channels(m[1]);
    if (ch.length === 3) rgb = ch.map((p) => (p.endsWith("%") ? parseFloat(p) * 2.55 : parseFloat(p)));
  } else if ((m = /^hsla?\((.*)\)$/.exec(s))) {
    const ch = channels(m[1]);
    if (ch.length === 3) rgb = hslToRgb(angle(ch[0]), parseFloat(ch[1]) / 100, parseFloat(ch[2]) / 100);
  }
  if (!rgb || rgb.some((v) => Number.isNaN(v))) return null;
  return rgb.map((v) => Math.min(255, Math.max(0, Math.round(v))));
}

const toHex = (rgb) => "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("");
const lin = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const luminance = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// ---------- checks ----------

const pad = (s, n) => String(s).padEnd(n);

function checkFile(file, neutral) {
  const { light, dark, darkMedia } = pickBlocks(readFileSync(file, "utf8"));
  const problems = [];
  const out = [file];
  if (!light) problems.push("no `:root { }` block (light values)");
  if (!dark) problems.push('no `:root[data-theme="dark"] { }` block (dark values)');
  if (!darkMedia) problems.push('no `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { } }` block');

  // Contrast pairs, both modes. Missing tokens are listed by the name check below, not twice.
  out.push(`  ${pad("mode", 6)}${pad("foreground", 22)}${pad("background", 17)}${pad("fg", 9)}${pad("bg", 9)}${pad("ratio", 7)}${pad("min", 5)}result`);
  const modes = [["light", light ?? new Map(), new Map()], ["dark", dark ?? new Map(), light ?? new Map()]];
  for (const [mode, own, inherited] of modes) {
    const lookup = (name) => own.get(name) ?? inherited.get(name);
    for (const [fg, bg, min] of PAIRS) {
      const raw = [fg, bg].map((n) => lookup(n));
      const missing = [fg, bg].filter((n, i) => raw[i] === undefined);
      const rgb = raw.map((v) => (v === undefined ? null : parseColor(resolveVar(v, lookup))));
      const bad = [fg, bg].filter((n, i) => raw[i] !== undefined && rgb[i] === null);
      let cells, note;
      if (missing.length) { cells = ["—", "—", "—"]; note = `fail (missing ${missing.join(", ")})`; }
      else if (bad.length) {
        cells = ["—", "—", "—"]; note = `fail (cannot parse ${bad.join(", ")})`;
        for (const n of bad) problems.push(`${mode}: ${n} = "${lookup(n)}" is not a color this checker can read`);
      } else {
        const ratio = Math.round(contrast(rgb[0], rgb[1]) * 100) / 100;
        const ok = ratio >= min;
        cells = [toHex(rgb[0]), toHex(rgb[1]), ratio.toFixed(2)];
        note = ok ? "pass" : "FAIL";
        if (!ok) problems.push(`${mode}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1, needs ${min}:1`);
      }
      out.push(`  ${pad(mode, 6)}${pad(fg, 22)}${pad(bg, 17)}${pad(cells[0], 9)}${pad(cells[1], 9)}${pad(cells[2], 7)}${pad(min, 5)}${note}`);
    }
  }

  // Every name the neutral file defines must be defined here, per mode.
  const missingLight = [...neutral.light.keys()].filter((n) => !light?.has(n));
  const missingDark = [...neutral.dark.keys()].filter((n) => !dark?.has(n));
  out.push(`  tokens vs neutral: light ${neutral.light.size - missingLight.length}/${neutral.light.size}` +
    ` · dark ${neutral.dark.size - missingDark.length}/${neutral.dark.size}`);
  if (missingLight.length) problems.push(`light (:root) is missing ${missingLight.length} token(s): ${missingLight.join(", ")}`);
  if (missingDark.length) problems.push(`dark ([data-theme="dark"]) is missing ${missingDark.length} token(s): ${missingDark.join(", ")}`);

  // Contract rule 2: the two dark blocks carry the same values.
  if (dark && darkMedia) {
    const names = new Set([...dark.keys(), ...darkMedia.keys()]);
    const differ = [...names].filter((n) => normalize(dark.get(n) ?? "") !== normalize(darkMedia.get(n) ?? ""));
    out.push(`  dark blocks agree: ${differ.length ? "no" : "yes"}`);
    if (differ.length) problems.push(`the @media dark block and [data-theme="dark"] differ on: ${differ.join(", ")}`);
  }

  out.push(problems.length ? `  RESULT: FAIL — ${problems.length} problem(s)` : "  RESULT: PASS");
  for (const p of problems) out.push(`    - ${p}`);
  console.log(out.join("\n"));
  return problems.length === 0;
}

// ---------- main ----------

const args = process.argv.slice(2);
let neutralPath = DEFAULT_NEUTRAL;
const files = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--neutral") neutralPath = args[++i];
  else if (args[i] === "-h" || args[i] === "--help") files.length = 0, (i = args.length);
  else files.push(args[i]);
}
if (!files.length) {
  console.error("usage: node check-contrast.mjs [--neutral <tokens.css>] <tokens.css> [<tokens.css> ...]");
  process.exit(2);
}
let neutral;
try {
  neutral = pickBlocks(readFileSync(neutralPath, "utf8"));
  if (!neutral.light || !neutral.dark) throw new Error("neutral file lacks a :root or :root[data-theme=\"dark\"] block");
} catch (e) {
  console.error(`error: cannot load neutral tokens from ${neutralPath}: ${e.message}`);
  process.exit(2);
}
let allOk = true;
for (const [i, file] of files.entries()) {
  if (i) console.log("");
  try {
    if (!checkFile(resolve(file), neutral)) allOk = false;
  } catch (e) {
    console.log(`${file}\n  RESULT: FAIL — ${e.message}`);
    allOk = false;
  }
}
process.exit(allOk ? 0 : 1);
