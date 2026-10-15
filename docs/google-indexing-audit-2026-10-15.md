# Google 索引诊断与整改方案（2026-10-15）

## 结论与证据边界

通过用户已登录的 Chrome 查看 Search Console，统计“已抓取 - 尚未编入索引”表格全部 321 条记录，并抽查线上页面及仓库实现。

当前最值得整改的是：下载页与指南页复用内容、同页重复问答、缺少贴合实际下载流程的操作说明，以及目录以平台名称列表代替任务选择信息。它们是可观察的内容问题，但不能据此声称已经知道 Google 内部拒绝收录的具体原因。

“已抓取 - 尚未编入索引”不是人工处罚或明确的“低质量判定”通知。Google 官方仅说明已抓取但尚未索引，将来可能收录也可能不收录。应将内容质量作为主要整改假设，用重新抓取后的索引结果检验。

## Search Console 基线

总览上次更新标注为 2026/10/9；部分示例抓取日期晚于该日期，报告之间存在时间差，单页以网址检查为准。

| 状态 | URL 数 |
| --- | ---: |
| 已索引 | 3 |
| 已抓取 - 尚未索引 | 321 |
| 已发现 - 尚未索引 | 230 |
| noindex | 26 |
| 软 404 | 25 |
| 重定向 | 3 |

已索引的三个地址：

- `https://freesavevideo.online/en`，表格抓取日期 2026-10-09。
- `https://freesavevideo.online/es/download`，2026-10-08。
- `https://freesavevideo.online/ja/download`，2026-07-29。

已索引目录也是当前模板，因此不能把“使用目录模板”或“正文比较短”单独当成拒收原因。多语言本身也不能直接解释问题。

### 321 条记录按页面类型分组

| 类型 | 数量 | 建议 |
| --- | ---: | --- |
| `/download` 及详情 | 140 | 优先整改核心任务页 |
| `/guide` 及详情 | 98 | 与对应下载页比较，合并重复内容或补足独立教程 |
| `/about` 及子页 | 29 | 核验当前重定向/noindex，不作为收录增长目标 |
| `/videorecord` | 10 | 独立工具入口，按录屏需求另行评估 |
| `/random-chat` | 10 | 独立产品需求，不在下载落地页重复推送 |
| `/faq` | 8 | 只保留具体问题及真实解决路径 |
| `/remux` | 7 | 按格式转换需求另行评估 |
| `/discover` | 7 | 单独评估内容、SSR 与资源时效 |
| `/clipboard` | 6 | 按文件传输需求另行评估 |
| `/youtube-video-downloader` | 3 | 与 `/download/youtube-download` 核对意图后决定合并或区分 |
| 语言首页 | 2 | `/zh`、`/de` |
| `/settings` 子页 | 1 | 非搜索落地页 |

下载与指南共 238 条，占 74.1%。

### 上次抓取日期分布

| 月份（2026） | 数量 |
| --- | ---: |
| 1 月 | 1 |
| 3 月 | 8 |
| 4 月 | 220 |
| 5 月 | 65 |
| 6 月 | 19 |
| 7 月 | 4 |
| 8 月 | 1 |
| 10 月 | 3 |

318/321（99.1%）的表格抓取日期早于 9 月。`docs/seo-fixes-2026-09-06.md` 记录 9 月 7 日已部署一轮修复。现有历史状态无法证明那轮修复后的页面已经被重新评估；也不能把统计下降直接归因于修复有效。

## 单页检查与线上内容

### 中文首页：近期重新抓取后仍未索引

网址检查 `/zh`：

- 上次抓取：2026-10-12 17:39:28，Googlebot 智能手机版。
- 允许抓取：是；抓取：成功；允许索引：是。
- 用户声明 canonical：`https://freesavevideo.online/zh`。
- Google 选择 canonical：所检查的网址。
- 状态：已抓取 - 尚未编入索引。

浏览器当前 DOM 也显示单一自引用 canonical 和 `index,follow`。由此可排除该次抓取中的 robots 禁止、抓取失败和选中其他 canonical；不能推广为全站技术检查通过。

