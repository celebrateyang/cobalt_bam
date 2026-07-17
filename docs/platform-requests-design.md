# 平台愿望单轻量详细设计

## 1. 目标

为 freesavevideo.online 增加公开的“平台愿望单”：登录用户可以提交希望支持的视频平台，所有用户可以浏览和访问平台官网，登录用户可以投票或取消投票；下载页只有在确认目标平台尚未正式支持时，才展示申请入口。

本设计重点解决两个容易误判的问题：

1. 如何准确判断一个平台已经被正式支持。
2. 如何区分“平台不支持”和“已支持平台本次解析失败”。

## 2. 已确认的产品规则

- 提交必须登录，使用现有 Clerk 用户身份。
- 投票和取消投票必须登录，同一用户对同一平台最多一票。
- 创建平台需求时，创建者自动获得一票。
- 游客可以浏览、搜索、查看详情和访问平台官网。
- 只保存可注册主域名（registrable domain，也称 eTLD+1），不保存用户提交的路径、查询参数、片段、用户名或密码。
- 平台外链统一生成为 `https://<domain>/`，前端使用 `target="_blank"` 和 `rel="nofollow noreferrer noopener"`。
- 重复平台不创建新记录，直接引导用户查看并投票。
- MVP 状态为 `pending`、`planned`、`supported`、`rejected`；`rejected` 状态仍允许投票。

## 3. 范围

### 3.1 MVP 包含

- 平台愿望单列表、搜索、排序和详情。
- URL/域名提交预览、重复检查、创建、投票和取消投票。
- 管理员修改状态和备注。
- 下载页在真正的未知平台错误上展示申请入口。
- 支持全部现有语言路由 `/<lang>/requests` 和 `/<lang>/requests/<id>`。

### 3.2 MVP 不包含

- 评论、关注、状态通知、邮件通知。
- 用户自定义平台名称或说明。
- 服务端访问用户提交的网址、抓取标题或 favicon。
- 自动承诺某个通用提取器偶尔可下载的平台为“正式支持”。
- 在申请表中保存原始视频 URL。

## 4. 现有代码结论

当前下载链路为：

```text
POST /
  -> api/src/processing/schema.js: normalizeURL
  -> api/src/processing/url.js: extract
  -> api/src/core/api.js: 可选通用提取
  -> api/src/processing/match.js: 调用平台处理器
  -> api/src/processing/request.js: createResponse
  -> web/src/lib/api/saving-handler.ts: 展示结果或错误
```

现有代码已经使用 `@imput/psl`，且 `processing/url.js` 中的 `getHostIfValid()` 是最接近“正式支持平台注册表”的实现。它同时处理：

- `service-config.js` 中的服务键、TLD、子域和 `altDomains`。
- `serviceNameForURL()` 中的特殊映射，例如 `nicovideo.jp`、`rednote.com`、`12371.cn`、`toutiaoimg.cn`、`learn.deeplearning.ai`。
- 部署环境的 `enabledServices`。
- 服务内 URL pattern 是否匹配。

但当前存在两个语义折叠：

1. `getHostIfValid()` 未命中时，`extract()` 返回 `link.invalid`。因此“格式无效的 URL”和“格式有效但未知的平台”使用同一个错误。
2. `core/api.js` 会对 `link.invalid` 尝试通用提取；通用提取失败后统一返回 `fetch.fail`。因此最终响应无法知道失败发生在未知平台，还是正式支持平台的抓取过程。

`match.js` 中平台处理器返回的 `fetch.fail`、`fetch.empty`、`content.*` 和捕获到的 `fetch.critical`，都发生在服务和 URL pattern 已经命中以后。这些属于解析、内容或运行时失败，不应引导提交新平台。

## 5. 核心判定模型

### 5.1 正式支持的唯一事实来源

“已正式支持”定义为：规范化 URL 的主机名能够通过 `processing/url.js` 的服务识别规则映射到 `service-config.js` 中的一个服务。

