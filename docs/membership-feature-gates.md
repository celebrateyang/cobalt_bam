# Membership feature gates

The paid membership plans grant these product entitlements:

- `ai_video_studio`
- `video_recording`
- `random_chat`

Both `member_monthly` and `member_yearly` grant the same entitlements. The
existing `member_download` entitlement remains separate.

## Eligibility API

```http
GET /user/features/:feature/eligibility
Authorization: Bearer <ClerkToken>
```

Supported `:feature` values are the three entitlement keys above.

Eligible response:

```json
{
  "status": "success",
  "data": {
    "supported": true,
    "eligible": true,
    "feature": "video_recording",
    "reason": null,
    "membership": {
      "active": true,
      "planKey": "member_monthly",
      "entitlements": [
        "ai_video_studio",
        "member_download",
        "random_chat",
        "video_recording"
      ]
    }
  }
}
```

An authenticated non-member receives HTTP 200 with `eligible: false` and
`reason: "MEMBERSHIP_REQUIRED"`. An active member whose plan does not grant
the requested entitlement receives `reason: "ENTITLEMENT_MISSING"`.

Unknown feature keys return HTTP 404 with error code `FEATURE_NOT_FOUND`.
Missing or invalid Clerk authentication returns HTTP 401 with error code
`UNAUTHORIZED`.

The `/user/me` membership object also includes the active plan's
`entitlements` array.

## Web integration

Use `requireMembershipFeature` from `$lib/membership/gate` at the action that
starts a protected feature:

```ts
const allowed = await requireMembershipFeature("video_recording");
if (!allowed) return;
```

The helper checks the API and opens the shared membership dialog when sign-in
or membership is required. It returns `true` only when the server grants the
feature.

## Enforced features

### Random chat

Random chat no longer uses paid credit-order history as an eligibility signal.
The legacy `/user/chat/eligibility` endpoint now checks the `random_chat`
entitlement and returns `requireMembership: true`.

The WebSocket server enforces the same entitlement when the client:

- authenticates the random-chat socket;
- enters the matching queue;
- requests the next match.

An active call is not interrupted when membership expires. The next queue or
next-match request performs a fresh membership check.

### Video recording

The recording page remains publicly visible. The web client calls
`requireMembershipFeature("video_recording")` before recording preflight,
countdown, or camera/microphone acquisition. Once recording starts, it can be
completed and exported without another membership check.
