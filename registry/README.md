# Registry

`registry/registry.json` is the single source of truth for the platform. One file, one object:

```json
{
  "contractVersion": 1,
  "platform": { "domain": "…", "hosting": { "project": "…", "site": "…" }, "gateway": { "enabled": false, "path": "/api", "service": "gateway", "region": "…" } },
  "apps": [ { "id": "vale", "name": "Vale", "path": "/vale", "status": "live", "routing": {…}, "web": {…}, "api": {…}, "repo": {…}, "deployment": {…} }, … ]
}
```

Three things are rendered from it and must never be edited by hand:

| Rendered artifact | Renderer | Consumer |
|---|---|---|
| Portal tiles and the published `/registry.json` (this object plus `generatedAt`, minus each app's `repo` block) | `apps/portal` build | visitors, the gateway |
| `rewrites` in `firebase.json` (gateway rewrite when `platform.gateway.enabled`, then one per Cloud Run app) | `scripts/render-firebase.mjs` | Firebase Hosting |
| Gateway routes (`/api/<id>/*`) and health fan-out | `apps/gateway` at startup (reads the published `registry.json`) | API clients |

The schema is `registry/schema/registry.schema.json` (`$defs.app` describes one entry).
`node scripts/validate-registry.mjs [path]` enforces it with no dependencies, including unique `id` and `path`.
`--published <path>` checks a published copy instead: `generatedAt` required and no `repo` block anywhere, because
`repo` names private repositories and local checkout paths. `make portal-build` runs it on every build.

## Add an app

1. Append an object to `apps`. Copy an existing entry; `id` is a unique slug.
2. Fill `name`, `description` (one sentence), `icon`, `path` (unique, e.g. `/vale`), `web` (Cloud Run service + URL) and `repo`.
3. Leave `routing.ready` at `false` until the app serves correctly under its path through the Hosting rewrite. Tiles link
   to `web.url` in the meantime, so a new tile is never a dead link.
4. Add `api` only if the app exposes an HTTP API the gateway should front. `healthPath` must return 200 when healthy.
5. Run `make check` and `make render-firebase`, then commit `registry.json` and the regenerated `firebase.json` together.

## Who updates `deployment`

CI. When an app repo deploys to `main`, its workflow sends `repository_dispatch` (`app-deployed`) to this repo with
`{id, version, sha, imageTag, url}`; `.github/workflows/register-deployment.yml` patches that entry's `deployment`
block, commits, and redeploys the portal so the tile shows the new version. Edit it by hand only for a manual deploy,
and set `deployedBy` to `manual` when you do.

## Status values

- `live` — rendered as a normal tile.
- `beta` — rendered with a Beta badge.
- `planned` — rendered dimmed, not clickable.
- `hidden` — not rendered; still routed and still known to the gateway.
