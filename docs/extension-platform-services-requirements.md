# Chrome 插件多平台解析下载实现需求

## 背景

当前插件的 MVP 是“通用页面媒体嗅探”：扫描 DOM、`video/audio/source/img/a` 标签和 `performance` 网络资源，然后把直链展示出来并调用 Chrome 原生下载。

这个能力对 B 站这类页面已经初步可用，但在抖音等平台会出现噪声多、候选不准、清晰度/大小不稳定、重复条目、无法区分封面图和视频等问题。SnapWC 这类插件的效果，通常不是只靠通用嗅探，而是：

1. 通用资源嗅探兜底。
2. 平台专用 adapter 解析页面状态、网络请求、播放器数据和候选 CDN。
3. 统一排序、去重、文件命名、下载动作。

因此，插件需要从“单 scanner”升级为“平台 service/adapters + 通用 scanner”的架构。

## 目标

- 在 Chrome 插件内直接下载，不默认走 FreeSaveVideo API tunnel。
- 优先利用用户当前浏览器登录态、Cookie、页面上下文和已加载网络资源。
- 对已支持平台提供接近 SnapWC 的体验：显示标题、缩略图、时长、大小、清晰度、格式，并提供直接下载按钮。
- YouTube 在 Chrome Web Store 版本中继续禁用下载能力，不做平台 adapter。
- 对无法稳定直下的平台，提供清楚的降级：复制链接、打开 FreeSaveVideo 页面、提示需要先播放/登录/切换公开内容。

## 非目标

- 不绕过 DRM、付费墙、会员专属加密内容。
- 不承诺所有平台都能在插件端完成无水印、合并音视频或格式转换。
- 不在扩展里内置服务端 ffmpeg。
- 不在 Chrome Web Store 版本宣传或支持 YouTube 下载。
- 不追求真正强控制或 DRM 级别的防绕过。懂技术的用户可以通过 DevTools、其他插件或修改本地扩展绕过普通直链限制，这部分用户不是主要付费对象。

## 总体架构

### 目录建议

```text
extension/src/
  adapters/
    registry.ts
    types.ts
    generic.ts
    bilibili.ts
    douyin.ts
    tiktok.ts
    instagram.ts
    ...
  downloader/
    chrome-downloads.ts
    filename.ts
    probe.ts
  popup/
  content.ts
  background.ts
```

### 核心流程

1. popup 打开后向当前 tab 注入 content script。
2. content script 根据当前 URL 从 registry 匹配 adapter。
3. adapter 收集候选资源：
   - DOM 元素。
   - performance 网络资源。
   - 页面内 JSON 状态。
   - 平台播放器变量。
   - 已知 API 请求结果。
4. adapter 返回统一 `DetectedMedia[]`。
5. 通用 pipeline 进行去重、排序、补全大小/清晰度/缩略图/文件名。
6. popup 展示结果，点击 `Download` 时调用 `chrome.downloads.download`。
7. 若平台需要特殊 header/referrer/cookie 且 Chrome download 不能满足，标记为 `requiresPageContext`，后续再实现更高级下载策略。

## 统一数据模型

```ts
type PlatformId =
  | 'generic'
  | 'bilibili'
  | 'douyin'
  | 'tiktok'
  | 'instagram'
  | 'facebook'
  | 'twitter'
  | 'vimeo'
  | 'reddit'
  | 'xiaohongshu'
  | 'kuaishou'
  | 'toutiao'
  | 'haokan'
  | 'soundcloud'
  | 'pinterest'
  | 'snapchat'
  | 'dailymotion'
  | 'streamable'
  | 'tumblr'
  | 'twitch'
  | 'vk'
  | 'weibo'
  | 'naver'
  | 'rutube'
  | 'ok'
  | 'loom'
  | 'bluesky'
  | 'newgrounds'
  | 'cctv'
  | 'bjnews'
  | 'ourjiangsu'
  | 'zhshjn'
  | 'kugou'
  | 'analdin';

type AdapterResult = {
  platform: PlatformId;
  pageUrl: string;
  pageTitle: string;
  media: DetectedMedia[];
  warnings?: string[];
};

type DetectedMedia = {
  id: string;
  kind: 'video' | 'audio' | 'image' | 'playlist' | 'subtitle' | 'link';
  url: string;
  label: string;
  source: 'adapter' | 'network' | 'dom' | 'api' | 'fallback';
  format?: string;
  sizeLabel?: string;
  qualityLabel?: string;
  thumbnailUrl?: string;
  durationLabel?: string;
  filename?: string;
  score?: number;
  requiresPageContext?: boolean;
};
```

