# apps/portal — Eisenhold, the eisensoftware front door

SvelteKit (Svelte 5, TypeScript, `adapter-static`, plain CSS) plus three.js. At build time it reads
`registry/registry.json` once and renders:

- **`/` — Eisenhold**, a walkable, Skyrim-like hold under the aurora: one rune gate per app in the registry, a square
  with a Word Wall of running versions, a hold guard, a dragon on the wind, and **My Get-a-way** — a small, grainy
  cabin with Colorado outside the window, a drawing board and a cork board of project stickies that evolve when done.
  **The Jarl's story** is hidden around it: the Heartcell (a mythical battery) over the square, the legend of the
  panel, six landmarks of the owner's life and 27 tidbits to find, a dozen of them keepsakes in the Get-a-way.
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

## The Jarl's story: landmarks and tidbits

The hold tells its owner's story in places to walk to and little things to read. Walk up to a sign, plaque or keepsake
and press E (or tap the prompt): a **tidbit** opens in a small dialog that stays until you close it. The first reading
chimes and counts; the journal's **Tidbits** tab lists every one by topic — found ones in full, the rest as a hint of
where to look — and remembers what you found in this browser (`localStorage` key `eisenhold.tidbits.v1`, a per-viewer
convenience like discovered places).

| Where | What stands there | Tidbits |
|---|---|---|
| The square | **The Heartcell**: a 4680-shaped mythical battery floating over the rune dais, charge rings filling, gilded orbits, arcs and a stream of light; before it, a lectern carved with **the legend of the panel** (Bush invented the solar panel at NREL — so the legend goes) and a relic panel on top | 2 |
| Beside the road in | **Memory Lane**: a painted signpost with an arrow at every landmark | 1 |
| Stillwater Pond (SW) | **Pond rink**: boards, two nets, pucks, string lights — and a lost puck in a drift past the far net | 2 |
| South road | **Eisenhold Supercharger** (Tesla): red-and-white stalls and a car charging in stall two | 2 |
| Beyond the rink (S) | **Green Mountain Crossing** (Vermont): a red covered bridge over a frozen brook (you walk its deck), a sugarbush with sap buckets, a sugarhouse, the Burr and Burton banner | 3 |
| South-east | **Cuenca** (Ecuador): three blue-tiled domes, short towers, the city's colours, a goal and the Deportivo Cuenca banner | 2 |
| West | **Davidson College**: a red-brick hall, a white portico and dome, Wildcats banners, a hoop | 2 |
| East | **NREL, Golden**: rows of solar panels under a turning wind turbine | 1 |
| My Get-a-way | Keepsakes: a Green Mountain painting, Burr and Burton and Davidson pennants, crossed hockey sticks, jersey 19, maple syrup, a sill solar panel with an NREL badge, a match ball, a Deportivo Cuenca scarf, a poster of Cuenca, a model car, the Colorado postcard | 12 |

- **Edit the words** in `src/lib/world/domain/tidbits.ts` (one place, content only); **move a landmark** in
  `src/lib/world/domain/landmarks.ts` — `tests/world/landmarks.test.ts` keeps every landmark, the Vermont brook and the
  Memory Lane post clear of the gates (for 1–10 apps), the cabin, the Word Wall, the campfire and the road in.
- The map lists every landmark with Travel; landmarks appear on the compass once you are within 45 m or have found
  them, and announce themselves when discovered. Colours live in `palette.ts` (`CELL`, `RINK`, `TESLA`, `VERMONT`,
  `CUENCA`, `DAVIDSON`, `NREL`, `JERSEY`).
- On the real domain the Get-a-way's keepsakes are behind its guild like the rest of the room; the journal says so.

## Layout (ports and adapters)

```
src/routes/+page.svelte, +page.server.ts        the world (build-time realm data from $lib/server/realm.ts)
src/routes/(classic)/+layout.svelte, apps/        the classic chrome and the /apps tiles page
src/routes/registry.json/+server.ts               prerendered /registry.json
src/lib/world/domain/        pure: realm layout and compass math, access rules, realm mode, the board and EXP, collisions, lore,
                             landmarks (where the Jarl's places stand) and tidbits (what they say)
src/lib/world/application/   ports (AuthPort, DoorPort, BoardStore, Navigator) and use cases (enter a gate, file/move a card)
src/lib/world/adapters/      Firebase config + Auth, the HTTP door, localStorage and Firestore board stores
src/lib/world/engine/        three.js: Engine (loop, post-processing), player, input, audio, particles, shaders,
                             palette.ts, textures/, overworld/ (terrain, sky, flora, gates, square, cabin, creatures,
                             landmarks/: a Kit that merges static pieces per material, the Heartcell, each landmark),
                             getaway/ (room, Colorado, cork and drafting boards, keepsakes)
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
- Motion: `prefers-reduced-motion` or Settings → Motion → Reduced freezes flames, snow, aurora and the evolution — and
  the Heartcell (held fully charged), its arcs, banners, steam and the turbine; the title's animation ends within five
  seconds (2.2.2).
- Tidbits open in a native dialog that stays until closed (no timer to race, 2.2.1); the journal's Tidbits tab and the
  map's Travel buttons reach every landmark without walking the whole valley.
- Checked with axe-core (WCAG 2.2 AA tags) on `/apps`, the title, the HUD, every dialog and the evolution, in light and
  dark themes: 0 violations. The tidbit dialog, the journal's Tidbits tab and the map with landmarks: 0 violations,
  light and dark, and no page overflow at 375 px.
