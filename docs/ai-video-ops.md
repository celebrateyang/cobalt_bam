# AI 视频功能运维手册

本文档覆盖 AI 视频功能当前完整版本，包括会员额度、断点上传、AI 转写与翻译、精彩片段分析、竖屏渲染、字幕交付、站内下载结果导入、GCS 存储和过期清理。

## 1. 生产架构

运行时包含以下组件：

- API Deployment：提供 `/user/ai-video/*` 接口，执行会员校验、额度查询、分块上传中转、草稿编辑、渲染提交和签名下载。
- `argocd-system-worker` Deployment：产品标识为 `argoCD`，负责媒体摄取、ffprobe、FFmpeg、OpenAI 转写/翻译/精彩片段分析和竖屏渲染。
- AI 视频清理 CronJob：终止过期上传会话，并按照数据库登记的精确对象 key 和 generation 删除过期资产。
- PostgreSQL：保存任务状态、上传进度、额度预留、字幕段、片段候选、渲染快照、资产索引和导入 nonce。
- GCS：保存源视频和生成结果，不保存于 PostgreSQL。

首版保持一个 Worker 副本，因此全局同时处理一个 AI 视频任务。API 和 Worker 可以重启；任务通过 PostgreSQL 租约恢复，不依赖 Pod 本地状态。

## 2. GCS 与 ServiceAccount

生产固定使用：

```text
gs://ebay-mag-terraform-state/production/cloudsql-pgsql/data/
```

注意事项：

- `data` 是对象名前缀，不需要单独创建目录。
- 对象名由服务端随机生成，不包含用户 ID、邮箱、任务 ID、原文件名、标题或字幕内容。
- 现有 Kubernetes ServiceAccount 通过 GKE Workload Identity 访问 GCS，不需要在环境变量中放置 ServiceAccount JSON 密钥。
- ServiceAccount 至少需要在上述固定前缀内创建、读取和删除对象的权限。
- 不需要 `storage.buckets.update`，也不需要配置 Bucket CORS。
- 浏览器只连接 API；API 将连续的 16 MiB 分块流式转发到 GCS resumable upload session。
- 清理程序不得枚举或删除 `production/cloudsql-pgsql/data/` 之外的对象。

该 Bucket 已启用版本控制和 7 天 soft delete。应用删除对象后，管理员仍可能在 soft-delete 窗口内恢复底层对象；应用层过期时间不等同于物理数据立即不可恢复。

## 3. Kubernetes Secret

`argo-secret` 必须包含三个相互独立的值：

| Secret key | 用途 |
| --- | --- |
| `AI_VIDEO_UPLOAD_SESSION_ENCRYPTION_KEY` | 加密 GCS resumable session URI |
| `AI_VIDEO_MEDIA_IMPORT_TOKEN_KEY` | 加密并认证站内下载导入凭证 |
| `OPENAI_API_KEY` | Worker 调用 OpenAI API |

两个自定义加密密钥均应至少 32 个字符，且不能互相复用，也不能复用 OpenAI 密钥。

```powershell
kubectl create secret generic argo-secret -n infra `
  --from-literal=AI_VIDEO_UPLOAD_SESSION_ENCRYPTION_KEY='<至少32字符的上传会话密钥>' `
  --from-literal=AI_VIDEO_MEDIA_IMPORT_TOKEN_KEY='<另一个至少32字符的导入凭证密钥>' `
  --from-literal=OPENAI_API_KEY='<OpenAI API密钥>' `
  --dry-run=client -o yaml | kubectl apply -f -
```

不要把真实密钥写入 Helm values、Git、前端构建变量或日志。更新 Secret 不会自动重启已有 Pod；应通过正常发布流程触发新一轮 API 和 Worker Pod 部署。

## 4. Helm 配置

建议的首版配置如下：

```yaml
aiVideo:
  enabled: true
  serviceAccountName: <现有的Workload-Identity-Kubernetes-ServiceAccount>
  storageProvider: gcs
  gcsBucket: ebay-mag-terraform-state
  storagePrefix: production/cloudsql-pgsql/data
  localStorageRoot: .ai-video-storage

  monthlySeconds: 7200
  maxFileBytes: 1073741824
  maxDurationSeconds: 3600

  uploadChunkBytes: 16777216
  uploadGlobalConcurrency: 3
  uploadSessionTtlMs: 21600000
  uploadStallTimeoutMs: 120000

  secretName: argo-secret
  uploadSessionEncryptionKeySecretKey: AI_VIDEO_UPLOAD_SESSION_ENCRYPTION_KEY
  mediaImportTokenKeySecretKey: AI_VIDEO_MEDIA_IMPORT_TOKEN_KEY
  openaiApiKeySecretKey: OPENAI_API_KEY

  worker:
    replicaCount: 1
    heartbeatMs: 15000
    pollMs: 3000
    leaseMs: 120000
    transcriptionModel: gpt-4o-transcribe-diarize
    textModel: gpt-5-mini
    openaiBaseUrl: ""
    openaiTimeoutMs: 120000
    openaiMaxRetries: 2
    audioChunkSeconds: 600
    resources:
      requests:
        cpu: 500m
        memory: 512Mi
        ephemeral-storage: 2Gi
      limits:
        cpu: "2"
        memory: 2Gi
        ephemeral-storage: 6Gi

  cleanup:
    enabled: true
    schedule: "15 * * * *"
    concurrencyPolicy: Forbid
```

