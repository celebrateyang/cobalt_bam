# Video Agent Task 3-2: durable worker execution

This is the phase 3-2 record. [Task 3-3](video-agent-task3-3.md) adds shared usage/capacity and supersedes the public metadata-only start behavior. Full Agent execution remains blocked until real media handlers are installed.

Task 3-2 implements the independent execution worker, step leases/fencing, attempt evidence, durable checkpoints, cancellation and recovery. Existing Highlight Studio uses its existing worker and tables. This task does not implement quota admission/billing, frontend execution, ASR, translation, rendering or dubbing.

## Execution boundary

Only runs with `admission_status=admitted` and non-null entitlement/budget snapshots are executable. Public commands still create admission-pending runs. There is no public admission override. Task 3-3 must implement trusted shared admission before normal users can execute runs. The frontend Start button remains disabled.

The production handler registry currently contains only `probe`. It downloads the immutable source into an isolated temporary directory, checks generation, size and SHA-256, invokes real FFprobe, validates duration/dimensions/audio/video, and persists the result as a checkpoint artifact. `chunk` and later stages remain waiting for their real handlers in Tasks 4-6. Missing handlers never produce synthetic success.

## Scheduling and ownership

- `advanceRuns` makes dependency-satisfied steps ready, activates due retries, recovers expired leases and reconciles cancellation/terminal states. Its bounded project scan rotates using `scheduler_checked_at`, so projects waiting for handlers do not starve later projects.
- `claimStep` uses `FOR UPDATE SKIP LOCKED`, consistent project -> run -> step locking, admitted snapshots, pipeline version and dependency checks. A run with a failed step cannot claim more work.
- Each claim increments both the attempt count and fencing token and inserts a `video_agent_step_attempts` row. Tokens remain decimal strings in JavaScript.
- Default lease: 120 seconds. Default heartbeat: 15 seconds. Default step deadline: 30 minutes. One worker process executes one step at a time. Cross-entry resource and user concurrency enforcement belongs to Task 3-3; keep the deployment at one replica until shared admission is ready.
- Heartbeat, checkpoint mutation, artifact registration and success/failure commits recheck owner, token, unexpired lease and executable run state under the same lock order. An expired lease cannot be revived. Old workers cannot submit into a replacement attempt.
- A local lease watchdog aborts processing if renewal is unavailable. AbortSignal propagates to storage streams and media subprocesses. Media commands use argument arrays, no shell, `windowsHide`, bounded output and explicit deadlines.

This provides at-most-one accepted step result for a fencing token, not exactly-once external computation. A crashed worker or already-submitted provider request can have consumed resources before recovery. Later provider adapters must pass the signal, classify failures and use provider idempotency where available.

## Durable checkpoints and files

Handlers receive `checkpoint`, `dependencies`, `saveCheckpoint`, `artifact`, `commitCheckpoint` and `readArtifact`.

- `saveCheckpoint` persists a bounded JSON cursor/state (32 KiB maximum).
- `artifact` registers an owned pending object before streaming an opaque object key into shared storage. JSON artifacts are limited to 1 MiB and carry generation/size/SHA-256 metadata.
- `commitCheckpoint({checkpoint,assets,outputRefs})` atomically makes uploaded objects ready and saves intermediate output references while the step stays running. A replacement attempt can read these files and resume from the saved cursor.
- A handler returns the same result envelope to finish the step. Artifact promotion, checkpoint/output references, step status, attempt evidence and safe progress event commit together. Failed validation rolls the entire transaction back.
- `readArtifact` accepts only the current step's committed references or successful dependency references, within the project. It checks ready status, TTL, generation, size and checksum. Storage paths are not exposed to clients.
- Pending abandoned objects expire after 24 hours. Ready checkpoint objects expire after seven days. Asset TTLs are fixed retention limits, not an unlimited run pin. Missing/expired checkpoints must cause later handlers to recompute or report a recoverable input problem.
- Cleanup takes the project lock before deleting objects and skips actively leased writers/readers. Source cleanup protects live worker reads and does not expire independently retained derived checkpoints merely because the original source expires. Project deletion still expires all project assets.

