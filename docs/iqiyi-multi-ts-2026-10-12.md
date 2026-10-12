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

## Follow-up: silent playback after deployment

The extraction patch was deployed, and request
`247e8137-590d-42af-985e-6ae3c5249902` successfully entered the server remux path.
The user reported silent playback of the downloaded file.

The production muxer uses `faststart+frag_keyframe+empty_moov` and streams MP4
through `pipe:3`. Unlike the ordinary MP4 used in the original local validation,
this writes the initial header before `aac_adtstoasc` has generated AAC
AudioSpecificConfig. An isolated production-container comparison of the same
60-second source showed:

| Output | AAC profile | Decoder configuration | Mean volume |
| --- | --- | --- | --- |
| Current fragmented MP4 | -1 (unknown) | Missing | -17.0 dB |
| Fragmented MP4 with `delay_moov` | LC | 2 bytes | -17.0 dB |
| Ordinary MP4 | LC | 2 bytes | -17.0 dB |

FFmpeg can decode the original fragmented output despite the missing header
configuration, so decode-only validation did not catch this player compatibility
defect. The user's exact downloaded artifact was not inspected.

Add `delay_moov` to iQIYI MP4 video downloads with audio. This delays the initial
header until the first fragment, allowing AAC configuration to be included while
keeping stream-copy processing. Other services and mute mode retain their flags.
See [FFmpeg MOV/MP4 muxer documentation](https://ffmpeg.org/ffmpeg-formats.html#mov_002c-mp4_002c-ismv).

Validation of the follow-up:

- 56 targeted tests passed locally, including a generated MPEG-TS -> streaming
  MP4 test asserting AAC configuration, profile, and non-silent decoded audio.
- The same regression test passed in an isolated production-container process
  with the proposed flag selector, without changing the running service.
- A complete seven-object remux with production Linux FFmpeg and `pipe:3`
  produced a 387217118-byte MP4, duration 2757.044535 seconds, AAC-LC with 2-byte
  decoder configuration. Ten-second audio samples at 0, 1380, and 2740 seconds
  decoded without errors, with mean volume -16.2, -16.1, and -18.0 dB respectively.
- The source's end-of-stream PES warning remains. This change addresses missing
  audio header configuration, not damaged source packets.
- The follow-up parameter fix has not been deployed. Browser playback and the
  user's original downloaded file still require verification after deployment.
