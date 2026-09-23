# apps/portal — the eisensoftware tiles

SvelteKit (Svelte 5, TypeScript, `adapter-static`, plain CSS, no Tailwind). At build time it reads
`registry/registry.json` once and renders one tile per app, a deployments table, and the published
`/registry.json`. There is no server: `build/` is what Firebase Hosting serves at `eisensoftware.com/`.

## Commands

| What | Command |
|---|---|
| Install (this package owns its own lockfile) | `cd apps/portal && npm ci` |
| Develop | `make portal-dev` (or `npm run dev` here) → http://localhost:5173 |
| Build | `make portal-build` → `build/index.html`, `build/registry.json`, `build/_app/**` |
| Type-check | `npm run check` (svelte-check) |
| Preview the build | `npm run preview` |
| Try a style without editing | `PORTAL_STYLE=ui-style-editorial npm run build` |

Requires Node `^20.19 || ^22.12 || >=24` (Vite 8). CI installs Node 20.x, which satisfies this.

## How the page is rendered

- `src/lib/server/registry.ts` imports `registry/registry.json` (the only source of app URLs, paths,
  versions and statuses) and turns it into view models: `visibleApps()` drops `hidden`, sorts live → beta →
  planned, then by name; `tileHref()` links to `path` once `routing.ready`, otherwise to `web.url`; planned
  apps get no link and no version. It lives under `$lib/server`, so the raw registry is never shipped to the client.
- `src/routes/+page.server.ts` runs once at build time (the root layout sets `prerender = true`) and bakes the
  result into `index.html`. `src/routes/registry.json/+server.ts` is prerendered too: the registry object plus
  `generatedAt`. Validate it with `node scripts/validate-registry.mjs apps/portal/build/registry.json`.
- The markup follows `plugins/eisen-design/mockups/reference.html` class for class (skip-link, `site-header`,
  `hero`, `section-head` + `filter`, `ul.tiles > li.tile[data-status] > .tile-link`, `badge[data-kind]`,
  `table`, `actions`/`btn-*`, `alert`, `site-footer`). Two additions: `div.table-wrap` (a labelled scroll region
  around the table for phone widths) and a visually-hidden `role="status"` line that announces filter results.
  One omission: the reference puts `aria-disabled` on the planned `<li>`, which ARIA 1.2 does not allow on a list
  item; the portal relies on `data-status="planned"` and a non-link `.tile-link` instead. One behavioural
  difference: the theme toggle keeps the label "Dark mode" and reports state through `aria-pressed` (the reference
  script flips the label), so assistive tech hears one stable control.
- Client-side behaviour is progressive enhancement: the filter input narrows tiles by name/description, the
  theme toggle sets `data-theme` on `<html>` and persists it in `localStorage` (try/catch, with a pre-paint
  script in `app.html`), and the hero probes `<gateway.path>/health` with a 3 s timeout — "Gateway healthy · N
  apps live" on 200, "Status unavailable" otherwise. Without JS you get the full list and the registry's live count.
- Nav: "Registry" → `/registry.json`; "Status" → `/api/health` when `platform.gateway.enabled`, else the
  deployments table, so the nav never holds a dead link.

## Switch style

Styling is two files loaded by `src/routes/+layout.svelte`: `$style/tokens.css` (the design-token contract) and
`$style/components.css` (component rules that read only those tokens). Both are aliases resolved in
`vite.config.ts` by **one line**:

```ts
const STYLE = process.env.PORTAL_STYLE || 'design-tokens';
```

- `design-tokens` (default): the neutral `plugins/eisen-design/skills/design-tokens/tokens.css` plus this
  app's own `src/styles/components.css` (an entry that `@import`s `base.css`, `apps.css` and `deployments.css`,
  split by component family to respect the 400-line cap; Vite inlines the imports into one stylesheet).
- Any `ui-style-<name>`: that skill's `tokens.css` **and** `components.css`, e.g. set the default to
  `'ui-style-editorial'`, or for a one-off build run `PORTAL_STYLE=ui-style-editorial npm run build`.

The markup never changes, so a restyle is a config change plus a build. Components must keep reading tokens
only; `grep -rnE "#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(" src` should stay empty.

## Layout

```
src/app.html                          shell + pre-paint theme script
src/routes/+layout.server.ts          prerender = true; nav/footer data from the registry's platform block
src/routes/+layout.svelte             style imports, skip-link, header, main, footer
src/routes/+page.server.ts            build-time view model (tiles, deployments, gateway URLs)
src/routes/+page.svelte               hero + AppsSection + Deployments
src/routes/registry.json/+server.ts   prerendered /registry.json
src/lib/server/registry.ts            registry types, sorting and view models
src/lib/site.ts                       portal constants (title, owner, source and docs URLs)
src/lib/components/*.svelte           ThemeToggle, GatewayStatus, Tile, AppsSection, Deployments
src/styles/components.css             neutral style entry: @imports base.css, apps.css, deployments.css (tokens only)
```
