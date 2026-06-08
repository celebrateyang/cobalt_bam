# cobalt_bam — Agent Context (project-wide)

## Repo map
- `api/`: Node 20 (ESM) Express API (media downloader + users/payments + discover/social module)
- `web/`: SvelteKit frontend (Cloudflare Pages adapter + Pages Functions)
- `cobalt-chart/`: Helm chart for API (GKE)
- `docs/`: API docs + ops docs (`docs/api.md`, `docs/discover-ops.md`, websocket docs)
- Upstream code reference: when the user says "upstream code", treat the local git branch `sync-api-from-upstream` as the canonical upstream-synced reference unless they explicitly mean the deployed upstream server runtime instead.

## Supported languages
- `de` (German)
- `en` (English)
- `es` (Spanish)
- `fr` (French)
- `ja` (Japanese)
- `ko` (Korean)
- `ru` (Russian)
- `th` (Thai)
- `vi` (Vietnamese)
- `zh` (Chinese)

## Production architecture
- **Frontend**: Cloudflare Pages (project: `freesavevideo-online`)
- **Backend**: GKE (namespace: `infra`), exposed as `https://api.freesavevideo.online/`
- **WebSocket**: `wss://api.freesavevideo.online/ws` (see `docs/websocket-troubleshooting.md`)
- **Network ACL note**: `api1.freesavevideo.online` is protected by a Cloudflare rule and only allows the API server egress IP. External/manual checks to `api1` are expected to fail and should not be treated as downtime.
- **Upstream server (api2) note**: `upstreamUrl=https://api2.freesavevideo.online`. In this setup, the agent can inspect upstream logs directly from local runtime (for example, `docker logs -f cobalt-upstream`).
- **Local upstream runtime note**: when switching upstream to the home-IP container, run it from `D:\code\cobalt_bam\api` with `pnpm start`.
- **Cloudflared exposure note**: to expose the local upstream service for end-to-end verification, run `cloudflared tunnel run freesave`.
- **Kubernetes ops note**: the agent has `kubectl` access. When debugging API production issues, first run `kubectl get pod -n infra` to locate API pods, then run `kubectl logs -n infra <pod-name> --since=30m` (or `-f`) to inspect API logs.

## Supported download services
- List is in `README.md` / `api/README.md` (core logic + patterns live in `api/src/processing/service-config.js`)

## Deployment (prod)

### API (GKE)
- **Trigger**: push to GitHub `main` auto-deploys via CircleCI (`.circleci/config.yml`)
- **Pipeline**: build & push image `gcr.io/ebay-mag/kubein/cobalt:<tag>` then `helm upgrade --install cobalt ./cobalt-chart -n infra ...`
- **Social sync CronJob**: `infra/cluster-metrics` runs every 12 hours (`0 */12 * * *`) and executes `node src/util/sync-enabled-accounts.js` inside the same image

### Web (Cloudflare Pages)
- Build: `pnpm -C web build`
- Deploy: `npx wrangler@4 pages deploy ".svelte-kit/cloudflare" --project-name "freesavevideo-online" --branch "main"`
- Build-time env vars live on the Cloudflare Pages project (see `web/README.md`): `WEB_DEFAULT_API`, `WEB_CLERK_PUBLISHABLE_KEY`, `WEB_TURNSTILE_KEY`, etc.

## API surface (high level)
- **Downloader**: `POST /` and `POST /expand` (request schema: `docs/api.md`), may return `redirect` or `tunnel`; tunnel served at `GET /tunnel`
- **Health/info**: `GET /`, `GET /health`, `GET /ws/health`
- **Social/Discover**: routes under `/social` (admin console + discover content)
  - Admin auth is **JWT** (env `JWT_SECRET`; middleware: `api/src/middleware/admin-auth.js`)
  - Data: `social_accounts`, `social_videos`, `social_video_events_daily`
- **Users**: routes under `/user`
  - End-user auth is **Clerk** (`@clerk/express`): `/me`, `/points/consume`, `/feedback`, `/collection-memory/*`
  - Admin endpoints: `/user/admin/*` (uses the same admin JWT)
- **Payments**: routes under `/payments`
  - WeChat Pay credits top-up (`/payments/credits/wechat/native`, `/payments/wechat/notify`)

## Auth/config notes
- Downloader endpoint auth is optional (supports API keys + sessions; see envs in `docs/run-an-instance.md` + code in `api/src/core/env.js`)
- Turnstile + JWT sessions exist (when configured): `api/src/security/turnstile.js`, `api/src/security/jwt.js`
- Multi-instance requires Redis (`API_INSTANCE_COUNT>=2` ⇒ `API_REDIS_URL`): `api/src/core/env.js`
- API envs already include `CLERK_SECRET_KEY` and `CLERK_PUBLISHABLE_KEY` in `api/.env`; do not ask again.
- For project details, read the code or add logs to verify; avoid asking the user for information that can be derived from the repo.
- Local testing: set `IS_UPSTREAM_SERVER=false` in `api/.env` so Clerk points/memory flows are enabled (the user often runs local API as upstream otherwise).

## Data/storage notes
- DB is PostgreSQL in prod (`DB_TYPE=postgresql` + `DB_*`); user + social modules require Postgres (`api/src/db/*`)
- Social/resource tables are created manually; dev: from `api/` run `pnpm run init-social`; prod (no pnpm): run `node init-social.js` (calls `src/setup-social.js` / `initDatabase`).
- Some services may need cookies for reliable extraction; cookie file is configured via `COOKIE_PATH` and mounted in Helm (`cobalt-chart/templates/deployment.yaml`)
- Instagram extraction may use an upstream fallback (`INSTAGRAM_UPSTREAM_URL`) to bypass WAF/rate-limits (see `docs/run-an-instance.md`)

