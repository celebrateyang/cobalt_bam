# HLS 下载与 FFmpeg 排障记录

讨论日期：2026-10-11（Asia/Shanghai）。

## 事故与实测证据

用户报告 Dailymotion 链接 `https://www.dailymotion.com/video/xbdiup6` 下载失败。
生产日志显示提取成功，API 返回 `status: tunnel`，但合并进程反复以
`SIGSEGV` 退出，`muxBytes: 0`。该次冻结积分随后成功释放。

在生产 API 容器中重新提取同一视频，并使用相同输入和合并参数对比两个二进制：

| 项目 | 结果 |
| --- | --- |
| 提取结果 | 两条 HLS 地址，视频 848×480，时长 3933 秒 |
| `ffmpeg-static@5.2.0` 包内二进制 | `SIGSEGV`，输出 0 字节，无 stderr |
| `/usr/bin/ffmpeg`（Debian 5.1.9） | 退出码 0，五秒 MP4 样本 526520 字节 |
| 系统 `ffprobe` 检查 | H.264 视频 848×480，AAC 音频 |

版本号 5.2.0 是 npm 包版本，不是此次查询得到的 FFmpeg 二进制版本。
证据表明此次失败发生在静态二进制处理远程 HLS 的阶段；尚未确定底层是
TLS、HLS 解复用还是其他编译差异。不应概括为“静态 FFmpeg 通常都会失败”。
五秒样本验证不代表完整视频或浏览器端到端下载已经验证。

## 调用流程与风险范围

Dailymotion 使用专用 GraphQL 提取器，不使用 yt-dlp；提取视频和音频地址后，
由 API 单独启动 FFmpeg 合并。NicoNico 等平台使用 yt-dlp 提取元数据和媒体地址，
但后续合并也由 API 单独启动 FFmpeg。yt-dlp 自身还支持完整下载并调用 FFmpeg；
项目的通用全文件下载兜底采用该方式，并显式指定 Linux 系统 FFmpeg。

调查时系统 FFmpeg 选择规则依赖服务名单，远程 HLS 输入规则使用另一份名单。
北京新报、NicoNico、微博 HLS 直接输入远程地址，却仍选择静态版本，应优先验证。
Vimeo、Rutube、Bluesky、Pinterest HLS、SoundCloud HLS 也可能选择静态版本，
输入经过隧道，风险需要单独验证。以上其他平台属于代码分析，未在此次调查复现崩溃。

Amazon、CCTV、爱奇艺、SOOP 已有系统版本规则。通用网站 HLS 也已使用系统版本；
优酷曾出现类似零字节 SIGSEGV，证据和其他隧道兼容性问题见
[通用下载记录](generic-download.md)。

## 本次落实的规则

- `api/src/stream/ffmpeg.js` 的统一选择器：非 Windows 的所有
  `isHLS === true` 输入使用 `/usr/bin/ffmpeg`，覆盖视频合并、重封装、静音、
  音频转换和 GIF 转换。生产环境为 Linux，非 Windows 条件延续既有实现。
- 保留已有服务的系统 FFmpeg 特例，包含爱奇艺非 HLS 等输入。
- Windows 继续使用打包二进制；其他非 HLS 输入维持原规则，未全面迁移。
- 常规 FFmpeg 日志级别改为 `warning`，继续只保留有限长度 stderr，
  失败日志包含实际选择的二进制路径。
- 不改变平台提取器、直连／隧道策略、yt-dlp 提取模式或现有通用下载兜底。
- `Dockerfile` 已安装系统 FFmpeg，无需为此新增安装步骤。

## 验证与后续排查

选择器测试覆盖代表性 HLS 服务、未来新服务以及输出模式，并检查 Windows
和非 HLS 输入的既有行为。以下回归命令在 Windows 工作区执行，29 项全部通过：

```sh
cd api
node --test src/stream/ffmpeg.test.js src/stream/manage.test.js src/stream/internal-hls.test.js src/stream/generic-render.test.js src/stream/generic-download.test.js
```

其中 Linux 二进制选择通过显式平台参数验证；真实流处理测试使用本机二进制。
这轮回归未逐个平台请求真实 CDN，不替代 Linux 部署后的完整验证。未运行生产构建。

本次代码修改在工作区完成，不代表已部署。部署后应验证完整 Dailymotion
浏览器下载，以及北京新报、NicoNico、微博和其余 HLS 平台的代表性链接。
若后续上线或完整验证完成，应在本文件追加实际结果，不要将样本验证当成上线验证。

排障时先查当前 Pod 和日志，再区分提取失败与合并失败：检查执行文件路径、
退出码／信号、输出字节数和 stderr。使用同一媒体地址、同一参数做二进制对比。
即使系统版本正常，也仍可能有签名过期、鉴权、地区限制、分片请求或格式问题。
不要把 API 成功返回 tunnel 当成文件下载成功，也不要用 yt-dlp 的存在判断
后续 FFmpeg 的实际路径。记录时不保存用户邮箱、访问凭据或带签名的 CDN 地址。
