# Release <app> <version>

Date <YYYY-MM-DD> · tag `v<version>` (monorepo: `<app>/v<version>`) · commit `<full sha>` · environment production

## Receipts

| Step | Receipt | Verify with |
|---|---|---|
| Release | annotated tag `v<version>` on `<sha>` | `git show v<version>` |
| Build | `us-central1-docker.pkg.dev/<project>/<repo>/<service>@sha256:<digest>` tagged `sha-<12>`, `v<version>` | `gcloud artifacts docker images describe us-central1-docker.pkg.dev/<project>/<repo>/<service>:v<version>` |
| Deploy | Cloud Run `<service>` revision `<service>-<xxxxx-yyy>` serving 100 % | `gcloud run revisions describe <revision> --region us-central1 --format 'value(status.imageDigest)'` |
| Publish | commit `<sha>` in `hockeyiscool19/monorepo` (`apps[].deployment` for `<id>`) | `curl -s https://eisensoftware.com/registry.json` |

The build digest and the deploy digest must be identical; write both.

## Changes

<paste the `[<version>]` section of CHANGELOG.md>

## Rollback

```bash
gcloud run deploy <service> --image us-central1-docker.pkg.dev/<project>/<repo>/<service>:v<previous> \
  --region us-central1 --project <project>
# then publish the rolled-back version: rerun the register job with version=<previous>, or edit the registry with deployedBy: manual
```

## Checks after deploy

- `curl -sS https://eisensoftware.com/<path>/health` reports `"version":"<version>"` and `"sha":"<sha>"`.
- The tile on `https://eisensoftware.com/` shows `<version>`.
