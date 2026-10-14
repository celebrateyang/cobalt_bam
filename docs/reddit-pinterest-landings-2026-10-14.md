# Reddit and Pinterest focused download pages

## Scope

The existing `/<lang>/download/reddit-video-download` and
`/<lang>/download/pinterest-video-download` URLs are retained. Neither page
renders the homepage Omnibox, the supported-service strip, generic product FAQ,
free-tool promotions, or the generic cross-platform content grid.

Reddit has a download desk, an explanation of separate picture/audio tracks,
an ordered saving walkthrough, and visible answers about silent sources,
original post URLs, native GIFs, and unavailable or external media.

Pinterest has a Pin workspace with a side walkthrough, a media classification
board (MP4/JPG/GIF), and expanded answers about image fallback, unsupported
whole-board input, and saving a Pin versus saving a device file. An image
fallback is explicitly not proof that the requested video was downloaded.

The platform-specific explanations and workflows cover all 11 current website
languages, including Indonesian. They bypass the generic locale FAQ padding,
capability additions, and German/Thai priority-template overrides. Translations
of a useful platform page remain legitimate localized versions of that page;
layout changes alone do not establish content quality or guarantee indexing.

## Download behavior

The two pages share a small single-source form, rather than the homepage UI.
It accepts recognized source-post/share links, rejects unrelated domains,
feeds/boards/profiles/raw CDN resources and multiple URLs, and calls the
existing `savingHandler` for authentication, points confirmation, extraction,
and saving/queue behavior. Pinterest regional domains on the explicit form
allowlist are passed to the existing backend normalization.

Requests explicitly use `downloadMode: auto` and disable GIF conversion so a
previous homepage mute/audio setting does not silently change this workflow.
Validated source links are kept in session storage for returning from sign-in.
No download is started automatically on page load. A task-start message does
not claim that saving has completed. No API extractor or production
configuration is changed.

## Search representation

Visible copy drives title, description, FAQ, HowTo steps and application feature
data. These two pages no longer advertise playlist/batch/audio-extraction
capabilities, a zero-price offer, or a guaranteed one-minute duration through
the shared JSON-LD. Canonical/hreflang and sitemap routing continue through the
existing site infrastructure.

Google supports localized page variants:
https://developers.google.com/search/docs/specialty/international/localized-versions

Its policies distinguish useful pages from doorway/scaled low-value content:
https://developers.google.com/search/docs/essentials/spam-policies

The reported Search Console exclusion has not been independently inspected.
This change addresses visible repetition and misleading capabilities; it does
not claim to prove the exclusion's cause or that indexing has recovered.

## Validation

- SEO contract tests cover both rendered pages and their visible/schema claims
  in all supported locales, plus source-link acceptance and rejection.
- Existing Reddit/Pinterest extractor tests exercise RSS/DASH audio discovery,
  HLS-only Pins, MP4 preference, and unavailable media handling.
- Svelte type checks and the i18n encoding check are run without a production
  build. Newly authored TypeScript copy is also checked as UTF-8 directly.
- Local browser checks cover hydrated controls, wrong-platform input,
  unsupported board input, and desktop/mobile rendering.
- No new full authenticated browser download or production deployment has been
  performed. Backend extraction tests use fixtures/mocks, not live CDN media.

After deployment, inspect these exact existing URLs in Search Console, compare
Google-selected canonical and rendered content, and monitor indexing and
successful download conversions. Do not manufacture test badges, successful
sample downloads, or ranking promises from the checks above.