不要在平台愿望单中另外维护一份支持域名列表，也不要从 README 文案、`match.js` 的 switch、前端常量或数据库 `supported` 记录反推支持状态。否则域名别名和特殊映射会发生漂移。

将 `getHostIfValid()` 的纯识别能力重构为可复用导出，例如：

```js
identifyService(url) -> {
    service: "youtube",
    domain: "youtube.com",
    enabled: true
} | null
```

其中：

- `service` 来自现有 `serviceNameForURL()` 和 `services` 配置。
- `domain` 使用 PSL 得到的可注册主域名；对于只允许特定主机的服务，仍返回该主机所属的可注册主域名。
- `enabled` 单独表达当前部署是否启用，不能把临时禁用误判为新平台。
- 该函数只解析字符串，不发起网络请求。

平台提交预览的“已支持”判断只调用此函数，不要求根路径能匹配视频 URL pattern。例如 `https://youtube.com/` 根路径不是可下载视频地址，但 `youtube.com` 平台显然已经支持。

`service-config.js` 中存在的服务即视为正式支持；`enabled=false` 时返回 `already_supported` 并附带 `temporarilyDisabled: true`，不允许创建重复愿望。

通用提取器不属于正式支持注册表。未知平台通过通用提取成功时正常下载；它通过通用提取失败时仍可申请。平台预览接口不运行通用提取器。

### 5.2 下载 URL 的四层分类

在进入抓取器之前，将 URL 分类为以下结果：

| 分类 | 条件 | 下载响应 | 申请入口 |
| --- | --- | --- | --- |
| `invalid_url` | URL 解析失败、协议不是 HTTP(S)、无有效 PSL domain | `error.api.link.invalid` | 否 |
| `unsupported_platform` | URL 有效，但未命中正式服务配置 | 先尝试通用提取；失败后 `error.api.platform.unsupported` | 是 |
| `unsupported_url` | 已命中正式平台，但路径/参数不匹配该服务的 patterns | 现有专用错误或 `error.api.link.unsupported` | 否 |
| `supported_url` | 正式平台和 URL pattern 均命中 | 进入 `match.js`；之后的所有错误均为解析/内容/运行时错误 | 否 |

建议新增一个纯函数并由现有 `extract()` 使用：

```js
classifyURL(url, enabledServices) ->
    { kind: "invalid_url" } |
    { kind: "unsupported_platform", domain } |
    { kind: "disabled_service", service, domain } |
    { kind: "unsupported_url", service, domain, error, context } |
    { kind: "supported_url", service, domain, patternMatch }
```

为了降低首轮改动范围，也可以保留 `extract()` 的现有返回形状，只将未知平台改为：

```js
{
    error: "platform.unsupported",
    domain: "example.co.uk"
}
```

但测试应覆盖上述完整分类语义，避免以后再次用错误码猜测来源。

### 5.3 通用提取与错误返回

对 `unsupported_platform` 保留现有“先尝试通用提取”的产品能力，但改变失败映射：

```text
未知正式平台
  -> 通用提取成功：返回正常下载结果，不展示申请入口
  -> 通用提取失败：返回 platform.unsupported，并带申请元数据
```

不能继续把通用提取失败改为最终 `fetch.fail`，因为 `fetch.fail` 应保留给已识别平台的抓取失败。

建议错误响应为：

```json
{
  "status": "error",
  "error": {
    "code": "error.api.platform.unsupported",
    "context": {
      "domain": "example.co.uk"
    }
  },
  "platformRequest": {
    "eligible": true,
    "domain": "example.co.uk"
  }
}
```

`platformRequest` 是机器可读的显式契约。前端应检查 `platformRequest.eligible === true`，而不是维护一组可申请错误码。现有客户端会忽略新增字段，保持向后兼容。

`createResponse("error")` 需要允许传递该可选字段，`web/src/lib/types/api.ts` 同步增加类型。

### 5.4 明确不展示申请入口的错误

以下错误即使包含 `unsupported` 字样，也不代表平台未知：

