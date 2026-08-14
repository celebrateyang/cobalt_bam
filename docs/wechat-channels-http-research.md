# 微信视频号 `sph` 纯 HTTP 解析研究

研究日期：2026-08-14（Asia/Shanghai）  
样本：`https://weixin.qq.com/sph/AievImkslV`

## 1. 最终结论

结论分两种约束：

1. **只有匿名服务端 HTTP、没有任何合法登录凭据：不能稳定完成 `sph → 视频 CDN`。**
   当前公开 `shortUri` Finder 接口可以匿名返回标题、作者、封面和一个短期
   `dynamicExportId`，但对本样本不再返回 `videoUrl`。
2. **提供合法的腾讯元宝 Web 登录 Cookie 后，链路已现场验证可以只用服务端 HTTP
   完成，不需要 Playwright、Puppeteer、Selenium、Windows 微信或抓包代理。**
   元宝接口负责把分享链接换成 `wx_export_id` / `playable_url`；Finder 接口负责返回
   `feedInfo.videoUrl`、`h264VideoInfo.videoUrl` 或 `h265VideoInfo.videoUrl`。完整
   `stodownload` URL 是腾讯服务端返回值，不应自行生成 `sign`。

用户随后提供了合法元宝 Cookie。本次样本只发送 Cookie 与通用浏览器请求头即端到端
成功，不需要额外的会话专用动态请求头：

```text
sph URL
  -> POST Yuanbao get_parse_result（Cookie）
wx_export_id + playable_url
  -> 从 playable_url 取 eid + token
  -> POST Finder get_feed_info
feedInfo.videoUrl + h264VideoInfo.videoUrl + h265VideoInfo.videoUrl
  -> Range 请求 finder.video.qq.com
H.264 MP4 + H.265/HEVC MP4，均为明文
```

新解析的 H.264 URL 与用户提供的已知 URL 具有相同 `encfilekey` 和 `m`，但临时
`token/basedata/sign` 已刷新，证明解析到了同一个媒体，而不是复用已知答案。

## 2. 完整解析链路

### 2.1 本次匿名实测链路

```text
INPUT
https://weixin.qq.com/sph/AievImkslV

  GET，redirect=manual
  response.headers.location
    ↓
https://channels.weixin.qq.com/finder-preview/pages/sph?id=AievImkslV

  POST /finder-preview/api/feed/get_feed_info
  body.shortUri = "AievImkslV"
    ↓
response.data.authorInfo
response.data.feedInfo.description
response.data.feedInfo.coverUrl
response.data.sceneInfo.dynamicExportId
```

`AievImkslV` 是服务器 lookup key，不是可在本地稳定解码出的 `export_id`。同一短码连续
请求三次得到三个不同的 `dynamicExportId`，而且每个响应的 `expiredTime - now` 都是
7200 秒。这反证了“短码通过固定 Base64/protobuf/hash 算法直接转换成 export_id”。

### 2.2 有合法元宝登录态时的纯 HTTP 链路

```text
share_url
  -> POST yuanbao.tencent.com/api/weixin/get_parse_result
     body.url = share_url
  -> response.data.wx_export_id
     response.data.playable_url

playable_url
  -> URL.searchParams.eid   = exportId
     URL.searchParams.token = generalToken

exportId + generalToken
  -> POST channels.weixin.qq.com/finder-preview/api/feed/get_feed_info
  -> response.data.feedInfo.videoUrl
     或 response.data.feedInfo.h264VideoInfo.videoUrl
     或 response.data.feedInfo.h265VideoInfo.videoUrl

  -> https://finder.video.qq.com/.../stodownload?...完整服务端签名...
```

元宝接口匿名请求返回 401；携带用户提供的有效 Cookie 后现场返回成功。Finder 当前
前端源码明确把 API 返回的 `videoUrl` 直接赋给 `<video src>`，没有在浏览器中拼装
`encfilekey/token/sign`。

## 3. HTTP 请求明细与研究日志

### STEP 1：请求 `sph` URL

```text
[REQUEST]
method: HEAD
url: https://weixin.qq.com/sph/AievImkslV
cookie: none

[RESPONSE]
status: 405 Method Not Allowed
content-length: 0
```

```text
[REQUEST]
method: GET
redirect: manual

[RESPONSE]
status: 301 Moved Permanently
location: https://channels.weixin.qq.com/finder-preview/pages/sph?id=AievImkslV
set-cookie: none

[FINDING]
sph 是真实 HTTP redirect，不是必须执行 JS 的页面跳转。
```

