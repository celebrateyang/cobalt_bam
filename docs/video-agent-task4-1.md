# Task 4-1: durable audio chunks

Implemented the real `chunk` stage after `probe`. At completion of Task 4-1, production handlers included
`probe` and `chunk`; `transcribe` and later stages remain unavailable. Full run
admission and the frontend execution button remain gated by the complete handler
registry. Existing Highlight Studio processing is unchanged.

Task 4-2 subsequently added transcription; see [Task 4-2](video-agent-task4-2.md)
for the current provider and recovery contract.

## Audio and timeline contract

- Source limit remains 1 GiB / 60 minutes. Download uses backpressure and verifies
  the source snapshot's generation, byte count and SHA-256 before decoding.
- FFmpeg extracts mono 16 kHz PCM signed 16-bit WAV to the isolated step directory.
  Audio timestamps are normalized using `aresample` with `first_pts=0`; gaps and
  an early audio EOF are padded to the source duration. The exact sample count is
  checked against the immutable source duration in milliseconds.
- Nominal ownership boundaries are 600 seconds apart. A streaming PCM scanner
  checks 20 ms RMS frames, looking for at least 300 ms at or below -40 dBFS within
  +/-8 seconds of each boundary. It selects a nearby pause, or the nominal boundary
  if none exists. A final ownership window under 10 seconds merges into its predecessor.
- Processing windows extend 2 seconds beyond ownership windows at each side,
  clamped to `[0, durationMs]`. Ownership windows are contiguous and do not overlap.
  `atrim` cuts by sample index, followed by `asetpts=PTS-STARTPTS`.
- Every chunk records ordinal, processing/ownership start and end in milliseconds,
  start/end sample indices, sample count, asset ID, object generation, size and
  SHA-256. Task 4-2 must map local ASR time through `processingStartMs`, then apply
  ownership and boundary deduplication; it must never infer `ordinal * 600`.
- Encoded files are checked for their actual sample count and a maximum of 24 MiB
  before upload. This is an internal byte cap, not a claim that an ASR provider has
  already been selected or integrated.

FFmpeg filter semantics: [atrim / asetpts / aresample documentation](https://ffmpeg.org/ffmpeg-filters.html).

## Durability and recovery

Chunk rows are represented by the versioned chunk manifest in the step checkpoint
and a JSON asset, with binary assets in the existing `video_agent_assets` table.
This keeps timeline metadata, output references and lease fencing in the same
existing transaction instead of introducing another independently updated chunk
table for this stage. No new database migration is required.

Each binary is registered `pending` before upload. A fenced `commitCheckpoint`
transaction marks it `ready` and records all completed chunks. The step remains
`running` until every chunk and the final manifest have been committed. Every
ready asset uses the existing 7-day derived-asset TTL; abandoned pending uploads
use the existing 24-hour TTL and cleanup rules.

On automatic step retry, completed binaries are checked against owned step or
successful dependency references, TTL, kind, generation, size and streamed SHA-256.
Valid binaries are reused. Missing/invalid binaries are removed from the saved
references and regenerated; lease, cancellation and transient storage errors are
not swallowed. Partial retries may re-download the source and re-extract the full
PCM file, but encode/upload only missing chunks. A fully completed checkpoint needs
no source download. Manual retry of a failed Run can reuse a succeeded chunk stage;
partial chunks of an unsuccessful stage are currently recovered within automatic
retries of the same Run, not copied into a new Run.

Chunk configuration, including the algorithm version, is part of the stage input
hash and therefore invalidates downstream stages when it changes. Increment the
algorithm version if encoder or timeline semantics change.

## Resource limits

Before source download, check scratch space for source bytes + duration * 32 bytes
per millisecond + one 24 MiB chunk + 64 MiB headroom. The default per-step budget
is 1536 MiB (`VIDEO_AGENT_CHUNK_SCRATCH_MAX_BYTES`, optional). Insufficient physical
space fails with retryable HTTP 503; an invalid or exceeded budget fails with 422.
The existing Agent Worker ephemeral-storage settings already cover this budget.

The original source file is deleted after extraction. Chunks are produced,
uploaded and deleted sequentially; no complete list of local chunk files is kept.
The normalized full PCM file is retained only while missing chunks are produced.
The PCM scanner uses one 64 KiB buffer and one candidate per nominal boundary.
The Worker removes the whole isolated directory after failure or success.
Media child processes use argument arrays, no shell, one thread, abort-driven kill,
and bounded timeouts; timeout errors are retryable `ETIMEDOUT`.

## Validation and rollout

Run `pnpm -C api test:video-agent-chunk` for timeline/scanner/resource tests and
real FFmpeg Worker integration, or `pnpm -C api test:video-agent` for the full
Agent suite. Tests cover a 60-minute ownership plan, pause and nominal boundaries,
short tails, sample-exact WAVs, byte limits, corrupted binaries, dependency access,
leading silence for delayed audio, stale leases, process timeout, and a real
620-second video interrupted after its
first durable chunk. Its second attempt must preserve the first asset ID and
encode only the remaining chunk.

Validation completed: the complete Agent suite passed 31 tests; the Worker suite
was rerun after adding the delayed-audio assertion. Syntax checks passed for all
nine changed/new Agent JavaScript modules, and `git diff --check` passed.

No production build, deployment or paid ASR call is performed in Task 4-1. Keep run
admission / execution Worker off until Tasks 4-2, 4-3, 5 and 6 complete the pipeline.
