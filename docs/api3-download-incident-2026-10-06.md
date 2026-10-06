# API3 download investigation, 2026-10-06

Times below are Asia/Shanghai. The supplied files are named after startup on
September 26, but include the October 6 incidents.

## Confirmed media-origin failure

Request `67843671-2828-44de-a3f8-6f9b4202c7c2`, submitted at 06:07:22,
extracted `htFyaiMAdYM` successfully in 3003 ms. In the app log:

- Lines 97688-97690: extraction returned HTTP 200 / local-processing.
- Lines 97691-97888: tunnel `kpAPg1Kc--NHbzeNzLliY` retried the same media
  source 11 times. HEAD returned 403, a one-byte Range probe returned 206,
  but the actual media chunk returned 403 with zero bytes. API3 returned 502.
- Reducing the browser Range from 8 MiB to 1 MiB did not resolve it.

This establishes a failure on API3's media-origin requests, independently of
Cloudflare connector warnings. It does not establish why YouTube denied the
larger request or guarantee that re-extraction will obtain a working URL.

The code's chunk recovery required `streamInfo.originalRequest`, but
`createInternalStream` only stores the bound `transplant` callback. Therefore
this branch was skipped for normal internal streams. The fix uses that callback
directly, preserving the parent's track selection and the generator byte offset.
There are at most four refresh attempts. Non-200/206 responses are discarded
rather than forwarded as media. No schema or environment changes are needed.

Validation: `node --test api/src/stream/internal-chunks.test.js
api/src/stream/proxy.test.js` (8 tests), plus `node --check
api/src/stream/internal.js`. These tests simulate CDN responses; production
recovery must still be verified after API3 runs the updated code.

## Unresolved browser stall

Request `9f000787-179d-42c7-9993-67e696c1034d`, submitted at 02:19:44,
extracted `whT-1UQbxi0` successfully in 3023 ms. App log lines 95626-95644
show audio tunnel `XrfT5l8RrBbn1XGqm1M0W` finishing in 696 ms with all
1,460,056 bytes. This proves server-side completion of that audio response,
not delivery to the browser or completion of the whole video. No second
tunnel open for that client is visible before its next extraction request.

The browser reported a stalled fetch at 02:24:05. The application logs lack
per-line wall-clock timestamps and a request-to-track tunnel mapping, so they
cannot identify precisely where this browser request stopped making progress.
No matching Cloudflare per-request failure was found in 02:18-02:26.

## Cloudflare connector health

The supplied Cloudflare log shows repeated QUIC connector failures on
`connIndex=3` in both incident windows. Other connection indices have registered
connections; one unhealthy connector does not prove the entire tunnel was down.
At 02:39:07, index 2 also reports `timeout: no recent network activity` and
re-registers at 02:39:30, outside the original stalled-fetch window.

On the API3 computer, test the existing tunnel configuration with root-level
`protocol: http2`, using its existing launcher and configuration file
`D:\scripts\cloudflared\config.yml`. Verify registrations report `protocol=http2`
and compare reconnects, media download completion and throughput. Revert to
the original protocol if there is no improvement. This is an operational
comparison, not a remotely applied change or a guaranteed CDN-403 fix.

Cloudflare documents the [protocol option](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/run-parameters/)
and [port requirements](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/tunnel-with-firewall/):
QUIC uses UDP 7844; HTTP/2 uses TCP 7844.

## Rollout and verification

The backend change is local and has not been deployed. API3 must run the updated
repository code; deploying GKE alone cannot change API3's origin stream handler.
After updating API3, retest the affected video and confirm the log contains
`Chunk forbidden; refreshing stream` if a CDN 403 recurs, followed by media
bytes or a bounded failure. Retain the application and connector logs around
the same request to assess recovery. The existing YouTube-page confirmation
dialog change in `web/src/lib/api/saving-handler.ts` is a separate pending edit.
