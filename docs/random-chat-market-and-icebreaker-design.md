# Random Chat market positioning and text-to-video design

## 1. Document status

- Status: approved for implementation
- Target branch: `feature/random-chat-market-and-icebreaker`
- Product route: `/<lang>/random-chat`
- Backend transport: `wss://api.freesavevideo.online/ws`
- Audience: product, web, API, QA, operations, and marketing

This document defines the first implementation stage for the members-only
Random Chat product. It combines two acquisition narratives with one shared
matching pool and changes the current match-immediately-to-video behavior into
an optional, server-controlled text icebreaker followed by mutually agreed
video.

## 2. Confirmed product decisions

The following decisions are fixed for this stage:

1. Random Chat remains available only to users with an active membership that
   grants the existing `random_chat` entitlement.
2. Existing WeChat Pay and PayPal membership products, prices, order handling,
   renewals, and entitlement activation are reused without modification.
3. Western-market users are matched with all supported Asian-market users by
   default, subject to mutual compatibility.
4. Every member can filter matches by country, language, and gender. These
   filters are not reserved for a higher membership tier.
5. A user can choose whether they prefer a text icebreaker before video.
6. Text is skipped only when both matched users choose to skip it. If either
   user requests an icebreaker, both enter the text phase.
7. The text phase lasts at most three minutes.
8. Video starts only after both users consent. Declining video immediately ends
   the match for both users.
9. If the text phase expires without mutual video consent, the match ends. The
   users cannot continue texting in that match.
10. When both users skip text, the match proceeds directly to video connection.
11. Text messages are ephemeral and are not stored in PostgreSQL in this stage.
12. The three-minute text timer does not consume the existing ten-minute video
    session. The video timer starts when the match enters the video phase.

## 3. Product strategy

### 3.1 One product, two acquisition narratives

Both audiences use the same account system, membership, queue, match state
machine, and video infrastructure. The acquisition message changes by market.

#### Western markets

Initial focus: United States, Germany, France, and Spain.

Value proposition:

- meet and video chat with people across Asia;
- discover people by country, language, and gender preference;
- start with text when either person wants a lower-pressure introduction;
- switch to video only after mutual consent.

Public copy should position the service as cross-cultural social discovery. It
must not guarantee a match with a woman, imply sexual services, or claim that a
specific person is waiting for the visitor.

#### Asian markets

Initial focus: China, Japan, South Korea, Vietnam, and Thailand.

Value proposition:

- practice spoken English with real people;
- use a short text introduction before speaking;
- meet speakers from selected countries and language groups;
- build confidence through real, time-limited conversations.

Copy should say "English speakers" or "real people" unless the product has a
verified native-speaker signal. Nationality must not be treated as proof of a
native language.

### 3.2 Subscription positioning

Both sides must be active members. The public page remains readable and
indexable, while the action that enters Random Chat is protected by the
existing membership gate.

The current products are:

| Provider | Product | Price and duration |
| --- | --- | --- |
| WeChat Pay | `member_3day` | CNY 6, 3 days |
| WeChat Pay | `member_monthly` | CNY 50, 30 days |
| WeChat Pay | `member_yearly` | CNY 298, 365 days |
| PayPal | `member_monthly_recurring` | USD 7.99 monthly subscription |
| PayPal | `member_yearly_recurring` | USD 79.99 yearly subscription |
| PayPal | `member_monthly_onetime` | USD 9.99, 30-day pass |

The legacy seven-day plan remains compatible because active legacy plans grant
the same `random_chat` entitlement.

## 4. Scope

### 4.1 In scope

- add an icebreaker preference to Random Chat settings;
- preserve existing country, language, and gender filters;
- add a three-minute ephemeral one-to-one text phase;
- add video invite, accept, and decline actions;
- enforce all phase transitions on the API WebSocket server;
- delay WebRTC negotiation until video is allowed;
- restart the existing ten-minute timer when video begins;
- add localized UI states and messages for all supported languages;
- adapt page metadata and body content to the two market narratives;
- add protocol, unit, integration, and targeted web checks;
- add basic operational metrics and structured logs.

### 4.2 Out of scope