### STEP 2：请求 Finder preview HTML

```text
[REQUEST]
method: GET
url: https://channels.weixin.qq.com/finder-preview/pages/sph?id=AievImkslV
cookie: none

[RESPONSE]
status: 200
content-type: text/html; charset=utf-8
x-powered-by: mmfinderpreviewnodeweb 1.0.0
```

HTML 加载：

```text
feed.9c135e64.js
mmfinderopenwebapisvr.0fb5ed5d.js
merlin.b35739a2.js
```

`merlin` 中的当前调用为：

```js
getFeedInfo(t) {
  return this.post({ url: "feed/get_feed_info", data: { ...t } });
}

getFeedInfo({
  baseReq: { generalToken },
  shortUri
});
```

### STEP 3：匿名 Finder `shortUri` 请求

```text
[REQUEST]
method: POST
url: https://channels.weixin.qq.com/finder-preview/api/feed/get_feed_info
headers:
  Content-Type: application/json
  Origin: https://channels.weixin.qq.com
  Referer: https://channels.weixin.qq.com/finder-preview/pages/sph?id=AievImkslV
body:
  {"baseReq":{"generalToken":""},"shortUri":"AievImkslV"}
cookie: none

[RESPONSE]
status: 201
errCode: 0
data.authorInfo.nickname: 翠蛇大将军
data.feedInfo.description: 高三再见，致我不一样的高中时代 ...
data.feedInfo.coverUrl: https://finder.video.qq.com/251/20304/stodownload?...
data.sceneInfo.dynamicExportId: export/UzFfBgAA...
data.sceneInfo.expiredTime: now + 7200
```

头部矩阵实测：

| Origin | Referer | 结果 |
|---|---|---|
| 无 | 无 | 401 `permission verification failed` |
| 有 | 无 | 401 |
| 无 | 有 | 401 |
| 有 | 有 | 201 / `errCode: 0` |

两者都需要；不需要 Cookie。

当前本样本的匿名响应没有 `videoUrl`、`h264VideoInfo` 或 `h265VideoInfo`。把响应中的
`dynamicExportId` 直接作为 `exportId` 再请求，会得到业务提示“此内容暂时无法播放”。
`dynamicExportId` 不是可以无条件替代元宝 `playable_url` 中 `eid + token` 的凭据。

### STEP 4：元宝 parse API

```text
[REQUEST]
method: POST
url: https://yuanbao.tencent.com/api/weixin/get_parse_result
headers:
  Content-Type: application/json
  Origin: https://yuanbao.tencent.com
  Referer: https://yuanbao.tencent.com/
body:
  {
    "type": "video_channel_url",
    "url": "https://weixin.qq.com/sph/AievImkslV",
    "scene": 1
  }
cookie: none

[RESPONSE]
status: 401
server: tRPC-Gateway
trpc-ret: 1008
body: {"error":{"code":"20000","message":"未知错误"}}
```

GET 同样在认证网关返回 401，无法用未认证响应区分方法；当前公开实现和调用代码均使用
POST。成功响应的关键字段是：

```text
response.data.wx_export_id
response.data.playable_url
```

当前元宝 Web 有正常访客认证接口 `POST /api/anon/login`，body 为
`{"device_type":6}`，但它需要腾讯正常生成的 Turing/device 认证请求头。本次裸 HTTP
请求返回 400“登录失败”，随后 parse API 仍为 401。没有尝试绕过或伪造设备认证。

使用用户提供的合法 Cookie 重试相同 POST，HTTP 请求成功。响应 `data` 的实际字段为：

```text
wx_export_id
cover_url
author_certification_icon
author
author_icon
desc
playable_url
```

`playable_url` 实际 query 字段为：

```text
entry_card_type
comment_scene
appid
token
entry_scene
eid
```

本次验证仅需 Cookie；未额外传递 `X-ID`、设备 ID 或抓取的动态请求头。这个结论限于
当前有效会话，腾讯未来仍可能调整校验。

### STEP 5：认证后的 Finder 请求定义

```text
[REQUEST]
method: POST
url:
  https://channels.weixin.qq.com/finder-preview/api/feed/get_feed_info
  ?_rid=<epoch-hex>-<random-hex>
  &_pageUrl=https://channels.weixin.qq.com/finder-preview/pages/feed
headers:
  Origin: https://channels.weixin.qq.com
  Referer: https://channels.weixin.qq.com/finder-preview/pages/feed
           ?entry_card_type=48&comment_scene=39&appid=0
           &token=<generalToken>&entry_scene=0&eid=<exportId>
body:
  {
    "baseReq": { "generalToken": "<playable_url.query.token>" },
    "exportId": "<playable_url.query.eid 或 wx_export_id>"
  }
cookie: Finder endpoint 本身不要求元宝 Cookie
```

