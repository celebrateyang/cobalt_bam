# Bilibili Direct MP4 Download Design

## Goal

For Bilibili videos, especially very long videos and collection / playlist batches, prefer returning a browser-downloadable MP4 CDN URL when Bilibili provides one. This reduces API server bandwidth because the client browser downloads directly from Bilibili CDN instead of using `/tunnel` or server-side merge.

This design is based on the June 2026 investigation around:

- `https://www.bilibili.com/video/BV1ZgVZ6ZE6H/`
- `https://www.bilibili.com/video/BV1zG5e6AEZJ/`

## Confirmed Behavior

Bilibili `x/player/playurl` can return two useful shapes for the same BV/CID:

1. DASH / split media
   - Current code path uses `fnval=4048`.
   - Response contains separate video `.m4s` and audio `.m4s`.
   - Requires merge/remux, currently handled by API tunnel or frontend local-processing queue.

2. Progressive MP4
   - Request with:
     - `fnval=0`
     - `platform=html5`
     - `high_quality=1`
     - `qn=64`
   - Response contains `data.durl[0].url`, often a single `*-192.mp4`.
   - For tested links, `HEAD` returned `200`, `content-type: video/mp4`, and valid `content-length`.

For `BV1ZgVZ6ZE6H`, the MP4 URL was about 7.29 GB / 6.79 GiB and directly accessible from a browser-like request.

For `BV1zG5e6AEZJ`, the root BV and sampled `ugc_season` episodes each produced direct MP4 URLs.

## Existing Relevant Code

API:

- `api/src/processing/services/bilibili.js`
  - Fetches Bilibili metadata and DASH playurl.
  - Currently returns `[videoUrl, audioUrl]` for Bilibili `.com`.

- `api/src/processing/match-action.js`
  - For `host === "bilibili"` and video action, currently sets `type: "merge"`.
  - `r.forceRedirect` can short-circuit into `redirect`, but this happens before the later `alwaysProxy` conversion.

- `api/src/processing/expand.js`
  - Already expands Bilibili multi-part videos and `ugc_season` collections into batch items.
  - Collection items are normal BV URLs, which is compatible with per-item MP4 extraction.

Web:

- `web/src/components/dialog/BatchDialog.svelte`
  - Batch requests set:
    - `request.localProcessing = "forced"`
    - `request.batch = true`

- `web/src/lib/api/saving-handler.ts`
  - Redirect handling already has a batch branch.
  - For forced batch redirect responses that are not `/tunnel`, it should not fetch the CDN URL in a worker because cross-origin fetch may fail and huge files stress browser storage.

- `web/src/lib/task-manager/queue.ts`
  - Existing queue is built around worker pipelines and final `File` objects.
  - This is not a good fit for large direct CDN MP4 URLs.

## Previous Attempt Summary

The rollbacked attempt did the following:

1. Added a progressive MP4 fetch in `bilibili.js`.
2. Returned:

```js
{
    urls: mp4Url,
    forceRedirect: true,
    filename: `bilibili_${id}.mp4`,
    duration,
    directClientDownload: true,
}
```

3. Allowed `match-action.js` to return `redirect`.
4. Added a `directUrl` queue item on the frontend so batch MP4 redirects could appear in the queue without fetching the file.

The basic extraction worked, but review found several release blockers.

## Review Findings From Previous Attempt

### 1. Audio-only regression

The previous implementation tried progressive MP4 before knowing the user's requested action.

Risk:

- If the user selects audio-only for Bilibili, the extractor may return a full MP4.
- `match-action.js` would then process the MP4 as the audio input.
- For long videos, this means downloading many GB just to extract audio.

Required fix:

- Progressive MP4 must only be used for normal video downloads.
- Do not use it for:
  - `downloadMode=audio`
  - `downloadMode=mute`
  - future modes that require DASH audio/video streams.

Implementation options:

- Pass request intent into `bilibili()` from `match.js`, for example:

```js
r = await bilibili({
    ...patternMatch,
    preferProgressiveMp4: !isAudioOnly && !isAudioMuted,
});
```

- Or let `bilibili()` return both progressive and DASH candidates, and let `match-action.js` choose based on action.

Recommended: pass an explicit `preferProgressiveMp4` boolean. It is smaller and safer.

### 2. `alwaysProxy` / privacy regression

The previous implementation used `forceRedirect: true`. In `match-action.js`, `forceRedirect` is handled before the `alwaysProxy` conversion, so Bilibili could redirect even when the user enabled forced tunneling.

