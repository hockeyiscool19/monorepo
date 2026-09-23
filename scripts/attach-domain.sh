#!/usr/bin/env bash
# Attach the platform domain (and www → apex redirect) to the Firebase Hosting site, then print the DNS
# records Cloudflare needs and the current verification / certificate state.
#
# Idempotent: re-run any time to see progress. Needs gcloud (logged in), curl and python3.
#
# Usage:  ./scripts/attach-domain.sh            # defaults below
#         DOMAIN=example.com SITE=my-site ./scripts/attach-domain.sh
set -euo pipefail

PROJECT="${PROJECT:-researcher-455022}"
SITE="${SITE:-eisensoftware}"
DOMAIN="${DOMAIN:-eisensoftware.com}"
API="https://firebasehosting.googleapis.com/v1beta1/projects/${PROJECT}/sites/${SITE}/customDomains"

TOKEN="$(gcloud auth print-access-token)"
call() {
  curl -sS -m 60 \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "x-goog-user-project: ${PROJECT}" \
    -H "Content-Type: application/json" "$@"
}

# ensure <host> <json-body>: create the custom domain if it does not exist yet.
ensure() {
  if call "${API}/$1" | grep -q '"hostState"'; then
    echo "exists:   $1"
  else
    echo "creating: $1"
    call -X POST "${API}?customDomainId=$1" -d "$2" >/dev/null
  fi
}

echo "project=${PROJECT} site=${SITE} domain=${DOMAIN}"
ensure "${DOMAIN}" '{}'
ensure "www.${DOMAIN}" "{\"redirectTarget\":\"${DOMAIN}\"}"

sleep 5

REPORT=$(cat <<'PY'
import json, sys
data = json.load(sys.stdin)
domains = data.get("customDomains", [])
if not domains:
    print("no custom domains found:", json.dumps(data)[:400])
for d in domains:
    host = d["name"].split("/")[-1]
    print(f"\n== {host}: host={d.get('hostState')} ownership={d.get('ownershipState')} cert={d.get('certState')}")
    if d.get("redirectTarget"):
        print(f"   redirects to {d['redirectTarget']}")
    for issue in d.get("issues", []):
        print("   issue:", issue.get("message"))
    updates = d.get("requiredDnsUpdates") or {}
    rows = []
    for block in updates.get("desired", []):
        for r in block.get("records", []):
            rows.append((r.get("requiredAction", "ADD"), r["type"], r["domainName"], r["rdata"]))
    for block in updates.get("discovered", []):
        for r in block.get("records", []):
            if r.get("requiredAction") == "REMOVE":
                rows.append(("REMOVE", r["type"], r["domainName"], r["rdata"]))
    if rows:
        print("   Cloudflare DNS (Proxy status: DNS only / grey cloud):")
        for action, rtype, name, rdata in rows:
            print(f"   {action:<7}{rtype:<6}{name:<30}{rdata}")
    elif d.get("hostState") == "HOST_ACTIVE" and d.get("certState") == "CERT_ACTIVE":
        print("   live: DNS verified and certificate active")
    else:
        print("   no DNS changes requested yet; re-run in a minute")
PY
)
call "${API}" | python3 -c "${REPORT}"

echo
echo "Next: add/remove the records above in Cloudflare → DNS → Records (DNS only), then re-run this script"
echo "until every domain shows host=HOST_ACTIVE and cert=CERT_ACTIVE. Details: docs/runbooks/dns.md"
