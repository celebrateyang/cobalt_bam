# YouTube byte-range resume fix (2026-10-11)

## Observed problem

For a production YouTube video tunnel, requests for `bytes=0-1023` and
`bytes=4194304-4195327` both returned HTTP 200, the full file length, no
Content-Range, and identical first 1024 bytes. This confirmed an ignored offset
for that sample, not a general encoding or FFmpeg problem.

The frontend already discards the duplicate prefix when resuming an ignored
Range response. That preserves saved bytes but wastes transfer time and traffic
after interruption. Ordinary uninterrupted HTTP 200 downloads consume one full
response; they do not repeatedly download the whole file for every chunk.

## Fix

The active public proxy in `api/src/stream/proxy.js` already forwards Range and
Content-Range. The missing handling was in `api/src/stream/internal.js`:

- Resolve a single bounded, open-ended, or suffix byte range after probing the
  source's total size. Use BigInt for offsets and lengths.
- Read source chunks from the requested start, stopping at the requested end.
- Return HTTP 206 with Content-Range, partial Content-Length and Accept-Ranges.
- Return HTTP 416 with `Content-Range: bytes */<size>` for unsatisfiable ranges.
- Ignore malformed or unsupported multiple ranges and serve the full response.
- Validate source segment bounds, total size and actual body length before
  declaring completion. Reject ignored or mismatched source ranges instead of
  appending duplicate or incorrect bytes. Preserve 403 URL-refresh handling
  at the current offset.

The same internal chunk handler is shared with VK. HLS routing is unchanged.
Audio/video concurrency, codec selection and FFmpeg policies are unchanged.

## Verification and deployment scope

Targeted tests exercise range parsing, chunk boundaries, 403 refresh at a
nonzero offset, source range mismatches, and short/oversized bodies. A local
HTTP integration test uses the real public proxy and internal tunnel with a
deterministic media source larger than one 8 MB internal chunk. It verifies
byte-for-byte reconstruction after cancellation and retry, partial headers,
suffix/clamped ranges, 416, and unchanged full-file downloads.

Validation: 21 tests passed across byte-range, internal-chunks, internal-range,
proxy, manage and internal-hls suites. JavaScript syntax checks and
`git diff --check` also passed. No production build was run.

These are local tests, not post-deployment YouTube browser validation. The fix
must reach the upstream runtime that owns the Google media URL and runs the
internal chunk handler (currently the global api3 route), as well as any other
runtime using this handler. Updating only the frontend or a forwarding API
does not fix an upstream that still returns HTTP 200 from offset zero.

HTTP reference: https://www.rfc-editor.org/rfc/rfc9110.html#section-14
