# Vimeo download investigation (2026-10-14)

Reported URL: https://vimeo.com/1230890961

## Verified results

- Production logs show `fetch.empty`, followed by HTTP 530 from both global
  upstreams. A second attempt encountered open upstream circuits.
- Vimeo oEmbed returns public metadata (191 seconds). Its public API reports
  `privacy.view=anybody`, `privacy.embed=public`, and `privacy.download=true`.
- The player returns HTTP 401 with a connection-security verification page
  from both the local connection and an isolated process in the production pod.
  The config endpoint returns HTTP 403 locally. The player hash exposed in
  the public page metadata did not resolve the local failure.
- Without cookies, yt-dlp 2026.08.19 reports that its web client requires login.
  With the production cookie, it reports `No video formats found`.
- Both local and production configured Vimeo cookies yield an empty `user`
  from `https://vimeo.com/_next/viewer`; neither establishes a logged-in session.
- The anonymous web API returns metadata but no media URLs/config URL.

## Code changes and validation

The player progressive fallback passed `url`/`quality` objects to a helper
that only understood the API's `link`/`rendition` fields. It could throw on
an empty filtered array, or fail to select media. Both shapes are now
supported, with safe fallback when no playable rendition exists. Player
progressive files also respect the existing duration limit.

Failure logs now distinguish yt-dlp login/access/no-format failures and
record the player's failed HTTP status without exposing signed URLs/cookies.

Validation: `pnpm -C api exec node --test src/processing/services/vimeo.test.js`
(four tests passed), plus `git diff --check`.

At the end of the initial investigation, these changes had not been deployed
and the reported video had **not** been successfully downloaded.
Restoring an authenticated Vimeo session and
retesting player access from the actual download server are the next steps;
a fresh cookie alone is not proven to resolve the connection-security check.