- new membership plans or payment prices;
- free Random Chat access or trial sessions;
- long-lived direct messages, inboxes, or friend lists;
- message history or transcript storage;
- image, video, audio, link preview, file, emoji-reaction, or rich-text messages;
- verified gender, age, nationality, or native-language badges;
- paid third-party moderation APIs;
- recording or storing video calls;
- a separate matching pool for each landing page;
- changes to the existing Redis or multi-instance WebSocket architecture;
- automatic translation or AI conversation coaching in the first stage.

## 5. Existing architecture to preserve

### 5.1 Membership

`random_chat` already exists in `MEMBERSHIP_FEATURE_ENTITLEMENTS`. The web page
uses the shared membership gate, and the WebSocket server verifies entitlement
on authentication, enqueue, and next-match operations.

The implementation must preserve these semantics:

- a non-member can view the public page but cannot enter the queue;
- WebSocket authentication rejects a user without an active entitlement;
- enqueue and next-match recheck entitlement;
- a membership expiring during an accepted match does not interrupt that match;
- the next enqueue or next-match request performs a fresh check.

### 5.2 Matching

The API currently keeps an in-memory queue and match map in
`api/src/core/signaling.js`. Compatibility is checked in both directions, so
each user's filters must accept the other user's profile.

The first stage retains the current first-compatible-match behavior. Ranking,
weighted geographic preference, reputation, and supply balancing can be added
later without changing the text-to-video state machine.

### 5.3 Video

The web client currently acquires camera and microphone before enqueueing and
creates a WebRTC offer immediately after a match. This behavior must be split:

- media preflight can occur before enqueue for users who choose direct video;
- WebRTC peer connection and offer creation must wait for server authorization;
- users who request text first should not be asked for camera or microphone
  permission merely to join the queue or exchange text.

## 6. User preferences and compatibility

### 6.1 Preference schema

Upgrade `RandomChatPreferences` from schema version 1 to version 2:

```ts
type RandomChatPreferences = {
    schemaVersion: 2;
    selfGender: "unspecified" | "male" | "female";
    targetGender: "any" | "male" | "female";
    targetCountry: RandomChatCountry;
    uiLanguage: "auto" | SupportedLanguage;
    useTextIcebreaker: boolean;
    autoNext: boolean;
    mirrorLocalVideo: boolean;
    muteRemoteOnJoin: boolean;
    showSafetyNotice: boolean;
};
```

Default and migration rules:

- `useTextIcebreaker` defaults to `true`;
- a missing or invalid field is normalized to `true`;
- schema-version-1 local storage is read and normalized into version 2;
- unrelated existing preferences are preserved;
- the storage key may remain stable if normalization is reliable, or move to a
  v2 key with a one-time read fallback from v1.

### 6.2 Queue payload

The profile supplied during enqueue adds:

```ts
type ChatMatchProfile = {
    selfGender?: ChatSelfGender;
    country?: string;
    language?: string;
    useTextIcebreaker: boolean;
};
```

The API treats any missing or non-boolean `useTextIcebreaker` value as `true`.
This fail-safe default prevents an old or malformed client from forcing another
user directly into video.

The queue filter also carries `targetRegion: "asia" | "western" | "any"`.
When no specific target country is selected, `en`, `de`, `fr`, and `es` pages
default to `asia`; `zh`, `ja`, `ko`, `vi`, and `th` pages default to `western`;
and `ru` remains `any`. Selecting a specific country takes precedence over the
regional default. Until a verified geo-profile field exists, the user's own
country is inferred from the localized acquisition route for matching purposes
and remains explicitly described as unverified.

### 6.3 Icebreaker calculation

After finding two mutually compatible queue entries:

```js
const icebreakerRequired =
    a.profile.useTextIcebreaker !== false ||
    b.profile.useTextIcebreaker !== false;
```

Therefore:

| User A | User B | Initial phase |
| --- | --- | --- |
| needs text | needs text | `icebreaker` |
| needs text | skips text | `icebreaker` |
| skips text | needs text | `icebreaker` |
| skips text | skips text | `video_connecting` |

## 7. Match state model

### 7.1 Server-owned phases

Each active match has exactly one phase:

```text
icebreaker
video_connecting
video
ended
```

The WebSocket server is authoritative. Client UI state never grants permission
to forward a text message or WebRTC signal.

