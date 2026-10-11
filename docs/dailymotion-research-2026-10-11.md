# Dailymotion 竞品下载与 SEO 调研

日期：2026-10-11（Asia/Shanghai）。来源是当日浏览器结果页、公开 HTTP 响应、搜索结果和项目代码。

## Klipa 下载链路：证据与推断

用户已下载的结果页显示：480p，时长 1:05:33，大小 392.7 MB，文件一小时后删除。
浏览器 DOM 中的 video src 是 Klipa 自己的 `/api/tools/stream-out/<task-id>`，不是 Dailymotion CDN。
对该已观察到的地址请求 `Range: bytes=0-1023`，得到：

- HTTP 206，无跨域重定向；`Content-Type: video/mp4`。
- `Content-Range: bytes 0-1023/411811963`，`Accept-Ranges: bytes`。
- MP4 文件头为 `ftyp`，随后是 `moov`；有文件名、ETag 和 Last-Modified。
- 实际大小 411811963 字节，即约 392.7 MiB，和页面大小一致。

这说明浏览器拿到的是竞品域名提供的可按字节读取的完整 MP4。完整长度、文件时间和删除提示
支持“后台已准备好文件”的推断，但不能证明是磁盘缓存、对象存储还是代理已有文件。
更不能据此知道其后台用了什么提取工具、是否获取源站 progressive MP4，或用了多少并发。
未重复下载 393 MiB 文件；“不到一分钟”来自用户体验描述，没有在本轮重测整个流程。

公开播放器元数据 `/player/metadata/video/xbdiup6` 在本地探测返回时长 3933 秒，
`qualities.auto` 仅包含 `application/x-mpegURL` 的 HLS manifest，无 progressive MP4。
这只代表该接口、该视频和当时请求环境，不能推断源站所有接口都没有 MP4。
项目此前 GraphQL 提取亦得到独立视频和音频 HLS；系统 FFmpeg 五秒合并样本成功，
见 [FFmpeg 事故记录](ffmpeg-hls-incident-2026-10-11.md)。

## Klipa 准备 MP4 的进一步调查

同日继续读取结果页实际加载的公开 JavaScript，并读取用户提供的既有任务状态；没有创建收费任务、读取登录凭据或探测后台管理接口。

### 可确认的任务流程