## Web UI (notable routes)
- Main downloader UI: `/<lang>/`
- Discover: `/<lang>/discover`
- Admin console entry: `/<lang>/console-manage-2025`
  - Pages: `/accounts`, `/videos`, `/users`, `/orders`, `/feedback`
  - Admin token is issued by `/social/auth/login` and stored client-side as `admin_token`

## Discover/social sync + thumbnail expiry
- Sync implementation: `api/src/processing/social/sync.js` (TikTok: embed scrape + oEmbed; Instagram: profile API + oEmbed)
- `thumbnail_url` is often a signed URL with expiry (TikTok commonly ~2 days via `x-expires`)
- Tools:
  - Analyze TTL: `pnpm -C api social:thumb-expiry`
  - Sync enabled accounts: `pnpm -C api social:sync-enabled` (CronJob uses this)

## Product constraints & response format
- No paid 3rd-party APIs; prefer free oEmbed; scraping as fallback; allow graceful degradation.
- Responses use fixed format: `PM:` + `Dev:`; every `Dev` message asks 0~3 clarifying questions first, then provides方案与任务拆分.

## Encoding hygiene (must-follow)
- When editing files with non-ASCII text (e.g., Chinese), always read/write as UTF-8.
- Avoid PowerShell defaults that can introduce mojibake; prefer `python` with `encoding='utf-8'` or `apply_patch` to preserve Unicode.
- If you add new UI strings, keep them ASCII unless you can guarantee UTF-8 encoding and the file already contains Unicode.
- For `web/i18n/**/*.json`, DO NOT use `Get-Content` + `Set-Content`/`Out-File` rewrite flows. Use only:
  - `apply_patch` for localized edits, or
  - Python scripts that explicitly read/write with `encoding='utf-8'`.
- After any i18n edit, run `pnpm -C web i18n:check-encoding` before finalizing changes.

### Correct UTF-8 reading workflow (must-follow)
- Do not decide that a UTF-8 file is corrupted from PowerShell `Get-Content`, `Select-String`, or terminal-rendered output alone; Windows console codepages can display valid UTF-8 text as mojibake.
- To verify file content, read bytes/text with Python using `Path(...).read_text(encoding='utf-8')`, then print samples with `value.encode("unicode_escape").decode()` so the terminal cannot hide or create mojibake.
- Keep verification scripts ASCII-only. Represent non-ASCII expected text as Unicode escapes such as `r'\u4e2d\u6587'`, then decode inside Python with `.encode('ascii').decode('unicode_escape')`.
- Before fixing suspected encoding damage, confirm with at least one byte-safe check, such as an exact Unicode-escape sample match, `pnpm -C web i18n:check-encoding` for i18n files, or `rg -n "�|\\uFFFD|锟|鎴|馃" <file>`.
- If UTF-8 Python reads and Unicode-escape spot checks are clean, treat mojibake shown by PowerShell or the terminal as a display issue and do not rewrite the file.

### Safe copywriting edit workflow (must-follow)
- Treat PowerShell command text itself as unsafe for non-ASCII. Even when Python reads/writes files with `encoding='utf-8'`, non-ASCII literals embedded in a PowerShell here-string can be converted to `?` before Python receives them.
- For multi-locale or non-ASCII copy edits, use one of these safe approaches:
  1. Prefer `apply_patch` for small targeted edits.
  2. If a script is needed, keep the script source ASCII-only and represent non-ASCII text as Unicode escapes such as `\u597d\u770b\u89c6\u9891`, or load the copy from an existing UTF-8 file instead of embedding literal CJK/JP/KR/RU/TH text in the shell command.
  3. In Python, always use `Path(...).read_text(encoding='utf-8')` and `write_text(..., encoding='utf-8')`, and `json.dumps(..., ensure_ascii=False, indent=4)` for JSON.
- After scripted i18n edits, run all of:
  - `pnpm -C web i18n:check-encoding`
  - `rg -n "\?\?|�|\\uFFFD|锟|鎴|馃" web/i18n`
  - Spot-check the exact changed keys with Python using `value.encode("unicode_escape").decode()` for non-Latin locales, so terminal codepages cannot hide corruption.
- If the encoding check reports repeated `?` or missing expected script characters, stop feature work immediately. Restore or rewrite only the corrupted keys using an ASCII-only Python script with Unicode escapes, then rerun the checks before continuing.
- Do not ignore encoding warnings just because the build passes; a clean `pnpm -C web i18n:check-encoding` is required for any copy/i18n change.

### Encoding incident notes (2026-02)
- Root cause: in Windows PowerShell, `Get-Content` on UTF-8-without-BOM files may be decoded with legacy codepage, then writing back as UTF-8 corrupts CJK text.
- DO NOT use this pattern on CJK files:
  - `Get-Content` -> mutate array -> `[IO.File]::WriteAllLines(...)`
  - `Set-Content` / `Out-File` without explicit UTF-8 handling
- Safe edit order for CJK files:
  1. Prefer `apply_patch` for targeted edits.
  2. If scripting is required, use Python with explicit `encoding='utf-8'` for both read and write.
  3. Avoid full-file rewrite if a localized patch is enough.
  4. After edits, run a quick mojibake scan:
     - `rg -n "�|\\uFFFD|锟|鎴|馃" <file>`
     - and spot-check known CJK UI strings.
- If mojibake is detected:
  - stop further edits immediately,
  - restore text before continuing feature changes.

