# Node 24 on macOS can segfault while an npm postinstall exits (@firebase/util; see the plan's surprises): the portal's
# install is retried once. A second failure still fails the target.
PORTAL_INSTALL = (npm ci --no-audit --no-fund || npm ci --no-audit --no-fund)

.PHONY: check registry-validate portal-build portal-test portal-dev render-firebase gallery gateway-test sites sites-check realm-rehearsal

## check: every gate that exists (CI runs this)
check: registry-validate sites-check
	@if [ -f apps/portal/package.json ]; then $(MAKE) portal-build && cd apps/portal && npm test; fi
	@if [ -f apps/gateway/package.json ]; then $(MAKE) gateway-test; fi

## registry-validate: registry/apps/*.json against registry/schema/app.schema.json (no dependencies)
registry-validate:
	node scripts/validate-registry.mjs

## portal-build: apps/portal → apps/portal/build (+ registry.json, checked to carry no private repo blocks)
portal-build:
	cd apps/portal && $(PORTAL_INSTALL) && npm run build
	node scripts/validate-registry.mjs --published apps/portal/build/registry.json

## portal-test: unit tests of the portal's world logic (realm layout, access, board, collisions)
portal-test:
	cd apps/portal && $(PORTAL_INSTALL) && npm test

## portal-dev: local dev server for the portal (the realm is open: every gate and room, no sign-in)
portal-dev:
	cd apps/portal && npm run dev

## realm-rehearsal: the guarded realm locally — Auth/Firestore emulators, the gateway door on :8787, the portal on :5174
realm-rehearsal:
	./scripts/realm-rehearsal.sh

## render-firebase: regenerate the rewrites block of firebase.json from the registry (idempotent)
render-firebase:
	node scripts/render-firebase.mjs

## gallery: serve the repo root; the style gallery is http://127.0.0.1:4178/docs/mockups/
gallery:
	python3 -m http.server 4178 --bind 127.0.0.1

## sites: regenerate plugins/eisen-platform/skills/sites/site-<id>/SKILL.md from the registry (idempotent)
sites:
	node plugins/eisen-platform/skills/site-plugin/scripts/generate-site-skills.mjs

## sites-check: fail when the generated site skills are stale (part of check)
sites-check:
	node plugins/eisen-platform/skills/site-plugin/scripts/generate-site-skills.mjs --check

## gateway-test: unit tests for apps/gateway
gateway-test:
	cd apps/gateway && npm ci --no-audit --no-fund && npm test
