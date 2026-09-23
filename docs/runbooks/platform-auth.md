# Runbook — platform sign-in, groups and the gateway door

Vale reaches a real grocery account and a real card, so on `eisensoftware.com` it opens only for people Jordan has put
in a group. This runbook explains how sign-in, groups and the door fit together, then lists Jordan's cloud steps in
order. Nothing here is automated for agents: every step that touches `researcher-455022` is Jordan's go.

## How it works

```
 browser                      Firebase Hosting (site eisensoftware)          Cloud Run, researcher-455022
 ───────                      ─────────────────────────────────────          ────────────────────────────
 1. sign in (Google or email) ─────────────▶ Firebase Authentication ◀── scripts/grant-groups.mjs writes the
    ◀── ID token, 1 h, claim groups: ["owner","vale"]                       custom claim `groups` (Jordan only)
 2. POST /vale/__door/session  ─▶ rewrite /vale{,/**} ─▶ gateway (the door): verify the token (Google JWKS,
    Authorization: Bearer <ID token>                       iss/aud researcher-455022), check its groups against
    ◀── 200 Set-Cookie: __session=d1.<sealed>; Path=/vale; HttpOnly; Secure; SameSite=Lax   apps[vale].access
 3. GET /vale/…  Cookie: __session ─▶ rewrite ─▶ gateway: open the envelope, re-check its groups against the
                                                  current registry ─▶ vale (web.url + the full path, vale's own
    ◀── vale's page                               __session restored; X-Serverless-Authorization when UPSTREAM_AUTH=metadata)
    refused page load ◀── 303 /?gate=vale&reason=sign_in_required|group_required|session_expired|door_unconfigured
```

| Piece | Lives in | Changed by |
|---|---|---|
| Identity (Google, Email/Password) | Firebase Authentication in `researcher-455022` | Jordan, console (step a) |
| Group profiles (`owner`, `vale`) | `platform.auth.groups` in `registry/registry.json` | a registry edit |
| Who may enter an app | `apps[].access.groups` in the registry (`registry/README.md`) | a registry edit |
| A person's groups | the custom claim `groups` on their Firebase account | `scripts/grant-groups.mjs` only (step e) |
| The door | Cloud Run `gateway` (`apps/gateway`); Hosting rewrites `/vale{,/**}` to it (`scripts/render-firebase.mjs`) | CI deploy (step f) |
| The key that seals door sessions | Secret Manager `gateway-session-secret` → env `SESSION_SECRET` | step c; rotation in step i |
| The portal's Firebase config | Hosting's `/__/firebase/init.json`, or repo variables `FIREBASE_WEB_API_KEY` / `FIREBASE_WEB_APP_ID` | step b |
| The My Get-a-way board | Firestore `boards/getaway` and `boards/getaway/cards/*`, guarded by `firestore.rules` (group `owner` only) | step d |

It fails closed: a gateway without `SESSION_SECRET` answers every guarded path with `door_unconfigured` (and CI refuses
to deploy one while `platform.auth.enabled`), an unreadable registry keeps the door shut, and `ACCESS_MODE=open` or an
emulator token is refused on Cloud Run. Anyone may create an account; an account without groups opens nothing guarded.

## Jordan's go-steps, in order

```bash
PROJECT=researcher-455022 REGION=us-central1
GATEWAY_SA="gateway-runtime@${PROJECT}.iam.gserviceaccount.com"
CI_SA="github-actions@${PROJECT}.iam.gserviceaccount.com"
```

### a. Turn on Firebase Authentication

Firebase console → `researcher-455022` → Build → Authentication → Get started.

- Sign-in method: enable **Google** (support email: yours) and **Email/Password** (leave "Email link" off).
- Settings → Authorized domains: add `eisensoftware.com`, `www.eisensoftware.com` and `eisensoftware.web.app`
  (`localhost` and `researcher-455022.firebaseapp.com` are already there).
- Settings → User actions: keep email enumeration protection on.

Email/Password accounts start **unverified**; `grant-groups.mjs` refuses to grant them anything until the address is
verified (anyone can sign up with an address they do not own). Google accounts arrive verified.

### b. Give the portal its Firebase config

Project settings → General → Your apps → Add app → Web, nickname `eisensoftware-portal`, and link it to the Hosting site
`eisensoftware`. Hosting then serves the config at `/__/firebase/init.json`, which the portal reads at runtime:

```bash
curl -s https://eisensoftware.web.app/__/firebase/init.json | jq '{projectId, authDomain, appId}'   # projectId researcher-455022
```

