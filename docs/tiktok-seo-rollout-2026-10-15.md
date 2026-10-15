# TikTok SEO 整改与发布后跟踪

## 当前阶段

- 代码整改完成，尚未执行生产构建或部署，也未提交本轮 GSC 收录请求。
- 首批完整重写：中英文的单视频、合集、音频下载页及对应指南，共 12 个 URL。
- 其他 9 种已提供语言的同组页面只精简重复推广/排错区和无关推荐，保留原本的本地化正文；不能将其描述为完成了内容重写。
- 原 URL、各语言自身 canonical、既有下载处理逻辑保持不变。
- 当前聊天已创建专用自动化 `tiktok-google`，每天北京时间 10:00 检查，未发布或状态不变时保持安静。

## 已修改

1. 单视频页解释视频、图集、短链接及公开内容边界，不承诺所有视频都能取得无水印版本。
2. 合集页区分可识别的公开 Playlist 与手动整理的多链接；不承诺整账号抓取或完整展开所有条目。
3. 音频页解释源音频格式和时长，不将所有输出称为 MP3，不承诺补全歌曲。
4. 下载页说明直接保存、桌面扩展、浏览器手动保存的选择，以及按界面确认积分/会员要求。
5. 指南提供独立的阶段排错、电脑/Android/iPhone 文件位置、过期链接和扩展下载完成确认，不再照抄下载页的步骤/FAQ。
6. 所有 TikTok 详情页移除通用宣传、重复排错 FAQ 和无关工具推广，相关推荐收敛到当前平台。全站侧栏不在本轮范围。
7. 中英文下载页添加服务端可见的表单：普通链接输入或多链接文本框。JS 加载后仍使用既有 Omnibox；表单作为未加载时的入口，将 `u` 参数交给语言首页。
8. 66 个 TikTok 相关下载/指南 URL 的 sitemap lastmod 更新为 2026-10-15。其他页面不刷新日期。额外语言也发生了结构性精简，因此这些日期不是虚假批量更新。
9. TikTok 页面的 WebApplication 结构化数据移除统一的零美元报价和通用功能堆砌，避免与实际积分/会员提示冲突；补上官方扩展商店入口。

内容实现位于 `web/src/lib/seo/tiktok-content.ts`。中文文案使用 Unicode 转义，脚本源码保持 ASCII。

## 本地验证

- `pnpm -C web test:seo-contracts`：21 项通过，包括 406 个详情页面的共享标签渲染检查及本轮新检查。
- 新检查覆盖：中英文 12 页的 SSR、无 JS 输入入口、下载/指南 FAQ 区分、可见问答与 FAQPage 一致、无关推荐移除、仅 TikTok 更新 lastmod。
- `pnpm -C web check`：0 errors，107 warnings，警告分布于 15 个文件；不把存在警告描述为全量无告警。
- `pnpm -C web i18n:check-encoding`：通过。本轮没有改写 i18n JSON。
- `git diff --check`：通过。
- 使用仅绑定 127.0.0.1 的临时 HTTP Vite 服务检查英语下载页和中文指南的真实浏览器排版。初次访问触发依赖优化及动态模块加载重试；不能将首次 SSR 表单截图当作媒体下载成功证据。
- 没有运行生产 build，没有实测媒体下载成功率、速度或所有手机设备。页面中的设备说明是操作指导，不是本轮硬件实测报告。

## 发布步骤

按 AGENTS.md，由维护者手动执行生产构建，再按项目既有 Cloudflare Pages 流程发布。自动化不运行 build，不擅自提交/推送或部署。

发布前保留三个已索引地址 `/en`、`/es/download`、`/ja/download` 作为对照；本轮不改这些地址的 canonical。

发布后需要同时验证：

- 正式域名出现新正文，而不是仅在本地、预览站或 Git 中存在。
- HTTP 正常、允许索引、canonical 为该语言的正式 URL，hreflang 正确。
- sitemap 的 TikTok 条目日期为 2026-10-15。
- 指南仍有对应下载入口，表单/Omnibox 可用。

### 新版识别文本

不能仅凭页面标题或日期确认发布。至少核对一段主要正文：

