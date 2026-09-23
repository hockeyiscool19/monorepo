---
name: design-tokens
description: The token contract every eisensoftware UI implements — one fixed set of CSS custom property names for color, type, space, shape, elevation and motion, with light and dark values. Load before styling any component, before writing a ui-style-* tokens.css, or when wiring tokens into Svelte, Next.js or Tailwind v4.
---

# Design tokens — the contract

A **style** is a `tokens.css` file that assigns values to the names below. A **component** reads only these
names. Because every style implements the same names, swapping styles never touches markup, and every
application in the platform can adopt any style by replacing one file.

Contract version: **1.1** (2026-09-23; 1.0 + tint tokens, `--radius-xl`, `--control-height`). Adding a token is a
minor change (every `ui-style-*/tokens.css` must add it too); renaming or removing one is a major change and needs a
plan entry. The markup side of the contract — classes, states and attribute vocabularies — is `components.md`.

## Token names

| Group | Names |
|---|---|
| Color, surfaces | `--color-bg` `--color-bg-elevated` `--color-surface` `--color-surface-hover` `--color-border` `--color-border-strong` |
| Color, text | `--color-text` `--color-text-muted` `--color-text-inverse` |
| Color, accent | `--color-accent` `--color-accent-hover` `--color-on-accent` `--color-accent-soft` `--color-on-accent-soft` |
| Color, semantic | `--color-success` `--color-warning` `--color-danger` `--color-info` `--color-focus` |
| Color, tints | `--color-success-soft` `--color-warning-soft` `--color-danger-soft` `--color-info-soft` — fills for badges and alerts; `--color-text` must read on them |
| Type families | `--font-sans` `--font-mono` `--font-display` |
| Type scale | `--text-xs` `--text-sm` `--text-md` `--text-lg` `--text-xl` `--text-2xl` `--text-3xl` |
| Type rhythm | `--leading-tight` `--leading-normal` `--weight-regular` `--weight-medium` `--weight-bold` |
| Space (4-pt grid) | `--space-1` (4) `--space-2` (8) `--space-3` (12) `--space-4` (16) `--space-5` (24) `--space-6` (32) `--space-7` (48) `--space-8` (64) |
| Shape | `--radius-sm` `--radius-md` `--radius-lg` `--radius-xl` `--radius-full` |
| Controls | `--control-height` — default height of buttons, inputs and table rows (dense styles go smaller) |
| Elevation | `--shadow-sm` `--shadow-md` `--shadow-lg` |
| Motion | `--duration-fast` `--duration-base` `--duration-slow` `--ease-standard` `--ease-emphasized` |
| Layout | `--content-max` `--gutter` |

## Rules

1. Components reference tokens only. A hardcoded hex, px radius or ms duration in a component is a defect.
2. Every style defines **all** tokens for light **and** dark. Dark values live in two places, so that both the OS
   preference and an explicit switch work:
   ```css
   @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { /* dark values */ } }
   :root[data-theme="dark"] { /* the same dark values */ }
   ```
3. Contrast: `--color-text` on `--color-bg` and on `--color-surface` ≥ 4.5:1; `--color-text-muted` ≥ 4.5:1;
   `--color-on-accent` on `--color-accent` ≥ 4.5:1; `--color-on-accent-soft` on `--color-accent-soft` ≥ 4.5:1;
   `--color-text` on each `*-soft` tint ≥ 4.5:1; `--color-focus` and `--color-border-strong` on `--color-bg` ≥ 3:1.
   Check both modes (`scripts/check-contrast.mjs` does).
4. `prefers-reduced-motion: reduce` sets the three durations to `0ms`. Styles may not override this.
5. `body` gets an explicit `background: var(--color-bg); color: var(--color-text)`; never rely on the UA default.
6. A style may add private tokens prefixed `--x-` for its own components, but shared components may not read them.

## Wiring

- **Plain CSS / Svelte / static HTML:** `<link rel="stylesheet" href="tokens.css">` before any component CSS.
- **Next.js:** import `tokens.css` in the root layout before `globals.css`.
- **Tailwind v4:** map tokens in `@theme` so utilities resolve to them:
  ```css
  @import "tailwindcss";
  @import "./tokens.css";
  @theme inline {
    --color-bg: var(--color-bg);  --color-surface: var(--color-surface);  --color-accent: var(--color-accent);
    --radius-md: var(--radius-md); --font-sans: var(--font-sans);
  }
  ```
  Then `bg-bg`, `text-accent`, `rounded-md` read the active style.

## Files

- `tokens.css` next to this file is the **neutral default** implementing the full contract. Use it when no style has
  been chosen yet; it is intentionally plain so that nothing built on it looks finished.
- Each `ui-style-<name>/tokens.css` is a complete implementation of this contract in that style.

## Verify

`scripts/check-contrast.mjs` checks one or more `tokens.css` files against this contract. Zero dependencies, Node 18+.

```
node plugins/eisen-design/skills/design-tokens/scripts/check-contrast.mjs plugins/eisen-design/skills/design-tokens/tokens.css
node plugins/eisen-design/skills/design-tokens/scripts/check-contrast.mjs plugins/eisen-design/skills/ui-style-*/tokens.css
```

For every file it reads `:root { }` (light) and `:root[data-theme="dark"] { }` (dark; a name the dark block does not
override inherits the light value), resolves `var()` chains up to 8 deep (private `--x-` tokens are fine), prints one
row per pair and mode, and exits 1 on any failure:

| Foreground on background | Minimum |
|---|---|
| `--color-text` on `--color-bg` and on `--color-surface` | 4.5:1 |
| `--color-text-muted` on `--color-bg` and on `--color-surface` | 4.5:1 |
| `--color-on-accent` on `--color-accent` | 4.5:1 |
| `--color-focus`, `--color-border-strong`, `--color-success`, `--color-warning`, `--color-danger`, `--color-info` on `--color-bg` | 3:1 |

It also fails when a name defined in the neutral `tokens.css` is missing from the checked file (light names must be in
`:root`, dark names in the dark block), when the `@media (prefers-color-scheme: dark)` block and the `[data-theme="dark"]`
block disagree (rule 2), or when a checked value is not a color it can read. Readable forms: hex (3, 4, 6 or 8 digits;
alpha ignored), `rgb()`/`rgba()`, `hsl()`/`hsla()`, `white`, `black`. Write the checked tokens in those forms —
`oklch()` and `color-mix()` cannot be verified and fail. `--neutral <path>` swaps the contract file. Exit codes:
0 pass, 1 any failure, 2 usage. Run it before every mockup review; it is the first gate of the Phase 5 verify.
