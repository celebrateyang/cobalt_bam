# Personal agent access and user-confirmed checkout

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
are not exposed by media resolution. Checkout uses separate tools and permissions.
Defaults: auto mode, 720p.

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
confirm purchases, call the legacy payment endpoints, or act as an admin. Lists and revocations are bound to
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

Automatic recharge, task quotations, OAuth consent and long-running video
processing remain later phases. Download authorization provides a per-call
points ceiling and call count, not a cross-agent daily spending budget.

## User-confirmed purchases

New grants may include `payments:create` and `payments:read`. Existing grants
retain their permissions and receive zero purchase limits during the additive
schema migration. Purchase settings are independent of points/download limits:

- `purchaseCurrency`: `CNY` or `USD`, default `CNY`.
- `maxPurchaseAmount`: maximum amount of one order, in minor units (fen/cents),
  default 0, maximum 100000 (1000 CNY/USD).
- `dailyPurchaseAmount`: sum of amounts of newly created orders for this grant
  since 00:00 UTC, default 0, maximum 100000. Failed and expired orders count;
  retries using the same key do not. This limits order creation, not when users
  actually pay, and is not a shared budget across credentials.

The authorization UI displays money in major units and converts to integer
minor units. Every order requires a separate user confirmation and payment.
Checkout never automatically spends stored payment details, subscribes or
expands the grant's download/member permissions.

1. `list_payment_products` / public `GET /agent/v1/products?kind=credits&provider=wechat`
   lists products. Kind is `credits` or `memberships`; providers are `wechat`,
   `nowpayments` and `buymeacoffee`. Use only enabled products and their exact
   keys. Prices and membership benefits come from the existing payment catalog.
2. `create_checkout` / `POST /agent/v1/checkouts` requires `payments:create`:

   ```json
   {"kind":"credits","provider":"wechat","productKey":"points_50","idempotencyKey":"topup_task_123456"}
   ```

   It creates a durable local unpaid checkout in `AWAITING_CONFIRMATION`,
   returning `checkoutId`, the product and amount, `confirmationUrl` and
   `readyToContinue:false`. It does not yet call the payment provider. The same
   grant/key always identifies the same order; changed kind/provider/product
   returns 409. Deduplication has no one-hour cutoff. Unconfirmed orders expire
   after 30 minutes or at grant expiry, whichever is sooner; an expired key does
   not automatically create a replacement.
3. Present the amount and confirmation URL to the user. The page requires the
   real owner's Clerk session. The user reviews terms and confirms before the
   existing payment module creates a provider order. WeChat displays a QR code;
   NOWPayments opens a hosted invoice; Buy Me a Coffee opens its checkout and
   displays the required order code. Users perform payment themselves. The
   confirmation URL contains an order UUID, not an agent credential or login
   token. GET only reads state; it never creates a provider order.
4. `get_checkout` / `GET /agent/v1/checkouts/<checkoutId>` requires
   `payments:read` and is restricted to orders created by that exact credential.
   Poll at most once per 15 seconds. Only verified callback/query fulfillment
   can produce `status:PAID` and `readyToContinue:true`. The response omits
   provider notifications, payment credentials and user identity. A browser
   return URL, screenshot or user claiming payment is not proof of fulfillment.
5. After `readyToContinue:true`, read balance and continue the original media
   task. Point ceilings and membership permission still apply. For a previous
   failed resolution, verify its error and use a new media task key for the new
   attempt after payment. Reuse keys only for retries of the same attempt; never
   rerun a completed download outside its one-hour replay window. The external
   agent orchestrates this sequence; the server does not run a background task
   or automatically resolve/save a video after payment.

The owner page calls `GET /agent/checkouts/:id` and
`POST /agent/checkouts/:id/confirm` with `{"confirmed":true}`. An agent bearer
cannot use these endpoints. Owner identity comes from Clerk, not request IDs.
Revocation/account disablement/expiry are rechecked before confirmation. Product
changes require a new review rather than creating an order at a different price.

Provider creation is claimed durably before I/O. Concurrent/repeated confirmations
create at most one provider order. A crash or ambiguous provider response leaves
`CREATING`/`NEEDS_REVIEW`; retries do not generate another payment. Operators must
reconcile that order before advising another purchase. Shared payment orders
contain `provider_data.agent_checkout_id` for correlation, without an agent token.
Inspect the matching credit/membership order and provider transaction; do not
manually credit points or reset `CREATING` until the original transaction is
resolved. Existing payment callbacks and transactional fulfillment remain the
source of truth, including duplicate notification protection.

The shared adapter invokes the same in-process checkout/status handlers as the
website with a private WeakMap identity. HTTP headers/body cannot set it. Direct
legacy payment endpoints continue to require Clerk. Default confirmation links
use `https://freesavevideo.online`; `PERSONAL_AGENT_WEB_ORIGIN` can override this
for another deployment or localhost development.

Deploy API/schema before frontend. Run `pnpm -C api personal-agent:init` for the
additive migration, or use lazy initialization. No new paid API, provider or
secret is required. Development tests cover isolated PostgreSQL, official MCP,
authorization, budgets, checkout replay, concurrent confirmation, ambiguous
provider responses, real shared WeChat handlers with mocked provider transport,
duplicate fulfillment, and resuming a task. Production payment verification
still requires deployment and a user-completed test payment; automated tests do
not purchase anything.