- `youtube.link.unsupported`：YouTube 已支持，只是频道页等 URL 类型不支持。
- `douyin.user.unsupported`：抖音已支持，只是用户页不支持。
- `bilibili.space.unsupported`：哔哩哔哩已支持，只是空间集合入口不支持。
- `link.unsupported`：已经识别平台，但 URL pattern 或处理器不支持此页面。
- `service.disabled`、`youtube.temporary_disabled`：平台已注册，只是当前部署临时关闭。
- `fetch.fail`、`fetch.empty`、`fetch.rate`、`fetch.critical`：正式平台提取失败。
- `content.*`：内容删除、私有、年龄、地区或平台策略限制。
- 上游超时、网络、熔断和不可用错误。

## 6. 域名规范化与安全

新增共享函数，例如 `api/src/processing/platform-domain.js`：

```js
normalizePlatformDomain(input) -> {
    domain: "example.co.uk",
    homepageUrl: "https://example.co.uk/"
}
```

规则：

1. 接受完整 HTTP(S) URL；申请页也可为用户输入的裸域名补 `https://` 后解析。
2. 使用 WHATWG `URL` 规范化主机名，国际化域名以 URL 产生的 ASCII/Punycode 形式作为数据库唯一键。
3. 使用现有 `@imput/psl` 的 `host.domain` 提取 eTLD+1，不能简单取最后两段。
4. 转为小写并移除尾随点。
5. 拒绝 IP 地址、`localhost`、无 PSL domain 的主机、非 HTTP(S) 协议和带解析异常的输入。
6. 丢弃 pathname、search、hash、username、password 和 port。
7. 服务端不请求生成的 homepage URL，避免 SSRF、端口探测和恶意重定向。

下载错误可以返回规范域名，但不能把原始视频 URL 带入愿望单查询参数。跳转只使用：

```text
/<lang>/requests?domain=example.co.uk
```

## 7. 数据模型

使用 PostgreSQL，表由新的 `api/src/db/platform-requests.js` 初始化，并接入现有 `api/init-users.js` 所调用的 `initUserDatabase()`。

```sql
CREATE TABLE platform_requests (
    id BIGSERIAL PRIMARY KEY,
    domain TEXT NOT NULL UNIQUE,
    homepage_url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'planned', 'supported', 'rejected')),
    vote_count INTEGER NOT NULL DEFAULT 0 CHECK (vote_count >= 0),
    submitted_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    submitted_by_clerk_user_id TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'request_page'
        CHECK (source IN ('request_page', 'unsupported_download')),
    admin_note TEXT,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    supported_at BIGINT
);

CREATE TABLE platform_request_votes (
    request_id BIGINT NOT NULL REFERENCES platform_requests(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    clerk_user_id TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    PRIMARY KEY (request_id, user_id)
);
```

索引：

- `platform_requests(status, vote_count DESC, created_at DESC)`
- `platform_requests(created_at DESC)`
- `platform_request_votes(user_id, created_at DESC)`

`vote_count` 是列表性能缓存。创建、投票和取消投票必须在事务中同时更新；定期校验或管理脚本可用 `COUNT(*)` 重建票数。

提交事务：

1. 规范化域名并再次检查正式支持注册表。
2. `INSERT ... ON CONFLICT (domain) DO NOTHING RETURNING *`。
3. 如果冲突，读取已有记录并返回 `already_requested`。
4. 如果新建成功，插入创建者投票，并将 `vote_count` 增加到 1。
5. 提交事务。

投票使用 `INSERT ... ON CONFLICT DO NOTHING`，只有确实插入一行时才增加计数。取消投票同理，只有确实删除一行时才减少计数，且通过事务和行锁保证不出现负数。

## 8. API 设计

路由挂载在主 API 的 `/platform-requests`，与 `/user`、`/social` 一样只在 `IS_UPSTREAM_SERVER=false` 时启用。公开读取接口不要求登录；写接口使用 `clerkMiddleware()` 和 `getAuth(req)`。

