---
name: ui-style-nordic
description: The Nordic UI style for eisensoftware — an old northern hold. Parchment and iron-gall ink by day, a blue-charcoal night HUD with bone-white text by night, one rune-gold accent, frost for focus and info, Cinzel engraved capitals over a Jost HUD voice, small carved radii, hairline double rules and inset frames, measured motion. Load it to style the Eisenhold portal (its /apps list view, HUD menus, gate plaques, journal and map overlays), to audit a screen in this style, or to port its tokens.css into an existing app.
---

# Nordic — carved, weathered, lit by rune-gold

**Personality:** an old northern hold: carved stone, iron, parchment, rune-gold, frost. Weighty and quiet. Names
are cut in stone (Cinzel capitals), everything you operate speaks in the terse capitals of a HUD (Jost), and gold
marks what you can act on. The light theme is the journal and the map; the dark theme is the night HUD.

## When to use / when not to

- **Use** for the Eisenhold portal (Phase 8): the `/apps` list view, HUD menus, gate plaques, the journal and map
  overlays. Also fine for games, lore, archives, maps: anything that should feel old, crafted and a little ceremonial.
- **Don't use** for long reading (Cinzel is capitals only: headings and names, never paragraphs), for dense
  operational tools (`ui-style-dense`), for daily wellness products (`ui-style-organic`, meant for Vale), or for
  anything that must look neutral. Don't spread the gold as decoration: apart from two marks (the wordmark lozenge
  and the rule under the headline) it means "act here".

## Tokens — what the values mean

`tokens.css` implements design-token contract **1.1** in full (light `:root`, dark in both the media query and
`[data-theme="dark"]`, reduced motion, `body`, `:focus-visible`). Cinzel and Jost load through the Google Fonts
`@import` at the top of the file, as in the other styles. Ratios below are `check-contrast.mjs` output (links and
hovers from the same maths).

| Role | Light — the journal | Dark — the night HUD | Why |
|---|---|---|---|
| bg / surface | parchment `#ebe1c9` / vellum `#f6f0e1` | blue-charcoal `#0f1319` / slate `#171d26` | Aged paper with lighter sheets laid on it; night is blue stone, never black |
| text / muted | iron-gall ink `#221a13` / faded ink `#5a4d3d` | bone `#ece5d4` / ash `#a4abb6` | Ink 13.2:1 and muted 6.3:1 on parchment; bone 14.8:1, ash 8.0:1 at night; muted ≥ 6.3:1 on bg, surface, surface-hover and bg-elevated |
| accent / on-accent | burnished rune-gold `#7a5616` / vellum `#f8f2e3` (5.9:1) | rune-gold `#d9b45e` / `#17130a` (9.4:1) | One "act here" colour in both themes. The day gold is deep enough to be link text: 5.1:1 on parchment, 5.8:1 on vellum |
| accent-hover | `#644510` (on-accent 7.8:1) | `#e7c678` (11.2:1) | Darker by day, brighter by night |
| accent-soft / on-accent-soft | gilt wash `#ecdcb2` / `#553c0b` (7.6:1) | `#3a3020` / `#f0dca6` (9.5:1) | Pressed toggle, text-button hover, live icon sockets, selection |
| success / warning / danger / info | pine `#2f5d3b` · ember `#9a4716` · oxblood `#9e2b23` · glacier `#265d7d` | lichen `#8dc99a` · ember `#ef8f4f` · blood `#e8655c` · frost `#8ec6e8` | ≥ 4.9:1 on parchment (safe as text), ≥ 5.7:1 at night. Warm hues step gold 40° → ember 23° → oxblood 4°, so warning never reads as the accent |
| `*-soft` tints | `#dce4cc` `#f0dac0` `#efd4c9` `#d5e0e0` | `#1c3325` `#3d2a1a` `#3e2023` `#193043` | Badge and alert fills; ink reads on each at ≥ 12:1, bone at ≥ 10.7:1 |
| border / border-strong | sepia hairline `#d2c4a3` / iron `#857559` (3.45:1) | `#2a3340` / iron `#687385` (3.88:1) | Hairlines are decoration; iron is every control edge and every structural double rule |
| focus | deep frost `#1f5f8b` (5.3:1) | frost `#a3d8f7` (12.2:1) | Frost marks focus: a cold ring that never matches the gold button it surrounds |