Suggested match record:

```js
{
    id,
    a,
    b,
    phase,
    createdAt,
    icebreakerRequired,
    icebreakerExpiresAt,
    icebreakerTimer,
    videoStartedAt,
    videoExpiresAt,
    videoTimer,
    videoConsent: {
        a: false,
        b: false,
    },
    rateLimits: {
        a: createTextRateLimitState(),
        b: createTextRateLimitState(),
    },
}
```

`endChatMatch` must clear every timer and remove both WebSocket-to-match
mappings exactly once.

### 7.2 State transitions

```text
compatible match
  ├─ either user needs text ─> icebreaker
  │    ├─ both consent ──────> video_connecting
  │    ├─ either declines ───> ended(video_declined)
  │    ├─ either leaves ─────> ended(left)
  │    ├─ socket closes ─────> ended(peer_disconnected)
  │    └─ 3 minutes pass ────> ended(icebreaker_timeout)
  │
  └─ both skip text ─────────> video_connecting
       ├─ WebRTC connected ──> video
       ├─ either leaves ─────> ended(left)
       ├─ socket closes ─────> ended(peer_disconnected)
       └─ connection fails ──> ended(connection_failed)

video
  ├─ either leaves ──────────> ended(left)
  ├─ socket closes ──────────> ended(peer_disconnected)
  └─ 10 minutes pass ────────> ended(timeout)
```

### 7.3 Timer semantics

- Icebreaker TTL: 180,000 milliseconds, measured by the API server.
- Video TTL: retain the existing `CHAT_MATCH_TTL_MS`, currently represented in
  the UI as ten minutes.
- The icebreaker timer begins when `chat_matched` is sent.
- The icebreaker timer is cleared when both users consent.
- The video timer begins when the server moves to `video_connecting`.
- Clients render countdowns from absolute server timestamps.
- Client clocks are display-only; the API decides expiration.
- A late accept received after icebreaker expiration is rejected and cannot
  revive the match.

## 8. WebSocket protocol

### 8.1 Updated match event

For an icebreaker match:

```json
{
  "type": "chat_matched",
  "matchId": "abc123",
  "role": "initiator",
  "phase": "icebreaker",
  "icebreakerRequired": true,
  "icebreakerExpiresAt": 1780000000000,
  "videoExpiresAt": null,
  "peer": {
    "selfGender": "female",
    "country": "JP",
    "language": "ja"
  }
}
```

For a direct-video match, `phase` is `video_connecting`,
`icebreakerExpiresAt` is null, and `videoExpiresAt` contains the new video
deadline.

The peer payload must not expose Clerk user IDs, socket identifiers, membership
order data, IP addresses, or internal entitlement data.

### 8.2 Ephemeral text

Client request:

```json
{
  "type": "chat_text",
  "clientMessageId": "local-random-id",
  "text": "Hello! What city are you from?"
}
```

Peer event:

```json
{
  "type": "chat_text",
  "clientMessageId": "local-random-id",
  "text": "Hello! What city are you from?",
  "sentAt": 1780000000000
}
```

Server rules:

- accept only during `icebreaker`;
- require the sender to belong to the active match;
- require a string after trimming;
- maximum 500 Unicode code points per message;
- reject empty messages;
- allow at most two messages per second with a small burst allowance;
- generate `sentAt` on the server;
- never trust a sender, match ID, timestamp, or peer ID from the client;
- forward the sanitized message without persisting it.

An invalid or rate-limited message returns `chat_error` to the sender without
ending the match unless repeated abuse triggers a separate future policy.

### 8.3 Video consent

Client messages:

```json
{ "type": "chat_video_invite" }
{ "type": "chat_video_accept" }
{ "type": "chat_video_decline" }
```

Server events:

```json
{ "type": "chat_video_invited" }
{ "type": "chat_video_accepted" }
{
  "type": "chat_phase_changed",
  "phase": "video_connecting",
  "videoExpiresAt": 1780000600000
}
```

Consent semantics:

- sending an invite records the sender's video consent;
- accepting records the recipient's video consent;
- simultaneous invites count as consent from both sides;
- duplicate invite or accept messages are idempotent;
- decline is valid only in `icebreaker` and immediately ends the match;
- once both consent flags are true, the server atomically changes phase and
  notifies both clients;
