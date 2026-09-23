# Registry

`registry/registry.json` is the single source of truth for the platform. One file, one object:

```json
{
  "contractVersion": 1,
  "platform": {
    "domain": "…", "hosting": { "project": "…", "site": "…" },
    "gateway": { "enabled": true, "path": "/api", "service": "gateway", "region": "…" },
    "auth": { "enabled": true, "provider": "firebase", "projectId": "…", "sessionHours": 12, "groups": [ { "id": "owner", "name": "…", "emblem": "👑", "description": "…" }, … ] }
  },
  "apps": [ { "id": "vale", "name": "Vale", "path": "/vale", "status": "live", "routing": {…}, "web": {…}, "api": {…}, "access": { "groups": ["owner", "vale"] }, "repo": {…}, "deployment": {…} }, … ]
}
```

Three things are rendered from it and must never be edited by hand:

| Rendered artifact | Renderer | Consumer |
|---|---|---|
| Portal tiles and the published `/registry.json` (this object plus `generatedAt`, minus each app's `repo` block) | `apps/portal` build | visitors, the gateway |
| `rewrites` in `firebase.json` (gateway rewrite when `platform.gateway.enabled`, then one per Cloud Run app — to the gateway service, the door, for an app with `access` while `platform.auth.enabled` and `platform.gateway.enabled`) | `scripts/render-firebase.mjs` | Firebase Hosting |
| Gateway routes (`/api/<id>/*`), health fan-out and the door (`/<id>/**` of apps with `access`) | `apps/gateway` at startup (reads the published `registry.json`) | API clients, browsers |

The schema is `registry/schema/registry.schema.json` (`$defs.app` describes one entry, `$defs.group` one group profile).
`node scripts/validate-registry.mjs [path]` enforces it with no dependencies, including unique `id` and `path`, unique
group ids, every `access` group declared in `platform.auth.groups`, and the reserved ids below.
`--published <path>` checks a published copy instead: `generatedAt` required and no `repo` block anywhere, because
`repo` names private repositories and local checkout paths. `make portal-build` runs it on every build.
`platform.auth` and `access` stay in the published copy: group names and which app needs which group are public;
who belongs to a group is not in the registry at all.

**Reserved app ids:** `registry`, `health` and `auth`. They would shadow the gateway's own routes
(`/api/registry`, `/api/health`, `/api/auth/me`), so the validator (and the gateway) reject them.

## Add an app

1. Append an object to `apps`. Copy an existing entry; `id` is a unique slug.
2. Fill `name`, `description` (one sentence), `icon`, `path` (unique, e.g. `/vale`), `web` (Cloud Run service + URL) and `repo`.
3. Leave `routing.ready` at `false` until the app serves correctly under its path through the Hosting rewrite. Tiles link
   to `web.url` in the meantime, so a new tile is never a dead link.
4. Add `api` only if the app exposes an HTTP API the gateway should front. `healthPath` must return 200 when healthy.
5. Add `access` only if the app must be reserved to signed-in people ("Sign-in and access" below).
6. Run `make check` and `make render-firebase`, then commit `registry.json` and the regenerated `firebase.json` together.

## Sign-in and access (`platform.auth`, `apps[].access`)

`platform.auth` turns on platform sign-in and declares the **group profiles**; an app's `access` block says **which
groups may enter it**. Runbook for the cloud side and the go-steps: `docs/runbooks/platform-auth.md`.

| Field | Meaning |
|---|---|
| `platform.auth.enabled` | `true`: Hosting sends every app with `access` through the gateway door (needs `platform.gateway.enabled` too). `false`: those apps are routed to their own service, **unguarded**; `validate-registry` and `render-firebase` print a warning for each. |
| `platform.auth.provider` | `"firebase"` (the only one). |
| `platform.auth.projectId` | Firebase project that issues ID tokens (`aud`); `iss` is `https://securetoken.google.com/<projectId>`. |
| `platform.auth.sessionHours` | 1–168. How long a door session (the sealed `__session` cookie) lasts, and so how long a removed group can keep working in a browser that entered before the removal. |
| `platform.auth.note` | Optional, at most 200 characters. |
| `platform.auth.groups[]` | 1–16 profiles `{id, name, emblem, description}`: `id` is the slug stored in the claim (unique), `name` ≤ 40, `emblem` ≤ 8 (an emoji), `description` ≤ 160 characters. |
| `apps[].access.groups` | Group ids declared above; a person in any one of them passes. `[]` = any signed-in person. |
| `apps[].access.note` | Optional, at most 200 characters. |

An app with `access` needs `platform.auth` and `web.kind: "cloud-run"` (the door forwards to its Cloud Run URL).

**Who writes `groups`.** A person's groups are **not** in the registry: they are the Firebase custom claim `groups` (an
array of group ids) on that person's account, and only `scripts/grant-groups.mjs` writes it, run by Jordan:

```bash
node scripts/grant-groups.mjs --email someone@example.com --add vale        # or --set owner,vale · --remove vale · --show
node scripts/grant-groups.mjs --list                                         # every account and its groups
node scripts/grant-groups.mjs --emulator --email a@b.c --set owner           # the local Auth emulator instead of production
```

It accepts only group ids declared here, keeps every other custom claim, refuses to grant to an unverified email, and
reminds you that the person must sign in again (a new ID token) and that door sessions already open keep their groups for
up to `sessionHours`. Taking a group out of an app's `access` closes that app to the whole group with the next deploy
(the door re-checks every request against the current registry, and the gateway refreshes its copy within 5 minutes);
taking it from one person is bounded by that person's ID token (1 h) and door session (`sessionHours`).

## Who updates `deployment`

CI, by two paths (`docs/runbooks/cicd-sync.md`). Both patch only that block (`deployedBy: "ci"`), commit, and redeploy
the portal so the tile shows the new version.

- **Pull (always runs).** `.github/workflows/sync-deployments.yml` runs `scripts/sync-deployments.mjs` every 30 minutes
  and on demand. It reads each app's health JSON at `api.baseUrl + api.healthPath` (platform contract v1 in the
  site-plugin skill) and records the reported `version` and `commit` when they differ. Apps without an `api` block, or
  whose health does not serve the contract yet, are skipped. It needs no token and catches manual deploys too.
- **Push (optional, faster).** When an app repo deploys to `main`, its workflow sends `repository_dispatch`
  (`app-deployed`) to this repo with `{id, version, sha, imageTag, url}`, and `.github/workflows/register-deployment.yml`
  patches that entry right away. This needs the `MONOREPO_DISPATCH_TOKEN` secret in the app repo.

Edit the block by hand only for an app the pull path cannot read, and set `deployedBy` to `manual` when you do. For an
app on the contract, the next sync replaces a hand edit with what is actually running.

## Status values

- `live` — rendered as a normal tile.
- `beta` — rendered with a Beta badge.
- `planned` — rendered dimmed, not clickable.
- `hidden` — not rendered; still routed and still known to the gateway.