## Adapter 接口

```ts
type PlatformAdapter = {
  id: PlatformId;
  label: string;
  matches(url: URL): boolean;
  scan(context: AdapterContext): Promise<AdapterResult>;
};

type AdapterContext = {
  pageUrl: string;
  pageTitle: string;
  document: Document;
  performanceEntries: PerformanceResourceTiming[];
  genericScan: () => DetectedMedia[];
};
```

要求：
- 每个 adapter 只处理自己平台的候选识别、页面数据解析和评分。
- 通用去重、排序、文件名清洗、下载动作放到共享模块。
- adapter 失败时不能让整个插件报错，应返回空结果并交给 generic 兜底。

## 平台优先级

### P0：先做流量价值最高的平台

1. Bilibili：已初步可用，继续完善音视频成对展示、清晰度、去重和文件名。
2. Douyin：当前截图显示问题明显，优先做专用 adapter。
3. TikTok：和 Douyin 类似但数据结构不同，复用候选排序思想。
4. Instagram：Reels、post、story、图片轮播。
5. Xiaohongshu：视频、图文笔记、分享短链。
6. Kuaishou：短视频、分享短链。
7. Twitter/X：多媒体 post、视频/GIF。
8. Facebook：公开视频/Reels。

### P1：补足长尾但可带来 SEO/增长覆盖的平台

- Pinterest
- Reddit
- Vimeo
- Dailymotion
- Streamable
- Snapchat
- Tumblr
- Toutiao
- Haokan
- Weibo

### P2：低频或复杂度更高的平台

- SoundCloud
- Twitch clips
- VK
- Rutube
- OK.ru
- Naver
- Bluesky
- Newgrounds
- CCTV
- BJNews
- OurJiangsu
- Kugou
- Loom
- Zhshjn
- Analdin

### 禁用

- YouTube：Chrome Web Store 版本不提供下载，不做 adapter，只显示政策提示。

## Douyin adapter 需求

### 匹配范围

- `douyin.com/video/:id`
- `douyin.com/note/:id`
- `douyin.com/share/video/:id`
- `douyin.com/share/note/:id`
- `douyin.com/share/slides/:id`
- `v.douyin.com/:shortLink`
- 当前页面形态如 `douyin.com/jingxuan?modal_id=...`

### 候选来源

- `performance` 中的：
  - `douyinvod.com`
  - `bytevod`
  - `zjcdn.com`
  - `www.douyin.com/aweme/v1/play`
  - `playwm`
- 页面 JSON：
  - `window._ROUTER_DATA`
  - `window._RENDER_DATA`
  - React/Vue hydration script。
- 当前播放 video 元素的 `currentSrc`。

### 过滤规则

- 排除埋点、统计、推荐流、头像、封面小图。
- 排除 `webcast` 直播非目标资源，除非后续明确支持直播录制。
- 同一视频候选按最终 CDN path 去重。

### 排序规则

优先级从高到低：
1. 真实 CDN MP4：`douyinvod`、`bytevod`。
2. 可直接下载且 content-length 合理的 `zjcdn`。
3. `aweme/v1/play` 跳转结果。
4. 页面 `video.currentSrc`。
5. generic 嗅探结果。

评分字段：
- 有缩略图加分。
- 有 content-length 且大于 1MB 加分。
- 有清晰度标识加分。
- URL 包含 `playwm` 降权。
- 图片数量多但视频少时，图文/相册候选单独分组。

### 展示要求

- 标题使用页面标题或 item desc。
- 缩略图使用当前视频 poster 或 og:image。
- 显示格式 `MP4`。
- 能推断时显示 `720p/1080p`。
- 同一视频只显示 1-3 个最可信候选，避免现在这种“80 items found”。

### 下载要求

- 默认调用 `chrome.downloads.download`。
- 文件名：`FreeSaveVideo/{title}-{quality}.mp4`。
- 如果 Chrome 原生下载 403/404，后续版本再考虑：
  - 尝试先打开下载 URL 触发平台重定向。
  - 或使用 content script 在页面上下文发起 fetch/blob 下载。
  - 不优先走我们的 tunnel。

