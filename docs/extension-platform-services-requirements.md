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

## 实施任务清单

以下清单按“可独立开会话执行”的粒度拆分。默认策略已经确认：

- 阶段 1 接受“先不上 API 授权、基础下载全免费”，但要预留授权接口和埋点位。
- 第一批 P0 平台按 `Douyin -> Bilibili -> TikTok -> Instagram` 落地。

### 里程碑划分

#### M1：完成扩展架构重构，不追求平台效果提升

目标：

- 把当前“单 content scanner”升级为“adapter registry + generic adapter + downloader pipeline”。
- 保持现有通用扫描能力不回退。
- 为后续 Douyin/Bilibili/TikTok/Instagram adapter 留好接口。

可并行任务：

1. 任务 A1：抽统一类型与消息协议
   - 文件范围：
     - `extension/src/shared/messages.ts`
     - `extension/src/adapters/types.ts`
   - 工作内容：
     - 定义 `PlatformId`、`AdapterResult`、`DetectedMedia`、`AdapterContext`、`PlatformAdapter`。
     - 给 `DetectedMedia` 增加 `durationLabel`、`filename`、`score`、`requiresPageContext`。
     - 给 `AdapterResult` 增加 `warnings` 和平台状态字段。
     - 升级 popup/background/content 间消息协议，避免后续平台信息丢失。
   - 验收：
     - TypeScript 可编译。
     - 旧 popup 仍能正常展示 generic 扫描结果。

2. 任务 A2：建立 adapter 目录与 registry
   - 文件范围：
     - `extension/src/adapters/registry.ts`
     - `extension/src/adapters/generic.ts`
     - `extension/src/adapters/index.ts`（如需要）
   - 工作内容：
     - 建立 adapter 注册表与 URL 匹配流程。
     - 约定 adapter 失败时只返回空结果或 warning，不抛致命错误。
     - 先接入 `generic` adapter 和 `youtube-policy` 特判逻辑。
   - 验收：
     - content script 能根据 URL 正确命中 generic 或后续平台 adapter。
     - YouTube 页面仍只显示政策提示，不出现下载按钮。

3. 任务 A3：迁移现有 content 通用扫描逻辑
   - 文件范围：
     - `extension/src/content.ts`
     - `extension/src/adapters/generic.ts`
   - 工作内容：
     - 把当前 DOM/performance 扫描逻辑迁入 `generic adapter`。
     - content script 自身只保留注入、上下文组装、调用 registry、回传结果。
     - 保留当前噪声过滤基础能力。
   - 验收：
     - 非目标平台页面扫描结果与当前版本接近。
     - 扫描时间维持在 3 秒内。

4. 任务 A4：抽 downloader 通用模块
   - 文件范围：
     - `extension/src/downloader/chrome-downloads.ts`
     - `extension/src/downloader/filename.ts`
     - `extension/src/downloader/probe.ts`
     - `extension/src/background.ts`
   - 工作内容：
     - 抽离文件名清洗逻辑。
     - 抽离下载入口，统一调用 `chrome.downloads.download`。
     - 为未来 `requiresPageContext`、403/404 回退策略预留接口。
   - 验收：
     - 当前 popup 里的下载功能不回退。
     - 文件名仍落在 `FreeSaveVideo/...` 目录下，且非法字符被正确清洗。

5. 任务 A5：popup 数据结构升级
   - 文件范围：
     - `extension/src/popup/main.ts`
     - `extension/src/popup/styles.css`
   - 工作内容：
     - 让 popup 消费 `AdapterResult`，而不是只消费简单 `PageScanResult`。
     - 增加平台标识、warning、状态文案区域。
     - 保持当前 UI 先可用，不强求完整视觉重做。
   - 验收：
     - popup 可展示平台、状态、warning。
     - generic 扫描结果仍能下载、复制链接、打开 FreeSaveVideo。

#### M2：Douyin 首发可用 + Bilibili 体验升级

目标：

- 先解决当前最明显的问题：Douyin 噪声大、候选不准。
- 把 Bilibili 从“能扫到”提升为“能看懂、能选对”。

可并行任务：

