# apps/gateway — registry-driven API gateway

A Cloud Run service (Node 20 + [Hono](https://hono.dev) + TypeScript) that fronts every app API on
`eisensoftware.com`. It has no configuration of its own beyond a handful of environment variables:
routes, upstreams, health probes and CORS origins all come from the platform registry
(`registry/registry.json`, published by the portal at `https://eisensoftware.com/registry.json`).

## Routes

`<prefix>` is `/api` unless `GATEWAY_PATH` says otherwise (it must equal `platform.gateway.path`).

| Route | Behaviour |
|---|---|
| `GET <prefix>/registry` | The registry JSON (`{contractVersion, generatedAt, platform, apps}`), `Cache-Control: public, max-age=60`, `ETag`, `304` on `If-None-Match`. |
| `GET <prefix>/health` | `{"gateway":{"ok":true,"version":…},"apps":[{id,status,ok,httpStatus,latencyMs}]}`. Probes `api.baseUrl + api.healthPath` for every app with an `api` block, in parallel, 3 s each; apps without `api` report `ok: null`. Always `200`; a dead upstream is `ok: false`. |
| `ANY <prefix>/<id>/*` | Forwarded to `api.baseUrl` + the rest of the path + the query string. Method, body and end-to-end headers are preserved; hop-by-hop headers (`connection`, `keep-alive`, `transfer-encoding`, `te`, `trailer`, `upgrade`, `proxy-*`, `host`) are stripped both ways. Responses gain `X-Upstream-App: <id>`. |

Every response carries `X-Gateway-Version`. Error bodies are JSON with a stable `error` code:
`404 {"error":"unknown_app","app":"…","apps":[…ids with an api]}`, `502 {"error":"upstream_unavailable","reason":"network|timeout|invalid_url"}`,
`503 {"error":"registry_unavailable"}`.

**CORS.** Allowed origins = `PORTAL_ORIGIN` (or, when unset, `https://<platform.domain>` and its `www`) plus the origin
of every app's `web.url` and `web.altUrl`. Allowed origins get `Access-Control-Allow-Credentials: true` and the
gateway headers exposed; other origins get no `Access-Control-*` headers. Preflights are answered with `204` and
never forwarded.

**Registry loading.** `HttpRegistrySource` fetches `REGISTRY_URL`, validates it against contract 1 and caches it for
`REGISTRY_TTL_SECONDS`. If a refresh fails it keeps the last good copy; if there is none it serves the snapshot
bundled at build time (`npm run build:snapshot` → `src/adapters/outbound/registry/snapshot.json`, generated from
`../../registry/registry.json`, never committed). Either way it retries after at most 30 s.

## Layout (hexagonal)

```
src/domain/            registry model + validation (parseRegistry), route resolution, header rules, CORS allow-list, errors.
                       Pure: no I/O, no fetch, no process.env, no clock. Imports nothing outside domain/.
src/application/ports/ RegistrySource { load() }, UpstreamHttp { forward(req) }, Clock { now() } — one request in, one result out.
src/application/       use cases: getRegistry, resolveAndForward, aggregateHealth. Imports domain + ports only.
src/adapters/inbound/  Hono app (app.ts), CORS middleware, error → HTTP mapping, settings (env parsing) and
                       bootstrap.ts — the ONLY composition root and the only reader of process.env.
src/adapters/outbound/ registry/{Http,File,Fake}RegistrySource + bundledSnapshot · upstream/{Fetch,Fake}Upstream ·
                       clock/{System,Fake}Clock · log/{JsonLogger,Logger}. Fakes are real adapters, shipped with the code.
src/main.ts            serve(buildApp()) on PORT.
tests/                 mirrors src; fakes only, no network. tests/scripts covers the two build scripts.
scripts/               build-snapshot.ts (registry → snapshot) · check-layers.mjs (dependency-direction gate).
```

Dependencies point inward: adapters → application → domain. `npm run check:layers` fails the build on a violation
(and `tests/scripts/check-layers.test.ts` proves it catches one). Every file stays under 400 lines, every export has a
doc comment, `tsconfig` is strict and there is no `any`.

## Settings

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8080` | Listen port (Cloud Run sets it). |
| `REGISTRY_URL` | `https://eisensoftware.com/registry.json` | Published registry to fetch. |
| `REGISTRY_FILE` | unset | Read the registry from this file (or a directory containing `registry.json`) instead of the URL; re-read on every request. Local development only. |
| `REGISTRY_TTL_SECONDS` | `300` | Cache lifetime of a fetched registry. |
| `PORTAL_ORIGIN` | unset → `https://<platform.domain>` (+ `www`) | Comma-separated extra CORS origins that may use credentials. |
| `GATEWAY_VERSION` | `dev` (the image sets it from `IMAGE_VERSION`) | Reported in `X-Gateway-Version` and `/health`. |
| `LOG_LEVEL` | `info` | `debug` \| `info` \| `warn` \| `error`; JSON lines on stdout with a Cloud Logging `severity`. |
| `GATEWAY_PATH` | `/api` | Mount prefix; must match `platform.gateway.path` and the Hosting rewrite. |
| `UPSTREAM_TIMEOUT_MS` | `60000` | Time an upstream gets to start answering a proxied request (health probes use 3 s). |

No secrets: the gateway forwards the caller's `Authorization`/`Cookie` headers untouched and holds none of its own.

## Develop

```bash
npm ci                                              # once
npm test                                            # typecheck + layer gate + vitest (what `make gateway-test` runs)
npm run dev                                         # tsx watch on src/main.ts; REGISTRY_FILE=../../registry is handy
REGISTRY_FILE=../../registry PORT=8787 npm run dev  # serve the local registry instead of the published one
npm run build && npm start                          # snapshot + tsc → dist/, then node dist/main.js
```

Smoke: `curl -s localhost:8787/api/registry | head -c 300`, `curl -si localhost:8787/api/vale/grocery/health | head`,
`curl -s localhost:8787/api/health`, `curl -si localhost:8787/api/nope/x` (404).

## Container

Build from the **repository root** (the Dockerfile copies `registry/registry.json` for the bundled fallback):

```bash
docker build -f apps/gateway/Dockerfile \
  --build-arg IMAGE_REVISION="$(git rev-parse HEAD)" --build-arg IMAGE_VERSION="$(git describe --tags --always)" \
  -t gateway:local .
docker run --rm -p 8080:8080 gateway:local
```

Multi-stage `node:20-alpine`; the runtime stage runs `npm ci --omit=dev`, copies only `dist/`, runs as the unprivileged
`node` user and carries `org.opencontainers.image.{source,revision,version}` from the build args. `IMAGE_VERSION` also
becomes the default `GATEWAY_VERSION`. BuildKit honours `apps/gateway/Dockerfile.dockerignore`, so `node_modules`,
`dist` and the rest of the monorepo never enter the build context.

## Deploy (coordinator)

Cloud Run service `gateway` in `researcher-455022` / `us-central1`, image tagged `:sha-<12>` and `:v<semver>` per the
image-tagging standard, `--port 8080 --allow-unauthenticated --set-env-vars GATEWAY_VERSION=<version>` (plus
`REGISTRY_URL` if the registry moves). Then set `platform.gateway.enabled: true` in the registry, rerun
`make render-firebase` so Hosting rewrites `/api/**` to the service, and deploy Hosting.

## Behaviour notes

- Redirects from an upstream are passed through (`Location` untouched), not followed.
- `fetch` decodes gzip/br bodies, so `content-encoding` and `content-length` from the upstream are dropped and the
  client's `accept-encoding` is not forwarded; the platform edge compresses again.
- Request bodies are buffered (Cloud Run caps requests at 32 MB anyway); response bodies stream.
- An app id of `registry` or `health` is rejected by validation because it would shadow a gateway route.
- `hidden` apps are not shown on the portal but remain routable, as the registry README promises.
