---
name: ui-style-organic
description: The Organic UI style for eisensoftware apps — linen surfaces, moss accent, pillow-soft cards, rounded humanist type and slow calm motion; load it to style a wellness or daily-habit product (Vale is the first adopter) or to port its tokens.css and component rules into an existing app.
---

# Organic — warm, calm, tactile

**Personality:** warm, calm, tactile. Everything looks touchable and nothing hurries you. Text is dark ink-green
on linen, accents are moss, and warnings are clay: the palette of a garden in early light, not a dashboard.

## When to use / when not to

- **Use** for products people open every day for their own wellbeing: habits, diet, sleep, journaling, health data
  (Vale). Also fine for a personal portal or any app whose job is to make routine feel gentle.
- **Don't use** for data-dense operational tools, developer consoles or anything where speed of scanning beats
  comfort — `ui-style-dense` or `ui-style-editorial` fit those. Don't use it to soften bad news: alerts still speak plainly.

## Tokens — what the values mean

`tokens.css` implements design-token contract **1.1** in full (light `:root`, dark in both the media query and
`[data-theme="dark"]`, reduced-motion, `body`, `:focus-visible`). It also declares two private tokens that only this
style's `components.css` may read: `--x-hero-gradient` and `--x-tile-gradient`.

| Role | Light | Dark | Why |
|---|---|---|---|
| bg / surface | linen `#f3efe6` / paper `#fcfaf5` | moss-charcoal `#161c18` / `#1e2620` | Warm ground, cards read as lifted paper; dark is a night garden, not black |
| text / muted | ink-green `#1e2a23` / `#56635a` | `#ebe7dc` / `#a9b3a8` | Green-cast ink keeps the page warm at 13:1; muted stays ≥ 5.5:1 |
| accent / on-accent | moss `#4d6e52` / linen `#f7f4ec` | sage `#9fbf9f` / `#14211a` | A deep moss lets light text sit on it at 5.2:1; pale sage would have forced dark text and a duller button |
| accent-soft / on-accent-soft | `#dde7d8` / moss-ink `#2f4f38` (7.2:1) | `#2a3d2e` / `#cfe3cf` (8.7:1) | Active nav, pressed toggle, text-button hover, selection |
| success / warning / danger / info | leaf `#2f6b40` / clay `#9a4f2a` / brick `#a03a32` / lake `#2f6774` | `#8cc79a` / `#e3a374` / `#ea948c` / `#8bc3cf` | ≥ 5.2:1 on bg in light, ≥ 6.7:1 in dark: usable as bars, dots and text |
| *-soft tints | `#d9e9da` `#f4e1d0` `#f3d9d5` `#d6e6ea` | `#264633` `#4a3524` `#4c2e2a` `#24414a` | Badge and alert fills; `--color-text` reads on every one at ≥ 8:1 |
| focus | moss (4.99:1 on bg) | `#b9d6b9` (11:1) | Thick 3px ring, 3px offset — soft but never faint |

Why not cream + terracotta: it is the generic "warm" answer and it makes warnings and brand fight over the same hue.
Linen + moss keeps the accent cool-warm so clay (warning) and brick (danger) stay unmistakably semantic.

- **Shape:** `--radius-sm` 8, `--radius-md` 14, `--radius-lg` 20, `--radius-xl` 28 (the pillow: hero and tiles), pills
  for every control. One family of curves.
- **Controls:** `--control-height` 44px everywhere — buttons, inputs, nav pills, table rows. Touch-first, even on desktop.
- **Elevation:** two-layer shadows tinted with the ink colour at 4–10% opacity. Depth is felt, not seen.
- **Type:** Nunito (display, 700) for headings, wordmark and tile titles; Nunito Sans (body, 400/600/700). Body
  leading 1.6, headings 1.15 with −0.01em tracking. `--weight-medium` is 600 because rounded faces go limp at 500.
- **Motion:** 140 / 240 / 420ms. Standard easing is a plain ease-in-out; emphasized is a long decelerate — things settle,
  they never bounce. Reduced motion zeroes all three durations (contract rule, not overridable).

## Component rules (contract 1.1, `design-tokens/components.md`)

