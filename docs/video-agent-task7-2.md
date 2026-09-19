# Video Agent Task 7-2: natural-language planning

Task 7-2 connects the durable conversation from Task 7-1 to the existing
structured plan control plane. It creates or updates a plan, but it never starts
a run. Automatic tool execution remains Task 7-3.

## Request flow

1. `POST /projects/:projectId/messages` durably stores the user message.
2. `POST /projects/:projectId/messages/:messageId/plan` claims that message with
   a bounded lease covering the initial call and two possible repairs.
3. The Planner receives bounded conversation history and at most ten ready
   sources. Source labels are explicitly treated as untrusted data.
4. The provider must return the strict JSON Schema in `planner-adapter.js`.
5. The server validates every field again, restricts source IDs to ready owned
   sources, and compiles the result with the existing `normalizePlan` contract.
6. A ready result uses the existing idempotent `create_plan` command. The user
   message, assistant reply, safe Planner metadata, and completion event are
   then persisted.

Completed requests replay their stored outcome. A live lease returns
`VIDEO_AGENT_MESSAGE_PROCESSING`; an expired or failed claim can be retried.
The plan command idempotency key is derived from the immutable message UUID, so
a lost HTTP response cannot create a second plan.
Each message permits at most three claimed planning requests.

## Planner contract

The Planner can select only `highlight_clips`, one ready source, 1-5 clips,
15-90 second durations, a supported language, and translated or bilingual
subtitles. It records `plan_only` or `execute` as intent, while this task always
stops after plan creation. Dubbing produces an `unsupported` assistant reply.

If a source or explicitly requested target language is missing, the result is
`needs_input` and no plan is created. One unambiguous ready source may be filled
by the server. All other readiness claims must agree with the `missing` fields.

The initial provider response plus at most two repair responses are allowed.
Repairs cover malformed envelopes, invalid JSON, refusals/incomplete output,
unknown fields, unavailable source IDs, and inconsistent readiness. HTTP,
authentication, timeout, and connection failures are not retried inside the
request.

## Security and operations

- Responses API calls use `store: false`, a bounded response body, no provider
  retries, and strict `text.format` JSON Schema output.
- The model cannot define URLs, tools, commands, pipeline stages, or arbitrary
  plan fields.
- Events contain IDs and status only. Provider request IDs and model names are
  stored as safe metadata; raw provider envelopes are not stored.
- `VIDEO_AGENT_PLANNER_MODEL` defaults to the existing
  `AI_VIDEO_TEXT_MODEL`; `VIDEO_AGENT_PLANNER_TIMEOUT_MS` defaults to the
  existing OpenAI timeout. Helm sets both explicitly and reuses the existing
  OpenAI secret and base URL.

The UI saves first, displays processing/completed/failed state, appends the
durable assistant reply, refreshes the project revision after plan creation,
and offers a safe retry for failed planning.
