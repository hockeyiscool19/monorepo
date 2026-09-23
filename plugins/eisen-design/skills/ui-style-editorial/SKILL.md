---
name: ui-style-editorial
description: The Editorial ui-style — ink on warm paper, a Fraunces display serif with Inter for UI, one ultramarine accent, sharp corners, hairline rules instead of shadows and a numbered index in place of card grids; load it to style or audit a portal, content, portfolio or reading screen that should feel composed and quiet, or when a style rotation lands on "editorial".
---

# ui-style-editorial

Files beside this skill: `tokens.css` (the design-token contract, this style's values), `components.css`
(rules for the reference screen), `mockup.html` (a verbatim copy of `mockups/reference.html`). Load
`design-tokens` first; every rule below reads its names and adds none.

## Personality

**Composed, literate, exact.** The page reads like a well-set magazine spread: the type carries the hierarchy,
rules carry the structure, and colour appears only where something can be acted on.

## When to use, when not

- Use for portals, indexes, documentation, portfolios, long-form reading and any screen whose main job is to be read.
- Use when the brief says calm, premium, print-like, or "the words are the product".
- Do not use for dense operational tools (many controls per screen — pick `ui-style-dense`), consumer apps
  that need warmth and motion, or data-heavy dashboards where colour must encode state at a glance.

## Tokens: the rationale

- **Type pairing.** `--font-display` is Fraunces (Georgia fallback): a serif with optical sizes, so it stays crisp
  at 24px and gains character at 72px. `--font-sans` is Inter (system fallback) for everything a reader operates.
  Mono is reserved for data that is genuinely code (commit hashes), never decoration.
- **Scale.** 13 / 15 / 17 / 21 / 24 fixed, then two fluid display steps: `--text-2xl` 30→40px and `--text-3xl`
  40→72px (`clamp`). Body is 17px on `--leading-normal` 1.55; display sits on `--leading-tight` 1.1 with
  -0.02em tracking. The jump from body to headline is at least 2.3×; hierarchy comes from scale, not weight.
- **The single accent.** `--color-accent` is ultramarine. It appears on links, the one primary button, the
  live badge, the current-nav underline and focus rings, and nowhere else. Red, amber, green and blue stay
  semantic (`--color-danger` etc.) so the accent never looks like an error.
- **Ink and paper.** Light: paper `#f7f5f0`, ink `#1a1814`, muted ink at 6.3:1. Dark inverts to near-black
  warm paper and off-white ink; the accent lightens (`#8fa0ff`) with a navy `--color-on-accent`. All
  contract pairs pass 4.5:1 (borders and focus ≥ 3:1) in both modes.
- **Tints.** The four semantic `*-soft` tokens and `--color-accent-soft` sit one step off paper (light) or off
  the dark ground; `--color-text` stays the text on them, `--color-on-accent-soft` only on the accent tint.
- **Shape.** `--radius-sm` 0, `--radius-md` 2px, `--radius-lg` and `--radius-xl` 4px: the scale tops out at 4px.
  Buttons, inputs and badges are rectangles; only the status dot uses `--radius-full`. `--control-height` is 44px.
- **Elevation.** Shadows are near-invisible (1px, ≤ 8% alpha). Separation is done with `--color-border`
  hairlines and the 4-pt space scale; a 2px ink rule heads each index and table.
- **Motion.** 120 / 180 / 280ms on a standard ease-out. Nothing translates or scales: transitions are limited
  to opacity, colour and underline colour. Reduced motion zeroes the durations via the contract.

## Component rules

- **Buttons.** Hierarchy in three: `btn-primary` filled accent with `--color-on-accent`; `btn-secondary`
  1px ink outline that fills ink on hover; `btn-text` an underlined accent link. One primary per view. Every
  button is `--control-height` (44px) tall, 15px medium, `--radius-sm`, and full width below 600px. Active dims
  to 75% opacity; disabled to 45% with `cursor: not-allowed`; focus uses the contract ring.
- **Cards are index entries.** `.tiles` is a rule-separated list under a 2px ink rule, not a card grid.
  Each `.tile` is numbered by a CSS counter (`01`, `02` … in Fraunces, muted), the emoji icon is desaturated
  and hangs under the number, the title is the display face, the description is body text at ≤ 48ch, and the
  foot (badge, version, `Open →`) sits right-aligned. Hover and focus underline the title and turn the call to
  action accent; `data-status="planned"` entries are muted, desaturated and `pointer-events: none`.
- **Tables.** Full-width, `border-collapse`, a 2px ink rule under muted 15px headers, 1px hairlines between
  rows, tabular numerals throughout, `th.num`/`td.num` right-aligned, no zebra striping; a hover wash is the only
  cell background. Labelled cells stay on one line and the `.table-wrap` region (focusable, labelled) is the only
  thing that scrolls sideways, so every column survives at 360px and the page never does.
- **Forms.** Label above the field, 15px medium. Fields are 44px rectangles with a 1px `--color-border-strong`
  outline on `--color-surface`; hover darkens the outline to ink; focus sets the outline to `--color-focus`
  plus the contract ring at 0 offset. Placeholders use `--color-text-muted`, which passes 4.5:1.
- **Badges.** 13px medium ink text in a 1px rectangle. `live` is the only accent fill; `beta` is an ink outline;
  `planned` a dashed muted outline; `success`/`warning`/`danger`/`info` sit on their `*-soft` tint with a hairline
  in the semantic colour. Text plus tint, never tint alone; no pills, no all-caps.
- **Alerts.** A 3px semantic left rule between two hairlines on the matching tint; `.alert-body` ≤ 72ch, lead in bold.
- **Navigation.** The wordmark is Fraunces at `--text-xl`. Nav items are 15px medium ink text links with a
  44px hit area; hover underlines in ink, `[aria-current]` underlines 2px in the accent. The theme toggle is an
  outlined rectangle whose `[aria-pressed="true"]` state fills ink with paper text. The skip link is visually
  hidden until focused, then appears top-left as ink on paper.

## Adaptive layout on a strict column grid

Every block that spans columns (`.site-header`, `.hero`, `.section-head`, `.tile-link`) is a CSS grid with the
same tracks and gaps, so edges line up down the page. `--content-max` 1120px, `--gutter` 20px.

| Width | Grid | Header | Hero | Section head | Index entry |
|---|---|---|---|---|---|
| 360 | one text column; a 48px hanging index margin | wordmark + toggle, nav on a ruled second row | full width, h1 40px | stacked; filter full width | number/icon in the margin; title, description, foot stacked |
| 768 | 8 columns, 24px gaps (from 600px; the section head joins one row at 768px) | wordmark 1–2, nav 3–6, toggle 7–8 | h1 cols 1–7, lede 1–6 | h2 1–4, filter 5–8 | number col 1, title over description cols 2–6, foot 7–8 |
| 1280 | 12 columns, 24px gaps | wordmark 1–3, nav 4–9, toggle 10–12 | h1 cols 1–10 at 72px, lede 1–7 | h2 1–6, filter 9–12 | number 1, title 2–5, description 6–9, foot 10–12 |

Body copy never runs full width: `.lede` ≤ 58ch, descriptions ≤ 48ch, alerts ≤ 72ch. Vertical rhythm is
32 / 48 / 64 between sections and 24 inside an index entry.

## Signature element

The numbered index: `01`, `02`, `03` in the display serif, hanging in the margin beside each entry, under a
2px ink rule. It turns a grid of app tiles into a table of contents. The oversized 72px headline on the hero
is its counterpart; one page should have both, and nothing else that competes with them.

## Do / don't

- Do let the type scale do the work; add a rule before you add a box.
- Do underline links, offset from the baseline; links look like links.
- Do use tabular numerals for versions, dates and tables.
- Do desaturate pictograms and emoji so they sit in the ink palette.
- Don't add a second accent, a gradient, a card shadow or a rounded pill.
- Don't add decorative all-caps eyebrows or middle-dot metadata strings; the reference `.meta` line is the one
  exception because it is a status readout, not decoration.
- Don't animate position or size; fade, recolour or underline instead.
- Don't set body text on `--color-text-muted` — muted is for metadata, numbers and labels.

## Apply to an existing app

1. Copy `tokens.css` next to the app's global stylesheet and link it first (plain CSS/Svelte: `<link>` before
   component CSS; Next.js: import it in the root layout before `globals.css`). The `@import` of Google Fonts is
   at the top of the file; keep it there or self-host the two families under the same names.