- **Buttons:** pills at `--control-height`, one `.btn-primary` per view (moss fill, lifts 1px and gains `--shadow-md`
  on hover), `.btn-secondary` is paper with a `--color-border-strong` outline (3:1) that turns moss on hover,
  `.btn-text` is moss text that gains an accent-soft pill with `--color-on-accent-soft` text on hover. Disabled =
  `surface-hover` fill with muted text (still 4.5:1), no shadow, `not-allowed` cursor. Active states drop 1px at `--duration-fast`.
- **Cards / tiles:** `--radius-xl`, `--space-5` padding, 1px `--color-border`, `--shadow-sm`, top-lit
  `--x-tile-gradient`. Hover/focus: rise 3px over `--duration-slow`, shadow to `md`, border warms toward accent (the one
  `color-mix()` hover layer), the icon well tilts 6°. `beta` tiles get a lake-tinted icon well. Planned tiles sit flat on
  the page bg with a dashed border and muted ink — dimmed by colour, not opacity, so they still pass contrast; only
  `a.tile-link` gets hover, so a `div.tile-link` never invites a click.
- **Tables:** no vertical rules ever. `.table-wrap` is the focusable scroll region (ring on focus) and the only thing
  allowed to scroll sideways. ≥ 600px: one paper surface, muted header on `surface-hover`, rows at `--control-height`
  separated by `--color-border`, hover tint; `th.num`/`td.num` right-aligned with tabular figures. < 600px: each row
  folds into a soft card on a two-column grid, every cell shows its column name from `data-label`, the first cell spans
  as the title, `thead` stays for screen readers. The page never scrolls sideways.
- **Forms:** visible label above a pill input (`--control-height`, paper fill, strong border). Hover turns the border
  moss; focus adds the ring plus a 4px accent-soft halo. Placeholder is muted ink at full opacity.
- **Badges:** pill, `--text-xs` bold, ink text on the matching `*-soft` tint with a small dot in the semantic colour.
  `live`/`success` leaf, `beta`/`info` lake, `warning` clay, `danger` brick, `planned` outlined and muted. The word
  carries the meaning; tint and dot only reinforce it.
- **Alerts:** flex row — a rounded 4px bar in the semantic colour, then `.alert-body` — on the matching tint;
  `<strong>` names the subject. Same anatomy for `info`, `success`, `warning`, `danger`.
- **Status dot:** leaf-shaped (`border-radius: var(--radius-full) 0`, tilted 20°) with a halo in the matching tint;
  `ok` leaf, `warn` clay, `down` brick, `unknown` muted. The `.meta` text always says what the dot means.
- **Navigation:** wordmark in Nunito with a small moss leaf; nav links are `--control-height` pills in muted ink,
  `surface-hover` on hover, `accent-soft` + `on-accent-soft` when `[aria-current="page"]`. The theme toggle is a secondary
  pill; `[aria-pressed="true"]` fills it accent-soft with a moss border. Skip link drops in as a moss pill with `--shadow-lg`.

## Adaptive layout

| Width | Header | Hero | Tiles | Table | Actions |
|---|---|---|---|---|---|
| 360 | wordmark + toggle, nav wraps to its own row | `--space-6`/`--space-5` padding, `--text-2xl` | 1 column, `--space-4` gap | folded, labelled cards | stacked, full width |
| 600 | same | same | 2 columns, `--space-5` gap | real table in `.table-wrap` | inline pills |
| 768 | one row, nav beside wordmark; filter beside heading | `--space-7`/`--space-6`, `--text-3xl` | 2 columns | real table | inline pills |
| 1200+ | same, content capped at `--content-max` | `--space-8`/`--space-7` | 3 columns | real table | inline pills |

Gutter is 20px everywhere; sections are `--space-7` apart. Nothing is ever wider than 52ch of running text.

## Signature element

**The morning panel.** The hero is a `--radius-xl` panel washed with `--x-hero-gradient` — sage at the top-left
warming to sand at the bottom-right, like light coming through a window — with the leaf-shaped status dot inside it.
Keep it to the hero; repeating the gradient elsewhere turns a signature into wallpaper.

## Do / don't

- **Do** keep text ink-green and muted text ≥ 4.5:1; soft never means faint. Check every muted colour on both bg and surface.
- **Do** let spacing group things first, borders second, shadows last.
- **Do** take tints from the `*-soft` tokens with `--color-text` or `--color-on-accent-soft` on top; `color-mix()` only
  for hover/pressed layers.