1. [tool/url.min.js](https://klipa.ai/static/js/tool/url.min.js?v=34) 中，输入链接会调用 `POST /api/tools/url-peek` 获取预检查信息。提交下载调用 `POST /api/tools/url-download`，请求字段为 `url`、`tool_key`、`audio`、`lang`，响应包含 `task_id`。普通视频提交没有发送分片并发数、FFmpeg 参数或明确的分辨率选择。
2. [tool/processing.min.js](https://klipa.ai/static/js/tool/processing.min.js?v=34) 每 2500 ms 查询 `GET /api/tools/status/<task-id>`。它读取 `status`、`progress`、`queued`、`queue_position`、`estimated_total_s`；完成后展示结果并保存 `result_url`、`output_size` 等字段。前端实现支持排队，但既有任务不能还原实际排队历史。
3. 既有任务状态为 `completed` / 100%，`tool_type=url_download`，`result.kind=url_full`。时长为 3932.52 秒，输入与输出大小均为 411811963 字节；`source_height=served_height=480`，`hd_available=false`，`audio_only=false`，`platform=dailymotion`。这次源高度本来就是 480，不能把免费 480p 展示解释为它把更高清的源强制转成了 480p。
4. 状态返回 `/api/tools/download/<task-id>` 用于下载，`/api/tools/stream-out/<task-id>` 用于预览。[tool/download.min.js](https://klipa.ai/static/js/tool/download.min.js?v=155) 使用 XMLHttpRequest 读取成品 Blob，再用 `URL.createObjectURL` 与下载链接保存；部分移动浏览器走原生链接保存。公开的这段下载逻辑没有客户端 HLS 分片下载、WASM FFmpeg 或客户端合并步骤。

可确认的流程为：链接预检查 → 创建后台任务 → 查询状态 → 领取成品 MP4。后台任务执行器、部署位置和存储类型没有公开确认。

### 成品封装信息

只读取 MP4 前 4566392 字节以检查完整 `moov`，没有重新下载整个文件：

- `ftyp` 长 32 字节，紧随其后的 `moov` 长 4566360 字节，媒体索引位于文件前部，适合开始播放前读取。
- 视频采样格式为 `avc1`，尺寸 848×480；音频采样格式为 `mp4a`。
- `moov/udta/meta/ilst/©too` 内的工具标记为 `Lavf61.7.103`。

`Lavf` 是 [FFmpeg 的 libavformat 封装/解封装库](https://www.ffmpeg.org/doxygen/trunk/group__libavf.html)。工具标记表明这个文件的制作链路经过该库，支持 FFmpeg 封装的解释，但不能单独证明处理发生在 Klipa 后台，也不能证明它调用了 FFmpeg 命令行或使用系统安装的二进制；源文件可能已经带有这个标记。索引在文件前部也不能单独证明具体使用了 `-movflags +faststart` 参数。

公开前端的错误过滤正则包含 `yt-dlp`、`ffmpeg`、`ffprobe`，同时还有大量其他服务和框架名称。这只是防止内部错误泄露的通用过滤器，不是 Dailymotion 下载使用 yt-dlp 的证据。

### 目前最合理的解释与未确认部分

合理但尚未证明的实现是：后台提取源媒体 → 下载源文件或 HLS 分片 → 使用 FFmpeg/libavformat 封装为 MP4 → 暂存成品 → 同域接口供浏览器保存。H.264 与兼容音频可以通过流复制封装，无须按视频时长逐帧重新编码，因此 65 分钟的视频不必处理 65 分钟。

仍未确认：源站 progressive MP4 还是 HLS、yt-dlp 还是自写提取器、音频是否复制、分片并发数、是否命中缓存，以及服务器下载与用户保存各花多少时间。本轮进一步请求 Dailymotion 源 manifest 返回 HTTP 403，未完成源流与成品码流的对比；不能据此断言无损合并或重新转码。

前端状态没有提供这项既有任务的开始/完成时间，不能复原准备耗时。411811963 字节若单次传输在 60 秒完成，需要平均约 6.9 MB/s（约 55 Mb/s，不含协议开销）；这只是带宽算术，不是本轮实测速率，也不解释任务准备时间。

## 速度优化方向

后续已完成生产服务器上的分阶段性能对比，见 [Dailymotion 性能测量](dailymotion-performance-2026-10-11.md)：同一完整视频当前 AAC 编码分支耗时 164.699 秒，音频直接复制对照耗时 22.335 秒；这是服务器受控测量，尚非用户实际下载耗时，也不是已部署的优化。

当前项目边读取 HLS 边输出 MP4；视频复制，音频会进入 AAC 编码分支。竞品交付已准备好的文件，
因此点击保存后的速度不能直接等同于提取与准备总耗时。应分开记录解析、准备、首字节、传输完成时间。

下一轮可以用同一视频和相同画质比较：源站分片请求耗时、跨区域带宽、FFmpeg 处理速度、
音频复制与编码的输出兼容性、受控分片并发，以及预先生成文件的总等待时间。
缓存须考虑签名有效期、存储成本和重复任务命中率；尚未实测这些优化，不能承诺提速比例。
本轮没有改动下载器后端或将 Dailymotion 切换为 Direct Bridge。

## SEO 机会与关键词映射

这是搜索意图和页面能力分析，不是搜索量、关键词难度或竞争对手流量统计。
没有 Keyword Planner 或 Search Console 数据，因此不报告估算月搜索量或排名承诺。

| 关键词 | 意图与机会 | 本轮页面安排 |
| --- | --- | --- |
| dailymotion video downloader | 明确工具意图，结果中有 Klipa、GetInDevice、MediaPuller 等专用工具页 | 主关键词用于英文标题、H1、独立页面和内链 |
| download dailymotion videos | 工具与操作指南混合意图，还有源站自己的下载说明 | 同页步骤标题与实用步骤，避免再建近似页面 |
| dailymotion to mp4 | 输出格式与声音需求，适合说明 MP4、清晰度及等待原因 | 同页功能标题和 FAQ |
| dailymotion playlist downloader | 整个列表批量下载意图，存在桌面软件竞品与教程 | FAQ 如实说明暂不自动展开；具备能力后才考虑独立页 |

已审阅的公开结果：

- [Klipa 专用下载页](https://klipa.ai/en/tools/download-dailymotion-video)：以工具入口、MP4 输出和相关编辑工具承接用户。
- [GetInDevice](https://getindevice.com/dailymotion-video-downloader/)：说明视频地址与播放列表地址的区别，FAQ 明确不展开整列表。
- [MediaPuller](https://mediapuller.com/download/dailymotion)：专用输入框和视频链接解释。
- [SurFast 播放列表页](https://www.nablamind.com/video-download/dailymotion-playlist-downloader.html)：通过桌面产品承接列表下载意图。
- [XGetter 播放列表与频道能力说明](https://docs.xgetter.com/platforms/dailymotion)：属于厂商自述，不代表本轮已验证该软件。
- [Dailymotion 官方下载说明](https://faq.dailymotion.com/hc/en-us/articles/115009096528-Download-videos)：提供 Studio 中下载自己上传视频的流程。

不能根据这一组结果确定固定排名、地区排名或市场容量。页面差异化优先放在可使用的下载入口、
声音与画质解释、真实的播放列表限制，以及明确的账号和用量提示；不写“无限免费”“无需登录”
或“一分钟下载完成”等与产品或证据不符的承诺。

## 本轮落地页实现与验证范围

项目没有独立的 Dailymotion SEO 页面。本轮复用既有动态下载页和 Omnibox，新增：

- `/en/download/dailymotion-video-downloader`，对应三个单视频核心关键词。
- `/zh/download/dailymotion-video-downloader`，中文说明页。
- 下载目录、内部推荐链接、能力目录及 sitemap 登记；仅这两种语言进入生成列表和 hreflang。
- 专用 FAQ、标准视频及 dai.ly 输入格式、账号用量提示、480p 与 HLS 耗时解释。
- 在下载控件加载前也提供 HTML 链接输入表单，通过既有 `u` 参数把输入交给首页下载器。
- 不为新页面添加一分钟完成的 HowTo 时间或免费价格结构化承诺。

其他语言暂不生成英语回退页面，避免多个语言 URL 实际呈现相同英语内容。
自动播放列表展开没有实现；用户可复制多个独立视频链接使用既有批量队列。
改动在本地，未部署。SEO 合约检查 17 项通过，包含 397 个多语言详情页的共享标签检查。
编码检查通过；Svelte 检查为 0 错误，已有项目组件警告需另行处理。未运行生产构建。
本地浏览器核对了中英页面的标题、表单和 FAQ，并保存英文布局预览。
本地 Vite 的动态模块曾加载失败，因此这轮浏览器验证不包含完整下载；HTML 表单和 SSR 内容
已验证，部署后的下载控件加载及整段下载仍需验证。
发布后用 Search Console 检查收录、查询词、展现、点击率及下载转化，再决定是否扩展其他语言。