Or bake it into the build: `firebase apps:sdkconfig WEB <appId> --project "$PROJECT"` prints the values, then
`gh variable set FIREBASE_WEB_API_KEY -R hockeyiscool19/monorepo --body <apiKey>` and the same for `FIREBASE_WEB_APP_ID`.
These are repository **variables**: a web API key only names the project; the door and the rules do the guarding.
Optional hardening: restrict the browser key to the three authorized domains (Cloud console → Credentials).

### c. The session secret and the gateway's own identity

```bash
# 1. A runtime identity for the gateway alone. The default compute account is shared by every service; step h grants
#    this identity the right to call vale, and nothing else should get that right by accident.
gcloud iam service-accounts create gateway-runtime --project "$PROJECT" --display-name "eisensoftware gateway (Cloud Run runtime)"

# 2. The key (base64 of 48 random bytes; the gateway needs at least 32): generated and stored without being printed.
openssl rand -base64 48 | tr -d '\n' | gcloud secrets create gateway-session-secret --project "$PROJECT" \
  --replication-policy=automatic --data-file=-

# 3. The gateway reads its value; CI only checks that it exists before deploying (metadata, never the value).
gcloud secrets add-iam-policy-binding gateway-session-secret --project "$PROJECT" \
  --member "serviceAccount:${GATEWAY_SA}" --role roles/secretmanager.secretAccessor
gcloud secrets add-iam-policy-binding gateway-session-secret --project "$PROJECT" \
  --member "serviceAccount:${CI_SA}" --role roles/secretmanager.viewer

# 4. Run the gateway as that identity. CI deploys keep a service's account, so this sticks.
gcloud run services update gateway --project "$PROJECT" --region "$REGION" --service-account "$GATEWAY_SA"
```

Check: `gcloud secrets versions list gateway-session-secret --project "$PROJECT"` shows one `enabled` version, and
`gcloud run services describe gateway --project "$PROJECT" --region "$REGION" --format='value(spec.template.spec.serviceAccountName)'`
prints `gateway-runtime@…`. The CI account can already act as the new identity (`roles/iam.serviceAccountUser`, `ci-auth.md`).
Without steps 1 and 4, bind `secretAccessor` to the account that command prints instead (empty = the default compute
account `382031913173-compute@developer.gserviceaccount.com`), and accept that in step h every service running as that
account can reach vale.

### d. Firestore and its rules

```bash
gcloud firestore databases list --project "$PROJECT"        # a (default) database already?
gcloud firestore databases create --project "$PROJECT" --location=us-central1 --type=firestore-native   # only if not; the location is permanent
firebase emulators:exec --only firestore --project "$PROJECT" 'node scripts/test-firestore-rules.mjs'   # prove the rules locally first
firebase deploy --only firestore:rules --project "$PROJECT"
```

The proof ends with `firestore.rules: 126 checks, 126 as expected` (it needs a JDK 21+, see Local). The rules let group
`owner` read and write `boards/getaway` and its cards (schema at the top of `firestore.rules`) and deny everything else.
CI does not deploy rules: repeat this step whenever `firestore.rules` changes.

### e. Your account and your groups

Create your account: sign in to the world with Google once step f is live (until the grant, the Vale gate is sealed for
you too, which is the safe failure), or now in the console (Authentication → Users → Add user). Then:

```bash
node scripts/grant-groups.mjs --email <you> --set owner,vale --dry-run   # groups: none → owner, vale
node scripts/grant-groups.mjs --email <you> --set owner,vale
node scripts/grant-groups.mjs --list                                      # every account and its groups
```

It uses your gcloud login (`gcloud auth print-access-token`; Owner includes Firebase Authentication Admin) and bills the
project. A console-made Email/Password account is unverified: pass `--allow-unverified` for an account you know is yours.
Sign out and in again so your ID token carries the groups.

### f. Merge, then deploy

Merging to `main` runs Deploy platform (`.github/workflows/deploy.yml`, `gh run watch -R hockeyiscool19/monorepo`):
`plan` (resolves `auth_enabled=true`) → gateway image → `gateway-deploy`, which first checks the secret from step c, deploys
with `--update-secrets SESSION_SECRET=gateway-session-secret:latest`, then requires `/api/health` and a 401 from
`/api/auth/me` → `hosting`, which publishes the registry and the rewrite `/vale{,/**}` → `gateway`.

The first rollout has a short gap: the gateway reads the published registry and keeps its copy for up to 5 minutes
(`REGISTRY_TTL_SECONDS`), so right after the Hosting release it may not know yet that vale is guarded. It then refuses
`/vale/…` (404) rather than forwarding it. If a 404 lingers after that, re-run the Hosting deploy: a release purges the CDN.

### g. Verify

