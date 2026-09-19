# Video Agent Task 7-3: controlled execution and source handoff

Task 7-3 connects the validated Planner output to the existing command and
worker control plane. The model never selects a tool name or supplies command
arguments. The server compiles a fixed sequence: read project context, inspect
the selected source, submit the idempotent `start_run` command, and read the run
status. `VIDEO_AGENT_MAX_TOOL_CALLS` bounds the sequence (default 12).

When the user explicitly asks for execution, a ready plan starts a run without
another confirmation. A plan-only request stops after `create_plan`. Membership,
quota, source integrity, and pipeline readiness remain enforced by the existing
`start_run` admission transaction. A lost command receipt replays using the
message-derived idempotency key; completed messages replay their stored result.

For a single HTTPS video URL in the latest user message, the server invokes its
own downloader over fixed loopback with the user's Clerk token and a stable
queue ID. Only a video candidate returned by that downloader can become an
encrypted, user-bound media import token. The imported source is linked to the
message with a unique origin ID, so retrying after a crash cannot import it
twice. Unsupported or multi-choice downloader results require the existing
manual downloader/import path. The model never fetches a URL itself.

The initial request records `awaiting_source` while the existing ingestion
worker verifies the media. On readiness, that worker resumes the same message,
creates one plan, and starts one run if execution was requested. The UI polls
the durable message feed while waiting. Failed ingestion marks the message
failed and permits a bounded retry. Source labels, URLs, raw downloader replies,
provider envelopes, and tokens are excluded from events and public outcomes.

Validation: Planner and resolver tests cover the fixed tool catalog, budget,
loopback downloader, source wait, resume, and idempotent run. The existing
Video Agent API suite and Svelte type check are run separately on Windows to
avoid concurrent-memory exhaustion. Production build and deployment remain
owned by the user under the repository instructions.
