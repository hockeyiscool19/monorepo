---
name: ui-style-brutalist
description: Brutalist UI style for eisensoftware — paper and ink with one acid-yellow accent, 2–3px rules on everything interactive, hard offset shadows, zero radius, Archivo + IBM Plex Mono and instant motion; load it to style a screen, tile grid, table or form in this style, to audit one, or to port its tokens.css into an existing app.
---

# UI style — Brutalist

Personality: **raw, loud, structural.** The page is a sheet of paper with ink drawn on it: every edge is a rule, every
elevation is a solid offset, nothing is rounded, blurred, eased or tinted beyond the contract's near-paper tints.
Hierarchy comes from size, weight, fill and outline, never from a second colour. Implements token contract **1.1**
and component contract 1.1 (`skills/design-tokens/SKILL.md`, `components.md`). Files: `tokens.css` (the contract
in this style), `components.css` (every selector in `components.md`), `mockup.html` (verbatim
`plugins/eisen-design/mockups/reference.html`).

## When to use / not use

- Use for developer-facing tools, launchers and portals (the tiles home), status pages, docs and anything that should
  feel hand-built and honest rather than polished. Good for the gateway/registry surfaces and topology-style tools.
- Do not use for wellness or consumer products that need warmth (Vale), for long reading sessions (heavy rules tire
  the eye), or where a client brand supplies its own palette. Do not mix with another `ui-style-*`.

## Tokens — why these values

- **Palette.** Paper `--color-bg` is bone, cards are white, ink `--color-text` is true black; dark mode flips to black
  paper with off-white ink. `--color-border-strong` *is* the ink: every interactive edge, grid rule and shadow uses it.
  `--color-border` is the only grey rule and `--color-text-muted` the only grey text. One accent, acid yellow
  `#e6ff00`, with `--color-on-accent` black in both modes (18.7:1). The accent has no contrast against paper by itself,
  so an accent block always carries an ink edge. `--color-accent-soft` is pale acid (dark: olive) and
  `--color-on-accent-soft` is ink in light and the acid itself in dark.
- **Semantic colours and tints.** `--color-success/warning/danger/info` are dark (light) or bright (dark) enough to be
  text and rules at ≥ 4.5:1. Their `*-soft` tints are near-paper (light) or near-black (dark); a badge or alert on a
  tint always carries `--color-text` and the semantic colour as its rule, so nothing depends on the tint alone.
- **Rules.** 2px on interactive edges (nav, toggle, input, badges, cell rules), 3px on structure (header, hero, tiles
  block, table region, buttons, alert). Widths are literals in `components.css`; only colours come from tokens.
- **Shadows.** `--shadow-sm/md/lg` are `4 / 6 / 10px` solid offsets in ink, no blur. Press = `translate(offset)` with
  the shadow removed, so the element lands where its shadow was.
- **Shape and size.** `--radius-sm/md/lg/xl` are `0px`; `--radius-full` stays `9999px` for the status dot only.
  `--control-height` is `44px` at every width: buttons, inputs, nav links, the toggle, footer links and table rows.
- **Type.** `--font-display` and `--font-sans` are Archivo (grotesque; headings at `--weight-bold` = 800, prose at
  400). `--font-mono` is IBM Plex Mono for every label: nav, buttons, badges, meta, table heads, footer links. Labels
  are uppercase with `0.08em` tracking; prose, titles and the search input never are. `--text-3xl` is fluid
  (`clamp(2.25rem, 1.5rem + 3.5vw, 4.5rem)`) so the hero reads as a poster at 1280 and still wraps at 360.
- **Motion.** `--duration-fast: 0ms`, base 60ms, slow 100ms, both easings `linear`. Colour changes are instant; only
  the press translate transitions. Reduced motion zeroes all three.
- **Layout.** `--content-max: 1200px`, `--gutter: clamp(16px, 4vw, 32px)`.

## Component rules

- **Buttons.** Hierarchy by fill, outline, underline — never colour. `.btn-primary` ink fill + paper text;
  `.btn-secondary` paper fill + ink text; `.btn-text` no edge, no shadow, 2px underline. All have a 3px ink edge
  (text buttons: transparent), `--shadow-sm`, `--control-height`, mono uppercase. Hover inverts paper and ink;
  `:active` translates by 4px and drops the shadow; `:disabled` / `[aria-disabled="true"]` is dashed
  `--color-border`, muted text, no shadow, `cursor: not-allowed`. One primary per view.
