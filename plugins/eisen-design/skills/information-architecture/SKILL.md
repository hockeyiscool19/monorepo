---
name: information-architecture
description: Structure before pixels — a working method for any app, site or portal on eisensoftware.com. Content inventory, object model, organization scheme, labels, navigation limits, sitemap, URL scheme under a path prefix, wayfinding checks, and validation by card sort and tree test. Load when adding or reorganizing screens, navigation, labels or URLs, before any ui-style-* skill.
---

# Information architecture

Structure first, style second: no `ui-style-*` rescues a screen people cannot find. Work the nine steps in order;
each produces one artifact (blank forms in `templates/`). Numbers are limits, not suggestions.

## 1. Content inventory → `templates/content-inventory.md`

1. List every item that exists or is planned: screens, objects, documents, settings, actions, external links.
   One row each; an item without a row does not ship.
2. Per row: id, name (as users say it), type (screen · object · doc · setting · action · external), where it
   lives today (URL or file), owner, source of truth (registry, database, CMS, code).
3. Decide per row: **keep · merge · rewrite · delete**. A redesign with fewer than 10 % deletes has not been audited.
4. Mark the **top tasks**: the 3 things most people come to do, in their words ("open Vale", not "navigate to
   application"). Every later step is measured against these three.

## 2. Object model → `templates/object-map.md`

- Objects are the nouns users care about, singular and capitalised: App, Deployment, Gateway.
- For each: attributes (the fields a user reads), relations with cardinality ("an App has one current Deployment"),
  actions (verb + object, and who may do it), and views — every object gets a **list** view and a **detail** view
  unless you write down why not.
- Screens are views of objects. A screen that shows no object is navigation or help, not a feature.
- Keep ≤ 7 core objects per app. An eighth is a sign of a second app.

## 3. Organization schemes

| Scheme | Use when | Needs testing |
|---|---|---|
| Exact: alphabetical, chronological, geographic, numeric | the user knows the name, date or place | no |
| Subjective: by object, by task, by audience, by topic | the user knows what they want done | yes (card sort) |

- One scheme per level. Tiles grouped by status and sorted alphabetically inside each group is two levels and
  fine; "by team" and "by task" side by side on one level is a defect.
- Categories are mutually exclusive: an item that could sit in two groups means the groups are wrong.
- Structures: hierarchy (default), hub-and-spoke (task flows), faceted (catalogs over 50 items), sequential
  (wizards), flat (≤ 7 items — the portal).

## 4. Labels

1. One name per concept, everywhere: nav, headings, buttons, URLs, API fields, docs. The glossary lives in the
   object map; a second name for the same thing is a bug to fix, not a synonym to add.
2. The user's words, taken from support requests, search logs and interviews — never the database column or the
   team name. `deployment.version` is shown as "Version".
3. Nav labels ≤ 2 words; button labels verb + object ("Refresh registry"); never "Misc", "Other", "Resources",
   "Tools" or "More".
4. Parallel grammar within a set: all nouns ("Apps · Registry · Status") or all verbs, never mixed.
5. The page `<title>`, its `<h1>` and the nav label that leads there are the same string.

## 5. Navigation limits

- Top level: **3–5** destinations; 7 is the ceiling, and only with a reason recorded in the plan.
- Depth: top tasks finish in **≤ 3 clicks** from the app's home and sit **≤ 3 levels** deep.
- One primary nav per app, identical on every screen (order, names, position). Utility items (account, theme,
  help) sit apart from it, at the right or in the footer.
- Contextual links ("View gateway logs") live in the content, not in the nav.
- Every screen has a way back: the wordmark returns to the app home; the app home links to the portal.
- Icons never stand alone; every nav item shows a text label at every breakpoint.

## 6. Sitemap → `templates/sitemap.md`

An indented list, one node per line: `path — Label [type] — nav system — purpose`. Types: `hub` `list` `detail`
`form` `flow` `static` `data` `external`. Every node has a URL (step 7) and a type; a node with neither is a
component, not a page. Walk the three top tasks through it and write the click count beside each; a task over 3
gets a redesign, not a footnote.

## 7. URL scheme (this platform routes by path prefix)

1. Every app lives under `eisensoftware.com/<app>/…` — its registry `path`. The app never emits a URL outside its
   prefix: Next.js sets `basePath`, SvelteKit `paths.base`, Python apps `BASE_PATH`.
2. `eisensoftware.com/api/<app>/…` belongs to the gateway. No UI ever lives under `/api`.
3. Lowercase, hyphens, no file extensions, no trailing slash (pick one form; redirect the other).
4. Collections are plural nouns, items are slugs: `/vale/habits`, `/vale/habits/morning-walk`. Internal ids appear
   only where no stable slug exists.
5. Every meaningful view has a URL — tabs, filters and sort included (`?status=live&sort=name`). The query string
   carries view state only, never identity.
6. A published URL keeps working: a rename ships its redirect in the same change.
7. ≤ 4 path segments after the prefix for anything on a top-task path.

## 8. Wayfinding and search checks

Each screen answers three questions without scrolling at 360 px wide:
- **Where am I?** `<h1>` equals the nav label; the current nav item carries `aria-current="page"`; the tab title
  reads "Page · App".
- **What can I do here?** One primary action is visible; secondary actions are quieter than it.
- **How do I get back?** Wordmark → app home; app home → portal; a page below level 2 shows a breadcrumb or a
  parent link.

Search is required when one level holds more than 20 items or the tree is deeper than 2 levels. Results show the
object type and a snippet; the empty state offers the nearest label. Search never excuses a bad tree.

## 9. Validate → `templates/tree-test.md`

| Method | When | Participants | Pass threshold |
|---|---|---|---|
| Open card sort | before grouping | ≥ 15 (clusters stabilise at 15–20) | a group is real when ≥ 60 % of people put its items together |
| Closed card sort | to test your groups | ≥ 15 | ≥ 70 % of placements land in the intended group |
| Tree test | on the sitemap, before visuals | ≥ 8 per task (≥ 30 for statistics) | per task: success ≥ 80 %, direct success ≥ 60 %, median ≤ 20 s; no task below 60 % |
| First-click test | on a mockup | ≥ 8 | ≥ 70 % first-click on the intended element |

With fewer than 5 people, treat every failure as a finding to fix, not a rate. If you cannot test, walk the top
tasks yourself: count clicks, write the label chosen at each step, and mark each label a new user could misread.

## Worked example — the portal, `eisensoftware.com/`

**Top tasks:** open an app · check whether an app and the gateway are healthy · find which version is deployed.

**Objects** (from `registry/registry.json`)
- **App** — id, name, description, icon, status (live · beta · planned · hidden), path, version (from its
  Deployment). Has one current Deployment; is routed by the Gateway. Actions: open, filter.
- **Deployment** — version, sha, imageTag, deployedAt, deployedBy. Belongs to one App. Action: view.
- **Gateway** — path `/api`, service, enabled, health per App. Has one route per App with an API. Actions: view
  health, view registry.

**Glossary:** App (not service, site, product) · Status (not state, stage) · Version (not release, build) ·
Registry (the JSON) · Gateway (the `/api` proxy). A tile is the UI for an App and never a noun in copy.

**Sitemap**
```
/               — Apps [hub]           primary  one tile per App not hidden; gateway health line
/#apps          — Apps [list]          primary  tiles + filter (?q=)
/<app>          — <App name> [external]         the app itself, under its own prefix
/api/registry   — Registry [data]      primary  Apps and Deployments as JSON
/api/health     — Status [data]        primary  Gateway → health per App
```
Primary nav: Apps · Registry · Status (3). Utility: theme toggle.

**Task walk:** open Vale = 1 click (tile) · check health = 0 clicks (hero line + badges) or 1 (Status) · find
Topology's version = 0 clicks (the tile shows `v0.1.0`; the deployments table adds sha and date).

**Tree-test tasks:** "Open Vale" → `/vale` · "Is HealthConnect healthy right now?" → `/` badge or `/api/health` ·
"Which version of Topology is deployed?" → `/` tile or the deployments table.

## Audit (score each 0–10; 7 passes; fix anything below 7 before styling)

1. **Inventory** — every item has a row and a keep / merge / rewrite / delete decision.
2. **Objects** — ≤ 7 core objects, each with attributes, relations, actions, list and detail views.
3. **Scheme** — one scheme per level; no item fits two groups.
4. **Labels** — one name per concept; the user's words; ≤ 2-word nav labels; title = h1 = nav label.
5. **Navigation** — 3–5 top-level items; top tasks ≤ 3 clicks and ≤ 3 levels; text label on every item.
6. **Sitemap** — every node typed and addressed; click counts written beside the top tasks.
7. **URLs** — under the app prefix; lowercase-hyphen; every view addressable; renames redirect.
8. **Wayfinding** — where / what / back answered on every screen at 360 px.
9. **Search** — present when required, scoped, typed results, useful empty state.
10. **Validation** — card sort or tree test run, or a documented task walk with click counts.

## Anti-patterns

Nav that mirrors the org chart, the repo layout or the database schema · "More" menus · icon-only nav · two
names for one thing · a URL that changes with the filter but not with the object · views you cannot link to ·
IA done once and never revisited when the content or the users change.
