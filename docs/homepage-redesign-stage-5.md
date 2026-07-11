# Homepage redesign: stage 5 regression checks

## Automated checks

Run the full homepage production regression check from the repository root:

```sh
pnpm -C web test:homepage
```

The command builds and prerenders the site, then validates all ten localized
homepages. The regression script checks:

- exactly one H1 and semantic H2 section headings;
- server-rendered platform, capability, FAQ, and ecosystem content;
- visible FAQ plus FAQPage JSON-LD;
- canonical, x-default, and all localized hreflang links;
- exactly one NoPainStudy brand link;
- absence of free-access and zero-price structured-data claims;
- absence of disallowed domestic download links on the English homepage;
- existence of prerendered targets for homepage SEO links.

Also run:

```sh
pnpm -C web check
pnpm -C web i18n:check-encoding
```

## Browser state matrix

The following states should be checked before production deployment whenever
the downloader, queue, authentication, or PWA code changes:

| Area | State | Expected result |
| --- | --- | --- |
| Omnibox | Empty | Placeholder visible; contextual download button absent |
| Omnibox | Valid URL | Clear and contextual download actions visible |
| Omnibox | Loading / bot check | Existing spinner and disabled state visible |
| Batch | Multiple URLs | Detected-count message visible |
| Batch | Limit exceeded | Error visible and download blocked |
| Modes | Auto / audio / mute | Current mode switches without layout movement |
| Help | Collection / batch | Pointer, keyboard, and mobile popovers reachable |
| Browser | WeChat | Compatibility notice and copy action visible |
| Save help | Collapsed / open | Save-location pill expands without covering actions |
| Queue | Idle / active / expanded | Upper-right queue remains reachable and reports progress |
| PWA | Banner visible | Queue keeps its existing vertical offset |
| Account | Low points | Conditional reminder appears and can be dismissed |
| Content | Desktop / tablet / mobile | Content uses 4 / 2 / 1-column responsive layouts |
| Navigation | Mobile | Existing five-item bottom navigation remains usable |
| Theme | Light / dark | Text, borders, focus, and cards remain readable |

## Scope protection

- Do not suppress prerender 404 errors with `handleHttpError` for homepage links.
- Do not replace conditional product states with static marketing controls.
- Keep the processing queue mounted by the global layout.
- Keep the low-points reminder conditional; do not turn it into fixed homepage copy.