Temporary directories are removed on normal completion, failure, cancellation and graceful shutdown. Pod/container temporary storage handles files left by a hard kill. Shared objects abandoned by a hard kill remain discoverable through their pending asset records and are removed by cleanup.

## Retry, cancellation and recovery

Retries are limited to three attempts per step, including crash recovery and shutdown interruptions. HTTP 429/500/502/503/504 and common connection/timeout errors receive exponential backoff with jitter (base one second, exponential ceiling 60 seconds). A supplied numeric `retryAfterMs` is honored up to the 24-hour wait ceiling. Unknown/permanent errors fail immediately. Raw provider messages and signed URLs are not stored in events.

Graceful SIGTERM/SIGINT aborts the active step and releases it to bounded retry with its committed checkpoint intact. A hard crash is recovered after lease expiry: the prior attempt becomes abandoned, its token is fenced out and a due replacement attempt receives the persisted checkpoint/output references. Queued work survives process/pod replacement in PostgreSQL.

Cancellation remains available when acceptance flags are off. It prevents new claims immediately; heartbeat or guarded writes detect cancellation and abort active work. A run becomes cancelled after its active steps acknowledge cancellation or their leases expire. Cancellation is cooperative for provider requests; later adapters cannot promise to reverse already-billed calls.

Completion requires successful verify/publication, terminal steps, an explicit produced count and owned ready unexpired `rendered_video` assets with generation/checksum/size metadata. Published references must have been referenced by verification. Fewer verified outputs than requested produce `partially_completed`. JSON checkpoint files cannot satisfy video publication. Actual media validation and creation of these assets belong to Task 6.

## Deployment and observation

The additive schema adds step-attempt history, asset run/step/token/input-hash fields and the scheduler timestamp. Initialize it using the existing command before enabling the worker:

```sh
pnpm -C api video-agent:init
```

Helm defaults remain off:

```yaml
videoAgent:
  enabled: false
  runsEnabled: false
  worker:
    enabled: false
    replicaCount: 1
```

`videoAgent.worker.enabled` creates the separate `argocd-video-agent-worker` Deployment with its own CPU/memory/ephemeral-storage resources, shared PostgreSQL/GCS configuration and a 60-second termination grace period. It runs `node src/util/video-agent-worker.js`. Worker acceptance is independent of UI/API acceptance; disabling new requests does not discard admitted work. Neither migration nor deployment was performed as part of this change.

For an isolated development database/storage:

```sh
# Set VIDEO_AGENT_WORKER_ENABLED=1 in the process environment.
pnpm -C api video-agent:worker --once
```

`--once` runs one reconciliation/claim/execution cycle and exits; the normal process polls every three seconds when idle. Do not manually admit production runs to bypass Task 3-3.

Run/step summaries and safe `step.progress`, `run.status`, `run.completed` events use the Task 3-1 read/SSE APIs. Attempt history is retained in `video_agent_step_attempts`; it is not exposed through an unauthenticated debugging endpoint. Worker logs include project/run/step IDs, stage, attempt, fencing token, elapsed time and safe error codes, without source URLs or credentials. Provider request IDs/cost and stage-specific telemetry arrive with the later provider handlers.

## Verification

```sh
pnpm -C api test:video-agent-worker
pnpm -C api test:video-agent
helm lint cobalt-chart --set database.password=lint-placeholder --set admin.password=lint-placeholder --set jwt.secret=lint-placeholder --set videoAgent.worker.enabled=true
```

Tests use isolated PGlite PostgreSQL, local object storage and actual FFmpeg/FFprobe. They cover pending admission, competing claims, transactional artifact rollback, old-token rejection, lease expiry/replacement, checkpoint/file recovery, bounded retries/Retry-After, shutdown, cancellation killing a child process, active-file cleanup protection, real source probing, unavailable handlers, final result guards and scheduler fairness. Completion-count fixtures test the database contract only; they do not claim to have rendered videos.

PGlite has one connection and the test adapter serializes transactions. These tests do not certify production multi-connection contention, real GCS/Clerk or Kubernetes crash behavior. No production build was run. Task 3 as a whole still requires Task 3-3: shared old/new admission, reservations/billing/concurrency and frontend progress.
