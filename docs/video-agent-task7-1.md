# Video Agent Task 7-1: durable conversation messages

Task 7-1 replaces the workspace-only request draft with an authenticated,
durable conversation feed. It intentionally does not call a model, create a
plan, start a run or consume video minutes. Messages enter `received` state for
the Planner introduced by Task 7-2.

## Storage and API

`video_agent_messages` stores an opaque UUID, owned project/user, client message
id, role, content, processing status, safe metadata and creation time. The
project/user/client-message tuple is unique. Project and pending-status indexes
support history reads and the future Planner claim path. Schema initialization
is additive and remains safe to run repeatedly.

The authenticated endpoints are:

- `GET /user/video-agent/projects/:projectId/messages`
- `POST /user/video-agent/projects/:projectId/messages`

History returns the most recent page in display order and an opaque
`createdAt:uuid` cursor for older pages. A POST accepts only `content` and
`clientMessageId`. The same id and normalized content returns the original
message; reusing an id with different content returns 409.

## Bounds and privacy

- Content is limited to 4,000 characters and 16 KiB after CRLF normalization.
- NUL and unsafe control characters are rejected. UI rendering remains escaped.
- A user can create at most 20 messages per minute across projects. A database
  advisory lock prevents parallel projects from racing this limit.
- A project can retain at most 2,000 messages.
- User identity comes from Clerk and project ownership is checked before every
  read/write. Public callers cannot choose an assistant role or processing
  status.
- The progress event contains only message id and role. Message text is not
  copied into the event stream or request logs.
- Messages expire after 90 days. Deleting a project removes its messages through
  the existing idempotent cleanup job.

## Web behavior

The conversation panel restores saved messages when a project opens, supports
older-page loading and saves the existing examples or free-form request. Local
draft text is cleared only after a successful durable write. Eleven locale
files contain the new save/history copy. The UI clearly states that automatic
planning will be connected in the next task.

## Verification

`conversation.test.js` uses real PGlite and HTTP routing to cover authentication,
cross-user isolation, normalization, input rejection, idempotent replay,
conflicts, event redaction, pagination, rate limiting, retention and project
deletion. Frontend type checking, i18n completeness and encoding checks are part
of the delivery checks. Production builds and live model calls are not run.
