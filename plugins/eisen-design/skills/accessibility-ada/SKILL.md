---
name: accessibility-ada
description: Build and review every UI to WCAG 2.2 AA, a superset of the WCAG 2.1 AA that ADA Title II requires. Load for any component, page, form, mockup or audit on the platform — before styling — for semantics, keyboard, focus, target size, contrast, forms, motion, ARIA, live regions, media, tables, timing, and the keyboard / VoiceOver / axe test routine.
---

# Accessibility — WCAG 2.2 AA, built in

## The bar

- **WCAG 2.2 Level AA.** It contains all of 2.1 AA, which is what ADA Title II (the DOJ 2024 rule), Section 508
  and EN 301 549 point at. Engineering guidance, not legal advice; a formal claim needs a human expert audit.
- AGENTS.md makes accessibility a gate: keyboard reachable, visible focus, 4.5:1 text, labels on inputs. This skill
  is the full list, ordered the way a screen gets built. Bracketed numbers are success criteria; `checklist.md`
  maps every item to its criterion and `scripts/a11y-audit.sh` runs axe.
- The token contract already carries part of the load: `--color-focus` (≥ 3:1 on `--color-bg`, proven by
  `check-contrast.mjs`), a 2 px `:focus-visible` outline, and durations that drop to 0 ms under
  `prefers-reduced-motion`. Components must not undo any of it.

## 1. Structure and semantics

1. `<html lang="en">`; each page a unique `<title>` of the form "Page · App"; exactly one `<h1>` naming what the
   page is for; heading levels never skip. [3.1.1, 2.4.2, 2.4.6, 1.3.1]
2. Landmarks once each: `<header>`, `<main id="main">`, `<footer>`; `<nav aria-label="…">` on every navigation when
   there is more than one; `<section aria-labelledby>` for regions with a heading. [1.3.1, 2.4.1]
3. The skip link is the first focusable element, targets `#main`, and becomes visible on focus. [2.4.1]
4. Native first: `<a href>` goes somewhere, `<button>` does something; `<dialog>`, `<details>`, `<select>`,
   `<table>` before any custom widget. A `div` or `span` with a click handler is a defect. [4.1.2, 2.1.1]
5. Lists are `<ul>`/`<ol>`; add `role="list"` when a CSS reset strips list semantics in Safari. [1.3.1]
6. DOM order equals visual order; CSS `order` and `row-reverse` never reorder content that has meaning. [1.3.2, 2.4.3]

## 2. Keyboard and focus order

1. Every action works with Tab / Shift+Tab, Enter, Space, arrows inside composite widgets, and Esc to close, with
   no pointer at all. Test by unplugging the mouse, not by reading the code. [2.1.1]
2. No trap: focus always leaves a widget with Tab or Esc. [2.1.2]
3. No positive `tabindex`; `tabindex="-1"` only on targets you focus programmatically. [2.4.3]
4. Dialogs and menus: move focus in on open, keep it inside, close on Esc, return it to the opener. Removing a
   focused element moves focus to the nearest sensible place, never to `<body>`. [2.4.3]
5. Single-character shortcuts work only while their component has focus, or can be turned off or remapped. [2.1.4]
6. The focused element is never covered by sticky headers, footers or banners: set `scroll-padding-top` (and
   bottom) to the sticky element's height. [2.4.11]

## 3. Visible focus

- `:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }` — ≥ 2 px thick and ≥ 3:1
  against what it sits on, on every surface a control can appear on (page, card, accent button — the offset
  keeps the ring on the page background). [2.4.7, 1.4.11]
- Never `outline: none` without an equal replacement. Prefer `outline` to `box-shadow` rings: outlines survive
  `forced-colors: active` (Windows High Contrast). [2.4.7]

## 4. Target size and pointer input

- Every target ≥ 24×24 CSS px, or spaced so a 24 px circle centred on it overlaps no other target; 44×44 for
  primary and touch targets; links inside a sentence are exempt. [2.5.8]
- Drag and multi-finger gestures have a click or keyboard alternative. [2.5.7, 2.5.1]
- Nothing fires on pointer-down alone; the up event completes or cancels the action. [2.5.2]
- The accessible name starts with the visible label: a button showing "Open" may be `aria-label="Open Vale"`,
  never "Launch". [2.5.3]

## 5. Contrast, color and zoom

1. Text 4.5:1; large text (≥ 24 px, or ≥ 18.66 px bold) 3:1; UI boundaries, meaningful icons, focus rings and
   chart marks 3:1 — in both themes and in hover, pressed and disabled states that carry information. Tokens:
   `check-contrast.mjs`; rendered text: axe. [1.4.3, 1.4.11]
2. Color is never the only signal: a status badge is color plus text, a link in prose is underlined, an error has
   an icon or text. [1.4.1]
3. Reflow: no two-dimensional scrolling at 320 CSS px wide (data tables and maps excepted). [1.4.10]
4. 200 % text zoom loses nothing; text-spacing overrides (line-height 1.5, paragraph spacing 2×, letter 0.12 em,
   word 0.16 em) clip nothing — no fixed heights on text containers. [1.4.4, 1.4.12]
5. No text inside images except logos. [1.4.5]
6. Tooltips and popovers open on focus as well as hover, close on Esc, and stay while the pointer is over them. [1.4.13]

## 6. Forms

1. A visible `<label for>` on every control; a placeholder is never the label and never the only hint; related
   controls sit inside `<fieldset><legend>`. [1.3.1, 3.3.2, 4.1.2]
2. "(required)" in the label text plus the `required` attribute; `autocomplete` on name, email, tel, address and
   similar fields. [3.3.2, 1.3.5]