## Bilibili adapter 需求

### 已有基础

当前插件已能识别 `video.m4s/audio.m4s` 并下载，但还需要更像 SnapWC：

- 合并展示同一视频的 video/audio 两路资源。
- 视频行显示缩略图、时长、大小、清晰度。
- 提供“视频流”和“音频流”下载；如未来支持本地合并，再显示“合并 MP4”。

### 候选来源

- `bilivideo.com`
- `upos-*`
- `akamaized.net`
- `api.bilibili.com/x/player/playurl`
- 页面 `window.__playinfo__`

### 验收

- 打开普通 B 站视频，播放 2 秒后 scan。
- 列表不出现 `data.bilibili.com/log`。
- video/audio 候选不重复。
- 下载文件可播放，或能明确标识“视频流/音频流”。

## TikTok adapter 需求

- 匹配 `tiktok.com/@user/video/:id`、`photo/:id`、短链。
- 解析 `__UNIVERSAL_DATA_FOR_REHYDRATION__`、embed 数据。
- 支持视频、图集、原声。
- 候选排序参考 API 的 `buildVideoCandidateSet`：
  - H265 按设置决定是否优先。
  - no-watermark 候选优先。
  - embed fallback 降级但可用。

## Instagram adapter 需求

- 匹配 `p/`、`reel/`、`stories/`、share 链接。
- 支持单视频、图片、多媒体 carousel。
- 利用页面已登录 Cookie 和 hydration 数据。
- 对 story 私密/过期内容给出清楚提示。

## 其他平台 adapter 摘要

- Twitter/X：读取 tweet 页面媒体 JSON，支持多媒体 post，视频/GIF 分组。
- Facebook：仅公开视频/Reels，优先页面 video src 和 browser network。
- Xiaohongshu：支持图文和视频笔记，短链解析，图片批量展示。
- Kuaishou：识别 `short-video`、`video`、短链，过滤封面和头像。
- Vimeo/Dailymotion/Streamable：优先播放器 config 和 HLS/DASH manifest。
- Reddit：识别 `v.redd.it`、fallback audio、gallery。
- Pinterest/Snapchat/Tumblr：优先页面 JSON 和媒体 CDN。
- SoundCloud：只做音频，文件名使用作者和曲名。

## 权限策略

MVP 当前权限：
- `activeTab`
- `scripting`
- `tabs`
- `storage`
- `downloads`

短期保持这个权限模型，不申请 `<all_urls>`。

如果后续需要后台持续监听网络请求，再评估：
- `webRequest`
- 更细粒度 host permissions，例如 `*://*.douyin.com/*`

但上架前需要谨慎，因为权限越多，审核和用户信任成本越高。

## 商业化与软收费墙

### 商业判断

插件最终可以收费，但不应把目标设定为“绝对防绕过”。只要媒体直链已经出现在用户浏览器里，理论上就无法完全阻止技术用户复制网络请求或使用其他插件。

因此，收费墙的目标是：

- 对普通用户形成有效门槛。
- 把高频用户引导到登录、积分和会员体系。
- 不牺牲早期增长和口碑。
- 不把收入核心押在不可强控制的单条直链上，而是逐步把高级能力纳入付费。

### 阶段策略

#### 阶段 1：早期增长期

- 插件基础下载免费。
- 不强制登录。
- 重点提升安装量、好评、平台覆盖和稳定性。
- popup 中保留 FreeSaveVideo 品牌和网站入口。

#### 阶段 2：登录与免费额度

- 未登录用户每天可免费下载少量次数，例如 3 次。
- 登录用户每天可获得更多免费额度，例如 10 次。
- 首次安装可赠送一次性试用额度，例如 20 次。
- 下载额度耗尽后，引导登录或升级。

#### 阶段 3：积分与会员

- 普通单条下载可以按次数授权。
- 高级解析、批量下载、合集下载、图集打包、高清优先、无水印优先、自动命名、下载历史、云端收藏等能力进入付费层。
- 支持会员无限或高额度使用。
- 支持积分按次消耗。

### 下载授权流程

插件点击 `Download` 前，不直接调用 `chrome.downloads.download`，而是先请求 FreeSaveVideo API 授权。

```text
用户点击 Download
-> extension 生成授权请求
-> POST /extension/download-authorize
-> API 校验登录态、会员、积分、免费额度、功能开关
-> API 返回 allow / deny / remaining / reason
-> allow=true 时插件调用 chrome.downloads.download
-> deny 时 popup 展示登录、升级或额度耗尽提示
```

