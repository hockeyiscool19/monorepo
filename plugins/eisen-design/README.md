# eisen-design

The design foundation for every eisensoftware app, packaged as a Claude Code plugin (`.claude-plugin/plugin.json`).
Skills load into Claude; the scripts and CSS files are what the apps consume.

| Skill | Gives you | Files |
|---|---|---|
| `design-tokens` | the token contract, the neutral `tokens.css`, the contrast checker | `skills/design-tokens/{SKILL.md,tokens.css,scripts/check-contrast.mjs}` |
| `information-architecture` | a method plus blank forms for inventory, objects, sitemap, URLs, tree tests | `skills/information-architecture/{SKILL.md,templates/}` |
| `accessibility-ada` | WCAG 2.2 AA rules in build order, the criterion checklist, the axe audit script | `skills/accessibility-ada/{SKILL.md,checklist.md,scripts/a11y-audit.sh}` |
| `ui-style-<name>` × 5 | a complete style: `tokens.css` (light + dark), `components.css`, `mockup.html` | `skills/ui-style-{expressive,editorial,dense,brutalist,organic}/` |

`mockups/reference.html` is the reference screen (the portal home) that every style mockup copies verbatim.
The side-by-side gallery is [`docs/mockups/index.html`](../../docs/mockups/index.html).

## How the pieces fit

1. **The contract** (`design-tokens`) fixes one set of CSS custom-property names — colors, type, space, shape,
   elevation, motion, layout — with light and dark values. Components read only those names.
2. **A style** is one `tokens.css` that assigns values to every name (plus component rules). Swapping styles means
   replacing that file; markup never changes. `check-contrast.mjs` proves every style keeps the floor: 4.5:1 text,
   3:1 focus ring, borders and status colors, in both modes.
3. **Information architecture** decides which screens exist, what they are called and where they live
   (`eisensoftware.com/<app>/…`) before any style is applied. Structure first, then tokens, then a style.
4. **Accessibility** is the gate on the result: keyboard, focus, contrast, forms, motion. `a11y-audit.sh` runs axe
   on the built page; the skill's keyboard walk and VoiceOver script cover what axe cannot.

Order for a new screen: IA (sitemap, labels, URLs) → build on the neutral tokens → accessibility audit → choose a
style. Order for a style change: replace `tokens.css` → run both scripts → done.

## Apply a style to an existing app

Pick `plugins/eisen-design/skills/ui-style-<name>/tokens.css`, or the neutral
`plugins/eisen-design/skills/design-tokens/tokens.css` until a style is chosen. Copy it into the app (or vendor it in
CI) and load it before any other CSS:

**SvelteKit / plain CSS**
```svelte
<!-- src/routes/+layout.svelte -->
<script>
  import '$lib/styles/tokens.css';   // first
  import '$lib/styles/app.css';
</script>
```

**Next.js (App Router)**
```tsx
// app/layout.tsx
import './tokens.css';   // first
import './globals.css';
```

**Tailwind v4** — map the names you use as utilities, then `bg-bg text-text border-border rounded-md` follow the style:
```css
@import "tailwindcss";
@import "./tokens.css";
@theme inline {
  --color-bg: var(--color-bg);       --color-surface: var(--color-surface);   --color-text: var(--color-text);
  --color-accent: var(--color-accent); --color-border: var(--color-border);   --radius-md: var(--radius-md);
  --font-sans: var(--font-sans);
}
```

Then, in every framework:

1. Replace hardcoded values in components with tokens: grep for `#[0-9a-fA-F]{3,8}`, `px` radii and `ms` durations.
   A remaining literal is a defect (AGENTS.md).
2. Dark mode: set `data-theme="dark"` or `"light"` on `<html>` from your switch; leave it unset to follow the OS.
   The tokens file handles both (contract rule 2).
3. The app serves under its registry `path`, so set the framework base path (`basePath`, `paths.base`, `BASE_PATH`)
   and never emit a URL outside it — see `information-architecture` step 7.
4. Verify before merging:
   ```
   node plugins/eisen-design/skills/design-tokens/scripts/check-contrast.mjs <path to the tokens.css you shipped>
   plugins/eisen-design/skills/accessibility-ada/scripts/a11y-audit.sh http://localhost:<port>/   # needs Chrome
   ```
   Both must exit 0.

To change style later, replace the file and rerun the two commands. Nothing else changes.

## Verify the plugin itself

```
node plugins/eisen-design/skills/design-tokens/scripts/check-contrast.mjs \
  plugins/eisen-design/skills/design-tokens/tokens.css plugins/eisen-design/skills/ui-style-*/tokens.css
plugins/eisen-design/skills/accessibility-ada/scripts/a11y-audit.sh plugins/eisen-design/mockups/reference.html
```

## Gallery

Open `docs/mockups/index.html`. Tabs switch styles, the width buttons set the frame to 360 / 768 / 1280 px, and
**Dark** toggles the mockup's `data-theme`. Browsers isolate `file://` documents from each other, so for the Dark
button to reach into the mockups serve the repo over HTTP:

```
python3 -m http.server 8080        # from the repo root
open http://localhost:8080/docs/mockups/
```

A style whose mockup is not built yet shows "mockup not built yet" in place of the frame.

## Install

Phase 7 lists this plugin in the repo's `.claude-plugin/marketplace.json`; until then, symlink
`plugins/eisen-design/skills/*` into a host's `.claude/skills/` (what `scripts/install-host.sh` will automate).
