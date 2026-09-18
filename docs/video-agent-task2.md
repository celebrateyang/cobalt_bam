# Video Agent: Task 2 operations

Task 2 enables projects and authenticated source management. The existing Highlight Studio remains at `/<lang>/ai-video`. The agent workspace and project URLs are `/<lang>/ai-video/video-agent` and `/<lang>/ai-video/video-agent/projects/<projectId>`.

## Local startup

Use Node 20, PostgreSQL with the existing users and membership tables, and the existing AI video storage adapter. No model API key is required by this task.

Set these process environment variables for the API:

```text
IS_UPSTREAM_SERVER=false
VIDEO_AGENT_ENABLED=1
AI_VIDEO_STORAGE_PROVIDER=local
AI_VIDEO_LOCAL_STORAGE_ROOT=.ai-video-storage
AI_VIDEO_UPLOAD_SESSION_ENCRYPTION_KEY=<existing 32-byte base64 or hex key>
AI_VIDEO_MEDIA_IMPORT_TOKEN_KEY=<existing secret, at least 32 characters>
```

Retain the configured Clerk and DB variables; do not replace existing secrets. Run the API from `api/` so it loads its existing `.env`. Local storage is for development, not a multi-pod production deployment. The API and ingestion/cleanup processes must share the same local storage root, encryption keys and database.

```sh
pnpm -C api video-agent:init
pnpm -C api start
```

In a separate process set `VIDEO_AGENT_INGEST_ENABLED=1` and run:

```sh
pnpm -C api video-agent:ingest
# Or process at most one queued source:
pnpm -C api video-agent:ingest --once
```

Run the cleanup process periodically (hourly in the chart):

```sh
pnpm -C api video-agent:cleanup
```

Set `WEB_VIDEO_AGENT_ENABLED=1` for the frontend development process. This flag does not authorize API requests. Authentication, disabled-account checks, source membership and ownership are enforced by the API.

Sources remain `queued_ingest` until the ingestion process is running. It only fetches/probes/hashes/stores sources; it never transcribes, translates, dubs, renders or consumes processing minutes. General ingestion errors are shown as failed sources; delete the project or wait for cleanup before adding replacement sources at the storage limit. Run retry commands are part of Task 3.

## Production configuration (not deployed by Task 2)

Initialize the schema using `node src/util/init-video-agent.js` inside the API image before enabling acceptance. This creates only the new tables/indexes and, if absent, the shared import nonce table; it does not alter old job data.

Use GCS and the existing `aiVideo` bucket/prefix, service account/credential mount and encryption-key secret configuration. Configure these independent chart flags:

```yaml
videoAgent:
  enabled: true
  ingestion:
    enabled: true
    replicaCount: 1
  cleanup:
    enabled: true
    schedule: "25 * * * *"
```

`videoAgent.enabled` controls API acceptance. The material ingestion and cleanup flags are independent so acceptance can be disabled while authorized sources drain. All three default to false. Existing `aiVideo.enabled` behavior is preserved; enabling the agent alone does not enable Highlight Studio processing.

The material ingestion Deployment inherits the existing media-worker resource limits and GCS configuration but has no LLM credentials. The cleanup CronJob inherits existing cleanup job history/concurrency configuration. Local storage cannot be shared across these pods; use GCS in production. Production frontend builds and deployment remain manual.

Source policy: 1 GiB / 60 minutes per source, 3 sources / 3 GiB per user, 30-day retention. Unknown import sizes reserve 1 GiB until ingestion completes. Failed and deleting sources count until physical source cleanup completes. Upload sessions expire after 6 hours. Failed objects and abandoned import attempts are cleaned after 24 hours. Signed GCS download links expire in 10 minutes, so links issued before deletion can remain valid within that window.

## API implemented in Task 2

All requests use `Authorization: Bearer <Clerk token>` and return `status:success,data` or the existing error envelope. Project titles have a 120-character limit; projects are capped at 100 per user. Adding sources requires active `ai_video_studio` membership, without touching execution quota.

| Method | Path under `/user/video-agent` | Behavior |
| --- | --- | --- |
| POST | `/projects` | `{title}` creates a project; 201 |
| GET | `/projects?limit=20&cursor=...` | Owned project list, stable timestamp/UUID cursor |
| GET | `/projects/:projectId` | Owned project and sources; no storage keys or credentials |
| DELETE | `/projects/:projectId` | Soft delete and schedule object cleanup; 204 |
| POST | `/projects/:projectId/sources` | Upload metadata (201) or authenticated import token (202) |
| GET | `/projects/:projectId/sources/:sourceId/upload` | Query storage offset, fingerprint, expiry and chunk size |
| PUT | `/projects/:projectId/sources/:sourceId/upload` | Octet-stream chunk, `Upload-Offset`, `Content-Length`, `Digest: sha-256=<base64>` |
| POST | `/projects/:projectId/sources/:sourceId/upload-complete` | Idempotent completion; enqueue probe/ingestion, 202 |
| GET | `/projects/:projectId/assets/:assetId/download` | Owned, ready, unexpired source; redirect to GCS or authenticated local stream |

Upload source body: `{kind:"upload",filename,contentType,sizeBytes,fileFingerprint}`. Supported MIME types are MP4, QuickTime, WebM, Matroska and M4V; actual media is checked by ffprobe after uploading. Import body: `{kind:"download_import",mediaImportToken}`. The download tool already saves the token in this browser's session storage; the workspace imports it only after an explicit user action and clears it after acceptance. Tokens expire after 15 minutes and cannot be replayed in either video interface. Arbitrary URLs are not accepted. Direct Bridge imports use only their original resource URL, without tunnel fallback.

GET download with `?url=1` returns a short-lived GCS URL, or `url:null` for local storage so the frontend can fetch with Clerk authorization. Source status transitions are uploading -> queued_ingest -> ingesting -> ready, with failed/expired/deleting/deleted terminal cleanup states. Pending import assets are registered before writing; lease tokens fence final publication, and abandoned attempts remain discoverable by cleanup.

## Verification

```sh
pnpm -C api test:video-agent
pnpm -C api test:ai-video-infrastructure
pnpm -C api test:ai-video-delivery
pnpm -C api test:ai-video-analysis
pnpm -C web check
pnpm -C web i18n:check-encoding
pnpm -C web i18n:check-completeness
```

New integration tests use an isolated in-memory PostgreSQL ([PGlite](https://pglite.dev/docs/)), injected test authentication, actual local storage and real ffmpeg/ffprobe. They never migrate or connect to the configured production DB. PGlite has one connection; production multi-pod lock competition and GCS resumable-session behavior still require staging validation.

Browser/staging acceptance: sign in with an entitled user, create a project, upload a valid video, pause/reselect the original file, refresh its project URL, and wait for the source to become ready. Download a video in the existing downloader, return to the project and import its token. Try another user's URL and verify rejection. Delete the project, verify API download denial, run cleanup and verify storage removal. Confirm that the global AI video menu and Highlight Studio retain their previous behavior. Close the acceptance flag while ingestion drains and cleanup continues.

Do not run production builds as a development check. Browser visual testing, real Clerk/GCS staging validation and deployment were not performed by this task.
