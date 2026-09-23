# Component contract — the markup every style must dress

Every `ui-style-*` styles the **same markup**: `plugins/eisen-design/mockups/reference.html`. A style ships a
`tokens.css` (values for the token contract in `SKILL.md`) and a `components.css` (rules for the classes and
states below) and never edits markup. This file is the list of what `components.css` must cover, and the
attribute vocabularies the markup uses. Contract version **1.1** (2026-09-23).

## Regions and navigation

| Selector | Notes |
|---|---|
| `.skip-link` | Visually hidden until focused; first focusable element on the page. |
| `.site-header` `.wordmark` `.site-nav a` | `a[aria-current="page"]` marks the current section. |
| `.theme-toggle` | `button[aria-pressed="true"]` when dark is forced. Constant label text; do not hide the label. |
| `.site-footer a` | |

## Hero and status

| Selector | Notes |
|---|---|
| `.hero h1` `.lede` `.meta` | |
| `.status-dot[data-state]` | Vocabulary: `ok` · `warn` · `down` · `unknown`. Never color-only: `.meta` text carries the meaning. |

## Apps

| Selector | Notes |
|---|---|
| `.section-head` | Heading + filter on one row at ≥ 768px, stacked below. |
| `.filter label` `.filter input[type="search"]` | Visible label; `:focus-visible` ring from `--color-focus`. |
| `ul.tiles` | Grid: 1 column < 600px, 2 at 600–1199px, 3 at ≥ 1200px (a style may choose rows/list instead). |
| `li.tile[data-status]` | Vocabulary: `live` · `beta` · `planned`. `planned` is dimmed and its `.tile-link` is a `div`, not a link. |
| `.tile-link` | Whole tile is the target; `:hover` `:focus-visible` `:active` states; min target 44px. |
| `.tile-icon` `.tile-body` `.tile-title` `.tile-desc` `.tile-foot` | `.tile-body` may be `display: contents` in grid layouts. |
| `.badge[data-kind]` | Vocabulary: `live` · `beta` · `planned` · `warning` · `success` · `danger` · `info`. Text + tint, never tint alone. |
| `.version` | Tabular numerals; monospace allowed. |
| `.tile-cta` | Decorative (`aria-hidden`); optional per style. |

## Deployments

| Selector | Notes |
|---|---|
| `.table-wrap` | Scroll region around the table: `div[role="region"][aria-label][tabindex="0"]`; the only element allowed to scroll horizontally at narrow widths. |
| `.table` `thead th[scope="col"]` `tbody tr` `td` | Sticky header optional. |
| `th.num` `td.num` | Right-aligned numeric column; the header carries `.num` too, so no `:has()` is needed. |
| `td[data-label]` | Column name for stacked/card layouts below 600px (`content: attr(data-label)`). |
| `code` | Commit hashes; `--font-mono`. |
| `.actions` | Button row; wraps at narrow widths, full-width buttons < 600px. |
| `.btn.btn-primary` `.btn.btn-secondary` `.btn.btn-text` | One primary per view. States: `:hover` `:focus-visible` `:active` `:disabled` / `[aria-disabled="true"]`. |
| `.alert[data-kind]` | Vocabulary: `info` · `success` · `warning` · `danger`. `role="status"` for info/success, `role="alert"` for danger. Message text is wrapped in `.alert-body`. |

## Rules

1. Every selector above gets a rule, even if it is a one-liner; a missing rule is a defect, not a choice.
2. Colors, radii, shadows, fonts and durations come from tokens. Private `--x-*` tokens are allowed inside a style's own
   `components.css` for values the contract has no name for (row heights, gradients), never in shared components.
3. Tints come from the `*-soft` tokens (`--color-accent-soft`, `--color-success-soft`, `--color-warning-soft`,
   `--color-danger-soft`, `--color-info-soft`) with `--color-on-accent-soft` or `--color-text` on top; `color-mix()` is
   allowed only for hover/pressed state layers.
4. No horizontal page scroll from 360px up. Interactive targets ≥ 44px on touch widths (< 768px), ≥ 32px above.
5. `prefers-reduced-motion` is honored through the duration tokens; do not add motion that bypasses them.
