# Video Agent delivery: Tasks 6-1, 6-2 and 6-3

## 6-1: Subtitle files

`build_subtitles` validates the Task 5 translated-clips-v1 contract against the
source checksum, source duration, target language and clip duration bounds.
Each clip receives UTF-8 SRT, WebVTT and ASS assets. Timestamps are relative to
the clip; the original translated transcript stays unchanged. Translated and
bilingual modes are supported. Grapheme wrapping limits each subtitle to two
lines. Splitting a long translation keeps it inside its source cue, marks the
new timing as estimated and sets the review flag. Extremely dense translations
that cannot fit even a 200 ms minimum cue fail explicitly. VTT markup and ASS
control syntax are escaped.

Files are registered and uploaded under the current lease before an atomic
checkpoint commit. Recovery checks generation, byte length and SHA-256 before
reusing saved files. Checkpoints keep compact clip metadata; cue provenance
remains available through the upstream translated artifact.

## 6-2: Render and verify

`render` downloads the verified source once into an isolated scratch directory,
then renders clips sequentially with FFmpeg. Output is a center-cropped
1080x1920, 30 fps H.264/yuv420p + AAC MP4 with burned-in ASS subtitles. Original
audio is retained; timestamp gaps are padded and output is limited to the clip
duration. No TTS or dubbing is added in this task.

Every clip has a durable checkpoint. If the worker stops after saving a video,
the next attempt verifies and reuses it rather than rendering it again.
Temporary paths and filters are fixed server-side; no user shell/filter input
is executed. FFmpeg accepts the worker's working directory, AbortSignal and
15 minute deadline. Scratch admission uses a 1.5 GiB budget and actual free
space; MP4 size is capped at 256 MiB. The existing image includes FFmpeg,
fontconfig and Noto fonts.

`verify` independently checks asset hashes, probes video/audio codecs,
dimensions, pixel format, frame rate and both stream durations, with a 250 ms
tolerance. It then fully decodes the MP4 with FFmpeg error checks and validates
all subtitle asset hashes. Only a verified manifest can enter `publish_results`.
Fewer selected/verified videos than requested remain `partially_completed`.
An invalid media output fails the run and is never published; retry reuses
durable upstream stages. This version does not independently publish clips
from a run whose rendering or verification stage failed.

## 6-3: Results and downloads

- `GET /user/video-agent/projects/:projectId/runs/:runId/results` returns
  published, unexpired results for an owned completed/partially completed run.
- The existing asset download endpoint now supports MP4/SRT/VTT/ASS, requires
  project ownership and successful publication, and checks storage generation
  and size before issuing a URL or streaming bytes. Internal transcript,
  audio and checkpoint artifacts cannot be downloaded through this endpoint.
- GCS uses existing 10 minute signed URLs. Local storage uses authenticated
  binary fetches. The result panel offers video playback and per-file downloads;
  switching runs or leaving the page releases local preview object URLs.

## Rollout and validation

No schema change is required beyond the existing Video Agent initialization.
Deploy API and Agent worker from the same image, then deploy the web changes.
The chart's execution defaults remain off. To accept real runs, configure
`videoAgent.enabled`, `videoAgent.runsEnabled`, `videoAgent.admissionEnabled`
and `videoAgent.worker.enabled`; enable `videoAgent.cleanup.enabled` for
retention cleanup. API and worker must share storage, database and existing
OpenAI configuration. `/capabilities` now considers all ten production stages
implemented, but readiness is not a live credential or worker health check.
Create a new plan/run after deployment when testing changed stage configurations.
Natural-language planning remains Task 7; current runs use structured plans.

Targeted verification (no production build):

```sh
pnpm -C api test:video-agent
pnpm -C web check
```

Delivery tests cover relative subtitle timing, text/markup safety, invalid-media
rejection and unverified-report rejection. The real SQL/storage/worker fixture
uses a genuine 20 second source video, injected translation responses, actual
subtitle export, actual 1080x1920 FFmpeg rendering and full decoding. It injects
an interruption after committing a video, verifies reuse of the exact asset,
checks partial completion, downloads all four formats over HTTP and rejects
another user's download. Existing tests cover upstream ASR/selection/translation,
lease fencing, cancellation, quota and the original material flow.

Validation on 2026-09-19: all 60 Video Agent tests passed; all 7 legacy subtitle
and media-import tests passed. Frontend checking reported 0 errors and the
existing 110 warnings in 14 files. Real frame checks at seconds 1 and 19 confirm
visible burned-in subtitles on the otherwise black fixture source.

Automated local checks do not replace production GCS signed-URL/CORS checks,
browser playback checks, font coverage inspection or real-model semantic QA.
No production deployment, production database mutation or live model call is
performed as part of this implementation.
