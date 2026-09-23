---
name: ui-style-dense
description: The Dense style for the eisensoftware token contract — compact, neutral, keyboard-first pro-tool UI; load it when styling dashboards, admin panels, registries or any data-heavy screen, or when a brief asks for the dense variant.
---

# ui-style-dense — compact, neutral, keyboard-first

A pro tool for people who live in it all day. Everything on screen is information; nothing is decoration.
Implements token contract 1.1 and component contract 1.1 (`design-tokens/components.md`).

**Personality:** compact · neutral · keyboard-first.

**Use it for** dashboards, admin panels, registries, logs, deploy tables, developer tools, anything with a
table at its centre. **Do not use it for** marketing pages, reading-length content, onboarding or consumer
apps — the 13px body and hairline borders are wrong for a first-time visitor.

## Token rationale (`tokens.css`)

| Group | Choice | Why |
|---|---|---|
| Type | Inter 13px body (`--text-md: 0.8125rem`, 14px below 768px), scale 11/12/13/14/16/20/24, bold = 600 | Inter is drawn for small UI text and has tabular figures; hierarchy comes from weight, not size |
| Mono | JetBrains Mono for `code`, `.version`, keycaps | Ids, commits and versions must be scannable and never proportional |
| Numerals | `font-variant-numeric: tabular-nums` on `body` | Columns of numbers line up without a table |
| Colour | Cool grey ramp; one saturated blue accent (`#2457e5` light / `#6d9bff` dark) for primary action, selection and focus; `--color-on-accent-soft` is the deep/pale accent that sits on `--color-accent-soft` | One colour means "act here"; greys carry everything else |
| Semantic | Strong foregrounds (≥ 3:1 on bg) plus quiet `*-soft` tints (`--color-success-soft` …) that carry badges and alerts; `--color-text` reaches ≥ 4.5:1 on every tint and each strong colour reaches ≥ 4.5:1 on its own tint | Status is text on a tint, never a fill alone |
| Controls | `--control-height: 32px` (44px below 768px); table rows equal it, the header bar is it + 8, panel title bars it + 4 | One number sets the rhythm of every row and control |
| Space | 2 / 4 / 8 / 12 / 16 / 24 / 32 / 48 — the 4-pt ramp one step tighter, `--space-1` is a 2px half step | Controls pad 8–12, panels 12–16, sections 16–24 |
| Shape | `--radius-sm` 2px, `--radius-md` 4px, `--radius-lg` 6px, `--radius-xl` 8px (dialogs only) | Near-square reads as precise |
| Elevation | 1px `--color-border` between every region; shadows exist only for popovers, menus, dialogs | Flat panels scan faster than stacked cards |
| Motion | 60 / 100 / 120ms; nothing slower | Feedback is instant; reduced motion sets all three to 0 |
| Layout | `--content-max: 1440px`, `--gutter: 12px` | Panes fill wide screens; text columns are capped per component (`.lede` 64ch) |

Both dark blocks are identical; `color-scheme` switches with them so native controls follow the theme.

## Component rules (`components.css`)

- **Buttons.** `--control-height` tall, 4px corners, weight 500, one `.btn-primary` per view (accent fill),
  `.btn-secondary` is a bordered surface, `.btn-text` is a ghost for toolbars. Hover = surface change; active = one
  shade darker (`color-mix()` is allowed for that pressed layer only); disabled = 50% opacity + `not-allowed`.
  The theme toggle is a secondary button; `[aria-pressed="true"]` is accent-soft with `--color-on-accent-soft` text.
- **Cards → panels.** A tile is a 1px-bordered panel: 24px icon box, title at weight 500, muted 12px description,
  a hairline-topped foot with badge · version · "Open →". `data-status="planned"` is dashed, muted, greyscale icon,
  `cursor: not-allowed`, and is a `<div>` so it never takes focus. Below 768px tiles become rows in one bordered list.
- **Data table (primary).** Rows equal `--control-height`, 12px muted header, tabular numerals, sticky header offset
  by the site header, row hover = `--color-surface-hover`, `th.num`/`td.num` right-aligned by one rule, `code` in a
  bordered mono chip. Below 768px the `.table-wrap` region (focusable, `role="region"`) is the only horizontal
  scroller on the page, with the first column pinned; the page never scrolls sideways.
- **Forms.** `--control-height` inputs with a `--color-border-strong` boundary (≥ 3:1), 4px corners, focus = 2px ring
  inset on the border; label to the left at 12px weight 500, stacked under the heading below 768px.
- **Badges.** 18px chips, 11px weight 500, a `currentColor` dot before the label so status is never colour alone.
  `live`/`success` → success, `beta`/`info` → info, `warning`, `danger`: strong colour on its `*-soft` tint; `planned`
  is dashed and muted.
- **Alerts.** A 3px semantic left rule on the matching `*-soft` fill, `--color-text` on top, 12px text, no icon;
  `.alert-body` is the flexible message column. Kinds: info / success / warning / danger.
