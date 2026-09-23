# apps/gateway — registry-driven API gateway and the door

A Cloud Run service (Node 20 + [Hono](https://hono.dev) + TypeScript) that fronts every app API on
`eisensoftware.com`, checks platform sign-in (Firebase ID tokens), and is the **door** of every app with an
`access` block (Vale first): Hosting rewrites such an app's path to the gateway, which lets through only
signed-in people in the app's groups. It has no configuration of its own beyond a handful of environment
variables: routes, upstreams, health probes, CORS origins, sign-in and access policy all come from the platform
registry (`registry/registry.json`, published by the portal at `https://eisensoftware.com/registry.json`).

## Routes

`<prefix>` is `/api` unless `GATEWAY_PATH` says otherwise (it must equal `platform.gateway.path`). A *guarded*
app is one with an `access` block; the registry of each request decides which apps are guarded.

| Route | Behaviour |
|---|---|
| `GET <prefix>/registry` | The registry JSON (`{contractVersion, generatedAt, platform, apps}`), `Cache-Control: public, max-age=60`, `ETag`, `304` on `If-None-Match`. |
| `GET <prefix>/health` | `{"gateway":{"ok":true,"version":…},"apps":[{id,status,ok,httpStatus,latencyMs}]}`. Probes `api.baseUrl + api.healthPath` for every app with an `api` block, in parallel, 3 s each (guarded apps with the gateway's upstream credentials); apps without `api` report `ok: null`. Always `200`; a dead upstream is `ok: false`. |
| `GET <prefix>/auth/me` | `Authorization: Bearer <Firebase ID token>` → who the bearer is and the door's verdict for every guarded app (shape below). `Cache-Control: no-store`. No or refused token: `401 {"error":"sign_in_required"}`. |
| `ANY <prefix>/<id>/*` | Forwarded to `api.baseUrl` + the rest of the path + the query string. Method, body and end-to-end headers are preserved; hop-by-hop headers (`connection`, `keep-alive`, `transfer-encoding`, `te`, `trailer`, `upgrade`, `proxy-*`, `host`) are stripped both ways. Responses gain `X-Upstream-App: <id>`. **Guarded apps:** a Bearer token that passes the app's policy is required (401/403/503 JSON otherwise), except `GET`/`HEAD` of exactly `<prefix>/<id><api.healthPath>`; the gateway's credentials replace any `x-serverless-authorization` the caller sent; answers are `private` (see Caching) and `Vary: Authorization`. |
| `POST <app.path>/__door/session` | Sign in at a door: `Authorization: Bearer <Firebase ID token>` → `200 {"app","uid","groups","expiresAt"}` + `Set-Cookie: __session=<envelope>; Path=<app.path>; Max-Age=…; HttpOnly; SameSite=Lax; Secure`. |
| `DELETE <app.path>/__door/session` | Sign out at a door → `204` + `Set-Cookie: __session=; Path=<app.path>; Max-Age=0; …`. No token needed. Other methods on this path: `405`, never forwarded. |
| `ANY <app.path>{,/**}` | The door: a live session in the app's groups is forwarded to `web.url` + path + query (the full path, as Hosting would). Anything else is refused (below). Paths that are no guarded app's path answer `404 {"error":"not_found"}`. |

Every response carries `X-Gateway-Version`. Error bodies are JSON with a stable `error` code:
`404 {"error":"unknown_app","app":"…","apps":[…ids with an api]}`, `502 {"error":"upstream_unavailable","reason":"network|timeout|invalid_url"}`,
`503 {"error":"registry_unavailable"}`, and the refusals `401 sign_in_required`, `403 group_required`, `401 session_expired`,
`503 door_unconfigured` as `{"error","app"?,"groups"?}` (`groups` = the groups that pass, for the two policy refusals),
`500 {"error":"session_too_large","app"}`.

## The door

Firebase Hosting forwards only the `__session` cookie to Cloud Run, so one sealed **envelope** in `__session` carries
both the platform session and the app's own `__session` value.

- **Envelope.** `d1.<iv>.<ciphertext>` (base64url, 12-byte IV, ciphertext + 16-byte tag), AES-256-GCM with the key
  HKDF-SHA256(`SESSION_SECRET`, salt `eisensoftware/door`, info `session v1`), additional data `door:<app id>` (an
  envelope opens only for its own app). Plaintext `{p: {uid, email?, name?, groups, iat, exp} | null, a: <app cookie> | null,
  ax: <app cookie expiry> | null}` (Unix seconds). Sealed with `SESSION_SECRET`, opened with it or `SESSION_SECRET_PREVIOUS`.
  Cookie `Max-Age` = max(`p.exp`, `ax`) − now, at least 60 s. A sealed value over 3800 bytes is `session_too_large`.
- **Sign-in (POST).** The token is verified (RS256 against Google's securetoken JWKS, `iss
  https://securetoken.google.com/<projectId>`, `aud <projectId>`, `exp`/`iat`/`sub`/`auth_time` checked, anonymous
  sign-ins refused), the app's policy is applied to the `groups` custom claim, and a session of `sessionHours` is
  sealed (never extended by later requests). The app cookie already in the browser is kept only when the previous
  envelope belonged to the same `uid`; with no envelope, an unsealed pre-door `__session` is adopted (migration).
  A presented token that is refused (401) or not in the groups (403) also removes the door cookie.
- **Passing.** Every `__session` value is tried: the first that opens as this app's envelope wins, unsealed values are
  legacy app cookies (used by sign-in only), anything else is ignored. The session must be live (`now < min(exp,
  iat + sessionHours)` with the **current** registry value) and its groups must pass the **current** policy — on every
  request. The app receives the Cookie header with every `__session` removed and `__session=<app cookie>` added (never
  the envelope). A `__session` the app sets is re-sealed with the unchanged platform part into one door `Set-Cookie`
  (Max-Age ≤ 0, a past Expires or an empty value deletes it); other `Set-Cookie`s, redirects and bodies pass through.
- **Refusals.** A page load (`GET`/`HEAD` whose `Accept` includes `text/html`) is sent back to the portal:
  `303 Location: /?gate=<id>&reason=<sign_in_required|group_required|session_expired|door_unconfigured>`. Every other
  refusal is JSON as above.
- **Caching.** Every door answer has `Vary: Cookie`. Refusals, sign-in and sign-out are `Cache-Control: private, no-store`.
  Forwarded answers keep the upstream's `max-age`, `immutable`, `no-cache`, `no-store` and `must-revalidate` behind
  `private` and lose `public`, `s-maxage` and everything else; with none of those, `private, no-store`.

`GET <prefix>/auth/me` answers, for the portal:

```json
{"user":{"uid":"…","email":"…"|null,"emailVerified":true,"name":"…"|null,"picture":"…"|null,"provider":"google.com"|null},
 "groups":["vale"],
 "access":[{"app":"vale","allowed":true,"groups":["owner","vale"]},
           {"app":"x","allowed":false,"reason":"group_required|door_unconfigured","groups":["owner"]}]}
```

One entry per guarded app (hidden ones too). The verdicts are exactly the door's: with `ACCESS_MODE=open` every gate
is open, without `SESSION_SECRET` every gate is `door_unconfigured`. No token is always `401` (checked before the
registry, so a deploy's smoke test gets it even before the registry with sign-in is published); a token while the
registry has no enabled sign-in is `503 {"error":"door_unconfigured"}`.

**CORS.** Allowed origins = `PORTAL_ORIGIN` (or, when unset, `https://<platform.domain>` and its `www`) plus the origin
of every app's `web.url` and `web.altUrl`. Allowed origins get `Access-Control-Allow-Credentials: true` and the
gateway headers exposed; other origins get no `Access-Control-*` headers. Preflights are answered with `204` and
never forwarded. The door's paths are not under `<prefix>` and get no CORS headers at all: sign-in and sign-out are
same-origin requests from the portal (`fetch("/vale/__door/session", {method: "POST", headers: {authorization}})`).

**Registry loading.** `HttpRegistrySource` fetches `REGISTRY_URL`, validates it against contract 1 and caches it for
`REGISTRY_TTL_SECONDS`. If a refresh fails it keeps the last good copy; if there is none it serves the snapshot
bundled at build time (`npm run build:snapshot` → `src/adapters/outbound/registry/snapshot.json`, generated from
`../../registry/registry.json`, never committed). Either way it retries after at most 30 s.

## Layout (hexagonal)

```
src/domain/            registry model + validation (parseRegistry), route resolution, header rules, CORS allow-list, errors,
                       access policy (access.ts), envelope/session model (session.ts), cookies, private caching.
                       Pure: no I/O, no fetch, no process.env, no clock. Imports nothing outside domain/.
src/application/ports/ RegistrySource { load() }, UpstreamHttp { forward(req) }, Clock { now() },
                       IdentityVerifier { verify({token, projectId}) }, SessionSealer { seal({appId, envelope}), open({appId, value}) },
                       UpstreamCredentials { headersFor({url}) } — one request in, one result out.
src/application/       use cases: getRegistry, resolveAndForward (+ the API policy), aggregateHealth, whoAmI, and the door:
                       openDoor, closeDoor, passDoor (shared parts in door.ts). Imports domain + ports only.
src/adapters/inbound/  Hono app (app.ts), the door's routes (door.ts), CORS middleware, error → HTTP mapping, settings
                       (env parsing) and bootstrap.ts — the ONLY composition root and the only reader of process.env.
src/adapters/outbound/ registry/{Http,File,Fake}RegistrySource + bundledSnapshot · upstream/{Fetch,Fake}Upstream ·
                       identity/{FirebaseIdToken,EmulatorIdToken,FakeIdentity}Verifier · session/AesGcmSessionSealer ·
                       credentials/{MetadataServer,No,FakeUpstream}Credentials · clock/{System,Fake}Clock ·
                       log/{JsonLogger,Logger}. Fakes are real adapters, shipped with the code.
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
| `SESSION_SECRET` | unset | **Secret.** Seals the door's envelope: base64 or base64url of at least 32 random bytes (`openssl rand -base64 32`). Unset: every guarded app (door and API) answers `503 door_unconfigured`. From Secret Manager, never a plain env var in the repo. |
| `SESSION_SECRET_PREVIOUS` | unset | **Secret.** The secret being rotated out: envelopes it sealed still open (and are re-sealed with the current one when the app sets its cookie). Refused without `SESSION_SECRET`. |
| `ACCESS_MODE` | `enforce` | `enforce` \| `open`. `open` removes the door and the API policy (local development: every space open). Refused on Cloud Run. |
| `FIREBASE_AUTH_EMULATOR_HOST` | unset | `host:port` of the Firebase Auth emulator: accept its **unsigned** ID tokens instead of Google-signed ones. Local rehearsals only; refused on Cloud Run. |
| `UPSTREAM_AUTH` | `metadata` on Cloud Run, else `none` | `metadata`: guarded apps' upstreams get `x-serverless-authorization: Bearer <ID token>` from the metadata server (audience = the upstream's origin, cached until 5 min before expiry), so the service can drop `allUsers`. `none`: nothing. |
| `K_SERVICE` | set by Cloud Run | Read only to refuse `ACCESS_MODE=open` and the emulator on Cloud Run and to default `UPSTREAM_AUTH`. |

`SESSION_SECRET` and `SESSION_SECRET_PREVIOUS` are the gateway's only secrets. Settings hold them as `SecretBytes`,
which print as `[redacted]`; no error message or log line quotes them. A malformed or short secret stops the gateway
at startup (`SettingsError`), as do the Cloud Run refusals above, so a bad revision never takes traffic.

## Develop

```bash
npm ci                                              # once
npm test                                            # typecheck + layer gate + vitest (what `make gateway-test` runs)
npm run dev                                         # tsx watch on src/main.ts; REGISTRY_FILE=../../registry is handy
REGISTRY_FILE=../../registry PORT=8787 npm run dev  # serve the local registry instead of the published one
npm run build && npm start                          # snapshot + tsc → dist/, then node dist/main.js
# every space open, no sign-in (the portal's `open` realm):
ACCESS_MODE=open REGISTRY_FILE=../../registry PORT=8787 npm run dev
# the door for real against the Auth emulator (firebase emulators:start --only auth):
SESSION_SECRET="$(openssl rand -base64 32)" FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
  REGISTRY_FILE=../../registry PORT=8787 npm run dev
```

Smoke: `curl -s localhost:8787/api/registry | head -c 300`, `curl -si localhost:8787/api/vale/health | head`,
`curl -s localhost:8787/api/health`, `curl -si localhost:8787/api/nope/x` (404), `curl -si localhost:8787/vale/ -H 'accept: text/html'`
(303 to `/?gate=vale&reason=sign_in_required`), `curl -si -X POST localhost:8787/vale/__door/session -H "authorization: Bearer $ID_TOKEN"`.
Over plain http to a loopback host the door's cookie drops `Secure` so a browser keeps it; everywhere else it is `Secure`.

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

The door (Jordan's go, `docs/runbooks/platform-auth.md`): store the secret in Secret Manager and mount it with
`--set-secrets SESSION_SECRET=<secret>:latest` (plus `SESSION_SECRET_PREVIOUS` during a rotation) — deploy with
`--update-*` flags so other variables survive. `UPSTREAM_AUTH` defaults to `metadata` on Cloud Run: grant the gateway's
service account `roles/run.invoker` on `vale` first (or set `UPSTREAM_AUTH=none` until then). Only after the gateway serves
`/vale` does Hosting's rewrite for `/vale{,/**}` move to the gateway (`auth.enabled` and `gateway.enabled`).

## Security notes

- **Fail closed.** A guarded app is closed (`door_unconfigured`, 503 or a 303 for page loads) while `SESSION_SECRET` is
  unset, `platform.auth` is missing, or `platform.auth.enabled` is false; the same holds for its API. With no registry
  at all nothing is forwarded (503); a registry that fails validation (including an `access` group not declared in
  `platform.auth.groups`, `access` without `platform.auth`, or `access` on a non-Cloud-Run app) is never used — the last
  good copy or the bundled snapshot is. Google's key set unreachable is a 502, never a pass. The gateway's upstream
  credentials unobtainable is a 502, never an unauthenticated forward. Unknown or unreadable cookies are "no session".
  A refused request's body is never read (no buffering work for strangers).
- **Re-checked on every request.** Groups against the current `access` block, the session against the current
  `sessionHours` (shortening it shortens live sessions). Removing a group from an app closes that door at once.
- **Revocation.** A person's groups are sealed into their envelope at sign-in, so removing a group from the *person*
  (the `groups` claim) takes effect at their next sign-in or after `sessionHours` at most. To end every session at once,
  rotate `SESSION_SECRET` without keeping the old one as `SESSION_SECRET_PREVIOUS`.
- **What stays public.** Apps without `access`; `GET <prefix>/registry`, `GET <prefix>/health` and `GET/HEAD
  <prefix>/<id><api.healthPath>` of a guarded app (the platform contract's health JSON: version and commit only);
  `DELETE …/__door/session` (it only removes access).
- **Sign-out and shared browsers.** `DELETE` removes the whole envelope, and a new sign-in keeps an app's cookie only
  for the same `uid`, so nobody inherits another person's app session (for Vale: a real grocery account and card). A
  refused sign-in attempt also ends the browser's door session. Anonymous Firebase sign-ins are refused.
- **Cookies.** `HttpOnly`, `SameSite=Lax` (a cross-site POST never carries the envelope, so it is refused), `Secure`
  except plain http to a loopback host, scoped to the app's path; the envelope is authenticated encryption bound to the
  app id. Door answers are `private` and vary on `Cookie`, so the Hosting CDN never serves one person's page to another.
- **Logs.** App, uid, decision and reason only — never a token, a cookie value, an envelope, a secret or a query string.
- **The run.app side door.** Hosting's rewrite makes the gateway the only way in through `eisensoftware.com`, but `vale`
  answers anyone on its own `run.app` URL until it drops `allUsers` (keeping `roles/run.invoker` for the gateway's
  service account, with `UPSTREAM_AUTH=metadata`). That IAM change is Jordan's go.
- **Local only.** `ACCESS_MODE=open` and `FIREBASE_AUTH_EMULATOR_HOST` switch the door off or accept forgeable tokens;
  both are refused when `K_SERVICE` is set.

## Behaviour notes

- Redirects from an upstream are passed through (`Location` untouched), not followed.
- `fetch` decodes gzip/br bodies, so `content-encoding` and `content-length` from the upstream are dropped and the
  client's `accept-encoding` is not forwarded; the platform edge compresses again.
- Request bodies are buffered (Cloud Run caps requests at 32 MB anyway); response bodies stream.
- An app id of `registry`, `health` or `auth` is rejected by validation because it would shadow a gateway route.
- `hidden` apps are not shown on the portal but remain routable (and guarded), as the registry README promises.
- The API proxy forwards the caller's `Authorization` and `Cookie` untouched — for a guarded app that is the platform ID
  token, which lets the app identify the person too.
