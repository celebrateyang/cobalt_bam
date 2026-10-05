# Personal agent production acceptance

Date: 2026-10-05 (Asia/Shanghai).
Sites: `https://freesavevideo.online` and `https://api.freesavevideo.online`.

## Verified against production

- `/agents` returns 200 without login or JavaScript, with agent discovery markers.
- `/zh` returns 200 with an HTML discovery link/marker and HTTP Link header.
- `/llms.txt`, `/robots.txt` and `/sitemap.xml` return 200 and point to `/agents`.
- `/capabilities.json` returns `personalAgent.supported: true` and connection URLs.
- `/agent/v1/capabilities` returns supported operations, services, pricing and limits.
- `/agent/openapi.json` returns the REST contract.
- Unauthenticated balance and grant-management requests return 401.
- The signed-in user successfully created a production credential through the UI.
- The user's credential successfully reads balance through REST and the official MCP client.
- Official MCP initialization and tool discovery succeed; capabilities are readable.
- Agent credentials are rejected by grant-management and account-audit endpoints (401).
- Invalid proxy/identity parameters are rejected before media extraction (400).
- Account audit UI shows two successful balance calls and one rejected input call,
  each with zero points charged. Balance is unchanged before/after the tests.

No valid media resolution or payment was requested during these read-only checks.
No credential or signed media URL is stored in this report or test scripts.

## Authorized membership-only attempt

- The user approved one membership download and no points spending.
- The account UI shows membership is not active. The credential permits membership
  usage, but this does not create a subscription.
- The production extractor successfully resolved the public TikTok fixture through
  the Direct Bridge provider. The agent route then returned 403 `AGENT_POINT_LIMIT`
  because the credential has a zero-point ceiling and no eligible membership.
- The account audit records the failed resolution with zero charged points. No
  membership download was charged and no media file was saved.
- This verifies the zero-point spending guard. Successful delivery and replay
  remain pending; a point-funded test requires separate user authorization.

The user subsequently approved one point-funded download, with a total allowance
of at most 4 points. The existing credentials still have a zero-point ceiling;
the point-funded attempt is waiting for a suitable credential.

The next supplied credential reported `maxPointsPerCall: 20`. The verifier
stopped after the balance query because the approved allowance is 4 points.
No resolve request or charge was made with that credential. A credential with
the agreed 4-point ceiling is still required for the point-funded attempt.

## Pending

- Credential revocation and rejection on both REST and MCP.
- Dedicated read-only credential scope denial, expiry and quota boundary checks.
- Membership-funded download (the test account has no active membership).
- Muse or other specific consumer-agent platform compatibility; the official MCP
  client test proves the protocol connection, not registration in a platform.

## Successful point-funded delivery

The user explicitly approved using the supplied 20-point-ceiling credential.
The real TikTok resolve request returned a Direct Bridge redirect, with
`points.outcome: consumed` and no tunnel URL. The balance difference was 2 points.
An immediate retry with the same operation key returned `idempotency_replay`;
balance was unchanged by the retry.

The direct CDN URL was fetched without an agent Authorization header. The saved
MP4 is 5,841,755 bytes and its file header contains `ftyp`.
Temporary file: `%TEMP%/fsv-agent-acceptance/tiktok-20261005.mp4`.
SHA-256: `3936432a7d59d18e70d7aa67a4fc543ea9c33bc99419a8c814139751f1315b4d`.
No credential or signed CDN URL was saved. Do not rerun this paid fixture after
the one-hour replay window without renewed authorization.

## Reproducible probes

The subsequent user-confirmed checkout implementation has been tested locally,
not against production. Deployment and a user-completed payment are still needed
to accept the new purchase flow. Existing production download results above do
not constitute production checkout acceptance.

```sh
node api/src/util/probe-personal-agent.mjs
node api/src/util/verify-personal-agent.mjs --read-only
```

The authorized verifier accepts the test credential interactively on stdin,
with terminal echo disabled, and does not print/save it. It intentionally counts
three business calls against the grant daily limit. Do not paste credentials into
command arguments, commit them, or repeatedly run tests against a small quota.

The membership-download mode must only be run after the user approves one
membership download, using a credential with a zero-point ceiling. It parses one
public TikTok fixture, retries with the same operation key, checks balance and
saves a bounded MP4 to the system temporary directory. Reusing the mode after the
one-hour replay window could create another charge; do not repeat it without
checking prior execution and approval.

The `--download-points-once` mode requires separate explicit approval and a grant
with a 4-point ceiling by default. `--max-points=20` requires explicit approval
for the 20-point ceiling, as given for this acceptance run. It checks balance after
resolution and again after replay, asserting no additional debit on replay.
