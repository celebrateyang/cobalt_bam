# Video Agent Task 7-4: result edits and revisions

Task 7-4 adds result editing to the existing Video Agent project. A completed
run remains immutable. Editing a clip title, source-cue-aligned start/end,
horizontal framing focus, or translated subtitle text creates a new project
revision and a new plan. The user can then start that plan, or explicitly ask
the conversation Agent to make and execute the edit. Earlier runs remain in
the run history with their original preview and downloads.

## API and validation

- `GET /user/video-agent/projects/:projectId/runs/:runId/editable` returns the
  selected clips and their source/translated cues from the verified translation
  artifact. Access requires ownership and a completed or partially completed
  run. The artifact is checked against its generation, size and SHA-256 hash.
- `update_clip` and `update_subtitles` use the existing command envelope with
  `expectedRevision` and `idempotencyKey`. Clip and cue IDs must belong to the
  selected run. Trims stay within its selected cues and last 15–90 seconds.
  Subtitle text is bounded and cannot contain control characters.
- `restore_revision` copies a historical settings/edit snapshot and plan into
  a new revision. It does not mutate the historical revision or any old run.
- Public `create_plan` rejects arbitrary edit payloads; only the dedicated
  validated edit commands can attach them to a plan. Command receipts remain
  idempotent, including after an HTTP response is lost.

Edited runs reuse verified probe, chunk, transcription, normalization,
selection and translation outputs when their input hashes and assets still
match. The edited subtitle, render, verify and publication steps run under a
new immutable snapshot. If the base translation artifacts expired, starting
the edited run fails explicitly instead of silently selecting different clips.
Changing horizontal focus uses a bounded numeric crop position; no user text
is inserted into an FFmpeg argument.

The result panel exposes clip/cue editing and revision restore controls. It
keeps local edit drafts when the server reports a revision conflict. A
conservative natural-language edit path uses a separate strict schema, exact
server-verified clip/cue IDs, the same mutation commands, and the standard
run admission checks. Ambiguous edits ask for clarification. The broader
Planner and old Highlight Studio workflow remain independent.

Validation covers ownership, idempotent edit replay, immutable revisions,
version restore, upstream step reuse, source-cue-aligned trims, edited subtitle
export and rejected invented IDs. Production build and deployment remain
manual per repository instructions.