1. 任务 B1：实现 Douyin adapter
   - 文件范围：
     - `extension/src/adapters/douyin.ts`
     - `extension/src/adapters/registry.ts`
   - 工作内容：
     - 支持 `video/note/share/slides/shortLink/jingxuan modal`。
     - 从 `performance`、`window._ROUTER_DATA`、`window._RENDER_DATA`、hydration script、`video.currentSrc` 取候选。
     - 过滤埋点、头像、封面小图、推荐流、`webcast` 直播资源。
     - 按文档优先级对 `douyinvod/bytevod/zjcdn/aweme play/currentSrc/generic` 排序。
   - 验收：
     - 同一视频默认只展示 1 到 3 个高可信候选。
     - 默认第一项可下载概率明显高于 generic 扫描。
     - 不再出现“80 items found”式列表污染。

2. 任务 B2：Douyin 展示与降级文案
   - 文件范围：
     - `extension/src/popup/main.ts`
     - `extension/src/popup/styles.css`
   - 工作内容：
     - 展示标题、缩略图、`MP4`、清晰度、大小、来源。
     - 增加 `needsPlayback`、`needsLogin`、`blockedByPlatform`、`fallbackOnly` 的文案。
   - 验收：
     - 无法直下时，用户能看懂下一步该做什么。

3. 任务 B3：Bilibili adapter 整理
   - 文件范围：
     - `extension/src/adapters/bilibili.ts`
     - `extension/src/adapters/registry.ts`
   - 工作内容：
     - 从 `window.__playinfo__`、`playurl API`、network 资源中归并 video/audio 候选。
     - 对同一视频的 video/audio 流做成组展示。
     - 过滤 `data.bilibili.com/log` 和其他统计噪声。
   - 验收：
     - 列表不再出现明显噪声链接。
     - video/audio 不重复。
     - 可明确标识“视频流/音频流”。

4. 任务 B4：P0 测试样本沉淀
   - 文件范围：
     - `docs/` 下新增测试样本文档，或 `extension/README.md`
   - 工作内容：
     - 为 Douyin、Bilibili 各整理至少 5 条验收链接。
     - 覆盖公开视频、多清晰度、图文/图集、短链、登录态或地区差异样本。
   - 验收：
     - 后续任何会话都能复用这些样本做回归。

#### M3：TikTok + Instagram

目标：

- 完成第一批 P0 平台主链路。
- 验证 adapter 架构具备横向复制能力。

可并行任务：

1. 任务 C1：实现 TikTok adapter
   - 文件范围：
     - `extension/src/adapters/tiktok.ts`
   - 工作内容：
     - 支持 `@user/video/:id`、`photo/:id`、短链。
     - 解析 `__UNIVERSAL_DATA_FOR_REHYDRATION__` 和 embed 数据。
     - 参考文档实现 no-watermark 候选优先、embed fallback 降级。
   - 验收：
     - 视频、图集、原声都有明确结果或明确降级提示。

2. 任务 C2：实现 Instagram adapter
   - 文件范围：
     - `extension/src/adapters/instagram.ts`
   - 工作内容：
     - 优先支持 `p/`、`reel/`、share。
     - `stories/` 先做到“能识别时展示，不能稳定支持时明确提示”。
     - 利用页面登录态 cookie 和 hydration 数据。
   - 验收：
     - 对 post/reel 的成功率高于 generic。
     - 对 story 私密或过期内容有清晰提示。

3. 任务 C3：P0 popup 体验收口
   - 文件范围：
     - `extension/src/popup/main.ts`
     - `extension/src/popup/styles.css`
   - 工作内容：
     - 统一各平台卡片结构。
     - 规范 badge：格式、清晰度、大小、来源、Pro 占位。
     - 规范失败态和空态。
   - 验收：
     - Douyin/Bilibili/TikTok/Instagram 在同一 popup 交互下都能读懂。

#### M4：商业化基础设施接线，但默认不拦基础下载

目标：

- 把授权、登录、配额、feature flags 接进来。
- 默认仍允许基础下载，避免影响增长。

可并行任务：

