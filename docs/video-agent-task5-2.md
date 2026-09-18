# Task 5-2: durable selected-cue translation

`translate_selected` now consumes `selected-clips-v1` and the referenced owned
normalization artifact. Only cue IDs referenced by selected clips are translated;
shared references are deduplicated. The stage reuses the existing text-model
client, key, base URL, timeout and Helm configuration. Original Highlight Studio
translation behavior is unchanged. No database migration is required.

## Plan and glossary

Plans accept optional `glossary: [{source, target}]`. Entries are normalized and
sorted, with at most 100 terms, nonempty strings up to 128 characters and no
duplicate source terms. Omitted glossary becomes an empty list. Existing command
size limits also apply. Create a new plan through the normal revision-controlled
`create_plan` command to edit terms; no glossary UI editor is added in this stage.
The saved plan is the immutable glossary revision. Translation input hashes
include glossary contents, source/target language, provider/model, endpoint
fingerprint and batch algorithm version. Glossary changes invalidate translation
and downstream work while retaining transcription and selection.

## Batches and structured output

Items carry stable cue ID, source text and immutable source time. Batches have
at most 80 items, 12,000 body bytes and approximately 3,000 tokens using a bytes/3
estimate. Context around batch boundaries is read-only; split children receive
nearby sibling items as additional read-only context. Glossary and full user
payload are bounded to 48 KiB. This is a budget heuristic, not exact tokenization.
Output has an 8,192-token cap. The shared bounded Responses transport uses strict
JSON Schema, `store=false`, cancellation, disabled SDK retries and a 512 KiB
response-envelope limit. Existing Worker policy handles transient errors.

The output must contain exactly one nonempty `translatedText` for every current
cue ID, with no missing, duplicate or extra IDs and no timestamps or other fields.
Unexpected control characters and oversized text fail validation. Returned order
does not determine identity. Final cue data inherits source timing and provenance
from normalization; the provider cannot alter them.

Numbers changed, missing glossary terms, unchanged text across languages, extreme
length, fast reading and obvious script mismatch receive review flags. These are
heuristics and may flag valid names, local number formatting or short content;
they do not automatically discard translations or claim language verification.
Semantic fidelity remains a model-quality concern for Task 5-3 acceptance.

## Repair, splitting and recovery

Each batch node saves its complete raw response and request ID before interpretation,
then separately saves validated translations. Checkpoint and assets commit under
the existing Worker lease. Formatting/coverage failure allows one repair request.
If repair fails, the node splits into two smaller batches. Successful children
remain durable; a failure at one cue records its ID and fails explicitly. Refusals
fail immediately. No fallback copies source text into translated text and calls
it success. An unchanged model translation is retained with a review flag.

Recovery reuses validated batches or revalidates saved raw responses, preserving
completed children and respecting a maximum of 30 batch-tree nodes. Missing or
corrupt saved assets fail explicitly rather than silently repeating paid requests.
Requests lost before their raw checkpoint commits can still be repeated externally.
Partial recovery is within the same Run; existing manual retry rules reuse only
succeeded stages. No new internal quota settlement is introduced.

An empty selected-clips result fails with `VIDEO_AGENT_NO_VALID_CLIPS` without
calling translation. The selection stage's shortfall remains available. Successful
`translated-clips-v1` includes selected clips, source references, translated cues,
review flags and shortfall metadata. The final artifact is a typed `transcript`
asset; the checkpoint exposes `translatedClipsRef` and `translatedCueCount`.

## Limits and validation

The design's locked user subtitle edits and optional refinement remain later
editing work: this stage has no edit command and does not modify source revisions.
Translated line wrapping and subtitle exports remain `build_subtitles` / Task 6.
Full execution admission stays closed until the remaining handlers exist.

`pnpm -C api test:video-agent` covers selected-only batching, context separation,
coverage and immutable timing, glossary validation/hash invalidation, quality
flags, repair/bisection, single-cue failure, cancellation, and recovery after a
successful child checkpoint. A local HTTP endpoint with a dummy key verifies the
actual Responses SDK translation schema and prompt. Worker integration verifies
owned translated-artifact publication and read access from `build_subtitles`.

No live paid model request, production build or deployment is performed.

Validation completed: all 53 Agent tests passed, including real Worker artifact
access and publication. Translation/selection tests were rerun after propagating
source review state. Nine JavaScript syntax checks, UTF-8 document spot checks
and `git diff --check` passed. No frontend or i18n files changed.

Selection now explicitly forwards its normalization dependency reference for
translation access. Selection windows and translation batch-tree nodes are each
capped at 30 so their raw/validated/final references stay below the existing
100-output-reference Worker limit; the asset access policy is unchanged.
