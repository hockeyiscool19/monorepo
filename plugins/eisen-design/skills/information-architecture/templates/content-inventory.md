# Content inventory — <app>

Date: <YYYY-MM-DD> · Owner: <name> · Sources: <site crawl, registry, repo, support requests, interviews>

## Top tasks (in the user's words, 3 max)

1. <e.g. "open Vale">
2. <e.g. "see whether the gateway is healthy">
3. <e.g. "find which version of Topology is deployed">

## Inventory

One row per screen, object, document, setting, action or external link. Types: screen · object · doc · setting ·
action · external. Decision is exactly one of keep · merge · rewrite · delete; "merge" names its target in Notes.

| ID | Name (user's words) | Type | Lives at (URL / file) | Owner | Source of truth | Decision | Notes |
|---|---|---|---|---|---|---|---|
| C1 | Apps | screen | `/` | portal | registry.json | keep | hub; tiles for every App not hidden |
| C2 | App | object | registry.json → apps[] | coordinator | registry.json | keep | id, name, status, path, version |
| C3 | | | | | | | |

## Totals

- Rows: <n> · keep: <n> · merge: <n> · rewrite: <n> · delete: <n>
- Fewer than 10 % deletes on a redesign means the audit is not finished.
- Items with no owner or no source of truth: <list them; each needs one before it ships>
