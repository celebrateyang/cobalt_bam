# Task 4-2: durable chunk transcription

The production registry now implements `probe -> chunk -> transcribe`. It reuses
the existing Highlight Studio OpenAI client, key, base URL, model and timeout;
the original Studio pipeline keeps its existing behavior. No new database
migration or provider account is required. Full run admission remains closed
until the remaining pipeline handlers are implemented.

## Provider and configuration

`AI_VIDEO_TRANSCRIPTION_MODEL` / `AI_VIDEO_TRANSCRIBE_MODEL` selects the existing
model (default `gpt-4o-transcribe-diarize`). The adapter supports that model with
`diarized_json` and `chunking_strategy=auto`, or `whisper-1` with `verbose_json`
and segment/word timestamps. Unsupported models or a missing existing key exclude
transcription from the available Worker registry, preventing claims and quota
settlement for an unconfigured service.

See the [official speech-to-text guide](https://developers.openai.com/api/docs/guides/speech-to-text).

Model, endpoint fingerprint, model revision, merge version and source language
participate in the transcription input hash. API and Worker Helm templates share
these settings; `videoAgent.asr.modelRevision` can invalidate results after a
provider-side model update. Credentials and the endpoint itself are not stored
in checkpoints. A runtime configuration mismatch fails rather than silently
running a different model from the immutable plan.

## Durable artifacts and recovery

For each verified WAV chunk, transcription saves the complete response and request
ID as an `asr_raw` asset before interpreting timestamps. A fenced checkpoint
commit marks it ready and records its reference. A separate `transcript` asset
holds the normalized chunk. The final transcript references every raw response.
JSON artifacts are capped at 8 MiB; ordinary checkpoints retain their 1 MiB cap.
Existing ownership, dependency, generation, size, SHA-256 and TTL checks apply.

Automatic retries within the same Run reuse durable raw results. A failure after
raw persistence can rebuild normalized output without another provider call.
Missing or invalid raw artifacts fail explicitly instead of silently making
another paid request. Manual Run retries reuse succeeded stages; partial failed
stage checkpoints are not copied into the new Run. A provider response lost
before its checkpoint commits can still require another external request;
external billing cannot be guaranteed exactly once.

SDK retries are disabled. Worker retry policy handles 429, transient connection
errors, timeouts and 5xx, respecting Retry-After. AbortSignal cancels requests and
body reads. The chunk file is deleted after the request; scratch space is checked
for one chunk plus 64 MiB headroom. Response streaming has a bounded byte count.

Internal paid-operation reuse additionally requires an identical transcription
input hash. Changing the model/configuration creates a fresh quota reservation;
retrying identical work does not repeat an already committed internal charge.

## Timeline contract

Local ASR times are mapped using each chunk's actual `processingStartMs`.
Word midpoints determine ownership; retained boundaries are clipped to the
ownership window and tagged when clipped. Adjacent chunk duplicates require
matching text and overlapping original ASR times. Intentional repeated words
with separate timestamps remain intact. IDs derive from source/config/chunk
identity, and speaker IDs are scoped to the chunk rather than pretending to
identify one speaker consistently across independent requests.

Provider word timing is preserved when valid and aligned with segment text.
Otherwise segment timing is divided by text weight and marked
`timingQuality=estimated`; mismatched word text is explicitly flagged. This is
an estimate, not forced alignment. The default diarization model uses this
fallback. Invalid times, oversized output and an empty final transcript fail
with specific errors. Subtitle cue generation and Whisper post-processing
remain Task 4-3.

## Validation and rollout

Run `pnpm -C api test:video-agent` for all Agent checks, or
`pnpm -C api test:video-agent-transcribe` for transcription, Worker and admission.
Tests use injected providers or a local HTTP endpoint with a dummy key. They cover
real multipart requests, model-specific parameters, bounded response size,
timeouts, cancellation, boundary deduplication, estimated timing, stable IDs,
configuration invalidation and quota behavior. Real FFmpeg integration uses a
620-second fixture and resumes across rate limiting and an interruption after
raw persistence, retaining the first raw asset and avoiding repeated saved work.

No live paid transcription, production build or deployment was performed.
Validation completed: all 38 Agent tests and 15 legacy Studio tests passed;
27 JavaScript syntax checks, Helm lint with deployment configuration placeholders,
UTF-8 document checks and `git diff --check` passed.
Keep execution admission and the execution Worker disabled until Tasks 4-3,
5 and 6 finish the remaining pipeline. This stage does not produce playable clips.
