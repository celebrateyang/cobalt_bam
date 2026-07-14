# AI video stage 3A operations

Stage 3A provides the durable job, quota, resumable upload, object storage,
worker heartbeat, and cleanup infrastructure. It intentionally does not run
transcription, highlight analysis, or rendering yet. Uploaded jobs remain in
`queued_ingest` until stage 3B supplies the ingest handler.

## Production configuration

Enable the Helm feature only after the Secret and existing Workload Identity
ServiceAccount are ready:

```yaml
aiVideo:
  enabled: true
  serviceAccountName: existing-workload-identity-ksa
  secretName: ai-video-secret
```

Create the upload-session encryption key as 32 random bytes encoded with
base64. The Secret key name defaults to
`AI_VIDEO_UPLOAD_SESSION_ENCRYPTION_KEY`. Do not reuse the OpenAI key.

The configured Kubernetes ServiceAccount needs object create, get, and delete
access for objects under this fixed prefix:

```text
gs://ebay-mag-terraform-state/production/cloudsql-pgsql/data/
```

Bucket update and CORS permissions are not required. Browser traffic is sent
to the API in sequential 16 MiB chunks; the API streams each chunk into a GCS
resumable upload session.

## Kubernetes resources

- API Deployment: exposes `/user/ai-video/*` and streams upload chunks.
- `argocd-system-worker` Deployment: publishes the `argoCD` worker heartbeat.
- AI video cleanup CronJob: aborts expired uploads and deletes expired assets
  by exact object key and generation.

The Worker does not claim jobs in 3A. This prevents an infrastructure-only
deployment from moving customer jobs into analysis before stage 3B exists.

## API endpoints

```text
GET    /user/ai-video/usage
POST   /user/ai-video/jobs
GET    /user/ai-video/jobs
GET    /user/ai-video/jobs/:jobId
GET    /user/ai-video/jobs/:jobId/upload
PUT    /user/ai-video/jobs/:jobId/upload
POST   /user/ai-video/jobs/:jobId/upload-complete
POST   /user/ai-video/jobs/:jobId/cancel
DELETE /user/ai-video/jobs/:jobId
```

`PUT /upload` requires `Upload-Offset`, `Content-Length`, and
`Digest: sha-256=<base64>`. Only the next sequential chunk is accepted. An
offset conflict returns the server's committed offset so the browser can
resume without restarting the file.

The `download_import` job shape is reserved, but trusted download import token
issuance is not enabled in 3A. It will be connected with the ingest handler so
tokens never outlive or expose source CDN credentials unnecessarily.