1. 任务 D1：定义扩展授权 API
   - 文件范围：
     - `api/src/routes/` 下新增 extension 路由
     - `docs/` 下新增或补充扩展 API 文档
   - 工作内容：
     - 新增 `POST /extension/download-authorize`。
     - 定义请求/响应结构、reason 枚举、feature flags 返回。
     - 默认只传 `mediaUrlHash`，不传完整 URL。
   - 验收：
     - 本地和生产 API 都能返回 allow/deny/remaining/plan/reason。

2. 任务 D2：扩展登录态接入 Clerk
   - 文件范围：
     - `extension/src/background.ts`
     - `extension/src/popup/main.ts`
     - 视方案需要新增 `extension/src/auth/*`
   - 工作内容：
     - popup 增加登录入口。
     - 与现有 FreeSaveVideo/Clerk 体系对接。
     - token 或 session 保存到 `chrome.storage.local`。
   - 验收：
     - 登录后可在扩展内看到用户权益状态。
     - token 过期时不阻塞基础浏览和基础扫描。

3. 任务 D3：扩展授权调用与缓存
   - 文件范围：
     - `extension/src/background.ts`
     - `extension/src/downloader/*`
   - 工作内容：
     - 在点击 `Download` 前先请求授权。
     - 授权结果缓存最多 5 分钟。
     - API 不可用时，增长期继续放行基础下载。
   - 验收：
     - API 超时或失败不把基础下载链路打崩。
     - 低风险免费能力可离线短暂可用。

4. 任务 D4：feature flags 打通
   - 文件范围：
     - `api` feature flags 输出逻辑
     - `extension/src/background.ts`
     - `extension/src/popup/main.ts`
   - 工作内容：
     - 支持按平台关闭 adapter。
     - 支持按功能灰度 `batchDownload/highQuality/noWatermark/galleryPack/playlist`。
   - 验收：
     - 后端可动态关平台、关功能、开额度策略，无需重新发版。

#### M5：收费能力与高级功能灰度

目标：

- 在不牺牲基础增长的前提下，逐步上线积分和会员能力。

建议后置任务：

1. 任务 E1：免费额度策略
   - 匿名用户每日免费次数。
   - 登录用户更高免费次数。
   - 首次安装赠送试用额度。

2. 任务 E2：Pro/Credits 功能墙
   - 高级解析。
   - 批量下载。
   - 图集打包。
   - 高清优先。
   - 无水印优先。

3. 任务 E3：高级下载策略
   - 针对 `requiresPageContext`、403/404 增加页面上下文 fetch/blob 下载。
   - 仍不优先走 FreeSaveVideo tunnel。

### 多会话执行建议

建议按以下边界拆会话，减少互相冲突：

1. 会话 1：A1 + A2
   - 只动类型、消息协议、adapter registry。
2. 会话 2：A3 + A4
   - 只动 content 通用逻辑和 downloader。
3. 会话 3：A5 + B2 + C3
   - 只动 popup 展示层。
4. 会话 4：B1
   - 只做 Douyin adapter。
5. 会话 5：B3
   - 只做 Bilibili adapter。
6. 会话 6：C1
   - 只做 TikTok adapter。
7. 会话 7：C2
   - 只做 Instagram adapter。
8. 会话 8：D1 + D4
   - 只做 API 授权接口和 flags。
9. 会话 9：D2 + D3
   - 只做扩展登录与授权调用。

### 编码约束与落地原则

- 短期不增加 `<all_urls>`、`webRequest` 等高敏感权限。
- 不为 Chrome Web Store 版本实现 YouTube adapter。
- adapter 内只做平台候选识别、过滤、评分，不把通用下载逻辑塞回 adapter。
- 通用去重、排序、文件名清洗、下载动作统一放共享模块。
- adapter 失败时必须优雅退回 generic，不得让 popup 整体报错。
- 商业化阶段前，默认基础下载不被 API 授权阻塞。

### 每阶段完成后的统一回归清单

1. 普通非目标站点页面仍可扫描出通用媒体资源。
2. YouTube 页面仍只显示政策提示。
3. 扫描结果在 3 秒内返回。
4. 文件名可读且不含非法字符。
5. 下载扩展名正确。
6. adapter 失败时能回落 generic，而不是白屏或报错。
7. popup 中 FreeSaveVideo 品牌和页面入口仍保留。
