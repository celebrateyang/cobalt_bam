# FreeSaveVideo Chrome extension

Manifest V3 extension for detecting public media URLs on the current page and opening them in FreeSaveVideo.

## MVP scope

- Detect direct media URLs from the current page DOM:
  - video/audio sources
  - image sources
  - HLS/DASH manifests
  - subtitle files
  - direct media links
- Copy detected URLs.
- Open detected public URLs in `https://freesavevideo.online/en`.
- Show a policy notice on YouTube pages and do not offer YouTube download actions.

## Not supported

- YouTube downloading inside the extension.
- Network interception.
- Private/paywalled media.
- DRM-protected streams.

## Permissions

- `activeTab`: scan only the tab the user is actively viewing.
- `scripting`: inject the scanner after the user opens the popup.
- `tabs`: read the active tab URL and title for display.
- `storage`: reserve local-only settings such as install metadata.

The MVP does not request broad host permissions and does not run a persistent scanner on every page.

## Development

```bash
pnpm -C extension build
```

Load the unpacked extension from:

```text
extension/dist
```

In Chrome:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click `Load unpacked`.
4. Select `extension/dist`.

## Store notes

The Chrome Web Store listing must not claim YouTube download support. Use a description such as:

```text
Detect media on the current page and open supported public links in FreeSaveVideo.
```

Privacy disclosure should state that the extension scans the current page DOM for media URLs, stores only local settings, and sends URLs to FreeSaveVideo only after the user clicks an open action.

package
pnpm -C extension package
