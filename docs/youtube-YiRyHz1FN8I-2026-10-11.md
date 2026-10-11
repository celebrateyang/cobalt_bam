# YouTube YiRyHz1FN8I download investigation

Date: 2026-10-11 (Asia/Shanghai).

## Production observations

- The API successfully extracted the video and returned `local-processing`
  from the global upstream `api3.freesavevideo.online` in about 5.4 seconds.
- The browser's failure diagnostic recorded HTTP 403 from api3 and
  `queue.fetch.bad_response`. The points hold was released successfully.
- Independent requests from the GKE API container reproduced successful
  extraction at 720p followed by empty HTTP 403 responses for both audio and
  video tunnels. Full GET and initial Range GET both failed.
- A control video (`lW7b8lf7V0U`) returned media bytes from both tunnels on the
  same upstream. These were initial-read checks, not full-file validation.
- One 360p extraction returned a proxy tunnel that supplied media bytes.
  A fresh extraction for a complete download then returned empty HTTP 403.
  Thus 360p is not a verified reliable workaround. No complete successful
  download of the reported video has been validated.
- Responses carried application timing headers and zero-length bodies.
  The precise cause of the source rejection still requires api3 runtime logs;
  cookie expiry, client restrictions and format-specific failures are not
  established by these observations.

## Local recovery fix

`createInternalStream` retains a bound `transplant` callback but does not retain
`originalRequest`. The initial HEAD/Range probe only attempted refresh when
`originalRequest` existed. Consequently an internal stream could fail on an
initial 403 before reaching the chunk reader's existing refresh handling.

The initial probe now invokes the bound callback before its legacy
`originalRequest` fallback, keeping track selection in the parent callback.
The existing three-probe-attempt limit bounds recovery to two refreshes.

Validation: all 12 tests in `internal-probe.test.js`,
`internal-chunks.test.js`, and `internal-range.test.js` passed. Syntax and
diff whitespace checks passed. No production build or deployment was run.

This fixes a confirmed local recovery gap, not a proven root cause or a
validated production resolution for this video. It must reach api3 to test
recovery on the actual media-owning runtime. Deploying only GKE cannot change
the upstream's internal probe behavior.

## Required runtime evidence

On the home desktop running api3, inspect the extraction entries containing
`YiRyHz1FN8I` and the subsequent tunnel/probe failures around 13:22-13:30
Asia/Shanghai. Include yt-dlp candidate format IDs and probe statuses. Redact
cookies, credentials and signed media URL query parameters before sharing.

## Supplied api3 log findings

The supplied `app_2026-10-08_20-42.log` contains the production request
`d944ffa6-6bc4-4a48-8558-9cac3dd7ff45` and the subsequent diagnostic requests.
Its bootstrap filename/date is not the timestamp of every request inside it.

- Lines 4955-4988: the reported production attempt completes extraction in
  about 4.8 seconds, using no cookies and `WEB_EMBEDDED_PLAYER` formats.
- Lines 4989-5004: the subsequent media tunnel probes the Google CDN directly;
  HEAD returns 403, Range GET returns 403 with size zero, then cleanup returns
  403 with zero bytes. No refresh occurs. This establishes the source CDN as
  the rejection point, rather than the public Cloudflare hop or FFmpeg.
- Lines 5526-5534: the earlier 360p request briefly works, then is canceled by
  the diagnostic client. Its abort/502 is not evidence of an FFmpeg crash.
- Lines 5569-5576: a newly extracted 360p URL also fails both probes with 403.
- The log contains repeated successful extractions followed by source 403s.
  Therefore the missing automatic refresh is a real recovery defect, but
  re-extraction alone is not proven sufficient to fix this video.
- Extraction says `cookie=no`, while media probing says `auth: true`.
  The API adds its configured browser cookies to media requests even after
  cookie-free extraction. Whether this mismatch affects this video needs a
  controlled same-URL comparison; the log does not prove it causes the 403.
- Successful extraction stderr/warnings are currently suppressed by
  `--no-warnings` and not logged. The supplied log cannot establish the
  yt-dlp version, available JS runtimes, or challenge solver health.

Next diagnostic on the actual api3 host, using the same yt-dlp executable as
the service (substitute its path if `YTDLP_BIN` is configured):