2026-10-15 16:00（GSC 显示时间）实时测试显示“网址可编入 Google 索引”。测试截图中可见中文标题、链接输入框、模式选择和粘贴下载按钮，首屏并非空白或错误页。实时通过仍不等于已经索引，也不能据首屏截图断言整页内容都已完整渲染。

当前首页已有真实输入框、模式选择、平台入口、扩展介绍及积分说明，并非空白页。首要改进方向是让用户迅速理解：什么任务能完成、输入什么链接、得到什么结果、免费与积分的边界。建议提供一组由真实操作验证的示例，而不是再加一段平台名称和泛化宣传。

### TikTok 下载页和指南页：有直接证据的内容重复

抽查：

- `https://freesavevideo.online/en/download/tiktok-no-watermark`
- `https://freesavevideo.online/en/guide/tiktok-download-guide`

两页重复：相同的介绍、三步操作、Highlights、Download and save flow、Platform advantages、workflow notes、failure cases，以及大部分 FAQ。

同一页还在“Platform-specific troubleshooting”和“FAQ”重复四个 TikTok 问题。多段文字要求用户重试、换网络、用队列，却没有明确解释直连失败时扩展下载和浏览器接管的实际路径。工具推荐区标记“No points required”，侧栏又对部分工具显示“members”，权益差异需要解释。

代码对应：

- `web/src/routes/[lang]/guide/[slug]/+page.svelte:21` 从下载页读取基础文案；没有独立教程数据时，步骤、特点和 FAQ 继续沿用。
- `web/src/lib/seo/guide-pages.ts` 中 TikTok 指南没有独立的步骤/特点/FAQ。
- `web/src/lib/seo/landing-pages.ts:279` 用通用池将 FAQ 补到至少五条；`:797` 起使用多语言通用模板。模板有维护价值，但不能替代平台特有信息。

TikTok 单页网址检查：最后抓取 2026-04-28 15:16:14，抓取成功、允许索引、自引用 canonical，未收录。因此当前重复内容是整改依据，不能声称四月 Google 看到的就是今天的页面。

建议在下载页保留输入框、支持链接/输出、关键限制、保存失败帮助；指南只有提供不同设备的真实操作、截图及失败案例时才独立保留。确无独立内容的指南可 301 到对应下载页，并同步修改内链、sitemap 与 hreflang。不要把已有独立教程的页面一律重定向。

### 泰语下载目录：列表很多，选择信息少

`https://freesavevideo.online/th/download` 当前自引用 canonical、`index,follow`。页面主要是平台名称卡片，展示 43 个专门支持的平台和额外平台列表。抽查 9GAG、HBO 卡片均指向 `/th/`，而不是对应平台说明。

这并不证明它因此未收录，但用户点击不同平台最终回到同一个通用输入框，缺少“此链接支持哪类输入、输出及限制”的预期说明。建议把可靠平台与通用尝试入口明确区分，给核心平台提供视频/音频/播放列表能力摘要；未验证的平台不要展示确定性下载承诺。

已索引的 `/es/download` 可作为保留对照，但不能据此假设翻译或语言数量是唯一问题。

## Sitemap 与索引策略

线上 `sitemap.xml` 在 Chrome 中可读取，共 459 个 `<loc>`：234 个下载目录/详情、187 个指南目录/详情、20 个 Learn 目录/文章、11 个 FAQ、4 个语言首页、2 个文件传输页、1 个 agents 页面。

GSC 的 sitemap 列表显示提交及上次读取日期均为 2026-09-16，状态“成功”，发现 424 页。部分单页检查的 sitemap 字段又显示“临时处理错误”或未检测到引荐 sitemap。这些不一致需要复核，不能当成 sitemap 已经损坏或 Google 无法访问全站的证明。

当前 About/support 在仓库已有 noindex，旧 `/about` 和 `/about/community` 有重定向。先核验部署行为，避免重复改造。把 URL 从 sitemap 删除不会阻止索引；noindex 也不会把资源自动转给别页。不得为了降低 321 的数字而批量 noindex 所有未收录页。

## 方案与任务拆分

### P0：建立可比较的核心 URL 清单

