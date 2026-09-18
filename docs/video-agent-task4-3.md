# Task 4-3: source subtitle normalization

The production registry now includes `normalize` after transcription. It reads
the owned, SHA-verified `transcript` dependency and writes a separate typed
`normalized-transcript-v1` artifact. Original segments and raw ASR assets remain
available. The checkpoint exposes `normalizedTranscriptRef`, `cueCount`,
`timingQuality` and `requiresReview` for downstream clip selection and translation.
No database migration or external model call is needed.

## Cue contract

Each cue contains a stable ID derived from source checksum, normalization config
and word IDs; source text; display lines; start/end milliseconds; word and segment
provenance; chunk-scoped speaker ID; timing quality; and review flags. The original
segment IDs remain available. Translate/render stages must use cue IDs rather
than array positions. The config version participates in the `normalize` input
hash, invalidating only normalization and its downstream stages.

Text uses NFC, normalized whitespace and control-character removal. Sentence
punctuation, gaps of at least 700 ms, speaker changes, 3.5-second duration and
display width determine breaks. Short cues are merged with an adjacent cue only
when the speaker, gap, duration and width permit. Short interjections are never
deleted. Lines wrap at word boundaries where possible, with grapheme fallback
for long tokens. Each cue has at most two lines of 32 display units; CJK, Hangul
and Thai characters count as two units. These are initial readability heuristics,
not measurements of a particular font.

Word timestamps are retained. Missing alignment is already marked estimated by
Task 4-2. Overlap up to 100 ms is reconciled by clipping the preceding word's end
and explicitly marking estimated timing. More significant overlap or ambiguous
word ordering fails with `VIDEO_AGENT_SUBTITLE_TIMELINE_INVALID` instead of
dropping text or inventing timestamps. Cues must be nonempty, positive-duration,
inside the immutable source duration and nonoverlapping on one track.

Sub-1.2-second cues, a single timed word over 3.5 seconds, reading speed above
20 display units/second and four identical consecutive lexical tokens within
a cue receive review flags. Repeated text is preserved. An indivisible timed
word exceeding display width fails explicitly for review. Without acoustic or
confidence evidence, the stage does not claim to detect or delete silence
hallucinations. Forced alignment and LLM rewriting are not used.

## Recovery and rollout

The existing Worker commits output assets and stage success atomically under its
lease. An interrupted normalization can deterministically rerun from persisted
transcription without another ASR request or quota charge. Cancellation is checked
before reading and before artifact publication. Asset access, TTL, kind, generation,
byte count and checksum validation follow the existing Worker contract.

Run `pnpm -C api test:video-agent` for the complete Agent suite. New checks cover
word-boundary timing, punctuation, pauses, interjection preservation, stable IDs,
multilingual line limits, estimated timing, repetition, jitter and invalid source
timelines, configuration mismatch, cancellation and typed artifact publication.
Real Worker integration extends the 620-second recovery fixture through the
normalization stage and verifies the derived cue and dependency reference.

Validation completed: all 42 Agent tests passed, including the real Worker
normalization path. The four normalization tests were rerun after adding source
alignment warning propagation. Seven JavaScript syntax checks, UTF-8 document
spot checks and `git diff --check` passed. No i18n or frontend files changed.

Full execution remains disabled until clip selection/translation and rendering
handlers (Tasks 5 and 6) complete. This stage generates source cue data, not final
translated SRT/ASS or playable clips. No production build or deployment is performed.
