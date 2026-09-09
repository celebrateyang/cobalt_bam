# FreeSaveVideo 海外收款与盈利模式深度调研

**面向对象：** 产品负责人 / 开发负责人  
**研究日期：** 2026-09-08  
**决策目标：** 国内继续现有微信支付；在 PayPal 封禁、Dodo Payments 审核失败后，确定海外收入模式与低风险落地顺序。

## 一、直接结论

建议采用“四层收入结构”，优先级如下：

1. **海外联盟营销 + 直客赞助作为立即可做的主线。** 推荐与下载后的真实下一步强相关的产品：视频编辑、字幕/转写、创作者分析、云存储。优先走 Impact、Awin、CJ 等可向中国银行账户付款的网络，或直接与中国出海软件厂商签人民币赞助合同。
2. **程序化广告只放在原创内容/指南页，并且必须先书面确认媒体政策；不要放在核心下载页。** Google 的发布商政策明确不允许“在内容提供方禁止时协助下载流媒体”的页面；Ezoic、Mediavine 等也继承 Google 合规或良好信誉要求。核心页还启用了 `COEP: require-corp`，Google Publisher Tag 官方说明并不支持这种页面。
3. **海外 B2B 走合同、发票和银行电汇。** 向有授权内容的机构、MCN、品牌方、研究团队销售批量处理/API/团队额度，客单价远高于个人订阅，也不依赖公开卡支付。
4. **不建议由中国大陆运营主体面向公众收 USDT/BTC。** 这不是一个“不会封号的支付替代品”：中国监管明确虚拟货币不能作为货币在市场上流通使用，并将相关业务活动定性为非法金融活动；主流加密收单商也普遍不支持中国主体。若未来确有境外实体和律师意见，只把它当作少量、合规 B2B 客户的可选结算方式，而不是网站零售入口。

一句话版本：**国内继续卖积分/会员；海外保持免费入口，用“下载成功后的相关联盟推荐 + 指南页联盟内容 + 直客赞助”变现，再用 B2B 发票承接高价值付费需求。**

## 二、范围、假设与限制

- 假设运营方或实际控制人在中国大陆，国内收款和人民币结算没有障碍。
- 研究对象是当前公开的 FreeSaveVideo：支持 YouTube、TikTok、Instagram、Facebook、Bilibili 等多平台下载，并有积分、会员、AI 视频、录像和批量处理功能。
- 本报告讨论商业与产品风险，不构成中国、香港、欧盟、美国等司法辖区的法律或税务意见。
- 未获得真实流量、国家分布、下载成功数、服务器毛利和历史付费转化数据，因此收入数字采用敏感性模型，不是预测。
- 政策核验以 2026-09-08 可访问的官方页面为准；任何接入前仍需保存平台书面预审结果。

## 三、PayPal 与 Dodo 失败很可能不是偶然

### 3.1 这是品类风险，不只是主体或地区问题

当前产品的公开页面把 “YouTube Video Downloader”“streaming download”“watermark-free download”等作为核心能力。多个支付/广告平台的规则都把“协助版权或平台条款侵权”视为禁止或高风险：