- **Status dot.** `ok` success · `warn` warning · `down` danger · `unknown` border-strong; the `.meta` text says why.
- **Navigation.** 40px sticky bar on `--color-bg-elevated`; links are `--control-height` pills, muted → text on hover;
  `[aria-current="page"]` is text-coloured with a 2px accent underline. Footer links are 11px muted with a 32px hit area.

## Keyboard-first rules

1. Every focusable element shows the 2px `--color-focus` ring (`:focus-visible`, offset 1px; inset where a
   container clips, including the `.table-wrap` region). Never `outline: none` without a replacement of equal size.
2. Shortcut hints are keycaps: `<kbd>`, or `data-kbd="⌘K"` on any control (rendered by `::after`). Show a hint
   only for a shortcut that is wired — the portal binds `/` to the filter and `Esc` to clear it.
3. Tab order is DOM order: skip link → wordmark → nav → theme toggle → filter → tiles → table region → actions →
   footer. Never reorder with `order` or `flex-direction: row-reverse` on focusable content.
4. Hover is never the only path: row actions and "Open →" also appear on focus.
5. Targets: ≥ 32px at every width, ≥ 44px below 768px (`--control-height` switches in `tokens.css`).

## Adaptive layout

| Width | Layout |
|---|---|
| 360 | One column. Header wraps: wordmark + toggle, nav on its own row (static, not sticky). Filter stacks under the heading, keycap hidden. Tiles are rows. Buttons fill the line (< 600). The table region scrolls sideways. |
| 768 | One column, sticky 40px header, heading + filter on one row, tiles 3-up (`minmax(200px, 1fr)`), table fits. |
| 1280 | Two panes: `2fr` apps · `3fr` deployments under a full-width title and status rail; panes top-align. |

## Signature element

**The keyboard hint + status rail.** The filter carries a `/` keycap from CSS `::after` that disappears on focus,
and the hero's meta line renders as a full-bleed status rail — a control-height strip with the health dot, bordered
top and bottom, the way a status bar sits under a pro tool's title. Both are information, not ornament.

## Do / don't

- Do put the table (or list) first and let it fill the width.
- Do use weight and colour for hierarchy; keep sizes within two steps of body.
- Do separate regions with 1px borders; do tint status with the `*-soft` tokens, never full-strength semantic fills.
- Don't add shadows, gradients, rounded 8px+ cards, mascots or hero imagery.
- Don't use all-caps labels or decorative monospace; mono is for ids, commits, versions and keys.
- Don't animate anything over 120ms or move layout on hover.
- Don't show a shortcut that isn't bound.

## Apply to an existing app

1. Drop in `tokens.css` before any component CSS (`<link>`, or import it first in the root layout). It sets
   `body` background/colour/font and `:focus-visible`; remove the app's own versions of those.
2. Tailwind v4 — map the contract in `@theme` so utilities resolve to the active style:
   ```css
   @import "tailwindcss";
   @import "./tokens.css";
   @theme inline {
     --color-bg: var(--color-bg);           --color-surface: var(--color-surface);
     --color-border: var(--color-border);   --color-text: var(--color-text);
     --color-muted: var(--color-text-muted); --color-accent: var(--color-accent);
     --color-success-soft: var(--color-success-soft); --color-warning-soft: var(--color-warning-soft);
     --font-sans: var(--font-sans);         --font-mono: var(--font-mono);
     --radius-sm: var(--radius-sm);         --radius-md: var(--radius-md);
     --spacing: 4px;                        --height-control: var(--control-height);
   }
   ```
   Then `bg-surface border-border text-muted rounded-md font-mono h-control` read the tokens; use `tabular-nums`
   on tables.
3. Port these rules from `components.css`, in this order: base (`::selection`, `code`, `.num`), buttons,
   the table block (`.table-wrap` included), badges, alerts, the keycap block, then the media queries
   (touch, < 600 buttons, phones).
4. Keep the app's markup; if a class is missing, add the class rather than a new colour.

## Audit (score each 0–10; 7 passes, fix anything lower)

1. **Density with hierarchy** — one obvious primary action; title/body/muted are distinguishable at a glance.
2. **Table quality** — tabular numerals, right-aligned numbers, sticky header, row hover, one scroll region.
3. **Borders not shadows** — every region separated by `--color-border`; shadows only on floating UI.
4. **One accent** — accent appears only on primary action, selection, current nav, focus and links.
5. **Contrast** — the design-tokens gate (`scripts/check-contrast.mjs`) passes: text on bg, surface and every tint.
6. **Focus** — every focusable element shows the ring; none is clipped by an overflow container.
7. **Keyboard hints** — hints present for wired shortcuts, absent for unwired ones; DOM order = tab order.
8. **Targets** — ≥ 32px everywhere, ≥ 44px below 768px, including inline links.
9. **Adaptive** — no horizontal page scroll at 360; panes appear at 1280; nothing hover-only.
10. **Token purity** — no hex/rgb/hsl, px radius or ms duration in component CSS; tints from `*-soft` tokens;
    `--x-` names only for sizes the contract has no name for.

## Files

`tokens.css` (contract 1.1, light + dark) · `components.css` (every selector in `components.md`) ·
`mockup.html` (verbatim copy of the reference; open it to see the style).