1. 保留三个已索引地址作为对照，不随意改 URL/canonical。
2. 第一批选择约 8—12 个 URL，例如中英文首页、中英文下载目录、中英文 YouTube 单视频、英文 Shorts/Playlist、英文 TikTok 单视频，以及一个已有实测依据的 Dailymotion 页。优先检验当前可靠功能，不凭关键词热度扩页。
3. 为每个 URL 记录当前索引状态、最后抓取、是否发生在发布后、canonical、是否允许索引、点击与展示。
4. 在 GSC 复核 sitemap 当前读取状态。整改发布后按实际变更更新 lastmod，避免给所有 URL 同时刷新日期。

### P1：先整改一个完整的平台样本

建议 TikTok：

- 下载页只保留直接完成任务需要的内容。
- 删除同页重复 FAQ、泛化平台宣传、与当前下载无关的工具推荐。
- 明确支持的原始/短链接/图集、输出形式和不支持的输入。
- 清楚说明直连保存、扩展下载、浏览器打开与保存的分支，语言与界面一致。
- 使用获得许可的真实公开素材验证普通视频、图集及失败场景。记录测试日期、设备、操作结果，不虚构成功率或速度。
- 为指南补足独立操作价值；做不到时合并并重定向。

验收不设最低字数。判断标准是用户能否从该页面完成任务、识别限制、处理实际错误，以及指南是否提供下载页没有的信息。

### P2：推广内容标准与内链整理

- 根据样本整改结果，按平台和语言逐批处理；翻译保留语言自身 canonical，不统一指向英语。
- 暂停继续复制通用指南。已经索引的语言页保留，未索引语言逐页评估，不按语言批量剔除。
- 首页和下载目录优先链接到核心任务页；相关内容围绕当前任务，而不是每页复制一整套全站链接。
- 录屏、聊天、格式转换、文件传输按各自用户需求建设独立入口；不因为本轮下载 SEO 将它们直接删除或 noindex。
- About、联系、条款、退款信息保持可访问、事实准确。是否索引与其对用户的信任价值分别考虑。

### P3：发布后验证

生产构建由用户执行，本轮不运行 build、不部署。

- 定向验证页面 SSR 正文、HTTP 状态、canonical、robots、hreflang、JSON-LD 和内链。现有 `test:seo-contracts` 可作为基础，不运行会触发构建的 `test:seo`。
- 多语言文案编辑后运行编码检查和精确键值抽查。
- 对实质修改且长期未重抓的少数核心页请求索引一次；不要逐日重复提交，也不把实时测试通过当作已经收录。
- 建议在发布后第 7、14、28 天人工复查；此为观测计划，不是 Google 收录期限，也未创建自动化。
- 将“发布后已重抓但仍未索引”与“尚未重新抓取”分开统计。前者继续评估内容/意图，后者排查发现、内链及服务器可达性。
- 看核心页实际进入索引数、非品牌搜索展示/点击及真实下载完成体验。旧页转成 noindex/重定向使 321 下降，不等于内容质量提升。

## 本轮限制与未执行事项

- 本轮只修改诊断文档，未修改产品代码、索引设置、sitemap，也未请求收录或发布。
- 历史抓取 HTML 在所检查的未索引 URL 中不可查看；不能还原四月实际正文。
- 命令行 HTTP 样本采集遇到 403，未得到完整样本文件。这不能代表真实 Googlebot 被拦；浏览器与 GSC 结果优先。未据此关闭防护或修改 ACL。
- 未实测媒体下载流程、未审计全部 459 个 sitemap 页面、未检查全部人工处置/安全报告，因此不作全站技术或处罚状态结论。

## 官方依据

- [Page indexing report](https://support.google.com/webmasters/answer/7440203?hl=en)：状态含义、历史与实时数据差异、预期不索引页面。
- [Creating helpful, reliable, people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)：原创价值、事实可靠、任务满足度。
- [Localized versions](https://developers.google.com/search/docs/specialty/international/localized-versions)：完整翻译不能仅因语言不同就判为重复。
- [Ask Google to recrawl](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl)：重抓不保证收录，重复请求不会加快处理。
- [Build and submit a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)：sitemap 是提示；lastmod 应对应实际重要内容变更。