3. Validate on blur or submit, not on every keystroke. The error sits next to the field, is linked with
   `aria-describedby`, sets `aria-invalid="true"`, and says what is wrong **and how to fix it** ("Enter the date as
   2026-09-23"). On submit, focus the first invalid field or an error summary that links to each. [3.3.1, 3.3.3]
4. Never ask for the same information twice in one process; sign-in has no puzzle or memory test and allows
   paste and password managers. [3.3.7, 3.3.8]
5. Submissions with legal, financial or data-loss effect are confirmable, reversible or checked first. [3.3.4]
6. Changing a value or receiving focus never submits, navigates or moves focus by itself. [3.2.2, 3.2.1]

## 7. Motion, timing and consistency

- Under `prefers-reduced-motion: reduce` the tokens zero the three durations; components add no durations of
  their own and replace parallax, auto-scroll and looping animation with a static state. [2.3.3]
- Anything that moves, blinks or auto-updates for more than 5 s has pause, stop or hide; nothing flashes more
  than 3 times per second. [2.2.2, 2.3.1]
- Time limits warn ≥ 20 s before expiry and allow ≥ 10 extensions, or can be switched off. [2.2.1]
- Navigation keeps the same items, order and names on every page; the same control has the same name and icon
  everywhere; help sits in the same place on every page. [3.2.3, 3.2.4, 3.2.6]

## 8. ARIA — only when HTML cannot

1. Prefer native; never change a native role; every ARIA widget is keyboard-operable; no `aria-hidden` on
   anything focusable; every interactive element has a name. [4.1.2]
2. Follow the WAI-ARIA Authoring Practices pattern exactly (tabs: roving tabindex plus arrows; menu; combobox;
   disclosure; dialog). If the full keyboard pattern is too much work, use a simpler native structure instead.
3. State attributes: `aria-pressed` on toggles, `aria-expanded` on disclosures, `aria-current="page"` on the
   current nav item, `aria-selected` on tabs. [4.1.2]
4. Live regions: `role="status"` for results, "saved" and counts; `role="alert"` only for errors that need
   attention now. The element exists before its text changes; one message per change; never the whole page. [4.1.3]
5. Icons: decorative → `aria-hidden="true"`; icon-only button → `aria-label`; `title` alone is never the name.
   [1.1.1, 4.1.2]

## 9. Images, media and tables

- `alt` says what the image does in this context, ≤ 125 characters; decorative → `alt=""`; charts get a text
  summary or a data table. [1.1.1]
- Video: captions, plus audio description where the picture carries meaning; audio-only: a transcript.
  [1.2.2, 1.2.5, 1.2.1]
- Data tables: `<caption>`, `<th scope="col">` and `scope="row"`, one header per column, never a table for
  layout; numbers right-aligned. [1.3.1]

## 10. Testing — keyboard walk per change, VoiceOver per screen, axe per build

**Keyboard walk (5 minutes)**
1. Tab from the address bar: the first stop is the skip link; Enter lands focus in `<main>`.
2. Tab through everything: order matches layout, every stop shows the ring, nothing is unreachable or trapped.
3. Enter and Space activate; Esc closes and returns focus; arrows move inside tabs, menus and radio groups.
4. Zoom to 200 %, then to 400 % (320 px): no horizontal scroll, nothing clipped, nothing overlapping.

**VoiceOver smoke script (macOS: ⌘F5 to start; VO = Ctrl+Option; rotor = VO+U)**
1. Rotor → Landmarks: header, navigation (named), main, footer — each once.
2. Rotor → Headings: one h1, levels in order, every heading names its section.
3. Rotor → Form Controls: each has a name equal to its visible label; required and invalid states are read.
4. VO+→ across one tile, card or row: name, status as text (not only color), version, and a link name that says
   where it goes.
5. Trigger a status or error: the live region reads it once, without moving focus.
6. Rotor → Links: no "click here", no two identical names with different targets.

**Automated:** `scripts/a11y-audit.sh <url-or-file>` runs axe with the WCAG 2.x A and AA tags and exits 1 on
violations (needs Chrome). Run it on the built portal and on every mockup. Automation finds roughly a third of
defects; the two scripts above find the rest.

## Audit (score each 0–10; 7 passes; fix anything below 7 before calling the work done)

1. **Structure** — lang, unique title, one h1, ordered headings, landmarks, skip link.
2. **Keyboard** — every action reachable and operable, no traps, DOM order equals visual order.
3. **Focus** — ring ≥ 2 px and ≥ 3:1 on every surface, never obscured, managed in dialogs and on removal.
4. **Targets** — ≥ 24 px (44 for primary); names contain the visible label; drag has an alternative.
5. **Contrast** — token pairs pass `check-contrast.mjs`; rendered text passes axe; both themes; all states.
6. **Color and zoom** — no color-only meaning; 320 px reflow; 200 % zoom; text spacing.
7. **Forms** — visible labels, required in text, errors that say how to fix, no placeholder-only, autocomplete.
8. **Motion and timing** — reduced motion honoured; motion over 5 s has a control; limits extendable.
9. **ARIA and live regions** — native first, correct patterns, states announced, one message per change.
10. **Media and tables** — alt, captions, caption and scope on tables.

Report the scores as a table; each failure names the criterion number and the fix.

## Anti-patterns (score 0 in the row they belong to)

Clickable `div`s · `outline: none` · placeholder as label · color-only status · `aria-label` that contradicts the
visible text · `aria-hidden` on focused content · positive `tabindex` · auto-playing carousels · focus lost to
`<body>` after a delete · an "accessibility overlay" widget presented as compliance.
