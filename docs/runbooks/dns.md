# Runbook — point eisensoftware.com at Firebase Hosting

Cloudflare holds the domain (registrar + DNS). Firebase Hosting site `eisensoftware` in project
`researcher-455022` serves it. Cloudflare is used **as DNS only** — every record below is "DNS only"
(grey cloud), never proxied, so Firebase can verify ownership and issue its own certificate.

## 1. Attach the domain to the site (once)

```bash
./scripts/attach-domain.sh
```

Creates the custom domains `eisensoftware.com` and `www.eisensoftware.com` (a redirect to the apex) if they
do not exist, then prints the records Firebase asks for: A/AAAA records for the apex, a TXT record proving
ownership, and any existing records that must be removed. Re-running is safe.

## 2. Add the records in Cloudflare

Cloudflare → `eisensoftware.com` → DNS → Records:

| Type | Name | Content | Proxy status |
|---|---|---|---|
| as printed (A, AAAA, TXT, …) | `@` for the apex, `www` for www | as printed | **DNS only** |

- Remove any conflicting A/AAAA/CNAME on `@` and `www` that the script flags as REMOVE (as of 2026-09-23
  the zone has no A/AAAA/CNAME records at all, so nothing should conflict).
- Do not enable the proxy (orange cloud). With the proxy on, Firebase's ownership check and ACME challenge
  can fail and Cloudflare's certificate would front the site instead of Firebase's.
- TTL: Auto is fine.

## 3. Wait and verify

```bash
./scripts/attach-domain.sh
```

Re-run until both domains show `host=HOST_ACTIVE` and `cert=CERT_ACTIVE`. DNS propagation is usually
minutes; certificate issuance is usually under an hour, at most 24 h. Then:

```bash
curl -sI https://eisensoftware.com/ | head -5
```

should return `200` with `server: Google Frontend` (or a Firebase Hosting header) once the portal is deployed.

## Later: an app on a subdomain

Path-prefix routing is the platform default (`eisensoftware.com/<app>`), rendered from `registry/registry.json`
into `firebase.json` rewrites — no DNS change per app. If an app ever needs its own subdomain, create a second
Hosting site, attach `<app>.eisensoftware.com` to it with `SITE=<site> DOMAIN=<app>.eisensoftware.com
./scripts/attach-domain.sh`, and add the printed records the same way.