实际成功响应字段：

```text
response.data.feedInfo.videoUrl
response.data.feedInfo.h264VideoInfo.videoUrl
response.data.feedInfo.h265VideoInfo.videoUrl
```

三个 URL 字段均是完整的 `finder.video.qq.com/stodownload?...` URL。其中
`feedInfo.videoUrl === feedInfo.h264VideoInfo.videoUrl`；H.265 字段是第二个独立 rendition。

### STEP 6：已知 CDN URL 实测

```text
[REQUEST]
method: HEAD
cookie: none
referer: none

[RESPONSE]
status: 200
content-type: video/mp4
content-length: 72942310
accept-ranges: bytes
content-range: bytes 0-72942309/72942310
access-control-allow-origin: *
cache-control: max-age=2592000
x-encflag: 0
x-enclen: 0
x-errno: 0
```

```text
[REQUEST]
method: GET
range: bytes=0-1023

[RESPONSE]
status: 206
content-range: bytes 0-1023/72942310
first bytes: 00 00 00 20 66 74 79 70 69 73 6f 6d ...
```

MP4 box 实测结果：

| 字段 | 值 |
|---|---|
| 容器 | ISO BMFF / MP4 (`ftyp isom`) |
| 时长 | 743.713 秒 |
| 视频 | H.264 (`avc1`), 1328×720 |
| 音频 | AAC (`mp4a`), 44.1 kHz timescale |
| 文件大小 | 72,942,310 bytes |
| 明文/加密 | 明文，`X-encflag: 0`，无需解密 |

同次响应还返回 H.265/HEVC rendition：

| 字段 | 值 |
|---|---|
| 时长 | 743.713 秒 |
| 视频 | HEVC, 1328×720 |
| 音频 | AAC, 44.1 kHz |
| 文件大小 | 31,469,530 bytes |
| Range/CORS | HTTP 206、`Accept-Ranges: bytes`、CORS `*` |
| 明文/加密 | 明文，`X-encflag: 0`，无需解密 |

## 4. 关键字段映射

| 变量 | 来源 |
|---|---|
| `shortUri` | `sph` path 或 redirect target 的 `id` query |
| `dynamicExportId` | 匿名 Finder 响应 `data.sceneInfo.dynamicExportId` |
| `wx_export_id` | 认证元宝响应 `data.wx_export_id` |
| `playable_url` | 认证元宝响应 `data.playable_url` |
| `exportId` | 优先 `new URL(playable_url).searchParams.get("eid")`，否则 `wx_export_id` |
| `generalToken` | `new URL(playable_url).searchParams.get("token")` |
| 完整媒体 URL | Finder 响应中的 `feedInfo.*VideoInfo.videoUrl` / `videoUrl` |
| 底层媒体 URL | 其他 Finder 数据形态中的 `object_desc.media[0].url` |
| URL 授权后缀 | 同一 media 中的 `url_token`，与 `url` 原样拼接 |
| 解密输入 | 同一次响应同一 media 的 `decode_key` |

本次没有获得该样本的 `object_id/feed_id`。TikHub 参数说明表明详情接口可以用稳定
`id` 或会过期的 `exportId` 二选一，但 SDK/OpenAPI 只是第三方服务包装，不能证明
腾讯端内部 lookup 的具体表结构。

## 5. 已知 CDN URL 参数分析

| 参数 | 实测结论 |
|---|---|
| `encfilekey` | 腾讯服务端返回的 opaque 文件/授权标识。封面连续三次请求保持不变；生成算法 `UNKNOWN`。 |
| `token` | 服务端返回的临时授权。封面连续三次请求每次变化；不应自行生成。精确过期编码 `UNKNOWN`。 |
| `hy=SZ` | 连续请求保持 `SZ`，明显参与地域/CDN 路由，但是否严格表示 Shenzhen 未证实，语义 `UNKNOWN`。 |
| `idx=1` | 样本和封面均为 1；不是 Range 分片号。是否代表 rendition/CDN 文件序号 `UNKNOWN`。 |
| `m=c490...` | 32 个十六进制字符且同媒体固定，但**不是文件 MD5**。完整 72,942,310 字节的实际 MD5 是 `8927c641c9a1a68b92cdcef0af8f7673`。具体语义 `UNKNOWN`。 |
| `uzid=7b5d4` | opaque 路由/用户化标识；封面响应为 `1`，具体语义 `UNKNOWN`。 |
| `X-snsvideoflag=xWT113` | CDN 响应头原样回显，并在 `basedata` 中出现两次。它是视频处理/格式能力标志，但精确 codec/profile 映射 `UNKNOWN`；实际流 codec 是 H.264。 |
| `basedata` | Base64URL 编码 protobuf，见下文。由服务端返回，不应自行生成。 |
| `sign` | opaque 服务端签名。Finder 前端直接消费 API 的完整 `videoUrl`，没有客户端签名函数；算法和 secret `UNKNOWN`，也不需要逆向。 |

