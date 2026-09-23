# WCAG 2.2 AA checklist

One row per check in SKILL.md, with the success criterion it comes from. Level A criteria are part of AA. Criteria
marked 2.2 are new in WCAG 2.2 (not required by ADA Title II's 2.1 AA, required here). Copy the table into the
review, fill the last column with pass · fail · n/a, and attach the fix for every fail.

## 1. Structure and semantics

| # | Check | Criterion | Level | Verify by | Result |
|---|---|---|---|---|---|
| 1.1 | `<html lang>` set and correct | 3.1.1 Language of Page | A | view source; axe `html-has-lang` | |
| 1.2 | Unique, descriptive `<title>` ("Page · App") | 2.4.2 Page Titled | A | tab title; axe `document-title` | |
| 1.3 | One `<h1>`; levels never skip; headings describe their section | 2.4.6 Headings and Labels; 1.3.1 | AA / A | VoiceOver rotor → Headings; axe `heading-order` | |
| 1.4 | Landmarks: header, one main, footer, named navs | 1.3.1 Info and Relationships; 2.4.1 | A | rotor → Landmarks; axe `landmark-*`, `region` | |
| 1.5 | Skip link first in tab order, visible on focus, lands in main | 2.4.1 Bypass Blocks | A | keyboard walk step 1 | |
| 1.6 | Native elements: links navigate, buttons act, no clickable div | 4.1.2 Name, Role, Value; 2.1.1 | A | search for `onclick` on div/span; keyboard walk | |
| 1.7 | Lists, tables and quotes use their elements | 1.3.1 Info and Relationships | A | rotor → Tables / Lists | |
| 1.8 | DOM order equals visual order | 1.3.2 Meaningful Sequence; 2.4.3 | A | disable CSS; tab order | |
| 1.9 | Language changes inside the page marked with `lang` | 3.1.2 Language of Parts | AA | view source | |

## 2. Keyboard and focus order

| # | Check | Criterion | Level | Verify by | Result |
|---|---|---|---|---|---|
| 2.1 | Every action operable by keyboard alone | 2.1.1 Keyboard | A | keyboard walk, mouse unplugged | |
| 2.2 | No keyboard trap; Esc or Tab always leaves | 2.1.2 No Keyboard Trap | A | keyboard walk through every widget | |
| 2.3 | Focus order follows meaning; no positive `tabindex` | 2.4.3 Focus Order | A | grep `tabindex="[1-9]`; keyboard walk | |
| 2.4 | Dialogs trap and return focus; deleted element hands focus on | 2.4.3 Focus Order | A | open/close every dialog and menu | |
| 2.5 | Single-key shortcuts scoped, remappable or off | 2.1.4 Character Key Shortcuts | A | press letters outside inputs | |
| 2.6 | Focused element never hidden by sticky UI | 2.4.11 Focus Not Obscured (Minimum) | AA · 2.2 | tab to items under sticky header/footer | |
| 2.7 | Focus never triggers a context change | 3.2.1 On Focus | A | tab through forms and menus | |

## 3. Visible focus

| # | Check | Criterion | Level | Verify by | Result |
|---|---|---|---|---|---|
| 3.1 | Ring visible on every focusable element, every surface | 2.4.7 Focus Visible | AA | keyboard walk | |
| 3.2 | Ring ≥ 2 px and ≥ 3:1 against adjacent colors | 1.4.11 Non-text Contrast | AA | `check-contrast.mjs` (focus/bg); inspect on accent buttons | |
| 3.3 | No `outline: none` without replacement; works in forced colors | 2.4.7 Focus Visible | AA | grep `outline: none`; Windows High Contrast | |

## 4. Target size and pointer input

| # | Check | Criterion | Level | Verify by | Result |
|---|---|---|---|---|---|
| 4.1 | Targets ≥ 24×24 px or spaced; primary ≥ 44 px | 2.5.8 Target Size (Minimum) | AA · 2.2 | devtools box model; axe `target-size` | |
| 4.2 | Drag has a single-pointer alternative | 2.5.7 Dragging Movements | AA · 2.2 | try every drag with clicks only | |
| 4.3 | Multipoint / path gestures have simple alternatives | 2.5.1 Pointer Gestures | A | try with one finger or mouse | |
| 4.4 | Actions complete on pointer-up; can be cancelled | 2.5.2 Pointer Cancellation | A | press, drag off, release | |
| 4.5 | Accessible name contains the visible label | 2.5.3 Label in Name | A | axe `label-content-name-mismatch`; VoiceOver | |
| 4.6 | Motion-actuated features have a UI alternative and can be off | 2.5.4 Motion Actuation | A | inspect device-motion handlers | |

## 5. Contrast, color and zoom

| # | Check | Criterion | Level | Verify by | Result |
|---|---|---|---|---|---|
| 5.1 | Text 4.5:1; large text 3:1; both themes and states | 1.4.3 Contrast (Minimum) | AA | `check-contrast.mjs`; axe `color-contrast` | |
| 5.2 | UI boundaries, icons, focus rings, chart marks 3:1 | 1.4.11 Non-text Contrast | AA | `check-contrast.mjs` (border-strong, focus, semantic); inspect | |
| 5.3 | Color never the only signal | 1.4.1 Use of Color | A | grayscale filter; read badges and links | |
| 5.4 | No 2-D scroll at 320 px | 1.4.10 Reflow | AA | devtools at 320 px wide | |
| 5.5 | 200 % zoom loses no content or function | 1.4.4 Resize Text | AA | browser zoom 200 % | |
| 5.6 | Text-spacing overrides clip nothing | 1.4.12 Text Spacing | AA | text-spacing bookmarklet | |
| 5.7 | No images of text except logos | 1.4.5 Images of Text | AA | inspect images | |
| 5.8 | Hover/focus content dismissible, hoverable, persistent | 1.4.13 Content on Hover or Focus | AA | Esc closes; pointer into tooltip | |
| 5.9 | Orientation not locked | 1.3.4 Orientation | AA | rotate device | |

## 6. Forms

| # | Check | Criterion | Level | Verify by | Result |
|---|---|---|---|---|---|
| 6.1 | Visible `<label for>` on every control; no placeholder-only | 1.3.1; 3.3.2 Labels or Instructions; 4.1.2 | A | axe `label`; rotor → Form Controls | |
| 6.2 | Groups in `<fieldset><legend>` | 1.3.1 Info and Relationships | A | view source | |
| 6.3 | Required stated in text; `required` set | 3.3.2 Labels or Instructions | A | read labels | |
| 6.4 | `autocomplete` on personal-data fields | 1.3.5 Identify Input Purpose | AA | axe `autocomplete-valid`; view source | |
| 6.5 | Errors identify the field in text | 3.3.1 Error Identification | A | submit an empty form | |
| 6.6 | Errors say how to fix; linked with `aria-describedby`; `aria-invalid` | 3.3.3 Error Suggestion | AA | submit bad input; VoiceOver reads the message | |
| 6.7 | Legal / financial / data submissions reversible, checked or confirmed | 3.3.4 Error Prevention | AA | walk the flow | |
| 6.8 | No redundant entry within a process | 3.3.7 Redundant Entry | A · 2.2 | walk multi-step flows | |
| 6.9 | Sign-in has no cognitive test; paste and managers allowed | 3.3.8 Accessible Authentication (Minimum) | AA · 2.2 | try pasting into the password field | |
| 6.10 | Changing input never auto-submits or navigates | 3.2.2 On Input | A | change selects and checkboxes | |

## 7. Motion, timing and consistency

| # | Check | Criterion | Level | Verify by | Result |
|---|---|---|---|---|---|
| 7.1 | `prefers-reduced-motion` removes non-essential motion | 2.3.3 Animation from Interactions (AAA, applied) | — | OS setting on; tokens zero durations | |
| 7.2 | Motion / auto-update > 5 s has pause, stop or hide | 2.2.2 Pause, Stop, Hide | A | carousels, tickers, live counters | |
| 7.3 | Nothing flashes > 3 times per second | 2.3.1 Three Flashes or Below Threshold | A | inspect animations | |
| 7.4 | Time limits adjustable, extendable (≥ 20 s warning) or off | 2.2.1 Timing Adjustable | A | let a session expire | |
| 7.5 | Auto-playing audio > 3 s controllable | 1.4.2 Audio Control | A | load with sound on | |
| 7.6 | Navigation same order and names everywhere | 3.2.3 Consistent Navigation | AA | compare 3 pages | |
| 7.7 | Same control, same name and icon everywhere | 3.2.4 Consistent Identification | AA | compare 3 pages | |
| 7.8 | Help in the same place on every page | 3.2.6 Consistent Help | A · 2.2 | compare 3 pages | |
| 7.9 | More than one way to reach a page (nav + search or sitemap) | 2.4.5 Multiple Ways | AA | count routes to a deep page | |

## 8. ARIA and live regions

| # | Check | Criterion | Level | Verify by | Result |
|---|---|---|---|---|---|
| 8.1 | Every interactive element has name, role and state | 4.1.2 Name, Role, Value | A | axe `aria-*`, `button-name`, `link-name`; VoiceOver | |
| 8.2 | Custom widgets follow the APG keyboard pattern | 2.1.1 Keyboard; 4.1.2 | A | keyboard walk per widget | |
| 8.3 | No `aria-hidden` on focusable content | 4.1.2 Name, Role, Value | A | axe `aria-hidden-focus` | |
| 8.4 | Status messages announced without focus change | 4.1.3 Status Messages | AA | trigger; VoiceOver reads once | |
| 8.5 | Link text makes sense out of context | 2.4.4 Link Purpose (In Context) | A | rotor → Links | |
| 8.6 | Instructions never rely on shape, size, position or sound alone | 1.3.3 Sensory Characteristics | A | read instructions | |

## 9. Images, media and tables

| # | Check | Criterion | Level | Verify by | Result |
|---|---|---|---|---|---|
| 9.1 | Informative images have alt; decorative `alt=""`; charts summarised | 1.1.1 Non-text Content | A | axe `image-alt`; VoiceOver | |
| 9.2 | Prerecorded video captioned | 1.2.2 Captions (Prerecorded) | A | play with captions | |
| 9.3 | Audio-only has transcript; video-only has description or transcript | 1.2.1 Audio-only and Video-only | A | find the transcript | |
| 9.4 | Audio description where visuals carry meaning | 1.2.5 Audio Description (Prerecorded) | AA | play with AD | |
| 9.5 | Live video captioned | 1.2.4 Captions (Live) | AA | check the stream | |
| 9.6 | Tables: caption, `th` with scope, no layout tables | 1.3.1 Info and Relationships | A | axe `th-has-data-cells`, `scope-attr-valid` | |

## 10. Testing record

| Step | Done by | Date | Result |
|---|---|---|---|
| Keyboard walk (SKILL.md § 10) | | | |
| VoiceOver smoke script (SKILL.md § 10) | | | |
| `scripts/a11y-audit.sh <url>` exit code | | | |
| `check-contrast.mjs` on the active tokens.css | | | |