现有全局 CORS methods 未包含 `PATCH`。实现管理接口时需要在 `core/api.js` 中加入 `PATCH`，否则浏览器的管理员更新预检会失败。

### 8.1 公开接口

```text
GET /platform-requests?page=1&limit=20&sort=votes|newest&status=pending&search=example
GET /platform-requests/:id
POST /platform-requests/preview
```

`preview` 不写数据库、不请求外部网站，输入为 `{ "url": "..." }`，结果：

```json
{ "result": "new", "domain": "example.com", "homepageUrl": "https://example.com/" }
```

```json
{ "result": "already_requested", "domain": "example.com", "request": { "id": 12, "voteCount": 21, "votedByMe": false } }
```

```json
{ "result": "already_supported", "domain": "youtube.com", "service": "youtube", "temporarilyDisabled": false }
```

未登录时 `votedByMe` 为 `false` 或省略。若请求携带有效 Clerk 身份则可返回真实状态。

### 8.2 登录接口

```text
POST   /platform-requests
POST   /platform-requests/:id/vote
DELETE /platform-requests/:id/vote
```

创建输入只接受 `{ "url": "...", "source": "request_page|unsupported_download" }`。服务端重新规范化和检查，不信任 preview 结果或前端提交的 domain/homepageUrl。

创建重复时返回 `200` 和 `result: "already_requested"`，新建时返回 `201` 和 `result: "created"`。这使并发重复提交成为正常业务结果，而不是 500。

### 8.3 管理接口

```text
GET   /platform-requests/admin?page=1&limit=20&status=&search=
PATCH /platform-requests/admin/:id
```

使用现有管理员 JWT 中间件 `middleware/admin-auth.js`。PATCH 只允许更新 `status` 和 `adminNote`。状态改为 `supported` 时设置 `supported_at`；离开该状态时清空。

管理员将记录设为 `supported` 只是愿望状态，不是下载服务注册表的事实来源。正式支持仍必须先进入 `service-config.js` 和处理链路。管理界面执行 `supported` 更新时应提示管理员确认代码已经上线。

## 9. 前端设计

### 9.1 页面

```text
/<lang>/requests
/<lang>/requests/<id>
```

列表页包含：

- URL/域名输入框。
- “最受期待”“最新提交”“已支持”筛选。
- 域名、状态、票数、创建时间、管理员备注摘要。
- 登录后的投票/取消投票按钮。

详情页包含平台官网外链、完整状态、票数、管理员备注和投票操作。

未登录用户点击提交或投票时，复用现有 `/<lang>/account?signin=1&redirect=...` 安全返回机制。redirect 只允许站内绝对路径。

### 9.2 下载页接入

接入点为 `web/src/lib/api/saving-handler.ts` 的 `response.status === "error"` 分支：

```text
platformRequest.eligible === true
  -> 保持现有错误说明
  -> 增加“申请支持此平台”主操作
  -> 跳转 /<lang>/requests?domain=<encoded domain>
```

不要仅凭 `error.api.link.unsupported`、错误文案包含“unsupported”或 HTTP 400 来展示入口。

申请页读取 `domain` 后仍调用 preview；query string 只是预填数据，不是可信判定。登录后返回时保留该站内路径。

### 9.3 类型与多语言

- `web/src/lib/types/api.ts` 为错误响应增加可选 `platformRequest` 和 `context.domain`。
- 新增请求页 API client，遵循现有 API base URL 和 Clerk token 处理方式。
- 所有支持语言增加页面、状态、重复提示、登录提示和下载错误 CTA 文案。
- i18n 修改后必须运行项目规定的编码检查和 mojibake 扫描。

## 10. 需要修改的主要文件

后端：

- `api/src/processing/url.js`：导出正式服务识别/URL 分类能力，拆开无效 URL 与未知平台。
- `api/src/core/api.js`：未知平台通用提取失败后返回显式申请元数据；挂载新路由。
- `api/src/processing/request.js`：错误响应透传可选 `platformRequest`。
- `api/src/processing/platform-domain.js`：共享域名规范化与安全校验。
- `api/src/db/platform-requests.js`：建表和事务查询。
- `api/src/db/users.js`：初始化新表。
- `api/src/routes/platform-requests.js`：公开、Clerk 和管理员接口。
- `docs/api.md`：记录新增错误元数据和接口。

