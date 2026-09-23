---
name: ui-style-expressive
description: The Expressive UI style for eisensoftware — a friendly, colourful, springy take on the design-token contract in the spirit of Material 3 Expressive (violet-blue seed, Figtree, pill buttons, tonal surfaces, overshoot motion); load it when a consumer-facing or personal app should feel warm and playful, when restyling the portal in this style, or when dropping its tokens.css and component rules into an existing app.
---

# ui-style-expressive

**Personality:** friendly, colourful, springy. Implements design-token contract **1.1** and the class/state
vocabulary in `skills/design-tokens/components.md`.

Files beside this skill: `tokens.css` (every contract token in this style), `components.css` (rules for every
selector in `components.md`), `mockup.html` (a verbatim copy of `mockups/reference.html`, so styles can be
compared on identical markup).

## When to use / not use

- **Use** for consumer-facing and personal apps (the portal, Vale, HomeReelz), mobile-first surfaces, and
  anywhere warmth and delight matter more than density.
- **Do not use** for data-heavy dashboards, admin panels or developer consoles (`ui-style-dense`), for
  long-form reading or marketing pages that want restraint (`ui-style-editorial`), or for anything that must
  feel severe or institutional.

## Token rationale

**Seed → tonal palette.** One seed, `#5444d8` (OKLCH hue 280, a vivid violet-blue), generates the whole
scheme; tones below are OKLCH lightness × 100 at the seed hue.

- accent = tone 50 (`#5444d8`), accent-hover = tone 45, on-accent = white (6.6:1)
- accent-soft = tone 92 (`#dfe2ff`) is the tonal container; on-accent-soft = tone 42 (`#4227bc`, 7.3:1) is
  the only text that goes on it, so tonal buttons, the active nav pill and the pressed toggle share one pair
