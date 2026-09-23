# Object map — <app>

≤ 7 core objects. Singular, capitalised nouns in the user's words. Every object gets a list view and a detail view,
or a written reason why not.

## <Object>

- **Definition:** one sentence in the user's words.
- **Attributes:** `field` (type) shown as "Label" · `field` (type) shown as "Label" · …
- **Relations:** has one <Object> · has many <Object> · belongs to <Object>
- **Actions:** <verb + object> (who may do it) · …
- **Views:** list at `/<app>/<objects>` · detail at `/<app>/<objects>/<slug>` · (or: no detail view because …)

## <Object>

- **Definition:**
- **Attributes:**
- **Relations:**
- **Actions:**
- **Views:**

## Relations (text diagram)

```
App 1 — 1 Deployment        an App has one current Deployment
Gateway 1 — * App           the Gateway routes every App that has an API
```

## Glossary — one name per concept

| Term | Means | Not | Where it appears |
|---|---|---|---|
| App | one registered application | service, site, product, tile | tiles, nav, registry, docs |
| Status | live · beta · planned · hidden | state, stage | badge, registry |
| Version | the deployed semver | release, build | tile, deployments table |

## Screens derived from the objects

| Screen | Object and view | Primary action |
|---|---|---|
| Apps | App · list | Open |