Risk:

- User expects server tunnel for privacy / network compatibility.
- Direct redirect exposes the client's browser/IP to Bilibili CDN.

Required fix:

- Do not bypass `alwaysProxy` for ordinary single downloads.
- Direct MP4 redirect should be allowed only when:
  - request is batch, and
  - request explicitly opts into client direct Bilibili MP4, or
  - a new API flag says client-direct is allowed.

Recommended:

- Add an internal response field such as `clientDirectUrl`.
- In `match-action.js`, only return redirect for that field when:

```js
host === "bilibili"
&& isBatchRequest === true
&& alwaysProxy !== true_for_user_privacy
```

Important nuance:

- Current batch sets `localProcessing="forced"`, which currently makes `alwaysProxy=true`.
- Do not use `alwaysProxy` alone to represent both privacy preference and "batch should go into queue".
- Separate these concepts.

Suggested API request flag:

```ts
bilibiliDirectMp4?: boolean
```

Batch dialog can set it for Bilibili items only.

### 3. Points and collection memory finalized too early

The previous frontend created a direct URL queue item, then immediately finalized points and marked collection memory as downloaded.

Risk:

- User may never click Save.
- Popup/new tab may be blocked.
- Direct URL may expire before the user saves.
- Item is still charged and hidden from future collection batches.

Required fix:

- For direct URL queue items, finalize points and mark collection memory only after the user clicks Save.
- If possible, finalize after `downloadFile()` is invoked successfully enough to open the URL or show the saving dialog.

Recommended:

- Store pending points/collection metadata on the direct queue item.
- Add a helper:

```ts
markDirectQueueItemSaveRequested(id)
```

This helper should:

- set `saveRequested=true`
- finalize points hold
- mark collection memory

If `downloadFile()` falls back to a saving dialog, finalize after the user clicks from that dialog if feasible. If not feasible, finalize when Save is clicked in the queue item, not when the API response arrives.

### 4. Queue wording and progress semantics

The previous implementation counted direct URL items as `done`, and the batch summary said "successfully downloaded".

Risk:

- Direct URL item is not downloaded yet; it is only ready to save.
- User may misunderstand queue completion.

Required fix:

- Add a separate direct-ready state or explicit `directUrl` wording.

Options:

1. Add queue state:

```ts
state: "ready" | "waiting" | "running" | "done" | "error"
```

2. Keep `state: "done"` but add UI wording:

- file-backed item: "downloaded, save now"
- direct-url item: "ready, click Save"

Recommended:

- Minimal change: keep `done` but update text and batch summary to avoid saying downloaded for direct URL items.
- Better change: introduce `ready` state if there is time.

## Recommended Implementation Plan

### Phase 1: API progressive MP4 extraction

In `api/src/processing/services/bilibili.js`:

1. Add `fetchComProgressivePlayInfo({ id, cid })`.
2. Use:

```js
fnval=0
platform=html5
high_quality=1
qn=64
```

3. Add `pickProgressiveMp4(playInfo)`.
4. Add `com_progressive_download(id, partId)`.
5. Only call it when `preferProgressiveMp4 === true`.

Suggested extractor result:

```js
{
    urls: progressiveUrl,
    filename: `${filenameBase}.mp4`,
    duration: toSeconds(playInfo.timelength),
    typeId: "redirect",
    directClientDownload: true,
}
```

Avoid using generic `forceRedirect` unless `match-action.js` is made aware of privacy and batch rules.

### Phase 2: Pass request intent into Bilibili service

In `api/src/processing/match.js`, change:

```js
r = await bilibili(patternMatch);
```

to something like:

```js
r = await bilibili({
    ...patternMatch,
    preferProgressiveMp4:
        !isAudioOnly &&
        !isAudioMuted &&
        params.batch === true &&
        params.bilibiliDirectMp4 === true,
});
```

If adding a public schema flag feels too broad, use an internal flag derived from batch mode for Bilibili only.

### Phase 3: Response selection in `match-action.js`

Add a Bilibili-specific redirect branch for progressive MP4:

```js
if (
    host === "bilibili" &&
    action === "video" &&
    isBatchRequest === true &&
    r.directClientDownload === true &&
    typeof r.urls === "string"
) {
    return createResponse("redirect", {
        url: r.urls,
        filename: defaultParams.filename,
        duration: defaultParams.duration,
    });
}
```

Do not let this branch run for audio/mute.

Be careful with `alwaysProxy`:

