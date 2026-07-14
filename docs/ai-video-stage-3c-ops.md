# AI video stage 3C operations

Stage 3C adds server-side vertical rendering, subtitle delivery, signed result
downloads, and trusted import of a recent downloader result.

## Output and retention

- Each enabled draft clip becomes a 1080x1920 H.264/AAC MP4 with `yuv420p`,
  30 fps, and Web Fast Start.
- Translated or bilingual subtitles are burned into the MP4. UTF-8 SRT and
  WebVTT files are stored alongside each clip.
- Result files remain application-accessible for 7 days. Source files remain
  available while a draft is editable and are shortened to 24 hours after a
  successful render. Draft metadata remains for 30 days.
- Every object uses an opaque key under
  `production/cloudsql-pgsql/data`; cleanup uses the registered key and GCS
  generation. Existing Bucket soft delete semantics still apply afterwards.

## Required secret update

The API and `argocd-system-worker` must receive the same import-token key. It
must be different from the upload-session key and OpenAI key.

```powershell
kubectl create secret generic ai-video-secret -n infra `
  --from-literal=AI_VIDEO_UPLOAD_SESSION_ENCRYPTION_KEY='<existing-upload-secret>' `
  --from-literal=AI_VIDEO_MEDIA_IMPORT_TOKEN_KEY='<new-random-secret-at-least-32-characters>' `
  --from-literal=OPENAI_API_KEY='<existing-openai-key>' `
  --dry-run=client -o yaml | kubectl apply -f -
```

Updating the Secret does not restart existing Pods automatically. Restart the
API deployment and worker through the normal deployment pipeline, or verify
that the new rollout has occurred before testing imports.

## Trusted downloader import

For an authenticated single-video `redirect` or `tunnel` response, the API
adds an encrypted `mediaImportToken`. The browser keeps it in `sessionStorage`
and the AI Video page can consume it once within 15 minutes.

The token is user-bound and contains an encrypted URL, expiry, and nonce. The
creation API records only the nonce and encrypted token. The Worker accepts
HTTPS only, rejects credentials/private IP resolution, validates every
redirect, and streams at most 1 GiB into the registered source object. Picker,
image, and audio-only responses do not receive import tokens.

## Capacity

The default worker remains one replica. Its default resources now include:

```yaml
requests:
  cpu: 500m
  memory: 512Mi
  ephemeral-storage: 2Gi
limits:
  cpu: "2"
  memory: 2Gi
  ephemeral-storage: 6Gi
```

Rendering uses local ephemeral storage for one source and the current output
files. Do not increase source size or worker concurrency without revisiting the
ephemeral-storage limit.

## Verification

```powershell
kubectl logs -n infra deployment/argocd-system-worker --since=30m
kubectl get pods -n infra -l app.kubernetes.io/name=argocd-system-worker
```

Expected render progression is `queued_render`, `rendering`, then `completed`.
For each enabled clip, `GET /user/ai-video/jobs/:jobId/results` should return one
MP4, one SRT, and one VTT asset with 10-minute signed URLs. Refreshing the page
requests new signed URLs without rerendering.

The Web production build remains a manual user verification step.
