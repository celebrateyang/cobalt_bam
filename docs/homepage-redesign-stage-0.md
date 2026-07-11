# Homepage redesign: stage 0 specification

## Goal

Modernize the FreeSaveVideo homepage without changing downloader behavior or
removing existing product entry points. The downloader remains the strongest
visual element. This stage does not add the NoPainStudy promotion; that belongs
to a later content-stage change.

## Baseline information architecture

1. Global application shell
   - Desktop sidebar and mobile bottom navigation
   - Dialog holder
   - Processing queue and queue popover
   - PWA install banner
   - Turnstile
   - Curious Cat
2. Homepage primary workflow
   - Supported-services popover
   - H1 and supported-platform summary
   - Link input, contextual clear and download controls
   - Feedback entry
   - Save-location help
   - Auto, audio, and mute modes
   - Collection and batch help popovers
   - Paste action
3. Conditional workflow states
   - Notification banner
   - Loading and bot-check states
   - Multiple-link count and limit error
   - WeChat browser notice
   - Low-points prompt for eligible signed-in users
4. Search and answer-engine content
   - Popular download and guide links
   - More FreeSaveVideo tools
   - Supported-platform descriptions
   - Product capability copy and FAQ structured data

## Stage 1 layout rules

- Keep the existing sidebar information architecture and mobile navigation.
- Use a compact hero; avoid decorative empty space above the input.
- Keep `SupportedServices` above the H1 as a small disclosure control.
- Give the omnibox the strongest border, shadow, and focus treatment.
- Keep feedback beside the input on desktop and in the existing mobile helper row.
- Keep save-location help directly under the input.
- Keep mode selection, collection/batch help, and Paste in one action region.
- Do not add a permanently visible submit button. `DownloadButton` remains
  contextual and appears only when the current input is downloadable.
- The processing queue remains fixed at the upper-right through the global
  layout and must continue to avoid the PWA banner.
- Do not add fixed marketing copy about pricing, plans, points, credits,
  memberships, or free use. Preserve the existing conditional low-points
  account-state reminder.

## Responsive behavior

### Desktop (greater than 600 px)

- Compact 80 px application sidebar remains visible.
- Homepage content is centered and limited to approximately 1120 px.
- Hero copy is limited to approximately 900 px.
- Omnibox controls retain their current desktop grouping.
- Processing queue remains at the upper-right.

### Mobile (600 px and below)

- Existing five-item bottom navigation remains authoritative.
- Hero and omnibox align to the mobile content gutter.
- Feedback and collection/batch help use the existing mobile helper row.
- Content never sits underneath the bottom navigation or safe-area inset.
- Queue, PWA, dialogs, and notices keep their existing responsive behavior.

## State acceptance matrix

| State | Expected result |
| --- | --- |
| Empty input | Link icon and placeholder are visible; no download button |
| Valid single URL | Contextual download and clear actions are visible |
| Loading / bot check | Link icon becomes the existing progress indicator |
| Multiple URLs | Detected-count hint is visible below the input |
| Batch limit exceeded | Error hint is visible and download is blocked |
| WeChat browser | Compatibility notice and copy-page-link action are visible |
| Save-location help | Inline pill expands without moving unrelated controls |
| Collection/batch help | Keyboard, pointer, and mobile popovers remain reachable |
| Queue idle | Upper-right queue stub remains reachable |
| Queue active | Count/progress and expanded queue remain usable |
| PWA banner visible | Queue uses its existing vertical offset |
| Reduced motion | Nonessential animations remain disabled |
| Dark theme | Contrast remains readable using existing theme variables |

## SEO/GEO invariants

- Preserve one visible H1.
- Preserve canonical and alternate-language links.
- Preserve WebSite, WebPage, FAQPage, and WebApplication structured data where
  factually correct.
- Do not claim free access or emit a zero-price Offer.
- Preserve descriptive platform links and visible capability copy.
- Later content work must ensure important descriptive content is present in
  server-rendered HTML rather than relying solely on viewport-triggered loading.

## Stage 1 verification

- `pnpm -C web check`
- `pnpm -C web build`
- Inspect desktop and mobile default states.
- Inspect valid-link, loading, batch, popover, and WeChat conditional states.
- Confirm the processing queue remains mounted by the global layout.
- Confirm rendered JSON-LD contains no free-access or zero-price claim.