- **Do** keep every control at `--control-height` (44px), including nav pills, inputs and footer links.
- **Don't** put pale sage or clay text on linen — they land near 3:1. Semantic colours in this file are already deep enough; use them as-is.
- **Don't** add a fifth radius, a bouncy easing, or a shadow darker than `--shadow-lg`.
- **Don't** dim with `opacity` on anything that contains text; swap to `--color-text-muted` instead.
- **Don't** use the gradient tokens on cards you can click repeatedly; the tile gradient is 1–2% and should stay that subtle.

## Apply to an existing app

1. Copy `tokens.css` next to the app's global stylesheet and load it first (`<link>` before component CSS, or
   `import "./tokens.css"` at the top of a Next.js root layout). Keep the Google Fonts `@import` or self-host the two
   families; the fallbacks are system humanist sans.
2. **Tailwind v4:** map the contract into `@theme` so utilities resolve to the active style:
   ```css
   @import "tailwindcss";
   @import "./tokens.css";
   @theme inline {
     --color-bg: var(--color-bg); --color-surface: var(--color-surface); --color-surface-hover: var(--color-surface-hover);
     --color-border: var(--color-border); --color-text: var(--color-text); --color-text-muted: var(--color-text-muted);
     --color-accent: var(--color-accent); --color-on-accent: var(--color-on-accent);
     --color-accent-soft: var(--color-accent-soft); --color-on-accent-soft: var(--color-on-accent-soft);
     --color-success: var(--color-success); --color-success-soft: var(--color-success-soft);
     --color-warning: var(--color-warning); --color-warning-soft: var(--color-warning-soft);
     --color-danger: var(--color-danger); --color-danger-soft: var(--color-danger-soft);
     --color-info: var(--color-info); --color-info-soft: var(--color-info-soft);
     --radius-sm: var(--radius-sm); --radius-md: var(--radius-md); --radius-lg: var(--radius-lg); --radius-xl: var(--radius-xl);
     --spacing-control: var(--control-height);
     --font-sans: var(--font-sans); --font-display: var(--font-display); --shadow-sm: var(--shadow-sm); --shadow-md: var(--shadow-md);
   }
   ```
   Then `bg-surface rounded-xl shadow-sm text-text-muted h-control` are Organic without touching markup.
3. Port component rules in this order — they carry most of the feel: buttons, cards/tiles, form inputs, badges, alerts,
   then the table fold (`.table-wrap` + `data-label`) and the morning panel. Copy the relevant blocks from
   `components.css`; they read tokens only.
4. Add `data-theme` handling on `<html>` (light | dark | absent = OS) and a toggle with `aria-pressed`.
5. **Vale** (health, habits, diet, biodata, labs) is the intended first adopter: its habit cards become tiles, its
   daily check-in is the morning panel, lab tables use the fold rule on phones, and clay/brick badges flag out-of-range
   values without shouting.

## Audit — score each 0–10 (7+ pass, 4–6 warn, 0–3 fail)

1. **Tokens only** — no hex/rgb/hsl, px radius or ms duration in component CSS; private `--x-` tokens read only by this style; `color-mix()` only in hover/pressed layers.
2. **Contrast** — `check-contrast.mjs` passes: text and muted text ≥ 4.5:1 on bg and surface, on-accent(-soft) ≥ 4.5:1, text on every tint ≥ 4.5:1, focus, strong border and semantic colours ≥ 3:1 on bg, both modes.
3. **Dark mode** — both dark blocks present and identical; dark is moss-charcoal with tinted (not black) surfaces.
4. **Shape** — only the five radius tokens; controls are pills; hero and tiles use `--radius-xl`.
5. **Elevation** — shadows only from tokens, layered and low-opacity; hover raises at most one step.
6. **Type** — Nunito for display, Nunito Sans for body, sizes on the scale, running text ≤ 52ch.
7. **Motion** — durations from tokens, standard/emphasized easing only, reduced-motion respected.
8. **Touch and focus** — every control at `--control-height`, focus ring visible on every interactive element including tiles and `.table-wrap`.
9. **Adaptive** — no horizontal page scroll at 360, table folds with labels, tiles 1/2/3 columns at 360/600/1200, header wraps cleanly.
10. **Signature** — exactly one morning panel per screen; gradient not reused as decoration.

Report scores as a table, list every < 7 with the fix, apply the fixes, then re-score.
