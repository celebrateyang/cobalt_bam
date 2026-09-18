# Video Agent Task 3-1: execution control plane

This is the phase 3-1 record. [Task 3-3](video-agent-task3-3.md) supersedes its pending-admission behavior: public start/retry now requires shared admission and a complete real pipeline.

This task implements execution metadata and control APIs. It does not implement a video execution Worker, model calls, media results, execution admission or billing. The original Highlight Studio tables, endpoints and quota logic are unchanged.

## Migration and switches

Run the existing `pnpm -C api video-agent:init` (or `node src/util/init-video-agent.js` in the API image) before rollout. The additive schema creates revisions, validated plans, runs, steps, commands and events, and adds project event cursors. Existing Task 2 projects obtain revision 0 lazily, without replacing their title, sources or existing revision.

`VIDEO_AGENT_ENABLED=1` permits new commands and source/project creation. `VIDEO_AGENT_RUNS_ENABLED=1` separately permits internal Run metadata acceptance. The latter is **off by default**, mapped to `videoAgent.runsEnabled: false` in Helm. The frontend Start Task button remains disabled.

Even when both flags are enabled, accepted runs are `queued` with `admission_status=pending`, null entitlement/budget snapshots and pending steps. No Worker is created by this task, and no execution minutes are charged. Task 3-2 must only claim steps belonging to admitted runs; Task 3-3 will provide shared membership/quota/concurrency admission and release hooks. Do not treat the internal acceptance flag as permission to execute unmetered work.

Turning acceptance off preserves authenticated GET, project deletion and run cancellation. Replaying an already committed command returns its original receipt even with acceptance off. New mutating commands other than cancellation are rejected. Frontend route visibility remains controlled separately by its build-time `WEB_VIDEO_AGENT_ENABLED` flag.

## Commands

POST `/user/video-agent/projects/:projectId/commands`:

```json
{
  "type": "create_plan",
  "expectedRevision": 0,
  "idempotencyKey": "a-client-generated-uuid",
  "input": {
    "sourceRef": "source-uuid",
    "operation": "highlight_clips",
    "sourceLanguage": "auto",
    "targetLanguage": "es",
    "clips": { "requestedCount": 3, "minSeconds": 15, "maxSeconds": 90 },
    "video": { "aspectRatio": "9:16", "preset": "tiktok" },
    "subtitles": { "enabled": true, "mode": "translated" },
    "dubbing": { "enabled": false, "voiceId": null },
    "executionMode": "execute"
  }
}
```

Replace placeholder IDs with actual UUIDs. Keys are 16-128 ASCII letters, digits, underscores or hyphens. Envelopes are limited to 16 KiB. User identity comes only from Clerk, never the envelope. Unknown envelope, plan and settings fields are rejected; there is no client-specified shell command, media fetch URL, object key or custom DAG.

| Type | Input | Behavior |
| --- | --- | --- |
| `update_settings` | Patch of `sourceLanguage`, `targetLanguage`, `subtitleMode` | Create a new immutable settings revision |
| `create_plan` | Validated business plan above | Verify ready, owned, unexpired source; create revision and plan ID |
| `start_run` | `{ "planId": "uuid" }` | Require current plan revision and matching source snapshot; create queued Run and DAG |
| `cancel_run` | `{ "runId": "uuid" }` | Queued/awaiting-input -> cancelled; planning/running -> cancelling; preserve terminal states |
| `retry_run` | `{ "runId": "uuid" }` | Failed/partially completed -> a new Run linked to the original |

The initial supported business operation is `highlight_clips`, with 1-5 requested clips, durations within 15-90 seconds, 9:16 TikTok output, translated/bilingual subtitles and no dubbing. Other operations, presets, subtitle disabling and dubbing are explicitly rejected until their media handlers are implemented. Uploaded-source ingestion/probe is Task 2's prerequisite, not an arbitrary URL resolver in the Run.

Settings and plan creation increment project revision. Run creation/cancellation/retry do not modify settings revision. `expectedRevision` must match current revision, except cancellation: cancellation remains immediate even after newer edits. Old plan IDs cannot start new runs after edits; create a new validated plan instead.

Retries intentionally retain the original plan/revision. The receipt's `revision` is the current project revision; `runRevision` reports the retried run's original revision. Completed/cancelled runs cannot reopen. An identical idempotency key and canonical payload returns the same command ID, revision and Run ID before checking current revision or run status. Key reuse with another payload returns 409. Failed transactions leave no committed mutation, command receipt or event; failed requests can be retried. Replayed receipts describe original acceptance, so query the Run to obtain current progress.

Receipt example (`status:success,data` envelope omitted):

```json
{
  "commandId": "uuid",
  "status": "accepted",
  "revision": 1,
  "runId": "uuid",
  "admissionStatus": "pending",
  "replayed": false
}
```

`accepted` returns HTTP 202; completed control mutations return 200. Receipt, state change and events commit in one transaction under a project row lock. A partial unique index enforces at most one active Run per project; the shared per-user/new-old execution limit is deferred to Task 3-3. Project runs are capped at 100 as a metadata limit.