```bash
SITE=https://eisensoftware.web.app          # https://eisensoftware.com once the domain is attached
curl -sI -H 'accept: text/html' "$SITE/vale/" | grep -iE '^(HTTP|location|cache-control|vary)'
#   HTTP/2 303 · location: /?gate=vale&reason=sign_in_required · cache-control: private… · vary: …cookie…
curl -s -o /dev/null -w '%{http_code}\n' "$SITE/vale/"             # 401 JSON: not a page load (no accept: text/html)
curl -s -o /dev/null -w '%{http_code}\n' "$SITE/api/auth/me"        # 401 without a token
curl -s -o /dev/null -w '%{http_code}\n' "$SITE/api/vale/health"    # 200: the one public route of a guarded app
curl -s -o /dev/null -w '%{http_code}\n' "$SITE/api/vale/anything"  # 401: every other gateway route needs a token
curl -s "$SITE/api/health" | jq '.apps[] | {id, ok}'                # vale ok
```

Then in the world: signed out, the Vale gate is sealed (sign in); signed in with an account without groups, it stays
sealed (group required); signed in as you, it opens and `/vale/` renders, and the browser holds a `__session` cookie for
path `/vale` (HttpOnly, Secure); signing out seals it again. My Get-a-way: a new card appears in the Firestore console.

### h. Close the run.app side door

Vale's direct URL `https://vale-382031913173.us-central1.run.app` still admits anyone (`allUsers` holds
`roles/run.invoker`) and skips the door. Close it after g passes, in this order:

1. **Kroger on the platform URL.** Register `https://eisensoftware.com/vale/api/grocery/oauth/callback` (plus the
   `eisensoftware.web.app` form while the domain is not attached) at the Kroger developer portal, and set vale's
   `KROGER_REDIRECT_URI` to it (vale's deploy sets it from `PUBLIC_APP_URL`, `integrations/vale/`). Link Kroger once
   through the door.
2. **Let the gateway identify itself to vale**, and check vale still works through the door while `allUsers` remains.
   `UPSTREAM_AUTH=metadata` (an ID token in `X-Serverless-Authorization`) is already the gateway's default on Cloud Run;
   setting it pins it:
   ```bash
   gcloud run services add-iam-policy-binding vale --project "$PROJECT" --region "$REGION" \
     --member "serviceAccount:${GATEWAY_SA}" --role roles/run.invoker
   gcloud run services update gateway --project "$PROJECT" --region "$REGION" --update-env-vars UPSTREAM_AUTH=metadata
   ```
3. **Drop `allUsers`:**
   ```bash
   gcloud run services remove-iam-policy-binding vale --project "$PROJECT" --region "$REGION" --member allUsers --role roles/run.invoker
   curl -s -o /dev/null -w '%{http_code}\n' https://vale-382031913173.us-central1.run.app/vale/   # 403
   ```
   Signed in, the world still opens Vale. Rollback: `add-iam-policy-binding … --member allUsers --role roles/run.invoker`.
4. **Keep it closed.** Vale's deploy workflow passes `--allow-unauthenticated`, which puts `allUsers` back on every vale
   deploy. In the vale repository (Jordan's PR), change it to `--no-allow-unauthenticated`, and point its smoke test at
   `https://eisensoftware.com/api/vale/health` (the door leaves it public) or send an identity token.
5. **What else read vale directly.** `scripts/sync-deployments.mjs` GETs `api.baseUrl + api.healthPath` on the run.app
   host without credentials, so from now on every half-hourly run reports `vale: skipped — health 403` and vale's tile
   version stops moving (the run stays green; other apps are unaffected). Follow-up in this repository: have the sync read
   guarded apps' health through the gateway's public route (`/api/vale/health`), or give `sync-deployments.yml` an identity
   token and `roles/run.invoker` on vale. The gateway's own `/api/health` fan-out keeps working through step 2.

### i. Rotation and revocation

**Rotate `SESSION_SECRET`** without signing anyone out: seal with a new key, keep opening the old one for one session
lifetime, then retire it.

```bash
OLD=$(gcloud secrets versions list gateway-session-secret --project "$PROJECT" --filter='state=ENABLED' \
  --sort-by='~createTime' --limit=1 --format='value(name.basename())')
openssl rand -base64 48 | tr -d '\n' | gcloud secrets versions add gateway-session-secret --project "$PROJECT" --data-file=-
gcloud run services update gateway --project "$PROJECT" --region "$REGION" \
  --update-secrets "SESSION_SECRET=gateway-session-secret:latest,SESSION_SECRET_PREVIOUS=gateway-session-secret:${OLD}"
# sessionHours (12 h) later:
gcloud run services update gateway --project "$PROJECT" --region "$REGION" --remove-secrets SESSION_SECRET_PREVIOUS
gcloud secrets versions disable "$OLD" --secret gateway-session-secret --project "$PROJECT"
```

`:latest` is read when an instance starts; the `services update` starts new ones. CI deploys update only
`SESSION_SECRET`, so a rotation in progress survives a deploy.

**Revoke.** Access is bounded, not instant: an ID token lives 1 hour and a door session up to `sessionHours` (12 h),
and a session keeps the groups it was sealed with.

| To | Do | Takes effect |
|---|---|---|
| stop one person | `node scripts/grant-groups.mjs --email <them> --remove vale` | their next ID token (≤ 1 h, or a new sign-in) and next door session; a session they already hold lasts until it expires (≤ 12 h) |
| …now | also disable the account (console → Authentication → Users → Disable) and rotate **without** `SESSION_SECRET_PREVIOUS` (`versions add`, then `services update … --update-secrets SESSION_SECRET=gateway-session-secret:latest --remove-secrets SESSION_SECRET_PREVIOUS`) | every door session ends at once, everyone's (the apps' own cookies inside them too, so Vale's Kroger link is redone); an ID token minted before the change still verifies until its hour is up |
| close an app to a whole group | remove the group from `apps[].access.groups`, merge | the next deploy, plus ≤ 5 min for the gateway's registry copy |

`platform.auth.enabled: false` is **not** a way to close anything: it routes apps with `access` straight to their own
service, unguarded (`validate-registry` and `render-firebase` warn). In an emergency, restrict the app instead
(`access.groups: ["owner"]`) and make sure step h is done.

## Local

- **Open mode needs nothing.** `make portal-dev` on localhost: every gate and space is open, no sign-in, and the board
  lives in `localStorage`. `?realm=guarded` walks the guarded flow instead.
- **The rehearsal** is `make realm-rehearsal`: with the Auth emulator, sign-up → sealed (no group) → `grant-groups` →
  the Vale gate opens and `/vale/` renders through the local gateway.
- **Emulators** (`firebase.json`): Auth `127.0.0.1:9099`, Firestore `127.0.0.1:8085`, UI `127.0.0.1:4000`, single project
  `researcher-455022`. firebase-tools 15 refuses Java below 21; on this Mac `export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"`
  first (Homebrew `openjdk` is 23; `openjdk@17` on the PATH is refused).
  ```bash
  firebase emulators:start --only auth,firestore --project researcher-455022
  node scripts/grant-groups.mjs --emulator --email you@example.com --set owner,vale --allow-unverified   # emulator sign-ups are unverified
  firebase emulators:exec --only firestore --project researcher-455022 'node scripts/test-firestore-rules.mjs'
  ```
  `grant-groups.mjs` refuses to run without `--emulator` while `FIREBASE_AUTH_EMULATOR_HOST` is set, so an emulator shell
  never changes production accounts.

## When it fails

| Symptom | Likely cause | Fix |
|---|---|---|
| Deploy red at "Require the session secret" | secret missing, no enabled version, or CI cannot see it | step c (2, 3) |
| gateway revision never becomes ready: permission denied on secret | the runtime account lacks `secretAccessor` | step c (3, 4) |
| `/?gate=vale&reason=door_unconfigured` | the running gateway has no `SESSION_SECRET` | step c, then redeploy (f) |
| `reason=group_required` for you | your ID token has no matching group | `grant-groups.mjs --email <you> --show`; sign out and in |
| `grant-groups`: 403 PERMISSION_DENIED | the gcloud account lacks Firebase Authentication Admin, or the API is off | `gcloud auth login` as Owner; step a |
| `grant-groups`: refused, email not verified | an Email/Password account nobody verified | verify it, or `--allow-unverified` once you know it is theirs |
| sign-in: `auth/unauthorized-domain` | the host is not an authorized domain | step a |
| Google sign-in by redirect fails in Safari | third-party storage blocked for `researcher-455022.firebaseapp.com` | sign in with a popup, or serve `authDomain` from the site's own host |
| the board: `permission-denied` | not in `owner`, no database, or rules not deployed | steps d, e |
| `vale ok: false` in `/api/health` after step h | no `run.invoker` on vale for the gateway's account, or `UPSTREAM_AUTH=none` | step h (2) |
| Sync deployments: `vale: skipped — health 403` | expected after step h | step h (5) |

Related: `registry/README.md` ("Sign-in and access"), `apps/gateway/README.md` (the door),
`plugins/eisen-platform/skills/site-plugin/SKILL.md` ("Access (optional)"), `scripts/grant-groups.mjs`, `firestore.rules`,
`scripts/test-firestore-rules.mjs`, `docs/runbooks/secrets.md`, `docs/runbooks/ci-auth.md`.