前端：

- `web/src/lib/types/api.ts`：响应类型。
- `web/src/lib/api/saving-handler.ts`：未知平台 CTA。
- `web/src/lib/api/platform-requests.ts`：API client。
- `web/src/routes/[lang]/requests/`：列表页和详情页。
- `web/src/routes/[lang]/console-manage-2025/`：平台需求管理页和导航。
- `web/i18n/**/*.json`：多语言文案。

## 11. 验收测试

### 11.1 服务识别和错误分类

- 无法解析的字符串 -> `link.invalid`，无申请元数据。
- `ftp://example.com/file` -> `link.invalid`，无申请元数据。
- 未配置的 `https://video.example.co.uk/watch/1` -> domain 为 `example.co.uk`；通用提取失败后返回 `platform.unsupported` 和申请元数据。
- 未配置平台通用提取成功 -> 正常下载，无申请入口。
- `https://youtube.com/channel/...` -> YouTube 专用 URL 不支持错误，无申请入口。
- 已配置平台处理器返回 `fetch.fail`/`fetch.empty` -> 无申请入口。
- 已配置平台内容删除、私有或地区限制 -> 无申请入口。
- 已配置但暂时禁用的平台 -> 已支持/暂不可用，无申请入口。
- `altDomains` 和 `serviceNameForURL()` 的特殊域名都被识别为已支持。

### 11.2 域名规范化

- `www.example.com/a?token=1#x` -> `example.com`。
- `m.example.co.uk/video/1` -> `example.co.uk`。
- 大小写、尾随点和 Unicode 域名产生稳定唯一键。
- IP、localhost、单标签主机和非 HTTP(S) 协议被拒绝。
- 数据库、API 响应和外链中均不出现原始路径和查询参数。

### 11.3 提交和投票

- 未登录创建、投票和取消投票返回 401。
- 并发提交同一域名最终只有一条平台记录。
- 创建者自动获得一票。
- 同一用户重复投票不会增加票数。
- 重复取消投票不会减少票数，票数不会为负。
- 不同子域、路径和参数不能绕过 domain 唯一约束。
- 已正式支持或暂时禁用的平台不能创建愿望。

### 11.4 前端

- 游客可以浏览和打开平台官网。
- 登录完成后返回原申请/详情页面。
- 下载错误只在 `platformRequest.eligible` 为真时显示 CTA。
- 申请页对 query 参数重新 preview。
- 所有外链带正确安全属性。

## 12. 实施顺序与上线策略

1. 先重构并测试 URL 分类，确保不改变已支持平台的成功下载行为。
2. 增加新的未知平台响应契约；前端尚未使用时不会影响旧客户端。
3. 建表并上线平台请求 API。
4. 上线愿望单页面、登录返回和投票。
5. 最后开启下载错误 CTA 和管理后台入口。

建议在下载错误 CTA 上线前观察一段时间的新错误分类日志，至少记录 `classification`、`service`、`domain`、最终错误码和通用提取结果。不要在新增的平台愿望日志中记录原始 URL。

## 13. 最终结论

这项需求可以落地，且不需要通过抓取结果猜测“是否支持”。最可靠的方案是把现有 `processing/url.js` 的服务配置识别提升为共享、纯函数的正式注册表，并在抓取前固定分类：

- 没命中正式服务配置：未知平台，通用提取失败后可申请。
- 命中正式服务但 URL pattern 不匹配：平台已支持，页面类型不支持，不可申请。
- 命中正式服务和 pattern 后发生任何失败：解析/内容/运行时失败，不可申请。

这样既保留现有通用下载能力，也能避免把 YouTube Cookie 失效、平台限流、视频删除等故障错误地变成“申请新平台”。
