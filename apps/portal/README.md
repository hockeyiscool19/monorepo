# apps/portal — Eisenhold, the eisensoftware front door

SvelteKit (Svelte 5, TypeScript, `adapter-static`, plain CSS) plus three.js. At build time it reads
`registry/registry.json` once and renders:

- **`/` — Eisenhold**, a walkable, Skyrim-like hold under the aurora: one rune gate per app in the registry, a square
  with a Word Wall of running versions, a hold guard, a dragon on the wind, and **My Get-a-way** — a small, grainy
  cabin with Colorado outside the window, a drawing board and a cork board of project stickies that evolve when done.
- **`/apps`** — the classic tiles and deployments table: the plain, accessible list view of the same registry.
- **`/registry.json`** — the published registry (no `repo` blocks).

There is no server: `build/` is what Firebase Hosting serves at `eisensoftware.com/`. Vale's protection is **not** in
this app — it is the gateway's door (`apps/gateway`, `docs/runbooks/platform-auth.md`); the world only shows it.

## Commands

| What | Command |
|---|---|
| Install (this package owns its own lockfile) | `cd apps/portal && npm ci` |
| Develop, local realm (every gate and room open) | `make portal-dev` → http://localhost:5173 |
| Rehearse production locally (emulators + gateway door) | `make realm-rehearsal` → http://localhost:5174 |
| Build | `make portal-build` → `build/index.html`, `build/apps.html`, `build/registry.json`, `build/_app/**` |
| Unit tests (realm, access, board, collisions) | `make portal-test` (`npm test` here) |
| Type-check | `npm run check` (svelte-check, 0 errors and 0 warnings) |
| Preview the build | `npm run preview` (same proxies as dev) |
| Try another style | `PORTAL_STYLE=ui-style-editorial npm run build` |

Requires Node `^20.19 || ^22.12 || >=24` (Vite 8). CI installs Node 20.x.

## Realm modes: open locally, guarded everywhere else

`src/lib/world/domain/mode.ts` decides once per page load:

| Mode | When | Warded gates (Vale) and My Get-a-way | Board storage |
|---|---|---|---|
| `open` | `vite dev`, or the page is on `localhost` / `127.0.0.1` / `*.localhost` | open to everyone, no sign-in | this browser's `localStorage` |
| `guarded` | any other host (eisensoftware.com, eisensoftware.web.app), or `?realm=guarded` / `PUBLIC_REALM=guarded` | need sign-in and a guild (`platform.auth.groups`) | Firestore `boards/getaway/cards/*`, owner only |

`?realm=open` cannot open a real domain. In open mode, `vite dev` and `vite preview` proxy every app path to that app's
own Cloud Run URL (and `/api` to the published gateway), so walking into a gate on localhost opens the real app:

| Variable (shell or `apps/portal/.env.local`) | Effect |
|---|---|
| `REALM_DOOR_URL=http://127.0.0.1:8787` | warded apps and `/api` go through a local gateway (what the rehearsal sets) |
| `REALM_GATEWAY_URL=<url>` | where `/api` goes (default `https://<hosting site>.web.app`) |
| `REALM_UPSTREAM_ID_TOKEN=$(gcloud auth print-identity-token)` | for apps whose Cloud Run service is private (after the runbook's step h) |

## Sign-in and the group profile

- Firebase Authentication in the registry's `platform.auth.projectId` (Google, or email and password; registering is open,
  guilds are not). The web config comes from `PUBLIC_FIREBASE_API_KEY` + `PUBLIC_FIREBASE_APP_ID` at build time, else from
  Firebase Hosting's `/__/firebase/init.json` on the real domains; `PUBLIC_FIREBASE_AUTH_EMULATOR_HOST` and
  `PUBLIC_FIRESTORE_EMULATOR_HOST` point at the emulators. No config → sign-in unavailable, warded gates stay sealed.
- Guilds are the ID token's custom claim `groups`, granted only with `scripts/grant-groups.mjs`. The journal shows your
  profile (name, email, provider, registration date, guilds, what they open), every guild's profile, a refresh button
  that re-reads your claims, and sign-out (which also closes every door session).