- If `alwaysProxy` is user privacy preference, respect it.
- If batch uses `localProcessing=forced` only to force queue behavior, do not treat it as privacy preference.

Long-term cleanup:

- Split `alwaysProxy` into:
  - `userAlwaysProxy`
  - `forceQueueProcessing`

### Phase 4: Frontend direct URL queue item

Add to queue type:

```ts
directUrl?: string;
directUrlType?: "redirect";
```

Recommended direct queue item shape:

```ts
{
    id,
    state: "done", // or "ready" if adding new state
    pipeline: [],
    filename,
    mimeType: "video/mp4",
    mediaType: "video",
    directUrl,
    originalRequest,
    points,
    collectionMemory,
    batchSessionId,
    batchSelectionTotal,
}
```

Do not put direct MP4 into fetch workers.

### Phase 5: Direct URL save action

In `ProcessingQueueItem.svelte`:

- If `info.directUrl`, Save should call:

```ts
downloadFile({
    url: info.directUrl,
    urlType: "redirect",
});
```

- Then finalize points and mark collection memory from this Save click path.

Do not finalize points at API response time.

### Phase 6: Batch status wording

For direct URL items:

- Status text before save: "ready to save"
- After click: "Save clicked"

Avoid saying "downloaded" before the user clicks Save.

If changing i18n, follow the project's UTF-8 rules:

- Use `apply_patch` or explicit Python UTF-8.
- Run:

```bash
pnpm -C web i18n:check-encoding
rg -n "\?\?|�|\\uFFFD|锟|鎴|馃" web/i18n
```

## API Schema Consideration

If adding a new request flag, update:

- `api/src/processing/schema.js`
- `web/src/lib/types/api.ts`
- Any request sanitizer / allowlist code.

Potential flag:

```ts
bilibiliDirectMp4?: boolean
```

Default should be `false` unless explicitly enabled by the frontend batch flow.

Reason:

- Avoid surprise privacy / quality behavior changes for existing API users.
- Avoid audio-only regressions.

## Quality and Fallback Rules

Progressive MP4 is usually lower quality than DASH.

Rules:

1. Use progressive MP4 for batch video downloads where bandwidth saving is the goal.
2. Use existing DASH merge for:
   - audio-only
   - mute video
   - higher-quality modes
   - user-forced tunnel/privacy mode
   - progressive MP4 unavailable
3. Keep upstream fallback for cases where local Bilibili API extraction fails.

## Testing Checklist

API direct MP4:

- `BV1ZgVZ6ZE6H`
  - Should return `redirect`
  - URL path should end in `.mp4`
  - Should work despite duration > `DURATION_LIMIT`

- `BV1zG5e6AEZJ`
  - Root BV should return `redirect`
  - At least one `ugc_season` episode should return `redirect`

Fallback:

- Force progressive MP4 unavailable and confirm DASH path still works.
- Bilibili TV path should remain unchanged.
- Bangumi `epId` should still return platform restricted.

Modes:

- Bilibili video mode batch: direct MP4 redirect allowed.
- Bilibili audio-only: must not use full MP4 progressive input.
- Bilibili mute: must not use progressive MP4 unless explicitly designed and tested.
- Single download with user `alwaysProxy=true`: must not direct redirect.

Frontend:

- Batch direct MP4 item appears in queue.
- It does not start fetch worker.
- User click Save opens direct URL.
- Points finalize only after Save click.
- Collection memory marks only after Save click.
- Queue text says ready/save, not downloaded, before Save click.
- Direct URL expiration behavior is acceptable; retry should call API again for a fresh URL.

Build / checks:

```bash
node --check api/src/processing/services/bilibili.js
node --check api/src/processing/match-action.js
pnpm -C web check
pnpm -C web build
```

Note: as of the investigation, `pnpm -C web check` and `pnpm -C web build` had unrelated existing failures / crashes. Do not treat those as introduced by this feature unless changed-file diagnostics appear.

## Suggested Prompt For Future Coding

Use this prompt next time:

> Implement the Bilibili direct MP4 optimization described in `docs/bilibili-direct-mp4-design.md`. Keep it scoped to Bilibili batch video downloads only. Do not affect audio-only, mute, single-download forced tunnel/privacy behavior, or Bilibili TV. Direct MP4 batch items should appear in the queue as ready-to-save URL items and should not be fetched by workers. Finalize points and collection memory only when the user clicks Save for the direct URL item. Preserve fallback to the existing DASH merge path when progressive MP4 is unavailable.

