# Task 5-1: bounded long-video clip selection

The `select_clips` handler consumes the owned, verified normalization artifact.
It reuses the existing OpenAI key/base URL and `AI_VIDEO_TEXT_MODEL` (default
`gpt-5-mini`). API and Agent Worker Helm templates both use
`aiVideo.worker.textModel`. Original Highlight Studio behavior is unchanged.
Selection model, endpoint fingerprint, algorithm version and clip limits enter
the selection input hash, invalidating selection and downstream stages only.

## Windows and model contract

Core windows target ten minutes, but split earlier at 150 cues or 16,000 serialized
bytes. Each cue belongs to exactly one core. Up to 90 seconds of following context
is prioritized so clips can cross window boundaries; preceding context is read-only.
The core/context user payload is capped at 32 KiB, reserving serialization headroom;
context is shortened when it would exceed that cap. At most 30 windows are allowed.
This is a conservative byte budget, not an exact tokenizer count.

Responses API requests use strict JSON Schema, an output-token cap of 4,096,
`store=false`, AbortSignal and the existing provider timeout. SDK retries are
disabled; the Worker handles transient errors and Retry-After. Response envelopes
are streamed with a 512 KiB cap. Transcript text is explicitly treated as untrusted
content in the prompt. No tool execution is exposed to the selection model.
See [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

Each window can return at most five candidates: start/end cue IDs, title, reason,
score and a complete-idea assessment. The server rejects additional fields,
invented IDs, malformed values and empty metadata. Candidates must start in their
core and use a contiguous range of provided cues. The server derives exact
millisecond boundaries; the model cannot supply or modify timestamps.
Reversed ranges, duration outside the plan's 15-90 second limits and incomplete
ideas are filtered with recorded rejection reasons. Semantic completeness remains
a model assessment, not a guaranteed automated fact.

## Global selection and insufficient content

Validated candidates are sorted by descending score with deterministic time/ID
ties. Greedy global selection excludes every temporal overlap, duplicate range
and identical normalized transcript content,
up to `requestedCount`. Scores use a shared prompt rubric but are not calibrated
across independent requests; this is the initial ranking heuristic. No additional
whole-transcript model request is made.

`selected-clips-v1` includes stable clip IDs, cue IDs, derived boundaries, titles,
reasons, scores, normalized-transcript reference, selected count, rejected ranges,
duplicate count and shortfall metadata. Zero valid candidates is an explicit
shortfall result; it is never padded with invented clips. Task 5-2 must handle
this result before translation; this stage does not produce downloadable video.

## Durability

Raw responses are saved and fenced into the checkpoint before interpretation.
Validated candidate batches are separate owned artifacts. An automatic retry
reuses both, reconstructing validation from saved raw output when necessary.
A formatting/ID failure allows one repair request with the same bounded window;
the repair response is also persisted. Refusal or incomplete generation fails
explicitly. Missing/corrupt saved assets fail rather than silently making another
paid request. External responses lost before checkpoint persistence may still
require another request. Partial recovery is within the same Run; manual new-Run
retry reuses succeeded stages under the existing dependency/hash rules.

Final stage success and selected artifact references are committed atomically by
the existing Worker. No new database migration or internal quota charge is added.
Run admission stays closed until Tasks 5-2 and 6 implement the remaining handlers.

## Validation

`pnpm -C api test:video-agent` includes selection tests for an hour-long source,
bounded dense windows, unique ownership, cross-boundary endings, unknown IDs and
extra timestamps, duration/completeness filtering, global overlap exclusion,
stable IDs, insufficient candidates, raw-commit interruption recovery, bounded
format repair and cancellation. A local HTTP server with a dummy key verifies
real Responses SDK parameters and one-request 429 behavior. Existing real FFmpeg
Worker integration now reaches selection and verifies its shortfall artifact
through an owned translation dependency.

No live paid model call, production build or deployment is performed.

Validation completed: all 47 Agent tests passed, including real Worker selection
artifact publication. Selection tests were rerun after adding identical-content
deduplication and earlier cancellation checks. Eight JavaScript syntax checks,
Helm lint with deployment placeholders, UTF-8 document spot checks and
`git diff --check` passed. No frontend or i18n strings changed.