`basedata` 解码为 64 字节：

```text
field 1 (varint): 3
field 2 (string): "xWT113"
field 4 (message):
  field 1 (message):
    field 1 (string): "xWT113"
    field 2 (varint): 0
field 8 (bytes): 32 opaque bytes
field 9 (varint): 1786687922 (Unix timestamp)
```

其中没有可读宽高、时长或 media ID。该时间戳比本次 CDN 测试早约 1 小时 47 分，
但仅凭一个样本不能断言它就是硬过期时间。

## 6. 登录态要求

| 环节 | Cookie/认证要求 |
|---|---|
| `weixin.qq.com/sph/*` redirect | 不需要 Cookie |
| Finder preview HTML | 不需要 Cookie |
| Finder `shortUri` metadata API | 不需要 Cookie；必须同时有正确 Origin 和 Referer |
| Yuanbao `get_parse_result` | 需要合法元宝登录/认证状态；匿名裸请求 401 |
| Yuanbao visitor login | 存在，但正常流程需要腾讯设备/Turing 认证；裸 HTTP 失败 |
| Finder `exportId + token` API | 元宝 Cookie 不发送给微信域；需要元宝产出的 `eid/token` 和正确页面头 |
| `finder.video.qq.com` CDN | 本样本不需要 Cookie、Referer 或微信登录；CORS 为 `*` |

## 7. URL 生命周期

对匿名 Finder 接口连续请求三次：

| 字段 | 结果 |
|---|---|
| 封面 `encfilekey` | 不变 |
| 封面 `token` | 每次变化 |
| 封面 `m` | 不变 |
| 封面 `hy/idx/uzid` | 不变 |
| `dynamicExportId` | 每次变化 |
| `expiredTime - requestTime` | 每次严格约 7200 秒 |

因此可确认：匿名 `dynamicExportId` 是两小时临时标识；token 属于临时授权。不能从
`Cache-Control: max-age=2592000` 推导签名 URL 有效 30 天，那只是成功响应的缓存策略。

携带元宝 Cookie 连续解析三次的结果：

| 字段 | 结果 |
|---|---|
| `wx_export_id` | 三次相同 |
| `playable_url.eid` | 三次相同 |
| `playable_url.token` | 三次相同 |
| 认证 Finder `expiredTime - now` | 约 86400 秒（24 小时） |
| H.264/H.265 `encfilekey` | 三次相同，两个 codec 也相同 |
| H.264/H.265 `m` | 均固定为 `c490a6846cfd8671977a73285abf5eca` |
| CDN `token/basedata/sign` | 第一轮与第二轮不同，第二、三轮短暂复用 |

这说明 CDN 授权会刷新，但服务端也可能短缓存授权结果。精确 token/sign TTL 与跨 IP
绑定仍是 `UNKNOWN`。同一出口下 curl-like 与浏览器-like User-Agent 均成功，未观察到
User-Agent 绑定。

生产缓存建议：

- `shortUri → metadata` 可短缓存；`dynamicExportId` 最长不要超过响应 `expiredTime`。
- 视频 CDN URL 在没有明确过期字段时只做短缓存，并在交付前用 Range 探测。
- 不要持久化元宝 Cookie 到日志、数据库明文字段或客户端。

## 8. Node.js 最小 PoC

实现位置：`api/src/util/resolve-wechat-channel.js`

匿名元数据验证：

```bash
pnpm -C api wechat:research -- https://weixin.qq.com/sph/AievImkslV
```

认证纯 HTTP 路径：

```bash
WECHAT_CHANNELS_YUANBAO_COOKIE='<合法登录 Cookie>' \
pnpm -C api wechat:research -- https://weixin.qq.com/sph/AievImkslV
```

推荐从被 Git 忽略的本地文件读取，避免 Cookie 出现在 shell history：