- neutrals are the seed hue at chroma 0.01–0.03: bg 96 (`#f1f3fe`), bg-elevated 99, surface white,
  surface-hover 94, border 88, border-strong 55 (4.4:1 on bg — Material's "outline" role)
- text = tone 22, text-muted = tone 46 (6.5:1 on bg); both carry the seed hue so greys never look foreign
- semantic colours share the accent's lightness (tone 50 light, ~82 dark) so badges read as one family;
  each has a `*-soft` tint at tone 94 light / 30 dark: `--color-text` reads on every tint at ≥ 10:1 and the
  kind colour itself at ≥ 4.8:1, so a dot in the kind colour can sit on its own tint
- focus = the tertiary hue (seed + 60°, rose `#9b357f` light / `#ffa0e0` dark), never the accent, so the
  ring reads next to accent-filled controls; the 2px outline offset keeps it on `bg`
- dark flips the ramp: bg 18, elevated 22, surface 24, hover 29, accent tone 83 with on-accent tone 31
  (8.4:1), accent-soft tone 40 with on-accent-soft tone 92 (7.9:1), text 93, muted 76

**Type.** One family, Figtree (rounded humanist, Google Fonts, `ui-rounded`/system-ui fallbacks), for
display and body. Scale xs 12 / sm 14 / md 16 / lg 18 / xl 24 / 2xl 32 / 3xl 45; leading 1.15 tight,
1.5 normal; weights 400 / 500 / 700, with headlines at `calc(var(--weight-bold) + 100)` = 800. Mono stays
the system stack and appears only on code values (commit hashes), never as flavour.

**Shape.** sm 8 (code chips), md 12 (icon blocks), lg 20 (cards, alerts, the table card), xl 28 (the hero,
sheets, dialogs), full (buttons, badges, inputs, nav pills).

**Controls.** `--control-height` is 48px at every width: buttons, the search input and table rows are
touch-sized even on desktop; nav pills and the toggle sit at 44px.

**Elevation.** Tone first: bg 96 under surface 100 is the resting depth, with no border or shadow on cards.
Shadows are seed-tinted and appear only on lift (card hover, primary hover) and floating layers (skip link).

**Motion.** fast 120 / base 220 / slow 420 ms. `--ease-standard` for colour and opacity; `--ease-emphasized`
= `cubic-bezier(0.34, 1.45, 0.64, 1)` overshoots and drives every transform: presses scale to 0.94–0.98 and
spring back, the toggle thumb slides past and settles, the tile icon morphs. Reduced motion zeroes all
three durations (the contract's block), which also stops the status-dot pulse.

## Component rules

- **Buttons** (`.btn`, pill, `--control-height`, padding 0 24): exactly one filled `.btn-primary` per view
  (accent / on-accent; hover = accent-hover + shadow-sm); `.btn-secondary` is tonal (accent-soft /
  on-accent-soft; hover mixes 12% of the text colour in — the one place `color-mix()` is used, as a state
  layer); `.btn-text` is text-only (accent; hover = 10% accent layer). Active: `scale(0.94)` on the emphasized
  curve. Disabled: border-colour fill, muted text, no transform, `cursor: not-allowed`.
- **Cards / tiles** (`.tile-link`, radius-lg, surface, 2px transparent border, no shadow at rest): hover →
  surface-hover, lift 4px, shadow-md, and the 56px icon block morphs radius-md → full while rotating −8°;
  active → `scale(0.98)`; focus ring offset 4px. Icon block sits on accent-soft (`live`) or info-soft
  (`beta`). `planned` → transparent, dashed border-strong, muted text, greyscale icon, `cursor: not-allowed`,
  no hover (the markup uses a `div`, so it is not focusable).
- **Tables**: `.table-wrap` is the surface card (radius-lg) and the only horizontal scroll region; the table
  itself stays `display: table` from 600px up, with xs bold muted headers, 1px dividers, 48px rows, row hover
  = surface-hover, and `th.num`/`td.num` right-aligned with tabular numerals. Below 600px rows stack as
  labelled cards: each `td` becomes a two-column grid whose first column is `attr(data-label)`, and the
  header row is visually hidden but kept for assistive tech.
- **Forms** (`.filter`): the label is always visible; the input is a `--control-height` pill with a 2px
  border that goes border-strong on hover and accent on focus under the global ring; placeholder is muted.
- **Badges** (`.badge`, pill, xs bold, leading dot): `--color-text` on the kind's `*-soft` tint with the
  dot in the kind colour — live/success → success, beta/info → info, warning, danger; planned → muted text on
  a dashed border-strong outline. The word carries the meaning; tint and dot only reinforce it.
- **Alerts** (`.alert`, radius-lg, flex): the kind's `*-soft` fill, a leading dot in the kind colour, and
  `.alert-body` in `--color-text`; kinds info (default), success, warning, danger.
- **Status dot** (`.status-dot[data-state]`): ok → success (with a pulsing halo), warn → warning, down →
  danger, unknown → muted; inside `.meta` it gets an on-accent ring so it reads on the accent pill.
- **Navigation**: pill links 44px tall, muted → text on hover, `[aria-current="page"]` = on-accent-soft on
  accent-soft. The wordmark is weight 800 with an accent dot that grows on hover. The theme toggle is a real
  switch drawn with pseudo-elements: `[aria-pressed="true"]` fills the track with accent and the thumb
  slides on the emphasized curve; its label text never changes size or hides.

## Adaptive layout

- **360 (compact):** one column, 20px gutters, no horizontal page scroll. Header wraps: wordmark + toggle
  on the first row, nav on its own row. Filter spans the width. Tiles 1-up. Deployments stack as labelled
  rows. Action buttons go full width. Hero headline clamps to 32px.
- **600:** tiles 2-up; the table returns to columns inside the scroll region.
- **768 (medium):** header on one row; filter shrinks to 18rem.
- **1200 (expanded):** tiles 3-up with 24px gaps; content capped at 1160; hero headline 45px at ≤ 18ch.

## Signature element

The hero is a solid accent colour block with `--radius-xl` corners, an 800-weight headline, a status pill
in accent-hover and two soft Material shapes (a circle and a tilted squircle) bleeding off its edges. In dark
mode it inverts to the tone-83 accent with deep-violet text, so "the door" stays the brightest thing on the
page. Spend the boldest colour here and nowhere else; every other surface is tonal.

## Do / Don't

- **Do:** one filled button per view; tonal containers before shadows; pills for everything interactive;
  press states that spring; sentence case; 4-pt spacing; `*-soft` tokens for every tint; `--control-height`
  for every control.
- **Don't:** hero gradients, three-feature rows, eyebrow labels, uppercase tracking, mono as "tech flavour",
  a second accent hue, shadows on resting cards, opacity to dim text (it breaks contrast), `color-mix()`
  anywhere but hover/pressed layers, any animation whose duration is not a token.

## Apply to an existing app

1. Copy `tokens.css` and link it before any component CSS (plain HTML / Svelte), or import it in the root
   layout before `globals.css` (Next.js). Body background and colour, the focus ring and reduced motion
   ship with it. Set `data-theme="light|dark"` on `<html>` for an explicit switch; unset follows the OS.
2. Tailwind v4: map the tokens in `@theme inline` so utilities resolve to them:
   ```css
   @import "tailwindcss";
   @import "./tokens.css";
   @theme inline {
     --color-bg: var(--color-bg); --color-bg-elevated: var(--color-bg-elevated);
     --color-surface: var(--color-surface); --color-surface-hover: var(--color-surface-hover);
     --color-border: var(--color-border); --color-border-strong: var(--color-border-strong);
     --color-text: var(--color-text); --color-text-muted: var(--color-text-muted);
     --color-accent: var(--color-accent); --color-accent-hover: var(--color-accent-hover);
     --color-on-accent: var(--color-on-accent);
     --color-accent-soft: var(--color-accent-soft); --color-on-accent-soft: var(--color-on-accent-soft);
     --color-success: var(--color-success); --color-success-soft: var(--color-success-soft);
     --color-warning: var(--color-warning); --color-warning-soft: var(--color-warning-soft);
     --color-danger: var(--color-danger); --color-danger-soft: var(--color-danger-soft);
     --color-info: var(--color-info); --color-info-soft: var(--color-info-soft); --color-focus: var(--color-focus);
     --font-sans: var(--font-sans); --font-display: var(--font-display); --font-mono: var(--font-mono);
     --radius-sm: var(--radius-sm); --radius-md: var(--radius-md); --radius-lg: var(--radius-lg);
     --radius-xl: var(--radius-xl); --radius-full: var(--radius-full);
     --shadow-sm: var(--shadow-sm); --shadow-md: var(--shadow-md); --shadow-lg: var(--shadow-lg);
     --ease-standard: var(--ease-standard); --ease-emphasized: var(--ease-emphasized);
     --spacing-control: var(--control-height);
   }
   ```
   Then `bg-bg text-text`, `bg-accent text-on-accent rounded-full`, `bg-accent-soft text-on-accent-soft`,
   `bg-success-soft`, `rounded-xl shadow-md ease-emphasized h-control` all read the active style.
3. Port these rules from `components.css`, in this order: `.btn*` (the hierarchy), `.tile-link` +
   `.tile-icon` (card and morph), `.badge`, `.alert`, `.filter input`, `.site-nav a` + `[aria-current]`,
   `.theme-toggle`, `.table-wrap` + `.table` (including the stacked layout). Wrap real tables in a
   `div.table-wrap[role="region"][aria-label][tabindex="0"]` and put `data-label` on every `td`.

## Audit (score 0–10 each; 7+ pass, 4–6 warn, 0–3 fail)

| # | Check | Passes when |
|---|---|---|
| 1 | Tokens only | No hex/rgb/hsl, px radius or ms in components; `grep -nE "#[0-9a-fA-F]{3,8}\b\|rgb\(\|hsl\("` on the component CSS prints nothing; `color-mix()` only in hover/pressed layers |
| 2 | Contrast | `node skills/design-tokens/scripts/check-contrast.mjs tokens.css` prints `RESULT: PASS` (text pairs, on-accent-soft, every `*-soft` tint, focus, border-strong, semantic on bg; both modes; name completeness) |
| 3 | Button hierarchy | One filled button per view; tonal and text for the rest; hover, focus, active and disabled all styled |
| 4 | Tonal depth | Cards rest without borders or shadows; shadows only on lift and floating layers |
| 5 | Shape | Cards `--radius-lg`, sheets and hero `--radius-xl`, interactive pills `--radius-full`; no ad-hoc radii |
| 6 | Motion | Transforms on `--ease-emphasized`, colours on `--ease-standard`, durations from tokens, reduced motion respected |
| 7 | Adaptive | 360 / 600 / 768 / 1200 render with no horizontal page scroll (only `.table-wrap` may scroll); targets ≥ 44px below 768 |
| 8 | Signature | One bold colour moment (the hero block) and nothing competing with it |
| 9 | Accessibility | Focus ring visible on every control in both modes (including `.table-wrap`), labels visible, meaning never colour-only, disabled things not presented as actions |
| 10 | Vocabulary | Every selector and attribute value in `components.md` has a rule: badge kinds ×7, alert kinds ×4, status states ×4, tile statuses ×3 |

Mockup self-score (2026-09-23, contract 1.1): 10 · 10 · 10 · 10 · 10 · 9 · 10 · 9 · 9 · 10. Points lost: the
status-dot pulse is decorative (6); the dark-mode hero is the brightest surface by design, so check it on a
real OLED (8); the rose ring has the same luminance as the accent and relies on its 2px offset gap (9).
