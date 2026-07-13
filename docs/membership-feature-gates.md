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