- clients create or continue WebRTC negotiation only after receiving
  `chat_phase_changed` with `video_connecting`.

### 8.4 WebRTC signaling enforcement

Existing `chat_offer`, `chat_answer`, and `chat_ice_candidate` forwarding must
be allowed only during `video_connecting` or `video`.

Signals received during `icebreaker` return:

```json
{
  "type": "chat_error",
  "code": "VIDEO_NOT_AUTHORIZED",
  "message": "Mutual video consent is required"
}
```

The server should move from `video_connecting` to `video` when it receives a
small client readiness event such as `chat_video_connected` from both peers,
or retain `video_connecting` as the server phase for the lifetime of the call
if no reliable connection acknowledgment is introduced. The preferred design
is to add `chat_video_connected` for observability, while treating it as
idempotent and not trusting it for billing or membership.

### 8.5 End reasons

Normalize reasons used by the UI and metrics:

- `icebreaker_timeout`
- `video_declined`
- `media_permission_denied`
- `connection_failed`
- `timeout`
- `left`
- `peer_disconnected`

The public UI maps these codes to localized copy. It must not display raw
server messages as translated user-facing content.

## 9. Media permission behavior

### 9.1 User requests text first

- connect and enqueue without `getUserMedia`;
- remain text-only throughout the icebreaker;
- when inviting video, acquire local camera and microphone before sending the
  invite so an invitation represents operational readiness;
- when accepting, acquire media before sending acceptance;
- if permission or device acquisition fails, do not claim acceptance;
- send decline with a normalized local reason and end the match.

### 9.2 User chooses to skip text

- perform media preflight before enqueue, preserving the expectation of direct
  video if the peer also skips text;
- if the peer requires text, retain the acquired local stream without sending
  tracks to the peer;
- show the user's own local preview if appropriate, but never negotiate WebRTC
  before server authorization;
- stop all local tracks when leaving the feature or destroying the manager.

### 9.3 Browser autoplay

"Direct video" means no product-level text gate. Browser permission and
autoplay policies still apply. The UI must show a clear connect or unmute action
when browser policy prevents automatic playback.

## 10. Web UI design

### 10.1 Page states

The page state should be explicit rather than inferred from media streams:

```ts
type RandomChatStage =
    | "idle"
    | "checking_membership"
    | "connecting"
    | "searching"
    | "icebreaker"
    | "video_connecting"
    | "video"
    | "ended";
```

### 10.2 Settings

Add a clearly worded toggle:

- on: "Text before video"
- off: "Skip text when the other person also skips it"

The off-state explanation is important. It must not imply that the setting can
override the peer's preference.

### 10.3 Icebreaker panel

Show:

- peer country, declared gender, and language;
- a three-minute countdown;
- ephemeral message list;
- plain-text input and send action;
- one or more localized starter prompts;
- invite-to-video action;
- end-match action;
- an incoming invitation panel with accept and decline actions.

The decline label must state that declining ends this match. There is no
"continue text only" action.

### 10.4 Video transition

After mutual consent:

- disable text input immediately;
- clear text messages from reactive state when the transition completes;
- show camera connection progress;
- display the ten-minute video countdown supplied by the server;
- retain stop and next-match controls;
- do not automatically requeue after decline or icebreaker timeout unless the
  existing `autoNext` setting is enabled and the UI clearly shows the action.

## 11. SEO and localization

### 11.1 Route strategy

The first implementation can retain `/<lang>/random-chat` and localize its
intent by language:

- `en`, `de`, `fr`, and `es`: cross-cultural chat with people across Asia;
- `zh`, `ja`, `ko`, `vi`, and `th`: real-world English conversation practice;
- `ru`: select a neutral cross-cultural treatment until campaign targeting is
  explicitly decided.

Dedicated campaign landing routes such as `/en/random-chat/asia` or
`/zh/random-chat/english` may be introduced later if keyword research shows
that distinct URLs provide sufficient value. They are not required for the
protocol implementation.

### 11.2 Page requirements

Each localized page needs:

- unique title, description, H1, supporting body copy, and FAQ;
- accurate members-only disclosure before the primary CTA;
- country, language, and gender filtering described as preferences, not match
  guarantees;
- text-first and mutual-video-consent explanation;
- canonical URL and existing language alternate behavior;
- JSON-LD updated to include text icebreaking and mutual video consent;
- no claim that nationality proves native-language proficiency;
- no sexualized or deceptive claims about Asian women.

All supported locale files must be edited with the repository's UTF-8-safe
workflow. After any i18n change, run the required encoding and mojibake checks.

## 12. Advertising alignment

This repository does not manage Facebook campaigns, but product analytics must
allow the two campaign directions to be evaluated separately.

Recommended campaign intent values:

- `western_asia_social`
- `asia_english_practice`

Preserve existing first-touch and last-touch attribution through sign-in and
membership checkout. The landing copy, membership dialog, and post-payment
return path must maintain the same intent.

Western ad copy should emphasize cross-cultural discovery. Asian ad copy
should emphasize real conversation practice. Neither campaign may describe the
feature as free because an active membership is required.

## 13. Analytics and observability

### 13.1 Client events

Emit or record events for:

- random-chat page viewed;
- membership gate shown;
- membership checkout opened;
- matching requested;
- queue entered and canceled;
- match created;
- icebreaker started;
- text message sent;
- video invite sent;
- video invite accepted;
- video invite declined;
- icebreaker expired;
- video connection started;
- video connected;
- match ended with normalized reason.

Do not include message content, Clerk tokens, media data, or sensitive profile
values in analytics payloads.

### 13.2 Server logs and metrics

Structured logs should include only operational identifiers and coarse fields:

- match ID;
- phase transition;
- normalized end reason;
- queue wait duration;
- icebreaker duration;
- video connection duration;
- video session duration;
- declared country pair and language pair if allowed by the privacy policy;
- whether icebreaker was required;
- no text content.

Primary product metrics:

- eligible-member page-to-queue conversion;
- median and p95 queue wait time;
- compatible-match rate;
- icebreaker-to-video acceptance rate;
- direct-video connection rate;
- decline and timeout rate;
- video calls longer than 30 seconds and 3 minutes;
- repeat usage and membership renewal by campaign intent;
- supply balance by region, country, language, and declared gender.

## 14. Minimal safety and privacy controls

This stage does not introduce a full moderation system. The implementation
must still preserve inexpensive baseline protections:

- mutual video consent when either user requests text first;
- immediate leave/skip capability in every phase;
- no text or video persistence;
- text length and rate limits;
- plain-text rendering with no HTML injection;
- no peer identity or IP disclosure through application payloads;
- existing safety notice remains available;
- camera and microphone tracks stop when the user exits;
- HTTPS/WSS in production;
- TURN credentials, if later added, must not be exposed beyond the intended
  short-lived client configuration.

Reporting, blocking, verified age, and automated moderation remain future
product decisions. Their absence should be treated as a launch risk and
monitored through support incidents and payment/ad-platform feedback.

## 15. Error handling

The client must distinguish:

- membership required;
- socket authentication failure;
- queue cancellation;
- no compatible match yet;
- icebreaker expiration;
- video decline;
- media permission denial;
- no camera or microphone device;
- WebRTC negotiation failure;
- peer disconnect;
- server disconnect.

Expected errors should update page state without requiring a reload. Unknown
protocol messages are ignored safely and logged only in development. A client
must never create a peer connection because of an unrecognized or malformed
phase value.

## 16. Testing plan

### 16.1 API unit tests

- preference normalization defaults missing `useTextIcebreaker` to true;
- all four preference combinations produce the correct initial phase;
- text forwarding works only in `icebreaker`;
- empty, oversized, non-string, and rate-limited messages are rejected;
- message content is forwarded as plain text without identity spoofing;
- invite and accept produce mutual consent and one atomic transition;
- simultaneous invites transition once;
- duplicate consent events are idempotent;
- decline ends both sides with `video_declined`;
- icebreaker timeout ends both sides;
- WebRTC signaling is rejected before authorization;
- timers are cleared on leave, disconnect, next, and server shutdown;
- video receives a fresh ten-minute expiry;
- membership checks remain enforced at auth, enqueue, and next.

### 16.2 Web manager tests