- Walking into a warded gate posts a fresh ID token to `<app.path>/__door/session`; the gateway checks it and sets an
  HttpOnly door cookie scoped to the app's path; then the page navigates. A door that refuses you sends you back to
  `/?gate=<id>&reason=…`, which puts you in front of that gate with the reason and a sign-in button.

## My Get-a-way and the drawing board

- The drawing board files a Jira-lite card: summary, type (idea · feature · fix · chore), priority (lowest … highest),
  column (Ideas → To Do → In Progress → Done), labels and notes; keys run `GET-1`, `GET-2`, … It becomes a sticky note —
  on the 3D cork board (canvas-painted handwriting, pinned under its column) and in the cork board dialog, where notes
  move by buttons or drag and drop.
- Moving a card into Done plays the **evolution**: "What? GET-3 is evolving!", silhouettes trading places (never more
  than three times a second, no flashes), a gold burst, "…evolved into RELEASE!", a fanfare and EXP (level n needs n³,
  the handheld games' medium-fast curve). Reduced motion skips straight to the result.
- The quest log (journal → Quests) reads the same board as quests, with your level.

## Layout (ports and adapters)

```
src/routes/+page.svelte, +page.server.ts        the world (build-time realm data from $lib/server/realm.ts)
src/routes/(classic)/+layout.svelte, apps/        the classic chrome and the /apps tiles page
src/routes/registry.json/+server.ts               prerendered /registry.json
src/lib/world/domain/        pure: realm layout and compass math, access rules, realm mode, the board and EXP, collisions, lore
src/lib/world/application/   ports (AuthPort, DoorPort, BoardStore, Navigator) and use cases (enter a gate, file/move a card)
src/lib/world/adapters/      Firebase config + Auth, the HTTP door, localStorage and Firestore board stores
src/lib/world/engine/        three.js: Engine (loop, post-processing), player, input, audio, particles, shaders,
                             palette.ts, textures/, overworld/ (terrain, sky, flora, gates, square, cabin, creatures),
                             getaway/ (room, Colorado, cork and drafting boards)
src/lib/world/ui/            World.svelte, controller.ts (the composition root), state.svelte.ts, HUD and every dialog
tests/world/                 vitest for domain/ (and a Firestore test that runs only when the emulators are up)
```

The engine never decides access: the controller tells it how each gate looks (open, sealed, dormant, unstable), and a
sealed gate's ward is a collider as well as a picture. Every ward starts closed.

## Style and colour rules

- The portal adopts **`ui-style-nordic`** (parchment journal in light mode, night HUD in dark mode). The one-line
  switch is still `STYLE` in `vite.config.ts`; `PORTAL_STYLE=design-tokens` returns to the neutral set.
- UI components read design tokens only. `grep -rnE "#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(" src --include=*.svelte
  --include=*.css` stays empty.
- Scene colours (materials, lights, fog, canvas textures) live in `src/lib/world/engine/palette.ts` only — the WebGL
  counterpart of `tokens.css`. Engine code derives shades from palette values; white and black appear only as masks.

## Accessibility

- The world surface is a focusable `role="application"` region that takes W A S D, arrows, Shift, Space, E, M, J and
  Escape only while focused (WCAG 2.1.4). A skip link jumps to a server-rendered directory of every gate (also the no-JS
  fallback), and the Map lists every gate and landmark with Travel and Enter buttons — the whole realm without walking.
- Every menu is a native modal `<dialog>` (focus trapped, Escape closes, focus returns to the world); tabs follow the
  ARIA pattern; forms have visible labels, autocomplete and field errors that say how to fix them; the cork board moves
  notes by buttons, not only by dragging (2.5.7).
- Motion: `prefers-reduced-motion` or Settings → Motion → Reduced freezes flames, snow, aurora and the evolution; the
  title's animation ends within five seconds (2.2.2).
- Checked with axe-core (WCAG 2.2 AA tags) on `/apps`, the title, the HUD, every dialog and the evolution, in light and
  dark themes: 0 violations.
