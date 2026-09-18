# Task 5-3: selection/translation integration acceptance

The normalization, windowed selection and selected-cue translation stages have
been exercised together through the actual Worker lease, PostgreSQL test adapter
and local object storage. Task 6 receives a self-contained translated artifact;
its reusable validation entry point is `validateTranslatedClips` in
`api/src/video-agent/translated-contract.js`. Translation validates its final
handoff before uploading the artifact.

## Task 6 input contract

- Read the direct successful translation dependency's `translatedClipsRef` with
  `{kind: "transcript"}` through the fenced artifact reader.
- Require `translated-clips-v1`, matching source checksum/duration and target
  language. Check nonempty translated text, unique cue/clip IDs, exact cue coverage,
  ordered nonoverlapping cues, source-bounded times, valid 15-90 second clip spans,
  exact first/last cue boundaries and nonoverlapping clips.
- Clip/cue IDs are stable identities. The artifact contains cue source text,
  translated text, timing, provenance, quality flags, selected clips and shortfall
  information. Build translated/bilingual lines from these cues; do not repartition
  text using unrelated array positions or let a model rewrite timestamps.
- SourceSelectedClipsRef and sourceTranscriptRef are provenance references, not
  permission to read arbitrary ancestor assets. The handoff is self-contained;
  existing direct dependency asset access remains unchanged.
- Exported subtitle line wrapping, SRT/VTT/ASS, rendering and output verification
  are still Task 6. No playable/exported video is produced by Task 5.

## Acceptance scenarios

An hour-long persisted ASR fixture contains 1,200 timed source units. The real
normalization handler generates cues, selection spans bounded windows and returns
three complete 30-second clips, and translation processes only their 30 cues.
Selection first repairs an invented ID, then encounters 429 in the next window.
Worker retry must retain the first validated batch and never request it again.
Translation is interrupted immediately after its raw-response checkpoint commits;
retry must preserve that raw asset and finish with only one provider call.
The final artifact is read under the next `build_subtitles` lease and checked
for source timing and word provenance.

The hour-long acceptance fixture starts at persisted ASR rather than decoding a
new hour-long video. Existing real 620-second FFmpeg/ASR-mock recovery tests remain
in the same suite and cover upstream chunk handling. All model responses are
injected fixtures or local HTTP responses with dummy credentials.

Additional acceptance checks include:

- Cancellation during an active translation request: heartbeat aborts the provider,
  marks the Run/step cancelled and prevents raw/final artifact publication.
- Cross-project asset references: fail ownership validation before contacting
  the translation provider.
- Repair, bisection and a failed single cue: bounded requests and durable successful
  children; no source-copy fallback.
- Unknown/duplicate/missing translation IDs, extra timestamp fields, empty text,
  refusal/truncation, invalid ranges, overlapping clips and empty selection.
- Target language/glossary changes retain all stages through selection but invalidate
  translation and downstream hashes. Model/endpoint and subtitle configuration
  invalidation are covered by the existing stage tests.
- Shared admission/usage tests ensure unavailable pipeline handlers block starts
  without reserving quota, and identical paid-operation retries avoid duplicate
  internal charges. This is not a substitute for production multi-connection locking.

## Rollout boundary

This is implementation and automated integration acceptance. No live paid model
call, production database migration, production build or deployment was performed.
It does not measure real-model semantic selection/translation quality, GCS behavior
or browser usability. Those require later production acceptance using representative
content. Locked subtitle edits/refinement and a glossary UI remain later editing
work. Keep full execution admission disabled until Task 6 completes and outputs
are verified; retain current project/material/plan functionality.

Validation completed: the complete Agent suite passed 56 tests. After adding
live translation cancellation, the Worker suite passed all 17 tests. The seven
handoff/translation checks were rerun with explicit refusal/truncation assertions.
Four changed-module syntax checks, UTF-8 document spot checks and
`git diff --check` passed. No frontend/i18n files or production configuration changed.
