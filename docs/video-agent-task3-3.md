# Video Agent Task 3-3: shared admission and progress

Task 3-3 completes the execution foundation: shared quota admission, old/new concurrency, reservation/commit/release and frontend plans/progress. Full media processing requires Tasks 4-6; natural-language planning is Task 7, and dubbing is Task 8. No new paid provider call was added.

## Ledger and admission

Both entries use the existing `ai_video_usage_reservations` ledger. The additive migration keeps historical IDs, job ownership, UTC periods, seconds and statuses intact, makes `job_id` nullable, adds a unique `run_id` FK, and enforces exactly one owner. No second copied ledger or historical re-charge is created. The migration is repeatable.

Old/shared schema initialization runs in one PostgreSQL transaction under a schema advisory lock. Concurrent compatible instance startups serialize migrations; existing active-job index replacement has no committed protection gap.

The entitlement remains `ai_video_studio`; the monthly limit is `AI_VIDEO_MONTHLY_SECONDS` (default 7200). Duration rounds up to whole minutes, matching Highlight Studio. Usage sums committed seconds and active reservations for both products in the same UTC month. No points/payment debit was introduced. Agent project/source/plan creation does not charge processing usage; source storage limits/membership remain unchanged.

New jobs/runs save private entitlement/budget snapshots. Historical jobs retain their historical records without invented snapshots. Public responses omit these private fields. `GET /user/video-agent/usage` and the existing old usage endpoint return the same `{usage:{limitSeconds,usedSeconds,reservedSeconds,remainingSeconds,periodKey,resetsAt}}` shape.

Agent start/retry takes the same per-user PostgreSQL advisory lock as old job creation, before the project lock. Membership, concurrency, quota, new run/steps, reservation, snapshots, events and command receipt commit atomically. A failed check or receipt write rolls everything back; duplicate command keys replay without reserving twice.

Old create/retry/render and Agent admission share one active execution per user. Old `draft_ready` remains editable without occupying the slot. Live leases count after deletion/cancellation until acknowledgment or expiry, preventing a new run from overlapping shutdown. Existing old media algorithms, input defaults and output formats are preserved; concurrent retry/render errors return 409.

`AI_VIDEO_EXECUTION_GLOBAL_CONCURRENCY` (default one) supplies a conservative shared worker-slot limit, checked under a separate advisory lock by both claim paths. A leased old pipeline job or Agent step occupies a slot. Old cancellation reconciliation can run when capacity is full. Whole pipelines are serialized conservatively; finer ASR/translation/render resource scopes remain a future adapter refinement. This counts valid leases, not stale external computation after lease loss.

## Billing lifecycle

- Agent admission reserves rounded source duration immediately.
- Claiming `transcribe` commits usage atomically, matching the old charge-before-ASR policy. Probe/chunk failure or cancellation before charging releases the hold.
- Terminal failure/cancellation/completion releases only still-reserved usage. Committed usage is not automatically refunded. Running cancellation waits for acknowledgment or lease expiry.
- Retry of the same immutable plan reuses its original committed reservation without duplicate debit, including later-month continuations. A fresh plan/start reserves new usage. An uncharged failure gets a new reservation.
- The old released-reservation retry gap is fixed: retry re-reserves under the user lock, checks current quota and refreshes its period. Committed old reservations remain unchanged.
- Reused Agent steps now carry their persisted checkpoints as well as output references. Task 3-2 video verification/publication guards remain mandatory.

## Gates and frontend

`VIDEO_AGENT_ENABLED`, `VIDEO_AGENT_RUNS_ENABLED` and `VIDEO_AGENT_ADMISSION_ENABLED` must all be enabled for new Agent execution. Helm adds `videoAgent.admissionEnabled`, default false. A disabled admission gate rejects new start/retry with `VIDEO_AGENT_ADMISSION_NOT_ENABLED`. Historical authenticated reads, cancellation and deletion continue working. Worker capacity/billing/release checks continue for already-admitted work even when acceptance is off. Historical pending metadata runs are not automatically admitted.

The real registry must implement all ten stages. Otherwise start/retry returns `VIDEO_AGENT_PIPELINE_NOT_READY` without leaving a run/quota hold. Capabilities expose `pipelineReady` and `executionEnabled`; both currently remain false because only probe is installed. No environment flag supplies fake handlers. Control/worker tests have an internal NODE_ENV=test-only metadata fixture policy; public command JSON rejects that field.

The project panel now provides shared usage/reset date, structured source/language/count/subtitle controls, saved plan creation/recovery, paginated run history, step/attempt/error summaries, verified output counts, cancellation and eligible retry. `GET /projects/:projectId/plan` returns the current revision's plan with ownership checks. Unsaved local edits are not overwritten by plan recovery.

Progress uses five-second event polling and authoritative run snapshots. Retention reset refreshes project state; transient failures display a reconnecting/stale notice. Completion comes from server state, never from HTTP acceptance or a timer. Existing SSE remains available for a later streaming optimization. An uncertain command response retains the exact key/body for replay, preventing accidental second reservations. Navigation discards stale responses and aborts event polling.

Start requires a saved current plan, no active run and server execution capability. Natural-language requests remain temporary drafts until the planner task; they are not silently converted to structured settings. All new UI strings are localized in the ten supported languages. Main/internal menu placement is unchanged.

## Rollout and validation

```sh
pnpm -C api video-agent:init
```

The init command now initializes both Agent tables and the old/shared ledger schema. Roll out compatible API and both worker deployments before enabling admission so every writer/claimer uses the shared rules. Both workers and API receive the same monthly/capacity configuration. Keep Agent execution off until Tasks 4-6 are installed and staging acceptance passes.

```sh
pnpm -C api test:video-agent
pnpm -C api test:ai-video-infrastructure
pnpm -C api test:ai-video-analysis
pnpm -C api test:ai-video-delivery
pnpm -C web check
pnpm -C web i18n:check-encoding
helm lint cobalt-chart --set database.password=lint-placeholder --set admin.password=lint-placeholder --set jwt.secret=lint-placeholder --set videoAgent.worker.enabled=true --set videoAgent.admissionEnabled=true --set aiVideo.enabled=true
```

Admission tests exercise actual SQL/service/authenticated HTTP: pipeline gates, expired/disabled membership, quota exhaustion, receipt rollback, duplicate reservation, old/new create/render/retry exclusion, global worker capacity, charge/release timing, already-charged retry, deletion with live leases, historical ledger preservation, released-reservation reuse, own-user usage, current-plan recovery and public payload rejection. Existing source/control/worker and old media tests also pass. PGlite serializes test transactions; production multi-connection contention, real Clerk/GCS and browser behavior still require staging validation. No production build, migration or deployment was performed.
