# Generic download reliability

Sites without a dedicated adapter use HTML probing followed by yt-dlp metadata
extraction. A supported yt-dlp extractor does not guarantee that a site's media
is publicly accessible from the server or browser.

## Delivery

- Progressive media needing Cookie, Authorization, Referer or Origin headers
  uses a server proxy. Header-free progressive media keeps direct delivery.
- Generic HLS uses the system FFmpeg on Linux and localhost internal tunnels,
  avoiding recursive requests through the public API and CDN.
- Playlist variants, media segments, initialization maps and AES key requests
  retain source headers. Temporary HTTP/network failures retry before any bytes
  are forwarded, up to three attempts per internal request.
- Generic FFmpeg responses finish only after its process exits successfully and
  has emitted bytes. Failed transfers after output begins destroy the HTTP
  connection so fetch clients see a failed body rather than a successful EOF.
- A video remux/merge failing before output begins falls back once to a fresh
  yt-dlp extraction and native HLS download on the same server. Unavailable
  fragments abort that download. A completed, nonempty file with a video stream
  is required before delivery. Audio-only, muted and GIF conversions do not use
  this fallback, to avoid changing the requested output.

## Resource limits and tradeoffs

FFmpeg stalls are terminated after 45 seconds without output. The fallback has
a 90-second download limit, shortened to fit the remaining 110-second response
preparation budget. Video validation may take up to 10 seconds. Its output is
limited to 1 GiB; temporary input plus remux output is monitored with a 2 GiB
budget. Two fallback files may be downloading or awaiting delivery per worker.
Files are removed after delivery, failure, timeout or client cancellation.

Fallback delivery waits for the full file, unlike normal FFmpeg streaming. It
therefore cannot recover every large/slow transfer or platform restriction.
An interrupted streaming transfer is failed explicitly; it cannot be replaced
with another file inside the same response after bytes have been sent.

The deployment image must contain `/usr/bin/ffmpeg`, `/usr/bin/ffprobe` and
yt-dlp. The repository Dockerfile installs them. Windows uses the packaged
FFmpeg/FFprobe binaries.

## Targeted checks

Set `API_URL=https://api.example.com/` when running from the repository root
without loading `api/.env`, then run:

```sh
node --test api/src/stream/generic-render.test.js api/src/stream/generic-download.test.js api/src/stream/internal-hls.test.js api/src/stream/ffmpeg.test.js api/src/stream/manage.test.js api/src/processing/match-action.test.js api/src/processing/generic/yt-dlp.test.js
```

Production Youku investigation: yt-dlp extracted format `h4-1` (720p), while
the static FFmpeg process exited with SIGSEGV and zero output. A separate system
FFmpeg probe on the API pod successfully produced a three-second MP4 sample.
A local native yt-dlp download of the reported link produced 91,055,538 bytes;
FFprobe found 960x720 video, audio and a duration of 605.605 seconds. These probes
do not constitute deployment or a full production end-to-end verification.
