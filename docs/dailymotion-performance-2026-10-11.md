# Dailymotion download performance measurement

Date: 2026-10-11 (Asia/Shanghai). Video: `https://www.dailymotion.com/video/xbdiup6`.

## Scope and method

Tests ran in the production GKE API container, pod `cobalt-cobalt-chart-5cfd7cd947-lhk62`, after inspecting current pods and the last 30 minutes of logs. The selected production executable was verified as `/usr/bin/ffmpeg`. The deployed source retains the Dailymotion HLS audio exception that requests AAC encoding.

The production Dailymotion extractor was imported directly, without sending a user download request, reserving points, or changing live application configuration. Tests used the extracted video/audio HLS playlists and the system FFmpeg binary. No signed media URLs or credentials are recorded here.

The first test used 300 seconds of source media. It downloaded the original H.264/AAC streams into a temporary fragmented MP4, then processed the same local media with either stream copy or AAC encoding. A separate remote AAC test approximated the current processing branch. The full-video tests explicitly selected the HLS demuxer, copied video, and compared AAC encoding with audio stream copy; each run had a 180-second wall-clock limit. Full-video outputs went to `/dev/null` to exclude client backpressure and avoid keeping large files.

These are controlled server benchmarks, not complete authenticated API/browser downloads. They exclude user authentication, points processing, browser network transport, and device saving. Source fetching and FFmpeg processing overlap; do not add remote and local timings as if they were independent sequential stages. The `firstMediaProgressMs` metric is the first positive FFmpeg media-time progress report, not HTTP time to first byte.

## Five-minute sample results

The selected source was 848x480, with a declared duration of 3933 seconds. Extraction took 326 ms in the instrumented sample (other cold-process measurements: 409 and 446 ms). OAuth, GraphQL and master-manifest response headers took 190, 38 and 83 ms respectively in that sample; the extraction total also includes response body reading and parsing.

| Test | Wall time | Output size | Meaning |
| --- | ---: | ---: | --- |
| Remote source, video/audio copy | 4.488 s | 30,450,168 bytes | Source retrieval plus inexpensive remux |
| Local source, video/audio copy | 0.333 s | 30,408,849 bytes | Container processing with source network excluded |
| Local source, video copy + AAC encoding | 8.854 s | 30,499,615 bytes | Current audio policy with source network excluded |
| Remote source, video copy + AAC encoding | 9.677 s | 30,540,676 bytes | Source retrieval and encoding running together |

All four sample runs exited with code 0. `ffprobe` confirmed that the copied source sample contained H.264 video at 848x480 and AAC audio at 44.1 kHz, stereo; container duration was 300.24 seconds. This is codec/container metadata validation, not a listening test.

The local AAC run accumulated roughly 27 times as many sampled process CPU ticks as local copy (823 vs 30); the CPU samples are approximate and are not exact process resource accounting. This supports CPU work as an explanation for the local timing difference. Only one sample of each variant was measured; filesystem/CDN cache and ordering can affect timings.

## Full-video results

The full-video extractor took 409 ms. Both variants used the same extracted playlist URLs, system executable and fragmented MP4 output options, with no real client receiver. Video was copied in both variants.

| Test | Wall time | Reported output bytes | Final media time | Exit |
| --- | ---: | ---: | ---: | --- |
| Current AAC encoding policy | 164.699 s | 410,955,877 | 3932.554739 s | 0 |
| Audio stream copy | 22.335 s | 409,705,592 | 3932.554739 s | 0 |

The observed processing-time ratio was approximately 7.37. The copy variant ran second, so CDN warming and ordinary run-to-run CPU/network variability may contribute to the difference. This is not a guaranteed production speedup. The controlled local sample independently shows that AAC encoding adds substantial CPU work even when source networking is excluded. Full-run sampled CPU ticks were 11984 for AAC and 524 for copy.

Both full runs completed before the deadline. The first positive media-time progress reports were at 1.805 and 1.501 seconds respectively; these do not measure browser first-byte latency. Full outputs were discarded, so their complete saved-file validity, seeking, audio/video sync and playback were not checked. The source sample was checked with ffprobe as described above. Temporary pod files were removed.

## Interpretation

Extraction was sub-second. For this source and this server, pure local remux was fast, while unnecessary AAC-to-AAC encoding was a substantial cost in the sample. The current implementation first requests audio copy and then overrides it with AAC encoding for Dailymotion through `hlsExceptions`; this is the concrete code path to investigate.

Do not remove AAC encoding for all HLS services. Before changing the Dailymotion exception, validate stream-copy output across representative Dailymotion videos, full duration, audio/video sync, seeking and target browsers/devices. This investigation does not yet change the production codec policy.

