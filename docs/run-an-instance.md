# how to host a cobalt instance yourself
## using docker compose and package from github (recommended)
to run the cobalt docker package, you need to have `docker` and `docker-compose` installed and configured.

if you need help with installing docker, follow *only the first step* of these tutorials by digitalocean:
- [how to install docker](https://www.digitalocean.com/community/tutorial-collections/how-to-install-and-use-docker)
- [how to install docker compose](https://www.digitalocean.com/community/tutorial-collections/how-to-install-docker-compose)

## how to run a cobalt docker package:
1. create a folder for cobalt config file, something like this:
    ```sh
    mkdir cobalt
    ```

2. go to cobalt folder, and create a docker compose config file:
    ```sh
    cd cobalt && nano docker-compose.yml
    ```
    i'm using `nano` in this example, it may not be available in your distro. you can use any other text editor.

3. copy and paste the [sample config from here](examples/docker-compose.example.yml) for either web or api instance (or both, if you wish) and edit it to your needs.
    make sure to replace default URLs with your own or cobalt won't work correctly.

4. finally, start the cobalt container (from cobalt directory):
    ```sh
    docker compose up -d
    ```

if you want your instance to support services that require authentication to view public content, create `cookies.json` file in the same directory as `docker-compose.yml`. example cookies file [can be found here](examples/cookies.example.json).
for vimeo, adding `vimeo_bearer` (`access_token=<token>`) lets cobalt prefer Vimeo's direct file links and keep downloads on redirect instead of tunneling through your server when possible.

cobalt package will update automatically thanks to watchtower.

it's highly recommended to use a reverse proxy (such as nginx) if you want your instance to face the public internet. look up tutorials online.

## run cobalt api outside of docker (useful for local development)
requirements:
- node.js >= 18
- git
- pnpm
- `yt-dlp` (recommended for YouTube and generic fallback extraction when running outside Docker)

1. clone the repo: `git clone https://github.com/imputnet/cobalt`.
2. go to api/src directory: `cd cobalt/api/src`.
3. install dependencies: `pnpm install`.
4. create `.env` file in the same directory.
5. add needed environment variables to `.env` file. only `API_URL` is required to run cobalt.
    - if you don't know what api url to use for local development, use `http://localhost:9000/`.
6. run cobalt: `pnpm start`.

if you're running outside Docker and want YouTube or the generic fallback extractor to work reliably, install `yt-dlp` and make sure it's available in `PATH`. if it's installed somewhere custom, set `YTDLP_BIN` to the executable path.

### optional: Polar credits checkout
if you want to enable international card / wallet checkout with Polar, set these env vars on the API:

- `POLAR_ACCESS_TOKEN`
- `POLAR_WEBHOOK_SECRET`
- `POLAR_SERVER` (`production` or `sandbox`)
- `POLAR_PRODUCT_ID_USD_199`
- `POLAR_PRODUCT_ID_USD_499`
- `POLAR_PRODUCT_ID_USD_999`
- `POLAR_PRODUCT_ID_USD_1999`
- `POLAR_PRODUCT_ID_USD_4999`

### optional: discover/social module
if you want to use the Discover page (`/discover`) and the admin console (`/console-manage-2025`), initialize the social tables (and re-run after pulling schema updates):

```sh
pnpm -C api init-social
```

### ubuntu 22.04 workaround
`nscd` needs to be installed and running so that the `ffmpeg-static` binary can resolve DNS ([#101](https://github.com/imputnet/cobalt/issues/101#issuecomment-1494822258)):

```bash
sudo apt install nscd
sudo service nscd start
```

## list of all environment variables
### variables for api
| variable name         | default   | example                 | description |
|:----------------------|:----------|:------------------------|:------------|
| `API_PORT`            | `9000`    | `9000`                  | changes port from which api server is accessible. |
| `API_LISTEN_ADDRESS`  | `0.0.0.0` | `127.0.0.1`             | changes address from which api server is accessible. **if you are using docker, you usually don't need to configure this.** |
| `API_URL`             | ➖        | `https://api.cobalt.tools/` | changes url from which api server is accessible. <br> ***REQUIRED TO RUN THE API***. |
| `API_NAME`            | `unknown` | `ams-1`                 | api server name that is shown in `/api/serverInfo`. |
| `API_EXTERNAL_PROXY`  | ➖        | `http://user:password@127.0.0.1:8080`| url of the proxy that will be passed to [`ProxyAgent`](https://undici.nodejs.org/#/docs/api/ProxyAgent) and used for all external requests. HTTP(S) only. |
| `CORS_WILDCARD`       | `1`       | `0`                     | toggles cross-origin resource sharing. <br> `0`: disabled. `1`: enabled. |
| `CORS_URL`            | not used  | `https://cobalt.tools`  | cross-origin resource sharing url. api will be available only from this url if `CORS_WILDCARD` is set to `0`. |
| `COOKIE_PATH`         | not used  | `/cookies.json`         | path for cookie file relative to main folder. |
| `UPSTREAM_URLS` | not used | `https://api3.example.com,https://api4.example.com` | comma-separated cobalt upstream pool used by download fallbacks and generic upstream extraction. supersedes `INSTAGRAM_UPSTREAM_URL` when set. |
| `UPSTREAM_API_KEY` | not used | `11111111-1111-1111-1111-111111111111` | optional `Api-Key` value sent to upstream nodes. supersedes `INSTAGRAM_UPSTREAM_API_KEY` when set. |
| `UPSTREAM_TIMEOUT_MS` | `12000` | `8000` | request timeout (ms) for upstream fallback. supersedes `INSTAGRAM_UPSTREAM_TIMEOUT_MS` when set. |
| `UPSTREAM_MAX_ATTEMPTS` | `2` | `1` | maximum upstream nodes to try for one request. single-node pools are tried once. |
| `UPSTREAM_CIRCUIT_FAILURES` | `3` | `3` | consecutive node-level failures before an upstream is temporarily removed from selection. |
| `UPSTREAM_CIRCUIT_COOLDOWN_MS` | `60000` | `120000` | cooldown before a failed upstream node can be tried again. |
| `INSTAGRAM_UPSTREAM_URL` | not used | `https://example.ngrok-free.app/` | fallback cobalt instance used when instagram/bilibili/douyin extraction fails locally (e.g. WAF/rate-limits), and optionally for Instagram creator sync (Discover/admin). |
| `INSTAGRAM_UPSTREAM_API_KEY` | not used | `11111111-1111-1111-1111-111111111111` | optional `Api-Key` value (sent as `Authorization: Api-Key ...`) for `INSTAGRAM_UPSTREAM_URL`. |
| `INSTAGRAM_UPSTREAM_TIMEOUT_MS` | `12000` | `8000` | request timeout (ms) for upstream fallback. |
| `DOUYIN_UPSTREAM_MIN_BYTES` | `8388608` | `16777216` | route large Douyin files (bytes) through upstream fallback (default 8 MB). |
| `GENERIC_EXTRACTOR_ENABLED` | `1` | `0` | enables the generic unsupported-site fallback extractor. |
| `GENERIC_USE_UPSTREAM` | `1` | `0` | tries upstream before local generic extraction when `UPSTREAM_URLS` or `INSTAGRAM_UPSTREAM_URL` is configured. |
| `GENERIC_HTML_PROBE_TIMEOUT_MS` | `3000` | `5000` | timeout in ms for the lightweight generic HTML probe stage. |
| `GENERIC_YTDLP_TIMEOUT_MS` | `35000` | `45000` | timeout in ms for generic `yt-dlp` extraction. |
| `GENERIC_FORCE_TUNNEL` | `1` | `0` | forces generic fallback downloads through cobalt tunnels instead of redirecting. |
| `PROCESSING_PRIORITY` | not used  | `10`                    | changes `nice` value* for ffmpeg subprocess. available only on unix systems. |
| `FREEBIND_CIDR`       | ➖        | `2001:db8::/32`         | IPv6 prefix used for randomly assigning addresses to cobalt requests. only supported on linux systems. see below for more info. |
| `RATELIMIT_WINDOW`    | `60`      | `120`                   | rate limit time window in **seconds**. |
| `RATELIMIT_MAX`       | `20`      | `30`                    | max requests per time window. requests above this amount will be blocked for the rate limit window duration. |
| `DURATION_LIMIT`      | `10800`   | `18000`                 | max allowed video duration in **seconds**. |
| `TUNNEL_LIFESPAN`     | `90`      | `120`                   | the duration for which tunnel info is stored in ram, **in seconds**. |
| `YTDLP_BIN`           | not used  | `/usr/local/bin/yt-dlp` | optional path to a custom `yt-dlp` binary when not available in `PATH`. |

\* the higher the nice value, the lower the priority. [read more here](https://en.wikipedia.org/wiki/Nice_(Unix)).

#### Douyin upstream relay (large files)
When a Douyin file is larger than `DOUYIN_UPSTREAM_MIN_BYTES`, the main server can use the upstream instance as a relay so the CDN sees the upstream IP while the browser downloads from the main domain.

Flow (high level):
- main server detects a large Douyin file.
- main server calls upstream (via `UPSTREAM_URLS`, or legacy `INSTAGRAM_UPSTREAM_URL`) to resolve the media.
- upstream returns a direct CDN URL.
- main server uses upstream `/relay` to fetch the CDN media with proper headers and streams it back to the user.

Notes:
- `/relay` is available only on upstream instances (`IS_UPSTREAM_SERVER=true`).
- if `UPSTREAM_API_KEY` or `INSTAGRAM_UPSTREAM_API_KEY` is set, `/relay` requires `Authorization: Api-Key ...`.
- direct browser downloads from Douyin CDN can return 403 without proper Referer/UA, so the relay path keeps the request server-side.

#### Upstream pool health
When multiple upstream URLs are configured, the API tracks node-level failures and temporarily removes unhealthy nodes after `UPSTREAM_CIRCUIT_FAILURES` consecutive network/timeout/5xx failures. The admin-protected `GET /upstreams/health` endpoint returns the current pool state, including circuit status, consecutive failures, latency, and last success/failure times.

To add more upstream servers in production, prefer setting the CircleCI project environment variable instead of editing `.circleci/config.yml`:

```txt
UPSTREAM_URLS=https://api3.freesavevideo.online,https://api4.freesavevideo.online
```

The deploy job uses that environment variable when present, otherwise it falls back to the chart default single upstream (`https://api3.freesavevideo.online`).

#### FREEBIND_CIDR
setting a `FREEBIND_CIDR` allows cobalt to pick a random IP for every download and use it for all
requests it makes for that particular download. to use freebind in cobalt, you need to follow its [setup instructions](https://github.com/imputnet/freebind.js?tab=readme-ov-file#setup) first. if you configure this option while running cobalt
in a docker container, you also need to set the `API_LISTEN_ADDRESS` env to `127.0.0.1`, and set
`network_mode` for the container to `host`.
