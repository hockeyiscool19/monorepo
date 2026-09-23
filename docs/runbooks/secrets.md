# Runbook — move plain-text Cloud Run secrets into Secret Manager

Found 2026-09-23. Two services in `researcher-455022` hold credentials as **plain environment variables**. Anyone
with read access to the project sees them in the console, in `gcloud run services describe`, and in every tool or
agent that describes the service. `jordan-lifts` already reads its `FIREBASE_*` values from Secret Manager, so the
pattern is in place; this finishes the job.

| Service | Plain-text variables that are credentials |
|---|---|
| `jordan-lifts` (healthconnect) | `GARMIN_PASSWORD`, `RENPHO_PASSWORD`, `SESSION_SECRET`, `API_TOKEN`, `GROK_API_KEY`, `XAI_API_KEY`, `WHATSAPP_VERIFY_TOKEN` |
| `vale` | `KROGER_CLIENT_SECRET` |

Non-secret configuration (`API_HOST`, `TZ`, `BASE_PATH`, `PUBLIC_URL`, `KROGER_CLIENT_ID`, …) can stay plain.

## Migrate one variable

The value is piped from the running service straight into Secret Manager, so it never appears on screen or in shell
history. Repeat per variable (example: `GARMIN_PASSWORD` on `jordan-lifts`).

```bash
PROJECT=researcher-455022 REGION=us-central1 SERVICE=jordan-lifts NAME=GARMIN_PASSWORD
SECRET=$(echo "${SERVICE}-${NAME}" | tr 'A-Z_' 'a-z-')

gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format=json \
  | python3 -c "import json,sys; e={x['name']:x.get('value','') for x in json.load(sys.stdin)['spec']['template']['spec']['containers'][0]['env']}; sys.stdout.write(e['$NAME'])" \
  | gcloud secrets create "$SECRET" --project "$PROJECT" --replication-policy=automatic --data-file=-

gcloud secrets add-iam-policy-binding "$SECRET" --project "$PROJECT" \
  --member="serviceAccount:$(gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format='value(spec.template.spec.serviceAccountName)')" \
  --role=roles/secretmanager.secretAccessor

gcloud run services update "$SERVICE" --project "$PROJECT" --region "$REGION" \
  --remove-env-vars="$NAME" --update-secrets="$NAME=${SECRET}:latest"
```

`--update-secrets` creates a new revision that reads the value at startup; the app sees the same variable name, so no
code changes. If the service account line prints nothing, the service runs as the default compute account
(`382031913173-compute@developer.gserviceaccount.com`); bind that instead.

## Then

1. **Deploy scripts and CI.** Anything that sets these variables with `--set-env-vars`/`--update-env-vars`
   (healthconnect's `gcp/deploy.sh` and `deploy.yml`, vale's `scripts/deploy-vale-cloudrun.sh` and the workflows in
   `integrations/vale/`) must switch to `--update-secrets NAME=secret:latest`, or the next deploy puts the plain value back.
2. **Rotate.** The values have been readable by anyone with project viewer access and were printed into a local
   agent session log on 2026-09-23 (not committed, not sent elsewhere). Rotating the Garmin and Renpho passwords, the
   xAI/Grok keys and `SESSION_SECRET` is cheap insurance; after rotating, add the new value with
   `gcloud secrets versions add "$SECRET" --data-file=-` and redeploy (a `:latest` reference picks it up on the next revision).
3. **Verify.** `gcloud run services describe <service> --format=json` should list these names only with `valueFrom`.
