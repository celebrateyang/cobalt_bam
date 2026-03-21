# Clipboard Personal Session MVP Contract

## Scope and Decisions

This document defines an MVP for "fixed personal session" on top of the existing clipboard P2P transfer flow.

Confirmed product decisions:

- Only devices from the same logged-in account can join a personal session.
- Personal sessions allow at most 2 devices.
- User can manually reset personal session code.
- "Transfer to device" after download defaults to personal session for logged-in users.
- Random session flow stays available.

Important architecture note:

- Current file transfer is browser-to-browser over WebRTC DataChannel.
- This MVP does not add server-side file queue/upload APIs.

## API Contract (HTTP)

Base path: `/user/clipboard/personal`

Auth:

- Requires `Authorization: Bearer <ClerkToken>`.
- Returns `401 UNAUTHORIZED` if token missing/invalid.

Device identity fields (for all write endpoints):

- `deviceId`: stable per browser/app install (required, string, max 128).
- `deviceName`: user-friendly device name (optional, string, max 64).
- `platform`: `web | ios | android | macos | windows | linux | unknown` (required).

### 1) Get Personal Session Profile

`GET /user/clipboard/personal`

Purpose:

- Read fixed personal code and active session summary.

Response `200`:

```json
{
  "status": "success",
  "data": {
    "personalCode": "K7M4Q9T2C6",
    "codeVersion": 3,
    "hasActiveSession": true,
    "activeSession": {
      "sessionId": "ps_7bbf47a5ff3c",
      "onlinePeers": 1,
      "maxPeers": 2,
      "expiresAt": 1760000000000
    }
  }
}
```

### 2) Open Personal Session (idempotent)

`POST /user/clipboard/personal/open`

Purpose:

- Open or reuse current user's personal session.
- Return a short-lived ticket for WebSocket `create_session`.

Request:

```json
{
  "deviceId": "web-7bcae934-8f2e-4db1-a40f-06d2ecdaef71",
  "deviceName": "Chrome on MacBook Pro",
  "platform": "web"
}
```

Response `200`:

```json
{
  "status": "success",
  "data": {
    "sessionType": "personal",
    "sessionId": "ps_7bbf47a5ff3c",
    "personalCode": "K7M4Q9T2C6",
    "codeVersion": 3,
    "maxPeers": 2,
    "onlinePeers": 1,
    "wsTicket": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9....",
    "wsTicketExpiresAt": 1760000005000
  }
}
```

### 3) Join Personal Session (one-click on second device)

`POST /user/clipboard/personal/join`

Purpose:

- One-click join for same account.
- If full, replace oldest offline peer only.

Request:

```json
{
  "deviceId": "iphone-3f8a2f65-9ad8-4db5-9d3b-7f6645d76f95",
  "deviceName": "iPhone 15 Pro",
  "platform": "ios"
}
```

Response `200`:

```json
{
  "status": "success",
  "data": {
    "sessionType": "personal",
    "sessionId": "ps_7bbf47a5ff3c",
    "maxPeers": 2,
    "onlinePeers": 1,
    "replacedPeer": {
      "deviceId": "web-old-device-id",
      "reason": "offline_replaced"
    },
    "wsTicket": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9....",
    "wsTicketExpiresAt": 1760000009000
  }
}
```

Error `409` when both peers are online:

```json
{
  "status": "error",
  "error": {
    "code": "SESSION_FULL_ONLINE",
    "message": "Two devices are currently online"
  }
}
```

### 4) Reset Personal Code

`POST /user/clipboard/personal/reset-code`

Purpose:

- Rotate personal code.
- Invalidate active personal session and kick connected peers.

Request:

```json
{
  "reason": "manual_rotate"
}
```

Response `200`:

```json
{
  "status": "success",
  "data": {
    "personalCode": "R3V8H2QW6M",
    "codeVersion": 4,
    "rotatedAt": 1760000012000,
    "invalidatedSessionId": "ps_7bbf47a5ff3c"
  }
}
```

## WebSocket Contract Changes

Existing path stays `/ws`.

Existing message types (`create_session`, `join_session`) are extended, not replaced.

### create_session (extended)

```json
{
  "type": "create_session",
  "sessionType": "personal",
  "sessionId": "ps_7bbf47a5ff3c",
  "wsTicket": "<short-lived ticket from open>",
  "deviceId": "web-7bcae934-8f2e-4db1-a40f-06d2ecdaef71",
  "publicKey": [1,2,3]
}
```

Rules:

- `sessionType=random` keeps old behavior.
- `sessionType=personal` requires valid `wsTicket`.
- Server validates ticket user/session/device binding before attaching socket.

### join_session (extended)

```json
{
  "type": "join_session",
  "sessionType": "personal",
  "sessionId": "ps_7bbf47a5ff3c",
  "wsTicket": "<short-lived ticket from join>",
  "deviceId": "iphone-3f8a2f65-9ad8-4db5-9d3b-7f6645d76f95",
  "publicKey": [4,5,6]
}
```

### New server error messages

- `error.code = PERSONAL_SESSION_FORBIDDEN`
- `error.code = SESSION_FULL_ONLINE`
- `error.code = PERSONAL_CODE_ROTATED`
- `error.code = WS_TICKET_INVALID`
- `error.code = DEVICE_REPLACED`

### Device replacement behavior

- Online definition: `last_heartbeat_at <= 45s`.
- If peer count is 2 and one peer is offline, oldest offline peer can be replaced.
- If 2 peers are online, reject with `SESSION_FULL_ONLINE`.

## Download -> Transfer Default Flow

Source integration point:

- `web/src/components/queue/ProcessingQueueItem.svelte` (`transfer(file)`).

New behavior:

1. User clicks transfer after a file is downloaded.
2. If logged in, route to clipboard page with personal mode (example: `/<lang>/clipboard?mode=personal&autostart=1`).
3. Clipboard page auto calls `/user/clipboard/personal/open`.
4. Page establishes WS session using returned `sessionId + wsTicket`.
5. Preselected downloaded file stays in local file list and can be sent once peer is connected.
6. If user is not logged in, fallback to existing random-session flow.

## Error Codes

HTTP and WS should use unified codes:

- `UNAUTHORIZED`
- `INVALID_INPUT`
- `PERSONAL_SESSION_FORBIDDEN`
- `SESSION_NOT_FOUND`
- `SESSION_FULL_ONLINE`
- `PERSONAL_CODE_ROTATED`
- `WS_TICKET_INVALID`
- `RATE_LIMITED`
- `SERVER_ERROR`

## Implementation Split (MVP)

API:

- Add endpoints in `api/src/routes/user.js` under `/clipboard/personal/*`.
- Add db helpers in `api/src/db/users.js` and new clipboard db module if needed.

WS:

- Extend personal session handling in `api/src/core/signaling.js`.
- Enforce same-account ticket verification and max 2 peers.

Web:

- Add personal-session API client (new file suggested: `web/src/lib/api/clipboard-personal.ts`).
- Update transfer entry in `web/src/components/queue/ProcessingQueueItem.svelte`.
- Add autostart personal mode in `web/src/routes/[lang]/clipboard/+page.svelte`.

I18n:

- Add new keys in `web/i18n/*/clipboard.json` (see copywriting doc).