| 语言/页面 | 本轮新正文示例 |
| --- | --- |
| en 单视频 | Only public posts are eligible. This does not unlock private or deleted content |
| en 合集 | Playlist expansion depends on the public entries TikTok currently exposes. |
| en 音频 | The result may be a short audio clip in a format other than MP3. |
| en 单视频指南 | A preview without a file usually calls for checking the saving step and download location. |
| en 合集指南 | First check whether the list failed to expand or an individual file failed to save. |
| en 音频指南 | Audio mode, the returned file format and the source clip length are separate checks. |
| zh 单视频 | 不解锁私密或已删除内容，也不保证每条视频都有无水印资源 |
| zh 合集 | 合集展开取决于 TikTok 当前可读取的公开条目 |
| zh 音频 | 音频不一定是 MP3，也不一定是完整歌曲 |
| zh 单视频指南 | 看到预览但找不到文件，通常需要检查保存步骤和下载位置 |
| zh 合集指南 | 先确认是列表没有展开，还是某个条目没有保存 |
| zh 音频指南 | 音频模式、返回格式和源音频时长是三个不同的检查点 |

## 每 URL 跟踪表

所有路径前缀为 `https://freesavevideo.online`。首次观察新版时间不自动等同于真实发布时间。缺失数据写“未检查”，不能推测。

| URL 路径 | 发布确认/时间 | GSC 上次抓取 | 当前索引状态 | 本轮请求日期/结果 |
| --- | --- | --- | --- | --- |
| /en/download/tiktok-no-watermark | 待发布 | 2026-04-28 15:16:14（10/15 检查） | 已抓取未索引（10/15 检查） | 未请求 |
| /zh/download/tiktok-no-watermark | 待发布 | 未检查 | 未检查 | 未请求 |
| /en/download/tiktok-collection-download | 待发布 | 未检查 | 未检查 | 未请求 |
| /zh/download/tiktok-collection-download | 待发布 | 未检查 | 未检查 | 未请求 |
| /en/download/tiktok-mp3-download | 待发布 | 未检查 | 未检查 | 未请求 |
| /zh/download/tiktok-mp3-download | 待发布 | 未检查 | 未检查 | 未请求 |
| /en/guide/tiktok-download-guide | 待发布 | 未检查 | 未检查 | 未请求 |
| /zh/guide/tiktok-download-guide | 待发布 | 未检查 | 未检查 | 未请求 |
| /en/guide/tiktok-collection-download-guide | 待发布 | 未检查 | 未检查 | 未请求 |
| /zh/guide/tiktok-collection-download-guide | 待发布 | 未检查 | 未检查 | 未请求 |
| /en/guide/tiktok-mp3-download-guide | 待发布 | 未检查 | 未检查 | 未请求 |
| /zh/guide/tiktok-mp3-download-guide | 待发布 | 未检查 | 未检查 | 未请求 |

## 自动跟进规则

1. 每天执行一次轻量检查，状态不变保持安静。当前聊天后续用户要求优先。
2. 正式域名未确认新版时，不提交旧版收录、不反复催发布。
3. 确认发布后，先检查中英文单视频页，再分批检查其他试点 URL；记录单页 GSC 状态、抓取时间及 canonical。
4. 对本轮实质修改、尚未请求过的核心地址，在确认新版可访问后请求编入索引一次，并记录结果。达到配额则保留剩余项；不得每天重复请求已提交项。
5. 仅在必要时提交/重新提交 sitemap 一次。已有地图可读取时，不把重新提交当作收录保证。
6. 浏览器、GSC 登录或 CAPTCHA 不可用时，报告一次具体需要用户操作的事项；不绕过、不虚构提交成功。
7. 记录“未发布”“已发布未重抓”“发布后已重抓仍未索引”“已索引”；实时测试通过不等于已索引。
8. 发布后第 7、14、28 天评估；实际检查日在目标日之后时注明实际日期，不补造当日数据。
9. 全部核心 URL 索引完成，或发布后 28 天观察期结束时，给出最终评估并结束专用自动化，不归档聊天。未收录时明确未达成目标，提出下一轮有证据支持的行动。

### 执行记录

- 2026-10-15：代码和定向检查完成；自动化创建成功，ID `tiktok-google`。尚未生产发布，未提交收录请求。
