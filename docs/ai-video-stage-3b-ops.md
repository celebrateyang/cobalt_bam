# AI video stage 3B operations

Stage 3B enables the analysis worker and the editable draft UI. It does not
render final vertical videos; rendering and download-import tokens belong to
stage 3C.

## Runtime components

- The API streams browser upload chunks into the configured object storage.
- `argocd-system-worker` downloads one source at a time, runs ffprobe/FFmpeg,
  calls the configured OpenAI speech and text models, and writes transcript and
  clip rows to PostgreSQL.
- The cleanup CronJob continues to delete only exact object keys registered in
  `ai_video_assets` under `production/cloudsql-pgsql/data`.

No Bucket CORS configuration is required.

## Secret

The existing `ai-video-secret` must contain two independent values:

```powershell
kubectl create secret generic ai-video-secret -n infra `
  --from-literal=AI_VIDEO_UPLOAD_SESSION_ENCRYPTION_KEY='<32-byte-or-longer-random-secret>' `
  --from-literal=OPENAI_API_KEY='<openai-api-key>' `
  --dry-run=client -o yaml | kubectl apply -f -
```

Do not put either secret in Helm values or application logs. GCS credentials
are supplied by the existing Kubernetes ServiceAccount through Workload
Identity, not by an environment variable containing a key file.

## Helm values

```yaml
aiVideo:
  enabled: true
  serviceAccountName: <existing-workload-identity-service-account>
  storageProvider: gcs
  gcsBucket: ebay-mag-terraform-state
  storagePrefix: production/cloudsql-pgsql/data
  monthlySeconds: 7200
  maxFileBytes: 1073741824
  maxDurationSeconds: 3600
  worker:
    replicaCount: 1
    transcriptionModel: gpt-4o-transcribe-diarize
    textModel: gpt-5-mini
    audioChunkSeconds: 600
```

`AI_VIDEO_TRANSCRIPTION_MODEL=whisper-1` is supported without a code change.
That mode stores word timestamps; the default diarization model stores speaker
labels and segment timestamps. Keep only one worker replica in the first
release to preserve the agreed global processing concurrency.

## Verification

```powershell
kubectl get pods -n infra -l app.kubernetes.io/name=argocd-system-worker
kubectl logs -n infra deployment/argocd-system-worker --since=30m
kubectl get pods -n infra -l app.kubernetes.io/name=argocd-system-worker `
  -o jsonpath='{.items[0].spec.serviceAccountName}'
```

Expected stage progression is `queued_ingest`, `probing`, `transcribing`,
`translating`, `analyzing`, then `draft_ready`. A retryable provider failure is
stored with `failed_stage`; retry reuses persisted transcript/translation data
when the failed stage permits it and does not charge the monthly quota twice.

The Web production build remains a manual user verification step. Development
verification uses `pnpm -C web check` and the API AI-video test scripts.
