.PHONY: check registry-validate portal-build portal-dev render-firebase gateway-test

## check: every gate that exists (CI runs this)
check: registry-validate
	@if [ -f apps/portal/package.json ]; then $(MAKE) portal-build; fi
	@if [ -f apps/gateway/package.json ]; then $(MAKE) gateway-test; fi

## registry-validate: registry/apps/*.json against registry/schema/app.schema.json (no dependencies)
registry-validate:
	node scripts/validate-registry.mjs

## portal-build: apps/portal → apps/portal/build (+ registry.json)
portal-build:
	cd apps/portal && npm ci --no-audit --no-fund && npm run build

## portal-dev: local dev server for the portal
portal-dev:
	cd apps/portal && npm run dev

## render-firebase: regenerate the rewrites block of firebase.json from the registry (idempotent)
render-firebase:
	node scripts/render-firebase.mjs

## gateway-test: unit tests for apps/gateway
gateway-test:
	cd apps/gateway && npm ci --no-audit --no-fund && npm test
