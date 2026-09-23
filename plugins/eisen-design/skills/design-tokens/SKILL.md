---
name: design-tokens
description: The token contract every eisensoftware UI implements — one fixed set of CSS custom property names for color, type, space, shape, elevation and motion, with light and dark values. Load before styling any component, before writing a ui-style-* tokens.css, or when wiring tokens into Svelte, Next.js or Tailwind v4.
---

# Design tokens — the contract

A **style** is a `tokens.css` file that assigns values to the names below. A **component** reads only these
names. Because every style implements the same names, swapping styles never touches markup, and every
application in the platform can adopt any style by replacing one file.

Contract version: **1**. Adding a token is a minor change (every `ui-style-*/tokens.css` must add it too);
renaming or removing one is a major change and needs a plan entry.

## Token names

| Group | Names |
|---|---|
| Color, surfaces | `--color-bg` `--color-bg-elevated` `--color-surface` `--color-surface-hover` `--color-border` `--color-border-strong` |
| Color, text | `--color-text` `--color-text-muted` `--color-text-inverse` |
| Color, accent | `--color-accent` `--color-accent-hover` `--color-on-accent` `--color-accent-soft` |
| Color, semantic | `--color-success` `--color-warning` `--color-danger` `--color-info` `--color-focus` |
| Type families | `--font-sans` `--font-mono` `--font-display` |
| Type scale | `--text-xs` `--text-sm` `--text-md` `--text-lg` `--text-xl` `--text-2xl` `--text-3xl` |
| Type rhythm | `--leading-tight` `--leading-normal` `--weight-regular` `--weight-medium` `--weight-bold` |
| Space (4-pt grid) | `--space-1` (4) `--space-2` (8) `--space-3` (12) `--space-4` (16) `--space-5` (24) `--space-6` (32) `--space-7` (48) `--space-8` (64) |
| Shape | `--radius-sm` `--radius-md` `--radius-lg` `--radius-full` |
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
   `--color-on-accent` on `--color-accent` ≥ 4.5:1; `--color-focus` on `--color-bg` ≥ 3:1. Check both modes.
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
