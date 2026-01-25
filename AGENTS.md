# cobalt_bam — Agent Context (project-wide)

## Repo map
- `api/`: Node 20 (ESM) Express API (media downloader + users/payments + discover/social module)
- `web/`: SvelteKit frontend (Cloudflare Pages adapter + Pages Functions)
- `cobalt-chart/`: Helm chart for API (GKE)
- `docs/`: API docs + ops docs (`docs/api.md`, `docs/discover-ops.md`, websocket docs)

## Production architecture
- **Frontend**: Cloudflare Pages (project: `freesavevideo-online`)
- **Backend**: GKE (namespace: `infra`), exposed as `https://api.freesavevideo.online/`
- **WebSocket**: `wss://api.freesavevideo.online/ws` (see `docs/websocket-troubleshooting.md`)

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