2. Tailwind v4: map the contract so utilities read the active style, then use `bg-bg`, `text-muted`,
   `border-border`, `font-display`, `text-3xl`, `rounded-sm`, `shadow-sm`:
   ```css
   @import "tailwindcss";
   @import "./tokens.css";
   @theme inline {
     --color-bg: var(--color-bg);           --color-surface: var(--color-surface);
     --color-border: var(--color-border);   --color-text: var(--color-text);
     --color-muted: var(--color-text-muted); --color-accent: var(--color-accent);
     --color-on-accent: var(--color-on-accent); --color-warning-soft: var(--color-warning-soft);
     --font-sans: var(--font-sans);         --font-display: var(--font-display);
     --text-md: var(--text-md);             --text-3xl: var(--text-3xl);
     --radius-sm: var(--radius-sm);         --shadow-sm: var(--shadow-sm);
   }
   ```
3. Port these rule groups from `components.css`, in order of payoff: base (`a`, `h1, h2`, `code`,
   `::selection`); the index (`.tiles`, `.tile*`, the counter); buttons (`.btn*`); tables (`.table-wrap`,
   `.table`, `.num`); badges; forms (`.filter`); alerts (`.alert`, `.alert-body`); header, nav, toggle and skip
   link; footer. Keep the class names and attribute vocabularies; `design-tokens/components.md` is the contract.
4. Delete every hex, px radius and ms duration the app still has in a component; each is a defect.

## Audit (score each 0–10; 7 or above passes)

1. **Scale hierarchy** — the headline is ≥ 2.3× body; no more than four sizes on one screen besides badges.
2. **Two families** — Fraunces only on headings, wordmark and index numbers; Inter everywhere else; mono only on code.
3. **One accent** — accent appears only on links, the primary button, the live badge, current nav and focus.
4. **Contrast** — all contract pairs ≥ 4.5:1 (focus and strong border ≥ 3:1) in light and dark; run the check.
5. **Grid** — every block edge lands on the 12 / 8 / 1-column tracks; nothing is centred by eye.
6. **Rules, not boxes** — no card backgrounds or visible shadows; tints stay one step off paper; hairlines and
   space separate content.
7. **Shape** — no radius above 4px; buttons, inputs and badges are rectangles.
8. **Motion** — nothing moves; durations come from tokens; reduced motion is honoured.
9. **States and targets** — hover, focus, active, disabled, pressed, current and planned all designed; every
   control ≥ 44px; focus visible on paper and on the accent.
10. **Typographic detail** — sentence case, tabular numerals, real dashes, measured line lengths, no eyebrow
    labels; copy is a verb plus an object on every button.