Why not oxblood as the light accent: it is the manuscript's rubric red and the obvious journal colour, but it would
share a hue with danger. Gold is action in both themes, so the HUD and the journal agree on "act here", and oxblood
keeps one job: danger, the wax seal.

- **Type:** Cinzel (display) for h1, h2, the wordmark, tile titles and app names in the table. Its lowercase letters are
  small caps, so a headline sets like an inscription. Jost (body) is a Futura-like geometric sans at 17px
  (`--text-md` 1.0625rem, because its x-height reads small), leading 1.6. The HUD voice is Jost 500 capitals at
  `--x-caps-tracking` (0.08em): nav, buttons, labels, badges, table heads, the meta readout. Mono is the system stack
  (`code`, `.version`). Fallbacks: Trajan, Palatino, Georgia, serif; Futura, Century Gothic, Avenir Next, system-ui.
  `--weight-bold` is 600 because Cinzel 700 clots at 20px.
- **Scale:** 13 / 15 / 17 / 20 / 24, then fluid 28→36 (`--text-2xl`) and 32→52 (`--text-3xl`). Engraved capitals are
  wide, so the display steps stay below the other styles'.
- **Shape:** `--radius-sm` 2, `--radius-md` 3, `--radius-lg` 4, `--radius-xl` 6 (hero only). Carved, never pillowy. No
  pills: `--radius-full` exists for the contract but no component here uses it; round things are lozenges instead.
- **Controls:** `--control-height` 44px everywhere: buttons, the input, nav items, the toggle, the skip link.
- **Elevation:** tight shadows tinted with ink by day, black by night. Stone sits, it does not float: hover never
  lifts a tile, it lights it (`--x-rune-glow`: a warm shadow by day, a gold aura by night).