```bash
pnpm -C api wechat:research -- \
  https://weixin.qq.com/sph/AievImkslV \
  --cookie-file yuanbao-cookie.txt
```

如果当前元宝会话还要求动态请求头，可把正常登录会话中的非 Cookie 请求头作为 JSON
传入 `WECHAT_CHANNELS_YUANBAO_HEADERS_JSON`。PoC 不打印 Cookie，也不生成 CDN 签名。

核心调用：

```js
const result = await resolveWechatChannel(
  "https://weixin.qq.com/sph/AievImkslV",
  {
    yuanbaoCookie: process.env.WECHAT_CHANNELS_YUANBAO_COOKIE
  }
);
```

匿名现场输出已验证标题、作者、封面和 `dynamicExportId`；认证现场输出进一步得到
H.264 与 H.265 两条真实视频 URL。mock 测试和线上 Range 探测均已通过。

## 9. FreeSaveVideo.online 集成方案

结论：采用**本机国内 upstream 受控解析 + CDN Direct Bridge**。主 API/GKE 不保存、
不读取元宝 Cookie，也不执行元宝/Finder 解析。

原因：

- 核心 `sph → playable_url` 依赖元宝合法登录态；匿名 visitor 流程还有设备认证。
- Cookie 有失效、续签、账号风控、并发和使用条款风险。
- 匿名 `dynamicExportId` 约两小时、认证场景约 24 小时，CDN token/sign 也会刷新。
- 部分视频可能带 `decode_key`，不能假定所有 CDN 内容都是明文 MP4。
- 当前样本是 12 分钟长视频，单次 72.9 MB；让 GKE API tunnel 全量代理会增加带宽、
  egress、连接占用和 Range 复杂度。

当前实现：

1. GKE 收到 `weixin.qq.com/sph/...` 后只允许转发到 `cn` upstream，不回退到 global 节点。
2. `api2.freesavevideo.online`（本机，`IS_UPSTREAM_SERVER=true`）从
   `api/yuanbao-cookie.txt` 读取 Cookie；也可用 `WECHAT_CHANNELS_YUANBAO_COOKIE_FILE`
   覆盖路径。
3. Cookie 文件已加入 `.gitignore`，不会进入 Git、容器镜像、Helm 或 GKE Secret。
4. 本机通过纯 HTTP 调用元宝与 Finder，默认选择 H.264，并保留 H.265 备用 URL。
5. API 返回 `status: redirect`、`directUrl` 和 `directUrlCandidates`，不生成 `/tunnel`。
6. Web 使用现有预览下载流程：浏览器直连失败时尝试扩展，再提供浏览器接管与复制链接。

本机运维：

```bash
cd D:/code/cobalt_bam/api
pnpm start
```

启动前应确认 `api/.env` 中 `IS_UPSTREAM_SERVER=true`，并确认
`D:/code/cobalt_bam/api/yuanbao-cookie.txt` 是当前登录态。单账号仍应低并发；
401/403/429 应作为 Cookie 维护或风控信号处理，不自动绕过认证。

## 公开证据与交叉验证

- 当前 Finder 前端资产：
  `https://res.wx.qq.com/t/wx_fed/finder/web/finder-preview/res/assets/merlin.b35739a2.js`
- 当前 Finder 基础资产：
  `https://res.wx.qq.com/t/wx_fed/finder/web/finder-preview/res/assets/mmfinderopenwebapisvr.0fb5ed5d.js`
- 公开纯 HTTP 元宝/Finder 调用实现：
  `https://github.com/demielcaitlinxk441-pixel/video-link-mcp/blob/main/lib/wechat_channels_api.py`
- TikHub 官方 SDK/OpenAPI（只作字段和参数旁证，不代表其私有服务端实现公开）：
  `https://github.com/TikHub/TikHub-API-Python-SDK`
- 加密文件研究实现（只用于说明其他样本可能加密）：
  `https://github.com/Evil0ctal/WeChat-Channels-Video-File-Decryption`

## 未解决项

- 本样本当前稳定 `object_id/feed_id`：`UNKNOWN`。
- 视频 URL 的精确 token/sign TTL 与跨 IP 绑定：`UNKNOWN`。
- `encfilekey`、`hy`、`idx`、`uzid` 的腾讯内部字段定义：`UNKNOWN`。
- `sign` 算法：`UNKNOWN`，并且生产实现不需要知道。
- 元宝登录 Cookie 的长期自动续签方式：未研究；不应转化为绕过登录的课题。
- 多清晰度：本次只得到同为 1328×720 的 H.264 与 H.265 rendition，没有其它分辨率。
