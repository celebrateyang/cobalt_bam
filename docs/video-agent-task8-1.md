# Video Agent Task 8-1: fixed-voice TTS foundation

This is the first independently testable part of the short-clip dubbing increment. It adds a TTS adapter and explicit per-run cost limits. It does not enable dubbing in plans, the Planner, the Worker graph, the result API or the web UI. The existing original-audio and subtitle paths remain active.

## Existing capability and integration boundary

- Highlight Studio and Video Agent already use the OpenAI client configured by `OPENAI_API_KEY` and optional `OPENAI_BASE_URL` / `AI_VIDEO_OPENAI_BASE_URL`. Video Agent has separate ASR and translation adapters, plus verified audio artifacts and FFmpeg rendering. There was no TTS call or dubbing Worker stage.
- The new adapter reuses that client. Its only supported model in this increment is `tts-1`, MP3 output and one configured voice. A custom OpenAI-compatible base URL must support the same speech endpoint and format before it can be used.
- Plans still reject `dubbing.enabled: true`, the Planner still reports dubbing as unsupported, and `dubbingEnabled` remains false. No paid TTS request can be triggered by a user Run in Task 8-1.

## Adapter contract

`tts-config.js` returns the fixed voice and required upper bounds only when `VIDEO_AGENT_DUBBING_ENABLED=1` and the provider key and all budget settings exist. The flag alone does not open the product flow.

Required configuration for the future enabled flow:

| Variable | Unit | Purpose |
| --- | --- | --- |
| `VIDEO_AGENT_TTS_MAX_RUN_CHARS` | Unicode characters | Maximum generated speech text in one Run, up to 20,000 |
| `VIDEO_AGENT_TTS_MAX_RUN_AUDIO_MS` | milliseconds | Maximum assembled dub duration in one Run, up to 450,000 |
| `VIDEO_AGENT_MAX_RUN_COST_MICRO_USD` | micro-USD | Maximum estimated TTS cost in one Run |
| `VIDEO_AGENT_TTS_MICRO_USD_PER_MILLION_CHARS` | micro-USD per million Unicode characters | Explicit rate for the configured provider contract |
| `VIDEO_AGENT_TTS_VOICE` | voice ID | One of `alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer`; defaults to `alloy` |
| `VIDEO_AGENT_TTS_TIMEOUT_MS` | milliseconds | Optional call timeout, defaults to 180,000 |

The adapter exposes capabilities, estimates the configured rate and synthesizes one text span. A request is rejected before contacting the provider unless the caller supplies remaining Run characters and micro-USD that cover the estimate. It limits a span to 4,096 Unicode characters and 8 KiB UTF-8, disables SDK retries, supports cancellation, bounds output at 16 MiB, rejects empty or unrecognized MP3 headers, and returns safe request metadata for a later Worker checkpoint. The caller must persist remaining balances across spans and attempts; that enforcement belongs to Task 8-3. FFprobe duration and audio validity checks belong to Task 8-4. Estimates are cost guards, not a claim that provider billing will equal the estimate.

## Dependency and rollout sequence

1. **8-1 — TTS foundation:** this adapter, fixed voice and fail-closed configuration. Acceptance: no provider call on invalid voice, text, budget or disabled config; bounded valid audio and retry metadata on an injected provider.
2. **8-2 — Opt-in plan and admission:** recognize explicit dubbing requests, validate target language and voice, display the character/duration estimate, enforce the feature flag and budgets at Run admission, and compile dubbing-only stages. Existing plans keep the original DAG.
3. **8-3 — Dub text and generated audio:** derive `spokenText` from selected translated cues, retain `translatedText`, track aggregate TTS characters/cost durably across retries, synthesize and verify per-clip audio artifacts.
4. **8-4 — Timing, subtitles and render:** measure audio with ffprobe, fit within bounded speed (hard stop above 1.3), add silence, build subtitles from spoken text, replace the original audio track and verify the final MP4. No full-video dubbing, voice cloning, lip sync or complex multitrack editing.
5. **8-5 — Delivery and acceptance:** expose authenticated audio preview, dub MP3, dub SRT/VTT, final MP4 and fit report; test cancellation, retry, cost bounds and original-audio regression. Enable the production flag only after the complete path and configured provider pricing are verified.

## Verification

`node --test src/video-agent/tts.test.js` uses an injected provider and makes no network calls. Production builds and live provider calls are not part of this increment.
