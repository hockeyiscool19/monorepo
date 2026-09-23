# Sitemap — <app>

Format: `path — Label [type] — nav system — purpose`. Types: hub · list · detail · form · flow · static · data ·
external. Nav systems: primary · local · utility · contextual · footer · none. Every node has a path and a type.

```
/<app>                        — <Label> [hub]      primary   <what the home does>
/<app>/<objects>              — <Objects> [list]   primary   <list of Object; filters ?status=&sort=>
/<app>/<objects>/<slug>       — <Object> [detail]  local     <one Object; actions …>
/<app>/<objects>/<slug>/edit  — Edit <Object> [form] contextual
/<app>/settings               — Settings [form]    utility
```

## Navigation

- Primary (3–5, same on every screen): <Label> · <Label> · <Label>
- Utility: <account · theme · help>
- Local (per section): <siblings and children>
- Footer: <full index, legal, source>

## Task walk (top tasks, ≤ 3 clicks each)

| Top task | Labels clicked, in order | Clicks | Label a new user could misread |
|---|---|---|---|
| <open Vale> | Apps → Vale | 1 | — |
| | | | |
| | | | |

## URL rules applied

- Prefix `/<app>`; no URL outside it; the app's framework sets its base path (`basePath`, `paths.base`, `BASE_PATH`).
- Lowercase, hyphens, no extensions, no trailing slash; plural nouns for collections, slugs for items.
- Redirects for renamed nodes: `<old> → <new>`