渲染期间，Worker 的临时目录会同时保存源视频、音频分片和当前输出文件。增加文件大小、候选片段数量或 Worker 并发之前，必须重新评估 `ephemeral-storage`、CPU 和内存限制。

## 5. 产品限制与额度

首版默认限制：

| 项目 | 限制 |
| --- | --- |
| 使用资格 | 有效会员并拥有 `ai_video_studio` entitlement |
| 每位会员每月输入额度 | 120 分钟 |
| 月度会员与年度会员额度 | 相同 |
| 单视频最大时长 | 60 分钟 |
| 单文件最大大小 | 1 GiB |
| 每位用户同时处理任务 | 1 个 |
| Worker 全局并发 | 1 个 |
| 同时上传 | 每用户 1 个，API 全局 3 个 |
| 上传分块 | 16 MiB，严格顺序 |
| 输出片段 | 默认 3 个，最多 5 个 |
| 单片段时长 | 15–90 秒 |
| 输出视频 | 1080×1920 MP4 |

额度在探测到真实视频时长后按分钟向上取整预留。在开始调用语音转写服务前提交用量；重试复用原额度记录，不会重复扣减。

## 6. API 接口

所有接口均使用 Clerk 鉴权并校验任务所有权。

```text
GET    /user/ai-video/usage
POST   /user/ai-video/jobs
GET    /user/ai-video/jobs
GET    /user/ai-video/jobs/:jobId

GET    /user/ai-video/jobs/:jobId/upload
PUT    /user/ai-video/jobs/:jobId/upload
POST   /user/ai-video/jobs/:jobId/upload-complete

GET    /user/ai-video/jobs/:jobId/draft
PUT    /user/ai-video/jobs/:jobId/draft
GET    /user/ai-video/jobs/:jobId/source
POST   /user/ai-video/jobs/:jobId/render
POST   /user/ai-video/jobs/:jobId/retry

GET    /user/ai-video/jobs/:jobId/results
GET    /user/ai-video/jobs/:jobId/assets/:assetId/download

POST   /user/ai-video/jobs/:jobId/cancel
DELETE /user/ai-video/jobs/:jobId
```

### 分块上传要求

`PUT /upload` 必须包含：

```text
Upload-Offset: <服务端已确认的字节偏移>
Content-Length: <本分块大小>
Digest: sha-256=<base64摘要>
Content-Type: application/octet-stream
```

服务端只接受下一个连续分块。偏移不一致时返回服务端当前 `committedBytes`，浏览器重新选择同一文件后可从已确认位置继续，不需要重新上传已有分块。

## 7. 处理状态与重试

分析阶段的正常状态变化：

```text
uploading
  -> queued_ingest
  -> ingesting
  -> probing
  -> transcribing
  -> translating
  -> analyzing
  -> draft_ready
```

渲染阶段的正常状态变化：

```text
draft_ready
  -> queued_render
  -> rendering
  -> completed
```

临时 Provider、网络、存储或 FFmpeg 错误会记录 `failed_stage` 和可重试标记。重试会尽量复用已经写入 PostgreSQL 的转写、翻译、渲染快照和已完成资产。Worker 通过 heartbeat 和租约避免同一任务被多个 Pod 同时处理；租约过期后任务可由 Worker 重新领取。

取消运行中任务时状态先变为 `cancel_requested`。当前 Worker 或租约恢复 Worker 会完成取消，并把已登记资产交给清理任务处理。

## 8. AI 模型配置

默认配置：

- 转写：`gpt-4o-transcribe-diarize`，保存说话人标签和段级时间戳。
- 文本：`gpt-5-mini`，用于字幕翻译和精彩片段分析。
- 音频分片：600 秒、16 kHz、单声道、48 kbps，确保单个转写文件明显低于 25 MB。

将 `aiVideo.worker.transcriptionModel` 改为 `whisper-1` 不需要修改业务代码。该模式保存段级时间戳和词级时间戳，但不提供默认模型的说话人分离结果。

精彩片段 Provider 暂时不可用时，Worker 会使用确定性降级算法生成合法候选；语音转写不可用时不会把任务伪装为成功。

## 9. 竖屏渲染与字幕

每个启用的候选片段独立渲染：

- 按片段起止时间裁切，服务端再次校验时长必须为 15–90 秒。
- 按 9:16 cover 规则缩放并裁切为 1080×1920。
- `focusX` 控制水平焦点，取值范围为 0–1。
- 输出 H.264、AAC、`yuv420p`、30 fps 和 Web Fast Start MP4。
- 根据任务配置烧录翻译字幕或原文+译文双语字幕。
- 同时生成 UTF-8 SRT 和 WebVTT。
- 所有用户文本写入 ASS 前都会转义；FFmpeg 使用参数数组调用，不拼接 shell 命令。