Preparing a file before user delivery does not by itself eliminate the observed audio encoding cost. Avoiding unnecessary encoding is a separate optimization that can benefit either streamed delivery or preprepared files.

## User download follow-up

The user subsequently downloaded the same video through the live website and reported:

- Submit to download start: a little over 2 seconds.
- Download start to completion: approximately 2 minutes 10 seconds (130 seconds).
- Saved file size: 391.92 M as displayed by the user's client.
- The saved file played normally, according to the user.

Production logs for this request confirmed `status=tunnel`, `service=dailymotion`, successful HTTP 200, downloader-handler time 319 ms and total application response time 329 ms. The expansion request returned a single item in 0 ms. These logs describe metadata response time, not the full media transfer duration.

The controlled current-policy output size, 410955877 bytes, is approximately 391.918 MiB, which matches the user's rounded 391.92 display if that client uses binary units. This supports the reported download following the measured current-policy path; the saved file was not directly inspected or hashed by the agent.

The roughly 130-second real download is in the same range as the 164.699-second controlled current-policy run. The independent runs had different network/cache/CPU conditions, and encoding overlaps transmission. Their durations must not be subtracted to estimate client network overhead. Together with the local CPU comparison and the 22.335-second full stream-copy run, this supports AAC re-encoding as a major server bottleneck. It does not prove that client transfer adds no limitation or that an optimized real download will take 22 seconds.

Prioritize validating Dailymotion AAC stream copy before changing the delivery architecture. Then repeat the same live download to measure actual improvement; if necessary, capture request host, first downloaded byte and byte progress to isolate remaining transfer limits. No production codec policy was changed during this investigation.

An initial review of recent production logs did not find this specific Dailymotion request in the inspected window; the subsequent live request was found as described above. Normal success logs do not provide all of the tunnel-processing and client-transfer timings needed for instrumented end-to-end measurement. Direct extractor invocation also bypassed normal API request handling. The controlled 164.699-second result is therefore a server-processing baseline, and the approximately 130-second browser duration is a separate user observation.

## Implemented optimization and validation

The user authorized optimization after reviewing these measurements. The local implementation now carries the selected manifest's audio codec from `dailymotion.js` through `match-action.js` and the encrypted stream data in `manage.js` to the FFmpeg policy in `ffmpeg.js`.

For Dailymotion MP4 video output only, when the selected variant explicitly advertises `mp4a.40.2` (AAC-LC), the HLS audio override selects `-c:a copy -bsf:a aac_adtstoasc`. Unknown codecs, other AAC profiles, other containers and other services retain the previous audio encoding policy. Muted downloads do not get an audio override; audio-only conversion is unchanged. Linux HLS still selects system FFmpeg. The selected source for `xbdiup6` advertised `mp4a.40.2,avc1.64001f`.

Targeted tests cover codec propagation through real tunnel creation/verification, known versus unknown codec behavior, mute/container restrictions and preservation of the other service workarounds. All 59 tests passed:

```sh
cd api
node --test src/stream/ffmpeg.test.js src/processing/services/dailymotion.test.js src/processing/match-action.test.js src/stream/manage.test.js src/stream/internal-hls.test.js src/stream/generic-render.test.js src/stream/generic-download.test.js
```

The modified extractor and FFmpeg module were evaluated in an isolated process inside the production container, with dependency imports resolved to existing deployed modules. The actual modified `remux` function wrote a temporary full MP4 through its normal output pipe. This did not replace files used by the live application or deploy the patch. Local tests separately verified codec propagation through the modified tunnel serializer.

Validation results:

- Extraction: 420 ms; selected audio policy was stream copy.
- Full modified remux: 14.469 seconds; saved temporary MP4 size 409705707 bytes.
- ffprobe: H.264 848x480 video, AAC 44.1 kHz stereo audio, overall duration 3932.674739 seconds.
- Output stream start times: video 0.120000 s, audio 0.000000 s; durations 3932.520000 and 3932.674739 s. Independent input probes showed video starting at 0 s and audio at -0.046440 s. Timestamp inspection alone does not prove perceptual lip sync.
- Entire audio track decoded with exit 0 and no error-level diagnostics in 5.213 seconds.
- Ten-second audio/video decode samples at 0, 1960 and 3910 seconds all exited 0 with no error-level diagnostics; these checks also exercised seeking near the middle and end.
- The temporary output and working directory were removed.

The 14.469-second observation was another independent run and is not a promised browser download time. It confirms that the modified processing code can produce a complete decodable file for this source. Subjective playback/sync across target devices and additional source profiles remain broader compatibility checks. Changes are local and have not been deployed; repeat the user's live download after normal API deployment to measure the actual user benefit. No production build was run.