- Paddle 的可接受使用政策直接把 **streaming downloaders** 列入禁止类别，并同时禁止促成版权或第三方条款侵权的产品。[Paddle AUP](https://www.paddle.com/help/start/intro-to-paddle/what-am-i-not-allowed-to-sell-on-paddle)
- Dodo Payments 2026 年的商户政策禁止盗版、未经授权的媒体下载、IPTV/流媒体访问工具、反平台条款工具，并明确反对通过错误分类、代理商户或壳实体规避审核。[Dodo Merchant Acceptance Policy](https://docs.dodopayments.com/miscellaneous/merchant-acceptance)
- Stripe 禁止直接侵权或**促成**第三方商标、专利、版权、商业秘密、专有权或隐私权侵权的产品/服务；中国大陆也不在 Stripe 的直接支持地区列表中。[Stripe Restricted Businesses](https://stripe.com/legal/restricted-businesses)；[Stripe Global Availability](https://stripe.com/global)
- PayPal 的可接受使用政策禁止涉及侵犯版权、商标或其他专有权的交易，其用户协议允许限制账户和持有资金。[PayPal Acceptable Use Policy](https://www.paypal.com/us/webapps/mpp/ua/acceptableuse-full?locale.x=en_US%5C)；[PayPal User Agreement](https://www.paypal.com/us/legalhub/paypal/useragreement-full?locale.x=en-US)

因此，成立香港/美国公司、换域名或再换一家普通 MoR，并不能解决根因。**只有真实改变被销售的产品、使用场景与风险控制，并向支付方完整披露后取得书面批准，才可能降低风险。**

### 3.2 现有法律页面不错，但免责声明不能代替控制措施

仓库中的英文条款已经写明：只允许下载自有、获许可或法律授权的内容；禁止私有、付费墙、登录限制、DRM、地理限制绕过，并提供版权投诉路径。这是有价值的基础。

但支付与广告平台会看实际功能、首页文案、支持平台、投诉记录、流量来源和执行能力，不只看 Terms。需要能证明：

- 技术上不处理 DRM、登录后私有内容和绕过访问控制的请求；
- 权利人投诉有可审计的受理、下线、复核和重复滥用处置记录；
- 对高风险平台或功能可按国家、来源、账号和服务快速停用；
- 收费 SKU 与宣传内容和实际交付一致；
- 申请支付时完整披露，不用代理主体或“换壳”规避审核。

## 四、方案比较

| 方案 | 变现潜力 | 获批/持续性 | 中国主体收款 | 用户体验 | 结论 |
|---|---:|---:|---:|---:|---|
| 核心下载页接 AdSense/Ezoic | 中 | 很低 | 中 | 较差 | 不做 |
| 原创指南页程序化广告 | 中 | 中低，需预审 | 中 | 可控 | 后置试验 |
| 下载后相关联盟推荐 | 中到高 | 中高 | 高 | 好 | 立即做 |
| 原创评测/教程联盟内容 | 中到高 | 中高 | 高 | 好 | 立即做 |
| 直客赞助/固定广告位 | 中到高 | 高，由双方谈判 | 很高 | 好 | 第一优先级 |
| 海外 B2B 合同/电汇 | 高，低量也有效 | 高 | 高 | 不影响零售 | 第一优先级 |
| 再申请普通 MoR | 中 | 很低 | 取决于平台 | 好 | 暂停 |
| 独立“创作者工具”付费产品 | 高 | 中，必须真实隔离并预审 | 中 | 好 | 中期建设 |
| 面向公众 USDT/BTC 收款 | 低到中 | 很低 | 很低 | 差 | 不建议 |

## 五、广告模式：能做，但不应成为第一根支柱

### 5.1 主流广告平台的政策障碍

Google Publisher Policies 明确禁止“在内容提供方禁止时，帮助或允许用户下载流媒体视频”的页面；也禁止版权侵权和 DRM 绕过。[Google Publisher Policies](https://support.google.com/adsense/answer/10502938?hl=en-15)

替代广告管理商并不自动绕过这一规则：

- Ezoic 明确要求网站遵守 Google/AdSense 政策，并列出“不提供版权材料/下载”。[Ezoic Requirements](https://osticket.ezoic.com/kb/article/getting-started-ezoics-requirements?lang=en_US)
- Mediavine 要求原创、以读者为中心的内容、品牌安全流量，以及 Google AdSense/Ad Exchange 的良好信誉；Journey 要求至少 1,000 个来自美、英、加、澳等 Tier 1 市场的月度会话。[Mediavine Requirements](https://www.mediavine.com/mediavine-requirements/)
- Raptive 当前门槛为每月 25,000 页面浏览；25,000-99,999 PV 的网站还要求至少 50% 流量来自美、英、加、新西兰、澳大利亚，并且大多数页面是原创长内容。[Raptive Eligibility](https://help.raptive.com/hc/en-us/articles/360032840891-Who-is-eligible-for-Raptive)
- Monetag 等更宽松网络可能接受流媒体站点，但仍禁止第三方权利侵权、盗版和 torrent；不能把它视为无审核渠道。[Monetag Publisher Rules](https://help.monetag.com/en/articles/6726292-website-content-main-rules-for-publishers)

### 5.2 项目还有一个特殊技术障碍

`web/src/hooks.server.ts` 目前给大多数页面设置：

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

这是浏览器端 libav/SharedArrayBuffer 所需的跨域隔离。Google 官方说明 Google Publisher Tag **尚不支持 COEP 页面**，因为广告会嵌入大量未显式允许跨域的第三方资源。[Google Publisher Tag and COEP](https://developers.google.com/publisher-tag/guides/cross-origin-embedder-policy)；[MDN COEP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Embedder-Policy)

所以，即使政策获批，核心工具页也不适合直接加载常规广告脚本。不要为广告牺牲媒体处理的稳定性。

### 5.3 可行的广告路径

1. 先用**静态赞助卡**：由本站渲染图片、标题和链接，不加载第三方广告 JS，不受 COEP 影响。
2. 广告只出现在下载成功后的“下一步”区域和原创指南页，不靠近主要 Download 按钮，不做假按钮。
3. 不使用 pop-under、自动跳转、通知订阅、强插屏或误导式“下载”广告；这些格式会提高短期收入，却伤害品牌、SEO、扩展商店信誉和回访。
4. 若未来要做程序化广告，优先使用独立的内容属性或确认无需 SharedArrayBuffer 的指南路由，先取得网络的书面政策意见，再改 COEP 路由。

## 六、联盟营销：最适合当前海外流量的短期主线

### 6.1 为什么比展示广告更匹配

下载站访问意图强、停留时间短。用户完成下载后，下一步往往是剪辑、压缩、加字幕、转写、存储或分析频道。只推荐这个“任务链”中的产品，单次转化价值通常比一个展示广告曝光高，也不需要在页面中加载复杂广告脚本。

推荐优先级：

1. **视频编辑/字幕：** Filmora、VEED 等；
2. **创作者分析：** vidIQ 等；
3. **云存储/备份：** 根据来源国家选择可用服务；
4. **隐私工具：** 只在真正的隐私教育内容中推荐，不要把 VPN 描述成绕过平台、地区或访问限制的工具。

当前可验证的项目示例：

- VEED 通过 Impact 运营联盟项目，官方页面列出首单和续费 20% 佣金，并支持银行转账、PayPal 或 wire。[VEED Affiliate](https://www.veed.io/affiliate)
- Filmora 的创作者变现项目通过 Impact 结算，官方列出桌面端最高 50%、移动端固定 30%，可转到银行或 PayPal。[Filmora Creator Monetization](https://filmora.wondershare.com/creator-monetization-program.html)
- vidIQ 的官方帮助页列出基础 15% 续费佣金，按销量最高可到 25%。[vidIQ Affiliate Commission](https://support.vidiq.com/en/articles/7866006-vidiq-affiliate-commission-everything-you-need-to-know)
- Surfshark 官方列出新销售 40% 起、30 天 cookie、100 美元最低结算，并可通过 Impact、CJ、Awin 等网络加入。[Surfshark Affiliate](https://surfshark.com/affiliate)

佣金比例会变化，不能把官网最高比例当成财务预测。真正的筛选指标应是：受众国家可购买、落地页速度、退款后净佣金、归因窗口、品牌安全、银行结算方式和实际 EPC。

### 6.2 中国主体如何收联盟款

Impact 官方支持银行 EFT/wire，USD 可支付到其支持的全部银行地区；其币种/时区表明确列出 China 为支持的银行账户地点。账户名、SWIFT 和税务资料必须真实一致。[Impact Bank Withdrawal](https://help.impact.com/partner/what-would-you-like-to-learn-about/platform-features/finance/payments-withdrawals-and-balance/withdraw-funds-to-your-bank-account)；[Impact Supported Currencies](https://help.impact.com/other/reference-documentation/supported-currencies-and-timezones)

Awin 的国际付款通过 Payoneer 处理，可选择当地货币或部分地区的 USD/EUR/GBP；CJ 也公开说明其 Payoneer 方案覆盖 200 多个国家/地区，并特别提到中国发布商。[Awin International Payments](https://success.awin.com/articles/en_US/Knowledge/International-Payment-Method-FAQs)；[CJ/Payoneer](https://junction.cj.com/article/global-innovation-payoneer)

这意味着联盟模式不依赖当前被封的 PayPal。入账、合同、发票、外汇申报和税务处理仍应让中国会计按实际主体确认。

### 6.3 更好的本地化做法

最值得优先谈的是**中国出海软件厂商的海外赞助**：广告展示给海外访客，合同和结算可以在国内完成。可以采用“固定月费 + 合格线索/成交奖金”，既比纯联盟稳定，也免受单一联盟网络账户冻结影响。

页面位置建议：

- 下载成功：一张“下一步：编辑/字幕/存储”的原生卡片；
- 对应平台指南：真实教程中的工具比较；
- AI 视频页：编辑/字幕工具；
- 批量下载页：存储、整理、备份工具；
- 不在下载按钮上方伪装，不自动打开，不覆盖结果。

对美国用户，FTC 要求联盟关系清晰、醒目并靠近推荐，单独写“affiliate link”可能不够；可直接写：“Sponsored / We may earn a commission if you buy through this link.” [FTC Affiliate Disclosure Guidance](https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking?2c5f01ae_page=2&c2f6250b_page=2&r=0)

对英国和欧洲访客，非必要 cookie/存储通常需要知情、主动同意；CNIL 明确表示用于联盟计费的跟踪器不属于免同意范围。能只用普通外链和广告主站内归因时，不要在 FreeSaveVideo 先放第三方追踪脚本。[ICO Cookie Guidance](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/cookies-and-similar-technologies/)；[CNIL Affiliate Tracker FAQ](https://www.cnil.fr/fr/cookies-et-autres-traceurs/regles/cookies/FAQ)

## 七、加密货币：为什么不适合作为当前海外零售收款

### 7.1 中国大陆监管风险过高

中国人民银行等十部门的通知明确：比特币、以太币、泰达币等不具有法偿性，不应也不能作为货币在市场上流通；虚拟货币兑换、定价和相关中介等业务属于非法金融活动；金融机构和非银行支付机构不得为相关活动提供结算服务。[中国人民银行 2021 年通知](https://www.pbc.gov.cn/tiaofasi/144941/3581332/4348658/index.html)

2025 年底人民银行的联合会议再次强调虚拟货币不能用于市场交易，并明确把稳定币归为虚拟货币，指出其当前难以满足客户识别和反洗钱要求。[PBOC Joint Meeting](https://www.pbc.gov.cn/en/3688110/3688172/5552468/2025121116132332435/index.html)

即使只收 USDT、不做交易所，作为中国大陆运营者公开标价并接受其购买会员，也很难把它描述为低风险路径；后续换汇、入账、退款和资金来源证明都会继续暴露风险。

### 7.2 主流加密收单并不能解决主体问题

- BitPay 的官方支持列表把中国和香港都列为不支持商户地区。[BitPay Supported Countries](https://support.bitpay.com/hc/en-us/articles/360000123366-Why-can-t-I-use-BitPay-s-services-in-my-country)
- Coinbase Commerce 已在 2026-03-31 前后迁移到 Coinbase Business；后者目前只接受美国和新加坡法律实体。[Coinbase Commerce Migration](https://help.coinbase.com/en/transitioning-from-coinbase-commerce-to-coinbase-business)
- NOWPayments 声称费用低、覆盖广，但其条款仍要求遵守当地法律并可自行限制地区；使用它不能改变中国运营者的监管义务。[NOWPayments FAQ](https://nowpayments.io/help/about-nowpayments/about)

自托管钱包虽然没有传统拒付，却把 KYC/AML、制裁筛查、退款、密钥保管、币价/脱锚、链上误转和法币换汇全部转给自己；对普通海外用户的购买转化也明显不如卡和本地支付。

**决策：未来 12 个月不把加密支付放到公开零售结账。** 只有在境外实体、境外运营、书面法律意见、合规出入金和客户筛查都具备后，才评估少量 B2B 发票的可选结算。

## 八、建议的收入架构

### 8.1 国内访客

- 保留微信支付的积分与会员：当前配置为 3 天 6 元、月度 50 元、年度 298 元，以及多档积分包。
- 继续把高成本功能放在积分/会员后：批量、长视频、AI 视频、收藏记忆等。
- 不为了海外模式改变国内已验证的支付体验。

### 8.2 海外个人访客

- 基础下载继续免费并设置公平使用限制；不展示已失效的 PayPal 结账。
- 下载成功后显示 1 个强相关赞助/联盟卡片，频控为每若干次成功下载最多展示一次；会员或已付费国内用户不展示。
- 指南页做原创的“下载后工作流”内容：剪辑、字幕、格式、备份、合法使用和故障排查。
- 不按界面语言判断国内/海外。应以 Cloudflare 的国家信号为主、语言为辅，并允许用户切换。当前 `account/+page.svelte` 以 `lang === zh` 判断支付偏好，而 `hooks.server.ts` 已经能读取 `CF-IPCountry`，应复用后者。

### 8.3 海外团队/B2B

建立 “Teams / API / Licensed Workflow” 询价入口，出售：

- 团队额度与批量队列；
- API 限额、稳定性和 SLA；
- 针对自有/获授权素材的抓取、转码、字幕、AI 剪辑；
- 年付预存额度或最低消费。

结算采用合同、发票、银行 wire；如果客户也是中国出海企业，可直接人民币结算。每个 B2B 客户必须签署内容权利保证，必要时只开放来源 allowlist。

### 8.4 未来恢复海外卡支付的正确路径

不是再次包装下载会员申请 MoR，而是把真正不同的产品做成独立 SKU，例如：

- 用户上传/浏览器录制的视频剪辑、字幕和转码；
- 创作者素材库和团队协作；
- 只处理客户自有或明确授权来源的 B2B 工作流。

产品、域名、条款、演示和技术权限必须与这个定位一致；申请时主动披露与 FreeSaveVideo 的关系并取得书面预批准。否则容易被认定为规避政策。

## 九、收入敏感性模型

以下按**每月 100,000 次海外成功下载会话**举例，仅用于判断量级。

### 9.1 联盟收入

公式：

```text
联盟收入 = 成功下载会话 × 推荐点击率 × 广告主购买率 × 净佣金
```

| 情景 | 点击率 | 购买率 | 每单净佣金 | 月收入 |
|---|---:|---:|---:|---:|
| 保守 | 0.5% | 1% | $15 | $75 |
| 基准 | 1% | 2% | $25 | $500 |
| 较好 | 2% | 3% | $35 | $2,100 |

真正应优化的是“每千次成功下载收入（RPSD）”，而不是只看点击率。所有退款、拒付、无效订单和网络费用都应扣除后再比较。

### 9.2 内容页展示广告

如果 30% 的下载用户进入指南，平均浏览 1.5 个广告合规页面，70% 的页面在同意/填充后可变现，则约有 31,500 个可变现 PV。假设页面 RPM 为 $2-$10，则月收入约 **$63-$315**。

这组数字说明：在没有大量 Tier 1 内容流量前，展示广告很难单独覆盖服务器成本。RPM 是建模假设，不是对任何广告网络的报价。

### 9.3 直客赞助与 B2B

- 一个原生赞助位按月固定收费，可用 $300-$1,500 作为谈判测试区间，再按国家占比、曝光、点击和转化修正。
- 3 个 $199/月的 B2B 小团队就是 $597 MRR；一个 $499/月客户已接近 100,000 次会话的联盟基准情景。

因此最合理的组合不是“全靠广告”，而是：**联盟提供可变收入，赞助提供底价，B2B 提供高毛利，内容广告只做增量。**

## 十、30/60/90 天落地计划

### 0-30 天：验证收入，不先造复杂系统

1. 海外访客隐藏微信支付主入口，改为“免费使用 + Sponsor/Creator Tools + Teams 询价”；国内保持微信支付。
2. 用国家而不是语言决定商业界面；保留手动切换。
3. 申请 Impact，并同时申请 Filmora、VEED、vidIQ 等 3-5 个高相关项目；记录拒绝原因。
4. 制作一个直客赞助 media kit：海外月会话、国家、成功下载数、平台分布、设备、可售位置、品牌安全措施。
5. 只上线本站渲染的静态推荐卡；不加载第三方广告脚本。
6. 在推荐附近显示清晰的 Sponsored/commission disclosure；更新隐私/cookie 说明。
7. 事件字段只保留 `offer_id`、`placement`、`country`、`locale`、`service`、`click`，不要把原视频 URL、Clerk ID 或原始 IP 传给联盟方。

### 31-60 天：做内容与直接销售

1. 从现有 33 个下载落地页和 28 个指南定义中选海外流量最高的 5 个主题，增加真实、第一手的下载后工作流内容。
2. 每个页面最多一个主要推荐；用 `subid` 区分页面/位置，但不放用户身份信息。
3. 主动联系 20 家视频编辑、字幕、创作者工具和云存储厂商，优先中国出海团队，报价“固定月费 + 成交奖金”。
4. 上线 Teams/API 询价表，人工审核后发合同和 wire 指引。
5. 每周核对联盟后台批准订单与本站点击；用净收入而非面板毛佣金决策。

### 61-90 天：保留赢家，评估广告

1. 淘汰 EPC 和用户反馈差的 offer；同一位置只保留 1-2 个赢家。
2. 争取至少一个固定赞助合同和 1-3 个 B2B 付费客户。
3. 只有当原创指南页有独立、稳定、品牌安全的 Tier 1 流量时，才向广告网络提交完整站点并书面询问 downloader 关联是否可接受。
4. 若获批，先在无 COEP、无下载按钮的指南路由上做小流量广告实验；不改变核心工具页的跨域隔离。
5. 对独立创作者工具 SKU 准备支付预审包，不投入结账开发，直到收到明确书面批准。

## 十一、上线与停止指标

核心指标：

- 海外成功下载会话数；
- 推荐曝光、点击率、广告主批准购买率、退款后 EPC；
- 每千次成功下载净收入（RPSD）；
- 每个国家/来源平台的 RPSD；
- 赞助固定收入、B2B MRR；
- 页面速度、下载成功率、回访率、投诉率；
- 联盟/广告政策警告数与账户集中度。

建议的决策阈值（内部运营阈值，不是行业标准）：

- 30 天内某 offer 超过 5,000 次合格曝光但无批准转化：下线或换创意/产品；
- 单一联盟/赞助方超过海外收入 40%：增加第二来源；
- 推荐使下载完成率下降超过 2 个百分点或投诉明显增加：减少频次/位置；
- 程序化广告未获得明确书面政策意见：不上线；
- 加密支付没有境外合规主体、法律意见和出入金路径：不上线。

## 十二、最终建议清单

**现在做：**

- 国内微信支付不动；
- 海外按国家展示联盟/赞助，而不是继续引导微信；
- Impact + Filmora/VEED/vidIQ 试点；
- 下载成功页一张静态原生推荐卡；
- 找中国出海软件厂商做人民币直客赞助；
- 开 B2B 询价和电汇；
- 建立 RPSD 仪表盘和合规记录。

**暂时不做：**

- 不再无差别申请普通 MoR；
- 不在核心下载页接 AdSense/GPT；
- 不做 pop-under、push、假下载按钮；
- 不公开收 USDT/BTC；
- 不成立壳公司或隐瞒 downloader 业务申请支付。

**中期再做：**

- 原创内容属性达到稳定 Tier 1 流量后试程序化广告；
- 将用户自有素材的 AI/录制/剪辑能力做成真正独立的付费产品；
- 拿着完整合规包向支付方做书面预审。

## 资料核验与研究停止说明

研究覆盖了支付处理商/MoR、主流和替代广告网络、联盟网络及项目、隐私与联盟披露、中国虚拟货币监管、加密收单商可用地区，以及项目自身的付款、地理识别、归因和 COEP 架构。关键结论均有官方一手来源或项目代码支持；继续搜索更多同类平台只会重复相同的版权/地区/合规限制，不太可能改变推荐，因此在证据收敛后停止。