提交渲染时会保存不可变草稿快照。相同草稿 revision 的重复请求不会重复创建渲染任务。

## 10. 站内下载结果导入

当已登录用户获得单视频 `redirect` 或 `tunnel` 下载结果时，下载 API 会附加加密的 `mediaImportToken`。Picker、图片和纯音频结果不会获得导入凭证。

导入规则：

- 浏览器仅在当前标签页的 `sessionStorage` 中保存令牌。
- 令牌有效期为 15 分钟，并绑定数据库用户 ID。
- 令牌包含加密后的媒体 URL、来源服务、文件名、过期时间和随机 nonce。
- nonce 只能消费一次；数据库不保存明文媒体 URL。
- Worker 仅接受 HTTPS，拒绝 URL 用户名/密码、localhost 和私网 IP。
- 每次重定向都会重新进行协议和地址校验，最多跟随 5 次。
- 响应头和实际流量都会执行 1 GiB 上限校验。
- 导入对象在上传前先登记为 pending 资产，避免 Worker 崩溃产生无法追踪的对象。

## 11. 保留与清理策略

| 数据或资产 | 默认保留时间 |
| --- | --- |
| 未完成上传会话 | 6 小时 |
| 失败任务源文件和部分结果 | 24 小时 |
| 可编辑草稿及渲染前源文件 | 30 天 |
| 渲染成功后的源文件 | 24 小时 |
| MP4、SRT、VTT | 7 天 |
| 单次签名 URL | 10 分钟 |

清理 CronJob 每小时执行一次，使用 PostgreSQL `FOR UPDATE SKIP LOCKED` 分批领取资产。删除时使用完整对象 key 和 generation；失败后指数退避重试。用户删除或取消任务只修改应用状态并登记清理，不在 API 请求中同步批量删除 GCS 文件。

刷新结果页面会生成新的 10 分钟签名 URL，不会重新渲染视频。资产到期或任务删除后，API 不再签发新的下载链接。

## 12. 部署后验证

确认 Worker Pod、日志和 ServiceAccount：

```powershell
kubectl get pods -n infra -l app.kubernetes.io/name=argocd-system-worker
kubectl logs -n infra deployment/argocd-system-worker --since=30m
kubectl get pods -n infra -l app.kubernetes.io/name=argocd-system-worker `
  -o jsonpath='{.items[0].spec.serviceAccountName}'
```

确认 API 和 Worker 都已加载导入密钥：

```powershell
kubectl get deployment -n infra cobalt argocd-system-worker -o yaml | Select-String AI_VIDEO_MEDIA_IMPORT_TOKEN_KEY
```

建议手工验收以下流程：

1. 非会员能看到入口，但创建任务时获得会员限制提示。
2. 会员上传视频，中断后重新选择同一文件能够从服务端 offset 继续。
3. 任务依次进入转写、翻译、精彩片段分析并生成可编辑草稿。
4. 修改字幕、片段边界和水平焦点后提交渲染。
5. 每个启用片段获得 MP4、SRT、VTT，MP4 分辨率为 1080×1920。
6. 刷新页面后任务和结果仍存在，并获得新的签名 URL。
7. 完成一次普通站内视频下载后，AI 视频页面能显示并消费最近下载导入凭证。
8. 取消、Provider 临时错误和 Worker 重启时，任务能够取消或从失败阶段重试。

## 13. 开发验证命令

```powershell
pnpm -C api test:ai-video-infrastructure
pnpm -C api test:ai-video-analysis
pnpm -C api test:ai-video-delivery
pnpm -C api test:membership-features
pnpm -C web check
pnpm -C web i18n:check-encoding
```

Web 生产构建继续由用户手动执行：

```powershell
pnpm -C web build
```

## 14. 常见问题

### 页面上传是否需要 Bucket CORS？

不需要。浏览器将分块发送到 API，只有 API 使用 GCS resumable session URI。

### API 是否会把整个 1 GiB 文件读入内存？

不会。上传、导入和对象写入均使用 Node.js stream 与 backpressure；浏览器端仅逐块读取当前 16 MiB 分片。

### 为什么删除后 GCS 仍可能占用空间？

应用已经删除当前 generation，但 Bucket 的 7 天 soft delete 允许管理员恢复对象，因此底层空间不会保证立即释放。

### 为什么刚更新 Secret 后导入仍然失败？

Kubernetes Secret 更新不会自动重启 Pod。确认 API Deployment 和 `argocd-system-worker` 都已经滚动到读取新 Secret 的 Pod。

### 为什么结果链接过一段时间失效？

单个签名 URL 只允许访问 10 分钟。只要资产仍在 7 天保留期内，刷新 AI 视频结果页面即可获得新链接。