```sh
yt-dlp --ignore-config --force-ipv4 --verbose --check-formats --simulate -f "299+140/18" "https://www.youtube.com/watch?v=YiRyHz1FN8I"
```

This checks media availability without saving a full video and exposes
runtime/challenge warnings hidden by the current API invocation. If these
formats work through yt-dlp, compare the exact selected URL with API headers,
cookie-free yt-dlp headers, and transport/proxy settings on api3. If they fail
through yt-dlp too, investigate its version, challenge solvers and client
warnings before changing API codec selection or retry policies.

Reference: https://github.com/yt-dlp/yt-dlp/wiki/EJS (JS runtime and solver
requirements). This is diagnostic guidance, not evidence of a missing runtime
on api3.

## Direct yt-dlp format check supplied by the user

On the api3 desktop, the command above selected `299+140` and successfully
downloaded a 10 KiB test sample from each track. It reports nightly
`2026.08.20.234504`, Deno `2.9.5`, bundled EJS `0.8.0`, no proxy and no PO Token
provider. Deno challenge solving ran successfully. This validates small
samples through that command's runtime, not a full video download, nor the
service process's executable/PATH.

The trace also reports unplayable visionOS/tv_downgraded responses and a
20-second skippable ad from web_embedded. Before testing the first media track,
yt-dlp waits five seconds. These are diagnostic clues, not proof of a timing
or ad-related cause.

`api/scripts/diagnose-youtube-media.mjs` compares the same freshly extracted
format URLs using extractor headers, API headers without cookies, and API
headers with a configured browser cookie. The comparisons run together,
then repeat once at least five seconds after extraction. Output includes
only format IDs, hostnames, statuses, byte counts and timing; it omits cookie
values and signed URLs. It performs bounded Range GETs and saves no media.
Run it from `api/` on the media-owning host under the service's account and
environment. It honors `YTDLP_BIN` and prints the selected version. Syntax
and whitespace checks passed; it has not been run on api3 by the agent.

```sh
node scripts/diagnose-youtube-media.mjs YiRyHz1FN8I
```

If yt-dlp headers work while API headers fail at comparable URL ages, change
header propagation based on that evidence. If only delayed probes work,
investigate the downloader wait requirement. If all Node probes fail but
yt-dlp's direct format check works, compare transport and runtime identity.
Do not automatically add a universal sleep, replace codecs or disable all
cookies based solely on the successful command.

## Same-URL timing result and implementation

The user ran the diagnostic on api3 with Node `v22.22.0` and yt-dlp
`2026.08.20.234504`. Only format `18` was present among the three requested
format IDs in that extraction. All three header profiles returned empty
403s immediately (URL age 2-23 ms). The same URLs returned 206 and exactly
10,240 bytes after five seconds with every profile, including the configured
cookie. This directly isolates availability timing for that sample. It does
not validate a complete 360p download or the missing 299/140 tracks.

yt-dlp sets per-format `available_at` for pre-playback waiting and its
downloader waits for the maximum timestamp among requested formats:

- https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/extractor/youtube/_video.py
- https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/downloader/common.py

The YouTube service now waits until the latest `available_at` of its selected
media URLs before returning a download result. Matching by exact selected URL
avoids delaying downloads for an unused format/client. Missing, invalid and
elapsed timestamps add no wait. The same service path is used for refreshing
URLs, so a new pre-playback deadline is honored after re-extraction too.
Waits exceeding the remaining 45-second service budget return the existing
`youtube.timeout` error instead of sleeping indefinitely. The wait stage is
logged without signed URLs or cookies.

This wait is inside the extraction API response, not a browser timer. Requests
with an advertised wait take longer to return; production forwarding currently
has a 20-second header timeout, so unusually long advertised waits can still
hit that upstream limit. The observed five-second wait fits the measured
roughly five-second extraction plus existing forwarding limit. No timeout
configuration was changed.

Validation: 27 tests passed across YouTube selection, availability, initial
probe recovery, chunk recovery and real HTTP range suites. Syntax and
whitespace checks passed. No production build or deployment was performed.

Update api3's `src/processing/services/youtube.js`, add
`src/processing/youtube-availability.js`, update `src/stream/internal.js`, and
restart its API process. Then validate a full browser download and, when
available, both 299/140 media tracks. The patch is locally verified; production
resolution is still pending that deployment and download verification.