- **Motion:** 150 / 250 / 400ms. Standard `cubic-bezier(0.4, 0, 0.2, 1)`, emphasized `cubic-bezier(0.2, 0, 0, 1)`: every
  control point sits inside 0–1, so nothing overshoots or bounces. Apart from the skip link dropping in, nothing moves more than
  1px (press) or 4px (a tile's "Open →"). Reduced motion zeroes all three durations (contract rule, not overridable).
- **Private tokens** (read only by this style's `components.css`): `--x-inset` 3px (edge to inner hairline), `--x-rule`
  3px (a `double` border: two 1px lines 1px apart), `--x-caps-tracking`, `--x-display-tracking` 0.03em, `--x-hero-bg`
  (a vellum glow by day, a faint frost-lit sky by night; muted text stays ≥ 6.2:1 on every stop), `--x-rune-glow`.
  `--x-frame` is set per element inside `components.css`: the colour of that panel's inner hairline.

## Component rules (contract 1.1, `design-tokens/components.md`)

- **Frames (signature).** The hero, tiles, alerts, plated buttons, the toggle, the skip link and folded table rows are
  carved: a 1px edge plus a 1px hairline `--x-inset` inside it, drawn by an absolutely positioned `::after` with
  `pointer-events: none`. Never a third line, never thicker. Solid iron edges (`--color-border-strong`) mark what you act on
  (buttons, toggle, input, tiles); dashed iron marks what you cannot act on yet (planned tiles and badges, disabled
  buttons); hairline edges (`--color-border`) mark what you read (hero, table, folded rows); semantic edges mark
  notices and tags.
- **Double rules.** Structure is `var(--x-rule) double var(--color-border-strong)`: under the header, under each
  section head, under the table head, above the footer. Gold double rules appear only under the hero headline and
  under the current nav item.
- **Buttons.** 44px plates, `--radius-sm`, Jost capitals. `.btn-primary` is a gold plate with an on-accent inner
  hairline (one per view). Hover deepens (day) or brightens (night) the gold and adds the rune glow. `.btn-secondary`
  is vellum with an iron edge whose inner line turns gold on hover. `.btn-text` has no plate: gold capitals that take
  an accent-soft wash and an underline on hover. Active presses in 1px. Disabled: surface-hover fill, dashed iron
  edge, no inner line, muted text (still ≥ 6.4:1), `not-allowed`.
- **Tiles (door plaques).** `--radius-lg`, `--space-5` padding, iron edge plus inner hairline, a 48px icon socket (gilt
  for `live`, frost for `beta`), the name in Cinzel, muted Jost description, and a foot on a hairline: badge, mono
  version, "Open →". Hover and focus light the frame gold, add the glow, turn the name gold and nudge "Open →" 4px.
  `planned` is uncarved: dashed edge, no inner line, flat on the parchment, muted ink, greyscale socket, no pointer.
  Only `a.tile-link` gets hover, so a `div.tile-link` never invites a click.
- **Tables (the ledger).** ≥ 600px: one vellum panel with a hairline edge; Jost-capital heads on a double rule; rows
  at `--control-height` separated by hairlines; app names in Cinzel; hover `--color-surface-hover`;
  `th.num`/`td.num` right-aligned with tabular figures. `.table-wrap` is the focusable region and the only thing that
  may scroll sideways. < 600px: each row folds into a carved ledger card, one "label · value" line per cell from
  `data-label`, with `thead` kept for screen readers. The page never scrolls sideways.
- **Forms.** Visible Jost-capital label above a 44px vellum field with an iron edge; hover and focus turn the edge
  gold and focus adds the frost ring. Placeholder is muted ink at full opacity.
- **Badges (stamped tags).** `--radius-sm`, Jost capitals at `--text-xs`, ink on the matching `*-soft` tint, 1px edge
  in the semantic colour: `live`/`success` pine, `beta`/`info` frost, `warning` ember, `danger` oxblood. `planned` is
  a dashed iron outline with muted text. The word carries the meaning; tint and edge only reinforce it.
- **Alerts (posted notices).** A tint fill, a 1px edge in the semantic colour, the carved inner hairline and a lozenge
  marker in the semantic colour, then `.alert-body`; `<strong>` names the subject. Same anatomy for all four kinds.
- **Status dot.** A lozenge (an 8px square turned 45°) with a halo in the matching tint: `ok` pine, `warn` ember,
  `down` oxblood, `unknown` muted. The `.meta` readout always says what it means.
- **Navigation.** The wordmark is Cinzel capitals led by a gold lozenge set in a thin ring. Nav items are 44px Jost
  capitals in muted ink; hover inks them over an iron double underline; `[aria-current="page"]` gets a gold double
  underline. The theme toggle is a secondary plate; `[aria-pressed="true"]` is a gilt wash with a gold edge. The skip
  link drops in as a gold plate with `--shadow-lg`.

## Adaptive layout

| Width | Header | Hero | Tiles | Table | Actions |
|---|---|---|---|---|---|
| 360 | wordmark + compact toggle; nav on its own row | `--space-6`/`--space-5` padding, h1 `--text-2xl` | 1 column, `--space-4` gap | folded ledger cards | stacked, full width |
| 600 | same | same | 2 columns, `--space-5` gap | real table in `.table-wrap` | inline |
| 768 | one row: wordmark, nav, toggle; filter beside the heading | `--space-7`/`--space-6`, h1 `--text-3xl` | 2 columns | real table | inline |
| 1200+ | same, content capped at `--content-max` (1120px) | `--space-8`/`--space-7` | 3 columns | real table | inline |

Gutter 20px everywhere; sections `--space-7` apart. The lede and tile descriptions stay ≤ 52ch, alert text ≤ 72ch,
the headline ≤ 20ch.

## Signature element

**The carved frame and the double rule.** Every panel is a stone tablet: a 1px edge with a hairline cut 3px inside
it. Every structural break is an iron hairline double rule. Gold double rules are kept for two places: a short bar
under the hero headline, like gilding under a carved name, and the underline of the current nav item. A frame turns
gold only when it is reached for (hover, focus) or pressed on (the dark-mode toggle): the rune lights under your hand.

## Do / don't

- **Do** keep gold for action: links, the primary plate, the text button, the current nav mark, hover light. The only
  decorative gold is the wordmark lozenge and the rule under the headline. Frost is focus and info.
- **Do** set names in Cinzel and everything operable in Jost capitals; keep sentences (lede, descriptions, alerts) in
  sentence-case Jost.
- **Do** take tints from the `*-soft` tokens with `--color-text` or `--color-on-accent-soft` on top.
- **Don't** set paragraphs in Cinzel, stack a third frame line, round anything into a pill, or add a bouncy easing.
- **Don't** use `outline` for decoration: it belongs to the focus ring. Frames are borders on `::after`.
- **Don't** dim text with `opacity`; use `--color-text-muted` (only the planned tile's emoji socket is faded).
- **Don't** put ember or oxblood text on its own tint at small sizes when ink would do; the word goes in ink.

## Apply to an existing app

1. Copy `tokens.css` next to the app's global stylesheet and load it first (`<link>` before component CSS, or
   `import "./tokens.css"` at the top of a Next.js root layout). Keep the Google Fonts `@import` or self-host Cinzel
   and Jost under the same names.