- **Cards / tiles.** The grid is one bordered block: `.tiles` has a 3px ink edge, `gap: 3px` and an ink background so
  the gap *is* the cell rule (rules never double), plus `--shadow-lg`. A tile is `surface`; icon in a 48px box with a
  2px `currentColor` edge; title in display caps; foot separated by a 2px `currentColor` rule. Hover and keyboard
  focus invert the whole cell, the CTA becomes an accent block, and the live badge swaps to paper.
  `[data-status="planned"]` is paper-coloured, muted, has a dashed inset rule and `cursor: not-allowed`; it never
  inverts (hover rules are scoped to `a.tile-link`; its `.tile-link` is a `div`). `currentColor` edges make
  inversion free: children follow the cell's colour.
- **Tables.** `.table-wrap` (the contract's `role="region"` scroll block) carries the 3px ink edge and `--shadow-md`
  and is the only thing that scrolls horizontally; the table inside keeps native display and semantics at every
  width. Inverted header row (ink fill, mono caps), 2px ink rules between rows and columns, rows at
  `--control-height`, `th.num`/`td.num` right-aligned in tabular mono, `td[data-label]` cells never wrap (the region
  scrolls instead of stacking), `code` as a paper chip with a thin rule, row hover `surface-hover`.
- **Forms.** Label in mono caps; `input[type="search"]` with a 2px ink edge, zero radius, `appearance: none`,
  `--control-height`, mono text (not uppercased), placeholder in muted. Focus adds the global ring and an
  `--color-accent-soft` fill with `--color-on-accent-soft` text.
- **Badges.** Mono caps, 2px edge, 24px tall, nowrap. `live` = ink fill; `beta` = outline; `planned` = dashed outline
  + muted; `success` / `warning` / `danger` / `info` = the kind's tint fill, ink text, the semantic colour as the
  rule. Text carries the meaning; colour only reinforces.
- **Alerts.** `info` / `success` / `warning` / `danger`: tint fill, ink text, 3px ink edge, a 12px left rule in the
  semantic colour, `--shadow-sm`, and a mono caps label generated from `data-kind` via `::before { content:
  attr(data-kind) }` so the kind is read, not just seen. `.alert-body` is a block capped at 72ch.
- **Status dot.** `ok` success, `warn` warning, `down` danger, `unknown` hollow (surface fill, ink ring); no state
  attribute falls back to muted. The `.meta` text carries the meaning.
- **Navigation.** `.site-nav` is a segmented bar: 2px ink edge, links at `--control-height`, mono caps, 2px rules
  between them (the container's ink shows through a 2px gap); links share whatever width the bar gets, so no bare
  ink shows after the last one. `[aria-current="page"]` is an accent block; hover inverts; focus is an inset ring.
  `.theme-toggle` is an outlined control with a square LED (`::before`): outlined when off, accent-filled when
  `[aria-pressed="true"]`, and the button itself fills with ink when on. Hover inverts relative to the current
  state; the LED keeps the state readable through every inversion; the label text is never hidden. `.skip-link` is
  an accent block that drops in at the top-left on focus.
- **Inverted focus.** The global ring is 3px `--color-focus` offset 3px. Elements whose focus state is inverted
  (tiles, hovered nav links) draw the ring in `--color-text-inverse` instead: contract 1.1 has no inverse focus
  token, and an ink ring would vanish on an ink surface. Paper on ink is ≥ 18:1 in both modes.

## Adaptive layout

| Width | Header | Tiles | Table | Actions |
|---|---|---|---|---|
| 360 | Wordmark is a full-bleed banner; nav and toggle wrap onto the next row(s) | 1 column (< 600) | `.table-wrap` scrolls; rows never wrap | Buttons stretch to fill rows (< 600) |
| 768 | One row: stamp wordmark, nav, toggle at the end; heading + filter on one row | 2 columns (600–1199); an odd last tile spans both | Fits, no scroll | Inline, wrapping |
| 1280 | Same, more gutter | 3 columns (≥ 1200); the last tile spans the remaining cells (`3n+1` → 3, `3n+2` → 2) so no empty cell exposes the ink behind the grid | Fits | Inline |

No horizontal page scroll at 360: shadows (≤ 10px) and focus rings (6px) stay inside the 16px gutters; the hero
heading wraps; the meta line wraps inside its box; only `.table-wrap` scrolls.

## Signature element

The **acid sticker wordmark**: `eisensoftware` in Archivo 800 caps on an accent block with a 3px ink edge and a hard
shadow, full-bleed on phones and a stamp beside the nav from 768. The inverted hover is the system-wide reflex that
follows from it: hover any control and paper becomes ink.

## Do / don't

- Do keep text ≥ 4.5:1 and rules ≥ 3:1 — brutal is loud, not illegible. Run `check-contrast.mjs` before shipping.
- Do give every interactive element an ink edge and `--control-height`; do keep the focus ring in every state, and
  swap it to paper on inverted elements.
- Do use caps + tracking on labels only; prose, tile descriptions and inputs stay sentence case.
- Do reserve the accent for one block per region (wordmark, current nav item, hovered CTA, skip link, selection).
- Do put semantic meaning in text and rules; tints are backgrounds under ink text, never the signal by themselves.
- Don't add radius, blur, gradients or greys beyond `--color-border` and `--color-text-muted`.
- Don't animate colour; don't exceed 100ms; don't ease.
- Don't restructure the table (no `display: block` on table parts); let `.table-wrap` scroll.
- Don't shrink type or padding to fit 360 — wrap, stack or scroll the block instead.

## Apply to an existing app

1. Copy `tokens.css` into the app and load it before any component CSS (Svelte/static: `<link>` first; Next.js:
   import in the root layout before `globals.css`). Set `data-theme="light|dark"` on `<html>` for an explicit switch.
2. Tailwind v4 — map the contract so utilities resolve to it:
   ```css
   @import "tailwindcss";
   @import "./tokens.css";
   @theme inline {
     --color-bg: var(--color-bg); --color-surface: var(--color-surface); --color-border: var(--color-border-strong);
     --color-text: var(--color-text); --color-muted: var(--color-text-muted); --color-accent: var(--color-accent);
     --color-on-accent: var(--color-on-accent); --color-warning-soft: var(--color-warning-soft);
     --font-sans: var(--font-sans); --font-mono: var(--font-mono); --font-display: var(--font-display);
     --radius-sm: var(--radius-sm); --radius-xl: var(--radius-xl); --spacing-control: var(--control-height);
     --shadow-sm: var(--shadow-sm); --shadow-md: var(--shadow-md); --shadow-lg: var(--shadow-lg);
   }
   ```
   Then `border-2 border-border`, `shadow-sm`, `min-h-control`, `font-mono uppercase tracking-[0.08em]`,
   `hover:bg-text hover:text-bg` and `active:translate-x-1 active:translate-y-1 active:shadow-none` express the style.
3. Port these rules from `components.css`: the base block (box-sizing, `::selection`, heading caps), the label voice
   list, `.btn` + hierarchy + press, the tiles grid (`gap`-as-rule and the last-cell spans), `.table-wrap` + table
   rules, the seven badge kinds, the four alert kinds with the `attr(data-kind)` label, and the inverted-focus rule.
4. Keep markup token-free: no hex, px radius or ms literal in components; rule widths (2px/3px) and the 4px press
   translate are the only literals allowed.

## Audit — score each 0–10 (7+ pass, 4–6 warn, 0–3 fail); fix anything under 7 before calling it done

1. **Palette discipline.** Paper, ink, one accent; the only greys are `--color-border` and `--color-text-muted`; tints
   appear only under ink text with a semantic rule; every accent block has an ink edge.
2. **Rules.** Every interactive element has a 2–3px ink edge; structure uses 3px; grid and table rules never double.
3. **Shadows and press.** Only hard offsets (4/6/10px); `:active` translates by the same offset and drops the shadow.
4. **Shape.** Zero radius everywhere except the status dot.
5. **Type.** Archivo for display and prose, Plex Mono for labels; caps + tracking on labels only; sizes on the scale;
   the hero is fluid and wraps at 360.
6. **Hierarchy by fill/outline/underline.** One ink-filled primary per view, outlined secondary, underlined tertiary;
   badges filled/outlined/dashed/tinted-with-rule; no colour-coded buttons.
7. **Inversion.** Hover inverts paper and ink on every control; children with their own fill (live badge, CTA, LED)
   swap correctly; planned tiles never invert.
8. **Motion.** Nothing over 100ms; colour changes are instant; reduced motion honoured.
9. **Accessibility.** `check-contrast.mjs` passes in both modes; `--control-height` targets; focus visible in every
   state including inverted; meaning never carried by colour alone; the table keeps native semantics.
10. **Layout.** No horizontal page scroll at 360; 2-up from 600, 3-up from 1200 with the last tile spanning; only
    `.table-wrap` scrolls; footer stays at the bottom.

Report the scores as a table and list each failure with the rule that fixes it.