## Run/DAG snapshots and state

The compiled initial stage template is:

`probe -> chunk -> transcribe -> normalize -> select_clips -> translate_selected -> build_subtitles -> render -> verify -> publish_results`

Steps have stable ordinal order, dependency IDs, scope, input snapshot/hash, pipeline version, attempt/checkpoint/output-reference and lease/fencing columns. The compiler controls the graph. These are project-scoped stage templates; chunk/clip handlers in later media tasks will expand the required granular work. No step is advertised as succeeded just because a request was accepted.

Input seeds hash the immutable source and stage-specific configuration, chaining upstream hashes. Changing target language preserves pre-translation seeds; changing subtitle mode preserves pre-subtitle seeds. Project revision is stored for audit and does not by itself invalidate unchanged upstream work. Later handlers must incorporate actual dependency outputs, provider/model configuration and user edits into resolved input hashes/checkpoints before cache reuse.

Retry creates new step IDs/dependencies. It can reference succeeded steps only with matching hashes, a fully reusable dependency chain and owned, ready, unexpired UUID asset references. Missing/expired refs reset that step and downstream steps to pending. Final verification/publication are always rerun. Original steps and attempt evidence remain intact. Actual lease claiming, attempt history, checkpoint loading and reference-aware output cleanup belong to Task 3-2/later asset tasks.

The state-machine helpers reject invalid transitions and reopening terminal states. Completion requires terminal steps, successful verify/publication and valid produced/requested counts. They are validation helpers for the future trusted Worker, not public endpoints allowing clients to set status. Real output media acceptance remains required before success.

Project deletion cancels queued runs and requests cancellation for running/planning runs under the same lock, then uses existing source cleanup. Task 3-2 must stop active processes and Task 3-3 must release any uncommitted reservations; neither hook is fabricated in this task.

## Read/control APIs

All paths below are relative to `/user/video-agent`, require Clerk auth, reject disabled users and verify project ownership. Invalid IDs/cursors return 400; another user's resource returns 404.

| Method | Path | Result |
| --- | --- | --- |
| GET | `/capabilities` | Acceptance flags, execution=false, supported operations |
| GET | `/projects/:projectId/revisions?cursor=...&limit=20` | Revision snapshots, descending revision cursor |
| GET | `/projects/:projectId/plans/:planId` | Validated plan and its immutable revision |
| GET | `/projects/:projectId/runs?cursor=...&limit=20` | Runs with timestamp/UUID pagination |
| GET | `/projects/:projectId/runs/:runId` | Current Run, safe step summaries and project event cursor |
| POST | `/projects/:projectId/runs/:runId/cancel` | `{expectedRevision,idempotencyKey}`, same command engine |
| POST | `/projects/:projectId/runs/:runId/retry` | `{expectedRevision,idempotencyKey}`, same command engine |
| GET | `/projects/:projectId/events?after=0&limit=20` | Ordered durable events, cursor, hasMore/resetRequired |
| GET | `/projects/:projectId/events/stream?after=0` | Authorized SSE with durable IDs and heartbeat |

Public responses omit storage keys/credentials, checkpoints, lease owners and budget internals. Event payloads are server-created safe summaries, not arbitrary input or model chain-of-thought. Event IDs are decimal strings, never JavaScript numbers.

The project row lock serializes event allocation and state commits for that project. Global sequence gaps are valid. The Run snapshot includes `eventCursor` for reconnecting after a consistent snapshot. SSE uses fetch with Authorization, expires after 25 seconds, respects response backpressure and allows two simultaneous streams per user per API process. Reconnect with the last received event ID; deduplicate by ID, fall back to event polling, and confirm terminal status through GET Run.

The cleanup process retains events for 90 days and removes events/command receipts after project deletion. Event floor metadata makes an expired cursor return `resetRequired:true,snapshotRequired:true`; SSE emits `event: reset` and ends. Fetch current snapshots before reconnecting with the supplied cursor. Cursors ahead of project state are rejected rather than skipping future events.

## Verification and remaining tasks

```sh
pnpm -C api test:video-agent-execution
pnpm -C api test:video-agent
pnpm -C web check
```

Execution tests use isolated in-memory PostgreSQL and injected test authentication. Coverage includes strict plans/DAG seeds, state transitions and completion guards, duplicate requests, key conflicts, CAS, transaction rollback, cross-user project/source/plan/run access, source changes/expiry, acceptance flags, replay during shutdown, stale cancellation, new-run retry, asset reference reuse, pagination, SSE and retention reset. Task 2's real-media/storage tests run unchanged apart from the intentional historical-query behavior when acceptance is disabled.

PGlite uses a single connection and a test transaction mutex; competing HTTP requests exercise command behavior but do not certify production multi-connection lock contention. Real Clerk/GCS/staging validation and deployment are not performed here. No production build is run.

Task 3-2: admitted-step claiming, lease/fencing checks, attempt history, checkpoints, cancellation interruption and bounded retries. Task 3-3: shared membership/quota admission, old/new concurrency, reserve/commit/release, ledger migration and frontend real progress. The overall Task 3 remains incomplete until both are delivered.
