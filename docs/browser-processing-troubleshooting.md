# Browser media processing failures

An API `200 / local-processing` response confirms extraction, not browser
processing or file saving. The admin download table now displays the API result
and browser outcome separately:

- `browser: unconfirmed`: no browser outcome has been received. This includes
  older clients, interrupted sessions and failed telemetry delivery.
- `browser: processed`: the queue produced the output file. This does not prove
  that the user saved it to disk.
- `browser: failed`: the queue reported a terminal failure.

## Encoder initialization

The FFmpeg runner gives each phase a separate deadline:

| Phase | Deadline per attempt |
| --- | --- |
| Outer Worker startup | 15 seconds |
| LibAV JS/WASM initialization | 120 seconds |
| Input probing | 60 seconds |
| Encoding | No startup deadline |

Worker startup or initialization failure retries once in a fresh Worker, using
single-thread WASM directly inside that Worker. Probe and encoding failures do
not restart initialization. Retries belong to each task independently. Removal
or a terminal queue state terminates the Worker and clears its deadlines.

If a YouTube audio task fails during browser processing, the user can explicitly
choose **download original audio (no conversion)**. This requests `audioFormat:
best`, disables metadata/cover processing and keeps a browser fetch queue. The
file keeps its original audio format rather than being renamed to MP3. The
previous hold release must succeed before retrying; the new format uses a new
request identity and normal points preview/reservation.

## Persistent diagnostics

### Download Worker startup

The fetch runner allows three startup attempts, with a 15-second deadline per
attempt. Constructor failures, message-cloning failures and Worker error events
now report `workerStage: worker`, `errorName`, `elapsedMs` (the final attempt)
and `attempt` through the existing browser outcome endpoint. The browser console
also records the Worker error message, script filename and line number. Runtime
crashes after startup do not automatically restart a partially downloaded file.
Cancellation and late callbacks cannot restart a completed or removed task.

### Cloudflare Pages LibAV assets

The Vite plugin copies LibAV into `_libav`, outside SvelteKit's asset manifest.
The Pages adapter must exclude `/_libav/*` from Function routing so Pages serves
these files directly. Keep this exclusion before `<all>` because the adapter
truncates exclusions when the total route count exceeds 100.

After the user builds and deploys the web app, check that the generated
`.svelte-kit/cloudflare/_routes.json` excludes `/_libav/*`, and that the public
remux/encode `.mjs` and `.wasm` assets return HTTP 200 with JavaScript/WASM MIME
types. Then test both `/zh/download/youtube-download` and `/zh/` with
`https://www.youtube.com/watch?v=6d_FXbWt12s`. Mock startup tests cannot replace
this production asset and browser verification.

Successful extraction responses include `downloadRequestId`. The browser posts
its terminal outcome to `POST /user/downloads/outcome` with a Clerk bearer token:

```json
{
  "requestId": "864b97cb-748a-4e63-8f38-fb8c8dca873a",
  "state": "failed",
  "errorCode": "queue.worker_didnt_start",
  "diagnostic": {
    "workerStage": "initializing",
    "elapsedMs": 240000,
    "attempt": 2,
    "threaded": false,
    "errorName": "TimeoutError"
  }
}
```

The API checks ownership of the exact request and stores bounded diagnostic
fields and the request's browser User-Agent in
`download_attempts.metadata.browserOutcome`. Successful processing also reports
initialization duration and whether it recovered on the second attempt. Reporting
is best effort and does not block completing a file or releasing points.

No schema migration is needed. Records survive Pod replacement and retain the
existing download-attempt retention policy (two days by default). Deploy both
the API and web changes to enable reporting; older clients remain unconfirmed.

## Targeted verification

- `pnpm -C web test:ffmpeg-startup`
- `pnpm -C web test:fetch-startup`
- `pnpm -C web test:saving`
- `node --test api/src/core/browser-download-outcome.test.js api/src/db/users.test.js`
- `pnpm -C api test:match-action` (requires an API URL for generating test tunnels)
- `pnpm -C web check`
- `pnpm -C web i18n:check-encoding`

The startup tests simulate delayed WASM initialization, bounded fallback, late
messages, cancellation, independent tasks, telemetry retries and points release
or finalization. A real Safari session is still useful for confirming a specific
browser/network failure; the original user's missing diagnostics cannot be
reconstructed from historical API success records.
