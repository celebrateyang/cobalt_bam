# iQIYI mainland multi-object extraction failure (2026-10-12)

## Incident

- Reported URL: https://www.iqiyi.com/v_1jm50v4hx7c.html
- Decoded tvid: `5739997997499700`.
- Production request `70e1f4aa-bdcc-403b-b41f-25a4d2aa7baa` returned HTTP 400,
  `error.api.fetch.empty`, with `points_outcome=skipped`.
- A read-only probe inside the production API container reproduced the empty
  extraction. The accelerator returned `A00000`, a 2757-second program, and a
  complete 720p playlist spanning seven progressive TS objects.

## Cause and fix

The mainland selector only accepted a single progressive TS object or legacy
F4V fragments. This playlist contains multiple TS object paths and an empty
`fs` array, so neither existing candidate route accepted it.

Reuse the international playlist validator for mainland multi-object playlists,
preserving its duration, contiguous byte-range, CDN, end-list, and encryption
checks. Pass `iqiyiTsConcat` and browser headers to the existing server remux
flow. Keep the single-object and legacy fragment routes.

## Validation and limits

- 55 targeted tests passed: extractor, URL recognition, match-action, and FFmpeg.
- Local extraction returned all seven objects. Serial Node fetching and FFmpeg
  stream-copy remux completed in 47.136 seconds.
- The resulting MP4 was 388214919 bytes, with H.264 video (1280x536), AAC audio,
  and a duration of 2757.045 seconds.
- FFmpeg reported a TS PES/packet warning near the end of the source. Full audio
  decoding reported one AAC `Input buffer exhausted before END element found`
  error. Ten-second A/V decode samples at 360, 1380, and 2740 seconds completed
  without decode errors. The extraction fix does not repair source packet damage.
- This is local full-file validation and production extraction diagnosis; the
  patch has not been deployed and browser download has not been validated.