- text-first matching does not request media before an invite or accept;
- direct-video preference performs media preflight;
- `chat_phase_changed` triggers WebRTC negotiation only for the initiator;
- receiver handles offer only after video authorization;
- media failure does not send false acceptance;
- local tracks stop during reset and destroy;
- stale events from a previous match do not affect the current match;
- reconnect and socket-close paths reset all phase state.

### 16.3 Page tests

- non-members see the existing membership gate;
- all members receive the same filter controls;
- the skip-text setting explains mutual behavior;
- countdown uses the correct deadline for each phase;
- decline clearly indicates that the match ends;
- icebreaker messages disappear after the match;
- mobile layout keeps input, consent, stop, and next actions usable;
- localized page metadata matches the target narrative.

### 16.4 Required repository checks

Use targeted checks only. Do not run the production build.

- API tests covering signaling and membership features;
- web type and Svelte checks with `pnpm -C web check`;
- focused test commands added for the Random Chat manager;
- `pnpm -C web i18n:check-encoding` after locale edits;
- mojibake scan required by `AGENTS.md`;
- Unicode-escape spot checks for every changed non-Latin locale key.

## 17. Implementation sequence

### Phase 1: protocol and server state machine

1. Extract or extend preference normalization.
2. Add match phases, independent timers, and cleanup.
3. Add ephemeral text forwarding and limits.
4. Add invite, accept, decline, and phase-change events.
5. Gate WebRTC signaling by server phase.
6. Add focused API tests before changing the page.

### Phase 2: web manager

1. Extend types and event map.
2. Separate socket matching from media acquisition.
3. Add text and video-consent methods.
4. Start WebRTC only after server phase authorization.
5. Harden reset, stale-event, permission, and disconnect behavior.

### Phase 3: page experience

1. Add the v2 preference and setting.
2. Introduce explicit page stages.
3. Build the three-minute icebreaker UI.
4. Add incoming invitation, accept, decline, and media-error states.
5. Preserve current stop, next, fullscreen, mirror, mute, and auto-next behavior.

### Phase 4: localization and SEO

1. Update metadata and public body content for each market narrative.
2. Add all new interaction strings for the supported languages.
3. Update JSON-LD feature descriptions.
4. Run all encoding checks and targeted web checks.

### Phase 5: observability and rollout

1. Add phase-transition and end-reason logs without message content.
2. Add funnel events with campaign intent.
3. Deploy behind an environment-controlled feature flag if practical.
4. Verify two real members through text-first, direct-video, decline, timeout,
   leave, and reconnect paths.
5. Monitor queue wait, consent, connection, error, and renewal metrics before
   increasing ad spend.

## 18. Acceptance criteria

The stage is complete when all of the following are true:

1. Existing WeChat Pay and PayPal members can enter Random Chat without a new
   purchase or migration.
2. Non-members cannot authenticate or enqueue for Random Chat.
3. Country, language, and gender filters remain available to every member.
4. If either matched user requests text, both receive a synchronized
   three-minute icebreaker.
5. If both users skip text, video negotiation begins without the text UI.
6. Video negotiation cannot begin during icebreaker without mutual consent.
7. Accepting video transitions both users to a fresh ten-minute video session.
8. Declining video ends the match for both users and text cannot continue.
9. Icebreaker expiry ends the match for both users and cannot be revived.
10. Text is rate-limited, rendered safely, and not stored.
11. Local media is not acquired early for text-first users.
12. Every timer and media track is cleaned up on timeout, leave, next, socket
    close, and page destruction.
13. Localized SEO copy accurately reflects the selected regional narrative and
    discloses membership requirements.
14. Targeted tests and required UTF-8 checks pass without running a production
    build.

## 19. Future extensions

The design deliberately leaves room for:

- topic and interest matching;
- declared English proficiency and willingness to help learners;
- translation and phrase suggestions;
- report and block lists;
- reputation and repeat-match suppression;
- queue supply balancing and estimated wait time;
- dedicated SEO campaign routes;
- verified profile attributes;
- Redis-backed cross-instance matching;
- TURN credential management and regional relay selection.

These extensions must not weaken the central invariant: when either person
chooses text first, video requires explicit consent from both people.
