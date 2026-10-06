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

Remux tasks always run single-thread WASM inside their processing Worker. A
Chrome test with samples from YouTube `yWZa1UZzoBA` completed a ten-second
stream copy in direct mode, while pthread mode remained stuck after entering
render. The video's full inputs are about 445 MiB and 77 minutes; this sample
test does not establish successful completion of the whole download.

For remux only, 120 seconds without advancing output bytes or processed time
restarts the processing Worker once with the same downloaded input files.
Repeated zero-progress messages do not reset this deadline. A second stall
reports `queue.ffmpeg.crashed` with `workerStage: encoding` and `TimeoutError`,
so the existing failure flow releases the hold. Recovery does not submit a new
extraction or points reservation. Transcoding retains no render idle deadline.

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

Processing Worker and LibAV scripts need `Cross-Origin-Embedder-Policy:
require-corp` even when the homepage itself is not isolated: client navigation
from an isolated document (for example `/zh/remux`) retains that document's
policy. Pages static assets bypass server hooks, so these headers are in
`web/static/_headers`. The service worker bypasses processing assets to avoid
replaying cached responses with older policies. A startup handshake changes
the content-hashed Worker URLs so existing immutable HTTP cache entries cannot
hide the header rollout. Neither account nor homepage isolation is expanded.

For verification after deployment, open `/zh/remux` directly, navigate to the
homepage through its sidebar, and download a short YouTube video. Also test a
direct homepage load. Confirm fresh Worker scripts return the COEP header.
The recurrence on October 6 (request `4e0dff15-26f5-4aa8-9fc7-e8f65026fa15`)
reported `WorkerError`, attempt 3, elapsed 6 ms, with the points hold released.
A controlled Chrome test reproduced the same generic `Event` with undefined
message, filename and line when an isolated document loaded a Worker without
COEP. The same Worker started after adding COEP, and both variants started in
a non-isolated document. This confirms the policy defect; whether this user's
incident followed the isolated navigation path still needs deployed verification.

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

Single queued downloads automatically start saving when processing completes.
With the default download preference, supported non-iOS browsers receive the
local file through the browser download manager even after transient activation
expires. iOS and gesture-gated preferences retain a saving dialog. Batch items
keep the bulk/folder flow; an authorized output directory takes priority. Each
task attempts automatic saving once, and manual repeat saving reuses its result
without a new extraction or points request. A browser download handoff is not
proof of a file being saved to disk, so the result and repeat-save action remain
available if the browser blocks or cancels the download.

- `pnpm -C web test:ffmpeg-startup`
- `pnpm -C web test:fetch-startup`
- `pnpm -C web test:worker-assets`
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
