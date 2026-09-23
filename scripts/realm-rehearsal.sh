#!/usr/bin/env bash
# Rehearse the guarded realm on this machine, exactly as production gates Vale, with nothing touching production:
#   - Firebase Auth + Firestore emulators (single project = registry platform.auth.projectId, rules from firestore.rules)
#   - the gateway door on :8787: emulator ID tokens, a throwaway SESSION_SECRET, the local registry, ACCESS_MODE=enforce
#   - the portal on :5174 in guarded mode, signing in against the emulator and sending /vale and /api through the door
#
#   scripts/realm-rehearsal.sh                        all three; Ctrl-C stops them        (make realm-rehearsal)
#   scripts/realm-rehearsal.sh emulators|gateway|portal   one part (the .claude/launch.json entries use these)
#
# Then: open http://localhost:5174, register (any email), walk to the Vale gate (sealed: no guild), and in another shell
#   node scripts/grant-groups.mjs --emulator --email <that email> --set owner,vale --allow-unverified
# Journal → Profile → "Refresh my guilds", walk back: the gate opens and /vale/ renders through the local door.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="$(node -p "JSON.parse(require('fs').readFileSync('$ROOT/registry/registry.json','utf8')).platform.auth.projectId")"
AUTH_HOST=127.0.0.1:9099
FIRESTORE_HOST=127.0.0.1:8085
GATEWAY_PORT="${GATEWAY_PORT:-8787}"
PORTAL_PORT="${PORTAL_PORT:-5174}"

# firebase-tools 15 refuses Java below 21: find one (JAVA_HOME, Homebrew's openjdk, or java_home) and put it first.
use_java_21() {
	local candidates=("${JAVA_HOME:-}" /opt/homebrew/opt/openjdk /usr/local/opt/openjdk)
	if [[ -x /usr/libexec/java_home ]]; then candidates+=("$(/usr/libexec/java_home -v 21+ 2>/dev/null || true)"); fi
	for home in "${candidates[@]}"; do
		[[ -n "$home" && -x "$home/bin/java" ]] || continue
		local major
		major="$("$home/bin/java" -version 2>&1 | sed -nE 's/.*version "([0-9]+).*/\1/p' | head -1)"
		if [[ -n "$major" && "$major" -ge 21 ]]; then
			export PATH="$home/bin:$PATH"
			return 0
		fi
	done
	echo "realm-rehearsal: the Firestore emulator needs Java 21 or newer (brew install openjdk)" >&2
	return 1
}

emulators() {
	use_java_21
	cd "$ROOT"
	exec firebase emulators:start --only auth,firestore --project "$PROJECT"
}

gateway() {
	cd "$ROOT/apps/gateway"
	[[ -d node_modules ]] || npm ci --no-audit --no-fund
	# A fresh random secret per run: rehearsal door sessions never outlive the rehearsal.
	SESSION_SECRET="${SESSION_SECRET:-$(openssl rand -base64 48)}" \
		REGISTRY_FILE="$ROOT/registry" \
		PORT="$GATEWAY_PORT" \
		FIREBASE_AUTH_EMULATOR_HOST="$AUTH_HOST" \
		ACCESS_MODE=enforce \
		UPSTREAM_AUTH=none \
		PORTAL_ORIGIN="http://localhost:$PORTAL_PORT" \
		exec npm run dev
}

portal() {
	cd "$ROOT/apps/portal"
	[[ -d node_modules ]] || npm ci --no-audit --no-fund
	PUBLIC_REALM=guarded \
		PUBLIC_FIREBASE_AUTH_EMULATOR_HOST="$AUTH_HOST" \
		PUBLIC_FIRESTORE_EMULATOR_HOST="$FIRESTORE_HOST" \
		REALM_DOOR_URL="http://127.0.0.1:$GATEWAY_PORT" \
		exec npm run dev -- --port "$PORTAL_PORT" --strictPort
}

case "${1:-all}" in
	emulators) emulators ;;
	gateway) gateway ;;
	portal) portal ;;
	all)
		trap 'kill 0' INT TERM EXIT
		(emulators) &
		(gateway) &
		(portal) &
		cat <<EOF

  Guarded realm rehearsal (nothing here touches production)
    portal     http://localhost:$PORTAL_PORT      guarded: warded gates need sign-in and a guild
    gateway    http://127.0.0.1:$GATEWAY_PORT     the door, emulator tokens, throwaway secret
    emulators  http://127.0.0.1:4000     Auth $AUTH_HOST · Firestore $FIRESTORE_HOST · project $PROJECT

  After registering in the portal:
    node scripts/grant-groups.mjs --emulator --email <your email> --set owner,vale --allow-unverified

EOF
		wait
		;;
	*)
		echo "usage: $0 [all|emulators|gateway|portal]" >&2
		exit 2
		;;
esac