授权请求建议包含：

```ts
type ExtensionDownloadAuthorizeRequest = {
  platform: string;
  pageUrl: string;
  pageTitle?: string;
  mediaUrlHash: string;
  mediaKind: 'video' | 'audio' | 'image' | 'playlist' | 'subtitle' | 'link';
  feature: 'direct-download' | 'batch-download' | 'high-quality' | 'no-watermark' | 'gallery-pack' | 'playlist';
  extensionVersion: string;
  clientTime: string;
};
```

注意：不需要把完整 `mediaUrl` 发给 API，默认只上传 hash，降低隐私和合规压力。只有在需要服务端诊断、云端解析或用户主动使用 FreeSaveVideo API 时，才发送完整 URL。

授权响应建议包含：

```ts
type ExtensionDownloadAuthorizeResponse = {
  allow: boolean;
  remaining?: number;
  plan?: 'anonymous' | 'free' | 'pro' | 'credits';
  reason?: 'allowed' | 'login_required' | 'quota_exceeded' | 'payment_required' | 'platform_disabled' | 'unsupported';
  message?: string;
};
```

### 登录方案

- 插件 popup 提供登录入口。
- 登录页使用现有 FreeSaveVideo/Clerk 登录体系。
- 登录完成后插件保存短期 token 或 session 状态到 `chrome.storage.local`。
- 插件启动或点击高级功能时调用 API 刷新用户权益。
- token 过期时回到登录态提示，不阻塞基础浏览。

### 本地缓存与容错

- 授权结果最多缓存 5 分钟，减少频繁点击导致的 API 压力。
- 免费额度和会员状态可短期缓存，但不能长期离线无限使用。
- API 不可用时：
  - 早期增长期可以放行基础下载。
  - 商业化稳定期可以只放行低风险免费额度，付费功能需要在线授权。

### Feature flags

API 应支持按平台和功能下发开关：

```ts
type ExtensionFeatureFlags = {
  directDownloadEnabled: boolean;
  platformAdapters: Record<string, boolean>;
  quotaEnabled: boolean;
  paidFeatures: {
    batchDownload: boolean;
    highQuality: boolean;
    noWatermark: boolean;
    galleryPack: boolean;
    playlist: boolean;
  };
};
```

用途：

- 某个平台解析不稳定时远程关闭。
- 灰度上线收费墙。
- 对新用户、老用户、不同国家/地区使用不同额度策略。
- 在 Chrome Web Store 审核风险较高时临时收敛功能。

### UI 要求

- 免费额度充足时，不打扰用户。
- 剩余额度较低时，在 popup 底部轻提示。
- 额度耗尽时，下载按钮切换为登录/升级引导。
- 高级功能用明确的 Pro/Credits 标识。
- 不使用误导性文案，不承诺绕过平台限制。

## 降级策略

每个平台 adapter 输出：

- `ok`：有可下载直链。
- `needsPlayback`：需要先播放几秒再 scan。
- `needsLogin`：需要用户在该平台登录。
- `blockedByPlatform`：平台返回风控/地区/私密限制。
- `unsupportedContent`：直播、会员、DRM、付费内容。
- `fallbackOnly`：只能复制页面链接或打开 FreeSaveVideo。

## 验收标准

每个平台至少准备 5 条测试链接：

1. 普通公开视频。
2. 多清晰度视频。
3. 图片/图集内容。
4. 短链/分享链接。
5. 登录态或地区差异样本。

每条链接验收：

- scan 后 3 秒内出结果。
- 噪声资源少于 20%。
- 默认排序第一条可下载。
- 文件名可读，不含非法字符。
- 下载文件扩展名正确。
- YouTube 页面不出现下载按钮。

## 落地顺序

1. 抽 `adapters/types.ts`、`adapters/registry.ts`、`adapters/generic.ts`。
2. 把当前 `content.ts` 的通用逻辑迁入 generic adapter。
3. 做 Douyin adapter，解决当前截图问题。
4. 回头整理 Bilibili adapter，让 B 站结果更像 SnapWC。
5. 做 TikTok adapter。
6. 做 Instagram/Xiaohongshu/Kuaishou。
7. 根据真实用户反馈继续补 P1/P2。
