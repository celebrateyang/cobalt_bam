# Personal agent access (phase one)

Users manage credentials at `/<lang>/account/agents`, linked from Account.
The page currently follows Account's Chinese/English language selection.
Create a credential with an explicit scope, lifetime (1-30 days), daily call
limit (1-100), points ceiling per resolution (0-1000) and optional membership
permission. Default points ceiling is zero; membership use is disabled.
The credential is shown once, held only in page memory, and stored as a
SHA-256 hash on the server. Revoke credentials from the same page.

## Discover and connect

- Website `/capabilities.json` and `/llms-full.txt` describe agent entry points.
- Public `/agents` explains integration without requiring login or JavaScript.
  Homepage links, server-rendered HTML head links, HTML response `Link` headers,
  `/llms.txt`, sitemap and robots comments point crawlers to this guide.
  Cloudflare Pages' static `_headers` also supplies discovery links for
  prerendered pages that bypass server hooks.
  The `fsv-agent-access` HTML meta marker and `personalAgent.supported` JSON flag
  explicitly declare support. These are site discovery hints, not a universal
  agent discovery standard or a guarantee every crawler will read them.
  Private account pages remain disallowed in robots and require authorization.
- API `GET /agent/v1/capabilities`: supported services, pricing and delivery rules.
- API `GET /agent/openapi.json`: REST contract.
- API `POST /agent/mcp`: stateless Streamable HTTP MCP, using the official SDK.

Configure an MCP client supporting custom headers with:

```json
{
  "url": "https://api.freesavevideo.online/agent/mcp",
  "headers": { "Authorization": "Bearer <user-created-credential>" }
}
```

This is a connection description; individual clients use different configuration
keys. OAuth-only clients cannot connect using this phase's manual credential.
There is no automatic Muse registration or assertion that Muse supports custom
headers. The REST contract remains available to clients able to call HTTP APIs.

Tools: `get_capabilities`, `get_balance` (`balance:read`), `resolve_media`
(`media:resolve`). Only tools authorized by the credential appear in the tool list.
Media resolution is marked as a write operation because it can consume points.

## REST example

```sh
curl https://api.freesavevideo.online/agent/v1/balance \
  -H "Authorization: Bearer $FSV_AGENT_TOKEN"

curl https://api.freesavevideo.online/agent/v1/resolve \
  -H "Authorization: Bearer $FSV_AGENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.tiktok.com/@example/video/123","idempotencyKey":"my_task_123456","videoQuality":"720"}'
```

Use a new idempotency key for a new operation; reuse it on network retries.
Existing downloader request identity/replay protects immediate retries against
duplicate charges and rejects a different source URL for the same key.
Replay follows the existing downloader's retention window (one hour); do not
retry completed tasks after that window. This phase is not a durable job queue.

Supported input is deliberately limited to one URL, downloadMode, videoQuality
and idempotencyKey. Batch, forced proxy, browser billing holds, caller user IDs
and payment actions are not exposed. Defaults: auto mode, 720p.

Resolution uses the existing downloader, upstream routing, membership admission
and charging policy: 2 points per started minute, 2 when duration is unknown.
After successful resolution, authorized points are consumed immediately or a
membership download is counted. Saving the returned media is the caller's
responsibility. If membership permission is disabled, the request uses the
points path even when the user holds a membership. If membership permission is
enabled, existing membership limits apply without an automatic paid fallback.
Saving failure does not automatically refund resolution. The agent does not
receive first-download grace. Authorization is rechecked
before charging; over-budget or revoked requests release the reservation and
return no media URLs. Read-only balances contain no email or user profile.

`redirect`, `tunnel`, `picker` and `local-processing` keep their existing shapes.
For Direct Bridge services (TikTok and DeepLearning.AI), use the direct media URL;
do not automatically request a tunnel. URLs may expire. If browser fetch is
blocked by CORS, use the extension or an explicit browser handoff. Picker and
local-processing results require caller selection/processing; do not report that
the file has been saved just because resolution succeeded.

## Authorization and audit

`GET/POST /agent/grants`, `DELETE /agent/grants/:id`, and `GET /agent/calls`
require a Clerk user bearer session. Agent credentials cannot manage grants,
call payment endpoints, or act as an admin. Lists and revocations are bound to
the signed-in user's ID. A user can have at most ten active grants.

Daily limits count admitted calls, including invalid inputs, scope failures and
retries, and reset at 00:00 UTC (08:00 Asia/Shanghai). PostgreSQL admission
serializes across pods: ten calls/minute and two active calls/user, across all
credentials. Running calls older than ten minutes no longer block admission.
An IP ceiling of 120 HTTP requests/minute also bounds invalid tokens and MCP
protocol messages. That IP ceiling is per process; user limits are DB backed.
MCP initialization/listing is not a billable resolution and does not consume the
grant's daily business-call allowance.

Audit records include grant, operation, source hostname, time, outcome, error
code and actual points debit. They omit full source/resource URLs and credentials.
The pre-existing downloader attempt logs retain their existing behavior.
Audit writes fail closed before returning the result. A crash can leave a running
record; retry the same task key to recover without immediately charging again.
The UI shows the latest 100 calls. Operators can remove audit records older than
90 days with `DELETE FROM personal_agent_calls WHERE started_at <
(EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT - 90 * 86400000::BIGINT;`.

## Deploy and verify

Install dependencies with the updated lockfile. This phase adds the official MCP
SDK and updates Zod within v3 to meet its peer requirement.

Initialize PostgreSQL after the existing users table exists:

```sh
pnpm -C api personal-agent:init
# Production image, from /app/api (use the actual image working directory):
node src/util/init-personal-agent.js
```

Schema initialization is also lazy and idempotent, with retry after failure.
Only the main API mounts `/agent`; upstream-only servers return 404.
For local testing use `IS_UPSTREAM_SERVER=false`. No new payment provider or
secret is required. Initialize and deploy the API before exposing the web page.
Development checks (no production build):

```sh
pnpm -C api test:personal-agent
pnpm -C web check
pnpm -C web i18n:check-encoding
```

The integration test uses an isolated PostgreSQL-compatible PGlite database,
an HTTP server and the official MCP client. Media extraction/billing is a fixture;
the real upstream/CDN success rate must be smoke-tested after deployment with a
user-created credential and an approved points ceiling. It does not debit real
users or register a third-party agent platform.

Recharge, task quotations, total daily spending budgets, OAuth consent and
long-running video processing are later phases. Current authorization provides
a per-call ceiling and call count, not a cross-agent daily spending budget.
