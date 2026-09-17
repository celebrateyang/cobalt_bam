# Xinpianchang downloads

Supported work URLs: `https://www.xinpianchang.com/a13690233` and the bare domain equivalent.

## API

The native extractor reads `__NEXT_DATA__.props.pageProps.detail.video`, obtains
`vid` and `appKey`, then requests the site's media endpoint. It selects an available
progressive MP4 by requested height. Media URLs must use HTTPS on `xpccdn.com`.
The API probes the MP4 header before returning a server tunnel, preserving the
work-page Referer and requesting `Range: bytes=0-`. No yt-dlp is used.

Verification challenges and page/media HTTP 403 or 429 return
`error.api.xinpianchang.browser_required`. The web downloader displays a dedicated
extension dialog with the extension name, store link, and source work link.
Missing/deleted works and ordinary extraction errors retain ordinary error handling.

## Extension (0.1.9)

Open the work, complete the site verification manually, play the video, then click
FreeSaveVideo Downloader. The adapter finds loaded MP4 resources through the
existing DOM and performance scanner. The extension does not automate verification.

The downloader installs a temporary session rule for the exact selected resource
URL to set its source Referer. It probes the file with `Range: bytes=0-31` and
checks the `ftyp` header before starting a Chrome download with `Range: bytes=0-`.
The rule is removed when the download completes or is interrupted. Signed query
parameters remain unchanged. Expired links require playback and a fresh scan.

The new header behavior requires `declarativeNetRequestWithHostAccess` and scoped
Xinpianchang/CDN host permissions. The currently published extension must be updated
before this flow is available to users installing from the store.

The initial implementation targets progressive MP4. It does not merge DASH/HLS
streams or promise original uploads or unavailable resolutions. A successful
download initiation is displayed as `Started`, rather than claiming completion.

## Validation

From the repo root, set `API_URL=http://127.0.0.1:9000/` for API tunnel tests, then:

```text
node --test api/src/processing/services/xinpianchang.test.js api/src/processing/xinpianchang-url.test.js api/src/processing/match-action.test.js api/src/stream/proxy.test.js
node --experimental-vm-modules --test extension/src/downloader/xinpianchang.test.mjs
pnpm -C extension typecheck
pnpm -C web check
pnpm -C web i18n:check-encoding
pnpm -C web i18n:check-completeness
```

Before release, run the updated extension in Chrome against a fresh work-page
resource. Confirm the saved video has audio and plays to the end. The signed sample
was downloaded with native Python during research; the actual Chrome rule/download
flow still needs a browser smoke test. Production builds remain user-owned.