2. **Tailwind v4:** map the contract into `@theme` so utilities resolve to the active style:
   ```css
   @import "tailwindcss";
   @import "./tokens.css";
   @theme inline {
     --color-bg: var(--color-bg); --color-surface: var(--color-surface); --color-border: var(--color-border);
     --color-text: var(--color-text); --color-muted: var(--color-text-muted); --color-accent: var(--color-accent);
     --color-on-accent: var(--color-on-accent); --color-focus: var(--color-focus); --color-info: var(--color-info);
     --font-sans: var(--font-sans); --font-display: var(--font-display); --radius-sm: var(--radius-sm);
     --radius-lg: var(--radius-lg); --shadow-sm: var(--shadow-sm); --spacing-control: var(--control-height);
   }
   ```
3. Port rule groups from `components.css` in order of payoff: the HUD-voice group and base, the carved frame,
   buttons, tiles, badges, the table (with the < 600px fold), alerts, the filter, header and nav, footer.
4. Add `data-theme` handling on `<html>` (light | dark | absent = OS) and a toggle with `aria-pressed`.
5. **Eisenhold:** the portal adopts this style with `PORTAL_STYLE=ui-style-nordic`; `/apps` is exactly the reference
   screen. HUD components read contract tokens only, never `--x-*`: gold for the one action, `--color-focus` for the
   selected gate, `--color-info` for information, `--color-text` on `--color-bg-elevated` panels. Take the 3D scene
   colours (`engine/palette.ts`) from the dark column above so the world and its HUD agree.

## Verify

```
node plugins/eisen-design/skills/design-tokens/scripts/check-contrast.mjs plugins/eisen-design/skills/ui-style-nordic/tokens.css
grep -nE "#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(" plugins/eisen-design/skills/ui-style-nordic/components.css   # no output
cmp plugins/eisen-design/mockups/reference.html plugins/eisen-design/skills/ui-style-nordic/mockup.html   # no output
wc -l plugins/eisen-design/skills/ui-style-nordic/*                                                       # each ≤ 400
plugins/eisen-design/skills/accessibility-ada/scripts/a11y-audit.sh plugins/eisen-design/skills/ui-style-nordic/mockup.html
```

The first must print `RESULT: PASS`. Then open the gallery (`make gallery`, `/docs/mockups/?style=nordic`) at 360,
768 and 1280 in both themes: no page scroll at 360, the table folds, and the focus ring shows on every stop.

## Audit — score each 0–10 (7+ pass, 4–6 warn, 0–3 fail)

1. **Tokens only** — no hex/rgb/hsl, px radius or ms duration in `components.css`; `--x-*` read only here; no `color-mix()`.
2. **Contrast** — `check-contrast.mjs` passes in both modes; gold links ≥ 4.5:1 on parchment and vellum.
3. **Dark mode** — both dark blocks identical; night is blue-charcoal with bone text, never black and white.
4. **Frames** — every carved panel has exactly one edge and one inner hairline; solid iron only on actionable things.
5. **Rules** — structure is double rules; gold rules only under the headline and the current nav item.
6. **Type** — Cinzel only on names and headings; Jost capitals on every control and label; no Cinzel paragraphs.
7. **Gold discipline** — accent on action (links, plates, current nav, hover light) plus the wordmark lozenge and the
   headline rule, nowhere else; frost only on focus and info.
8. **Motion** — durations from tokens, no overshoot, nothing but the skip link moves more than 4px; reduced motion respected.
9. **Touch and focus** — every control at 44px; the frost ring visible on tiles, buttons, the input and `.table-wrap`.
10. **Adaptive** — no page scroll at 360; tiles 1/2/3 at 360/600/1200; the ledger folds below 600; the header wraps cleanly.

Report scores as a table, list every < 7 with the fix, apply the fixes, then re-score.
