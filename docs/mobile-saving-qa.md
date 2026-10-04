# Mobile saving verification

The API response, local processing completion, browser download handoff, and
device file save are separate events. A browser download or successful Web Share
call does not prove that a file was saved locally.

Automated checks (no production build required):

```sh
pnpm -C web test:saving
pnpm -C web check
pnpm -C web i18n:check-encoding
pnpm -C web i18n:check-completeness
```

Verify on an actual iPhone with Safari, and on Android Chrome:

1. Process a small public video. The queue says the file is ready and provides
   Save. On iPhone, Save opens a choice between downloading to Files and sharing.
2. Download to Files. Confirm Safari's download prompt and locate the actual
   file in Files/Downloads. The website reports browser handoff, not verified save.
3. Cancel sharing, then share again. Cancellation must not show a success check.
   Reuse the ready file; no new extraction or points request should be submitted.
   Check Save Video (when offered) or Save to Files in the native share sheet.
4. Process two files. On mobile, Save next file opens one file at a time; it must
   not replace a pending dialog or open multiple native share sheets.
5. On an English page, no Chinese campaign appears. On a Chinese page, campaigns
   stay hidden while processing, troubleshooting errors, or saving queued files.
6. Open saving help, a failed-save message, FAQ, and feedback. Confirm Discord
   links point to the configured channel. A FAQ search with no results must also
   offer Discord. The link may require Discord sign-in and server membership.

Clarity/GA events use `media_save` with attempt, dialog, handoff, share, cancellation,
failure, repeat, and support actions. They do not contain filenames, video URLs,
account IDs, or exception messages. Download admin records describe request-time
API responses and points reservations, not final device-save outcomes.
