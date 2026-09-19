# Video Agent Task 8: short-clip dubbing

Task 8 adds one fixed-voice dub for each selected short clip. It does not dub a full source video, clone voices, synchronize lips or edit multiple audio tracks. Subtitle translation without an explicit dubbing request continues to retain the original audio and existing subtitle graph.

## Rollout and dependencies

1. Task 8-1 established the bounded TTS adapter and configured price contract. See [Task 8-1](video-agent-task8-1.md).
2. Task 8-2 adds explicit opt-in plan validation, Planner intent, Run admission, a separate server-compiled dub DAG and a disabled-by-default feature flag.
3. Task 8-3 prepares selected translated text, reserves characters and estimated micro-USD in a durable checkpoint before each provider call, and stores verified MP3 assets. Failed or lost calls consume the attempt budget. A project is limited to ten dub Runs per UTC day.
4. Task 8-4 probes each TTS asset, refuses a required speed above 1.3, fits speed within 0.9-1.3, pads silence, measures duration and volume, creates subtitles from spoken text, then replaces the original track in the vertical MP4. A long script fails with an actionable error for user revision; it is never forced past the speed limit. Subtitle timing is marked estimated.
5. Task 8-5 publishes authenticated dub WAV preview/download, dub SRT/VTT, MP4 and fit measurements. The web plan shows the fixed voice, estimated maximum characters, audio time and USD; the result panel provides audio listening and downloads, including a JSON fit report. All eleven existing locale files include the new controls and stage labels.

## Configuration

The API and Video Agent Worker share `VIDEO_AGENT_DUBBING_ENABLED`, `VIDEO_AGENT_TTS_VOICE`, `VIDEO_AGENT_TTS_MAX_RUN_CHARS`, `VIDEO_AGENT_TTS_MAX_RUN_AUDIO_MS`, `VIDEO_AGENT_MAX_RUN_COST_MICRO_USD` and `VIDEO_AGENT_TTS_MICRO_USD_PER_MILLION_CHARS`. Monetary values are integer micro-USD. The Helm flag defaults to false and both monetary values default to zero. Set the actual contracted rate and cost cap before enabling; incomplete settings fail closed. The existing OpenAI key and optional compatible base URL are reused. No new provider dependency was added.

## Verification and limits

The TTS and dub tests use injected providers; the dub test generates local MP3 with FFmpeg and verifies fitted duration and subtitles. A separate media test renders a full short MP4, verifies its audio/video streams and measures the replacement tone. Worker HTTP tests cover authenticated dub WAV delivery and cross-user denial. Existing execution, Planner and delivery tests protect the original workflow. A live provider request, production build, deployment and real GCS delivery are not performed by these tests. The operator should verify the configured TTS endpoint, price and voice in a controlled environment before enabling the Helm flag.
