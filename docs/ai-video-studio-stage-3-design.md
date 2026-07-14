# AI 视频工作室第三阶段实施设计

## 1. 目标与已确认范围

第三阶段交付一个会员专属的 AI 短视频工作室 MVP：用户提交本地视频或站内下载结果，系统自动识别语音、提取精彩片段、生成翻译字幕，并输出可下载的竖屏短视频。

已确认的产品约束：

- 输入同时支持本地上传和站内下载结果。
- AI 自动推荐精彩片段。
- 每个片段默认限制为 15–90 秒。
- 首版只输出 9:16 竖屏视频。
- 用户可以调整片段边界、画面焦点和字幕文本。
- 首版允许调用 OpenAI API；业务层仍保留 Provider 适配接口，避免以后更换模型时改动任务管线。
- 功能只对具有 `ai_video_studio` 权益的会员开放，不扣积分。
- 月度会员和年度会员使用相同的合理使用额度。
- 任务开始时校验会员；已经受理的任务可以在会员到期后完成。

首版不包含：多轨时间线、横屏/方形输出、动态贴纸、模板市场、多人协作、用户自定义字体、逐帧关键帧、自动发布到社交平台。

## 2. 核心设计结论

AI 视频处理不能复用当前同步下载请求或浏览器本地处理队列。生产环境应拆成四个边界：

```text
SvelteKit Web
    |
    | Clerk token + REST
    v
Express API (控制面) ---- PostgreSQL（任务、字幕、额度、租约）
    |                              ^
    | API 分块中转/签名下载         | claim / heartbeat / progress
    v                              |
对象存储 <------------------ AI Video Worker
                                   |
                                   +-- ffprobe / ffmpeg
                                   +-- OpenAI Audio Transcription
                                   +-- OpenAI Responses API（翻译/精彩片段）
```

主要选择：

1. API 负责鉴权、任务编排、分块上传流式中转和签名下载 URL，不在 HTTP 请求内执行 FFmpeg 或 AI 推理。
2. PostgreSQL 使用 `FOR UPDATE SKIP LOCKED` 充当首版持久化任务队列，不新增 Redis 强依赖。
3. 独立 Worker Deployment 执行下载、探测、转写、分析和渲染；Worker 可独立限制并发和扩容。
4. 生产文件使用对象存储；开发环境提供本地文件适配器。不能依赖 API Pod 临时目录或当前 1 GiB PVC。
5. AI 能力均通过 Provider 接口调用，首版默认实现为 OpenAI；模型名称通过环境变量配置，不写死在任务数据访问层。
6. 分析完成后进入可编辑草稿，用户确认后才渲染，减少无效计算和对象存储写入。
7. 正式放弃浏览器跨域直传 GCS，不依赖 Bucket CORS。本地文件按 16 MiB 顺序分块传给 API，API 使用 GCS resumable upload 边接收边转发，不缓存完整视频。

## 3. 用户流程

### 3.1 创建任务

1. 用户进入公开可见的 AI 视频工作室页面。
2. 点击上传或“制作短视频”时，前端调用统一会员门禁。
3. API 校验 Clerk 身份、`ai_video_studio` 权益、任务并发和剩余额度。
4. 本地文件由浏览器按 16 MiB 顺序分块传到 API，API 流式转发到服务端持有的 GCS resumable session；站内下载结果走受信任的导入凭证。
5. 上传或导入完成后，API 用 ffprobe 结果确认真实时长、编解码、尺寸和音轨。
6. API 按视频时长预留额度并把任务放入分析队列。

### 3.2 AI 分析与编辑

1. Worker 提取单声道语音并转写带时间戳的字幕段。
2. OpenAI 文本模型将字幕翻译为用户选择的目标语言。
3. OpenAI 文本模型使用结构化输出，根据转写文本和时间戳返回精彩片段候选及理由。
4. 服务端校验候选边界，将其规范到 15–90 秒，默认保留分数最高的 3 个，最多 5 个。
5. 任务进入 `draft_ready`。前端展示源视频预览、候选片段和字幕编辑器。
6. 用户可以启用/停用候选、调整起止点、修改翻译、选择单语或双语字幕、调整横向画面焦点。

### 3.3 渲染与下载

1. 用户提交草稿版本进行渲染。
2. API 再校验任务所有权，但不因任务创建后的会员到期拒绝本任务渲染。
3. Worker 为每个启用片段生成 1080×1920 MP4，并输出可选的 SRT/VTT 字幕文件。
4. 前端轮询任务或使用 Server-Sent Events 接收进度。
5. 完成后 API 返回短期签名下载 URL；源文件和输出按保留策略自动清理。

## 4. 输入与输出规范

### 4.1 输入限制

首版默认配置值，全部通过环境变量调整：

| 项目 | 默认值 |
| --- | --- |
| 最大文件大小 | 1 GiB |
| 最大视频时长 | 60 分钟 |
| 最短视频时长 | 15 秒 |
| 用户同时活跃任务 | 1 个 |
| 用户排队任务上限 | 3 个 |
| 支持容器 | MP4、MOV、WebM、MKV |
| 必需内容 | 至少一个视频流；无音轨时只能手动切片，不能生成 AI 字幕 |

MIME 类型只用于提前提示，最终以 ffprobe 结果为准。压缩包、播放列表、损坏文件和超限文件必须拒绝。

### 4.2 站内下载结果导入

不能允许 Worker 获取前端传入的任意 URL，否则会形成 SSRF 和内网探测能力。

下载 API 在产生可用媒体结果时，可以额外签发一个短期 `mediaImportToken`，内容至少包含：

- 用户 ID；
- 规范化资源 URL 或服务端资源引用；
- 来源服务；
- 预期文件名和 MIME；
- 过期时间；
- 随机 nonce。

创建 AI 任务时只接受该签名凭证。API 校验用户、过期时间、nonce 单次使用和来源协议，Worker 随后立即把资源摄取到对象存储。凭证默认 15 分钟有效，数据库中不记录完整敏感源 URL日志。

### 4.3 输出规范

- 容器：MP4。
- 视频：H.264，1080×1920，`yuv420p`，30 fps 上限，Web Fast Start。
- 音频：AAC，48 kHz，立体声；源为单声道时允许保留单声道。
- 画面：按 9:16 cover 裁切。首版提供 `center` 和 `custom_focus`；`custom_focus` 保存 0–1 的水平焦点，不做动态人物追踪。
- 字幕：默认烧录翻译字幕；可选原文+译文双语；同时生成 UTF-8 SRT 和 WebVTT。
- 片段：默认 3 个，单个 15–90 秒，最多选择 5 个。
- 文件名：使用净化后的标题、片段序号和语言代码，不接受用户提供的路径片段。

## 5. 任务状态机

### 5.1 主状态

```text
created
  -> awaiting_upload
  -> uploading
  -> queued_analysis
  -> ingesting
  -> probing
  -> transcribing
  -> translating
  -> analyzing
  -> draft_ready
  -> queued_render
  -> rendering
  -> completed
```

任一未完成状态可以进入：

- `failed`：可重试或不可重试失败；
- `cancel_requested`：用户要求取消，Worker 在安全检查点停止；
- `cancelled`：已经停止并释放资源；
- `expired`：文件和结果已按策略删除。

### 5.2 状态规则

- 所有状态迁移由数据库条件更新保护，禁止前端直接指定主状态。
- 每次 Worker 领取任务时写入 `lease_owner`、`lease_expires_at` 和 heartbeat。
- 租约过期的运行中任务可以被重新领取；每个步骤必须可幂等执行。
- `attempt_count` 默认最多 3 次；参数错误、无视频流、文件超限等不可重试。
- Provider 超时、临时网络错误和 Worker 崩溃可指数退避重试。
- 渲染使用不可变的 `draft_revision`。用户编辑产生新版本时，旧渲染结果不能覆盖新版本。
- 进度是阶段权重后的展示值，不作为状态判断依据。

建议阶段权重：摄取 10%、探测 5%、转写 35%、翻译 15%、精彩分析 10%、渲染 25%。

## 6. 数据库设计

所有时间沿用项目现状，使用毫秒 Unix 时间 `BIGINT`。结构化可编辑内容保留 JSONB，同时把需要并发控制、筛选和计费的字段规范化。

### 6.1 `ai_video_jobs`

核心字段：

```sql
id UUID PRIMARY KEY
user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
status TEXT NOT NULL
source_kind TEXT NOT NULL              -- upload | download_import
source_object_key TEXT
source_filename TEXT
source_mime TEXT
source_size_bytes BIGINT
source_duration_ms BIGINT
source_width INTEGER
source_height INTEGER
source_language TEXT                   -- auto 或受支持语言
target_language TEXT NOT NULL
subtitle_mode TEXT NOT NULL            -- translated | bilingual
progress INTEGER NOT NULL DEFAULT 0
current_stage TEXT
error_code TEXT
error_detail JSONB
draft_revision INTEGER NOT NULL DEFAULT 0
render_revision INTEGER
attempt_count INTEGER NOT NULL DEFAULT 0
lease_owner TEXT
lease_expires_at BIGINT
started_at BIGINT
completed_at BIGINT
expires_at BIGINT
created_at BIGINT NOT NULL
updated_at BIGINT NOT NULL
```

索引：

- `(user_id, created_at DESC)` 用于任务历史；
- `(status, created_at)` 用于排队；
- `(status, lease_expires_at)` 用于回收失效租约；
- 每个用户只允许一个运行任务的部分唯一索引，或在创建事务中使用 advisory lock。

### 6.2 `ai_video_assets`

记录源文件、音频中间件、字幕和成片，不把二进制放入 PostgreSQL。

```sql
id UUID PRIMARY KEY
job_id UUID NOT NULL REFERENCES ai_video_jobs(id) ON DELETE CASCADE
kind TEXT NOT NULL                     -- source | audio | transcript | srt | vtt | output
clip_id UUID
object_key TEXT NOT NULL
object_generation TEXT NOT NULL
mime TEXT
size_bytes BIGINT
checksum_sha256 TEXT
revision INTEGER
expires_at BIGINT
cleanup_status TEXT NOT NULL DEFAULT 'active' -- active | pending | retry | deleted
cleanup_attempts INTEGER NOT NULL DEFAULT 0
cleanup_after BIGINT
deleted_at BIGINT
created_at BIGINT NOT NULL
UNIQUE (job_id, kind, clip_id, revision)
```

### 6.3 `ai_video_upload_sessions`

记录 API 中转上传进度，使上传可以跨 API Pod 重启恢复：

```sql
id UUID PRIMARY KEY
job_id UUID NOT NULL UNIQUE REFERENCES ai_video_jobs(id) ON DELETE CASCADE
user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
object_key TEXT NOT NULL
gcs_session_uri_encrypted TEXT NOT NULL
total_bytes BIGINT NOT NULL
committed_bytes BIGINT NOT NULL DEFAULT 0
chunk_size_bytes INTEGER NOT NULL DEFAULT 16777216
status TEXT NOT NULL                    -- active | completed | aborted | expired
file_fingerprint TEXT NOT NULL
last_chunk_sha256 TEXT
expires_at BIGINT NOT NULL
created_at BIGINT NOT NULL
updated_at BIGINT NOT NULL
```

GCS resumable session URI 具备写入能力，按敏感凭证处理，使用独立的 `AI_VIDEO_UPLOAD_SESSION_ENCRYPTION_KEY` 加密后入库，不返回浏览器、不写日志。`file_fingerprint` 由文件大小、名称、lastModified 和首尾采样哈希组成，用于刷新页面后重新选择文件时防止续传到错误对象。

### 6.4 `ai_video_transcript_segments`

```sql
id UUID PRIMARY KEY
job_id UUID NOT NULL REFERENCES ai_video_jobs(id) ON DELETE CASCADE
segment_index INTEGER NOT NULL
start_ms BIGINT NOT NULL
end_ms BIGINT NOT NULL
source_text TEXT NOT NULL
translated_text TEXT
speaker TEXT
confidence REAL
revision INTEGER NOT NULL DEFAULT 0
UNIQUE (job_id, segment_index)
```

统一转写结构包含必需的段级时间戳和可选 `words[]`。`gpt-4o-transcribe-diarize` 首版返回说话人及段级起止时间；将来切换为 `whisper-1` 时把词级时间戳写入 `words[]`，不需要修改字幕段主表、任务 API 或前端基础协议。词级数据首版存入单独 JSONB 资产，不建立逐词数据表。

### 6.5 `ai_video_clips`

```sql
id UUID PRIMARY KEY
job_id UUID NOT NULL REFERENCES ai_video_jobs(id) ON DELETE CASCADE
sort_order INTEGER NOT NULL
start_ms BIGINT NOT NULL
end_ms BIGINT NOT NULL
title TEXT
reason TEXT
score REAL
enabled BOOLEAN NOT NULL DEFAULT true
crop_mode TEXT NOT NULL DEFAULT 'center'
focus_x REAL NOT NULL DEFAULT 0.5
subtitle_style JSONB
revision INTEGER NOT NULL DEFAULT 0
created_at BIGINT NOT NULL
updated_at BIGINT NOT NULL
```

服务端约束 `end_ms > start_ms`、15–90 秒、`focus_x` 在 0–1 范围内，并确认边界不超过源时长。

### 6.6 `ai_video_usage_reservations`

AI 使用额度需要并发安全的预留，不直接复用只记录结果的 `member_usage_events`。

```sql
id UUID PRIMARY KEY
user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
job_id UUID NOT NULL UNIQUE REFERENCES ai_video_jobs(id) ON DELETE CASCADE
period_key TEXT NOT NULL                -- YYYY-MM, UTC
reserved_seconds INTEGER NOT NULL
consumed_seconds INTEGER NOT NULL DEFAULT 0
status TEXT NOT NULL                    -- reserved | committed | released
created_at BIGINT NOT NULL
updated_at BIGINT NOT NULL
UNIQUE (user_id, job_id)
```

任务完成后仍向现有 `member_usage_events` 写一条 `service='ai_video_studio'` 的审计事件，方便会员后台统一查看。

## 7. 合理使用额度

### 7.1 计量口径

- 按“输入视频分钟数”计量，不按输出片段数或积分计量。
- 不足一分钟向上取整到一分钟，数据库内部仍保存秒数。
- 同一源文件重试不重复扣量；创建新任务重新分析则重新计量。
- 月度和年度会员都使用同一 UTC 自然月额度。
- 推荐首版默认每个会员每月 120 分钟，通过 `AI_VIDEO_MONTHLY_SECONDS=7200` 配置。
- 管理员可调整全局额度；用户级赠送或覆盖暂不放进首版 UI，但数据访问层应保留扩展点。

### 7.2 预留与结算

1. 创建任务时只做初步上限检查，不扣额度。
2. ffprobe 得到真实时长后，在同一数据库事务中锁定用户与当月额度并创建 reservation。
3. 可用额度 = 月额度 - 已 `committed` - 有效 `reserved`。
4. 任务进入首次 AI 转写前即视为产生实质成本；成功或此后的失败都 `committed`。
5. 在 AI 转写开始前取消、上传失败或探测失败则 `released`。
6. Worker 重试复用原 reservation，不再次预留。

资格接口应增加独立的用量摘要，而不是改变通用会员门禁返回结构：

```json
{
  "limitSeconds": 7200,
  "usedSeconds": 1800,
  "reservedSeconds": 600,
  "remainingSeconds": 4800,
  "periodKey": "2026-07",
  "resetsAt": 1785542400000
}
```

额度耗尽返回 HTTP 429 和 `AI_VIDEO_QUOTA_EXCEEDED`；并发超限返回 HTTP 409 和 `AI_VIDEO_CONCURRENCY_LIMIT`。会员缺失仍返回 `MEMBERSHIP_REQUIRED`，不要混用错误码。

## 8. API 设计

所有 `/user/ai-video/*` 路由使用 Clerk 鉴权和任务所有权校验。

### 8.1 额度和任务

```http
GET    /user/ai-video/usage
POST   /user/ai-video/jobs
GET    /user/ai-video/jobs?cursor=<cursor>&limit=20
GET    /user/ai-video/jobs/:jobId
POST   /user/ai-video/jobs/:jobId/cancel
DELETE /user/ai-video/jobs/:jobId
```

`POST /jobs` 请求：

```json
{
  "sourceKind": "upload",
  "filename": "source.mp4",
  "contentType": "video/mp4",
  "sizeBytes": 12345678,
  "sourceLanguage": "auto",
  "targetLanguage": "zh",
  "subtitleMode": "bilingual"
}
```

上传类型返回 `job`、`uploadSessionId`、`chunkSizeBytes=16777216`、`committedBytes=0` 和过期时间，不返回 GCS URL。下载导入类型用 `mediaImportToken` 替代文件元数据。

### 8.2 API 分块中转上传

```http
GET  /user/ai-video/jobs/:jobId/upload
PUT  /user/ai-video/jobs/:jobId/upload
POST /user/ai-video/jobs/:jobId/upload-complete
```

`GET /upload` 返回服务端已确认的 `committedBytes`、固定 chunk size、总大小和过期时间，用于断点恢复。

`PUT /upload` 一次只接受下一个连续分块，请求至少携带：

```http
Upload-Offset: 33554432
Content-Length: 16777216
Digest: sha-256=<base64>
Content-Type: application/octet-stream
```

API 校验 Clerk 用户、任务所有权、会话状态、offset、分块上限和摘要，然后把请求体通过带 backpressure 的流直接转发给 GCS resumable session。API 不把完整分块或完整视频写入内存/本地磁盘；仅使用有界流缓冲并在转发同时计算 SHA-256。首版同一上传会话严格顺序、同时最多一个在途分块，避免 GCS 连续 byte range 冲突。

offset 不匹配返回 HTTP 409 和 `AI_VIDEO_UPLOAD_OFFSET_MISMATCH`，同时返回服务端 `committedBytes`。重复提交已确认的 offset 不重复写入，客户端先重新查询状态。单块默认 16 MiB，最后一块允许更小；单块请求超时不影响此前已提交字节。

`POST /upload-complete` 查询 GCS session/HEAD，确认总字节数、generation、object key 和任务映射，随后写入 `ai_video_assets` 并进入探测队列。不能只相信前端声明；确认接口必须幂等。

上传会话默认 6 小时失效。失效、取消或文件指纹变化时终止原会话并由清理任务删除不完整对象。API 全局默认最多 3 个活跃上传，每位用户最多 1 个；多 API Pod 通过 PostgreSQL 锁和计数执行限制，不使用进程内计数。

### 8.3 草稿编辑与渲染

```http
GET  /user/ai-video/jobs/:jobId/draft
PUT  /user/ai-video/jobs/:jobId/draft
POST /user/ai-video/jobs/:jobId/render
POST /user/ai-video/jobs/:jobId/retry
GET  /user/ai-video/jobs/:jobId/assets/:assetId/download
```

`PUT /draft` 必须携带 `revision`，采用乐观锁：

```json
{
  "revision": 3,
  "clips": [],
  "segments": []
}
```

版本冲突返回 HTTP 409 和 `AI_VIDEO_DRAFT_CONFLICT`。渲染接口保存当时的不可变快照并返回新状态，重复提交相同 revision 要幂等。

### 8.4 进度更新

首版以 2–3 秒轮询 `GET /jobs/:id` 为默认方案，页面不可见时降低频率。等任务稳定后再增加：

```http
GET /user/ai-video/jobs/:jobId/events
Accept: text/event-stream
```

不建议首版复用随机聊天 WebSocket；两者认证生命周期和消息可靠性不同。

## 9. Worker 与 Provider 接口

### 9.1 Worker 领取任务

Worker 每次只领取自己有容量执行的任务：

```sql
SELECT id
FROM ai_video_jobs
WHERE status IN ('queued_analysis', 'queued_render')
  AND (lease_expires_at IS NULL OR lease_expires_at < $now)
ORDER BY created_at
FOR UPDATE SKIP LOCKED
LIMIT 1;
```

领取、状态更新和租约写入必须在同一事务。默认 heartbeat 15 秒、租约 60 秒、单 Worker 并发 1。FFmpeg 子进程设置超时、捕获退出码，并在取消时先发送正常终止，再强制结束。

### 9.2 Provider 契约

业务层定义三个接口：

```js
speechProvider.transcribe({ audioPath, language, requestId })
translationProvider.translate({ segments, sourceLanguage, targetLanguage, requestId })
highlightProvider.suggest({ segments, minSeconds, maxSeconds, maxClips, requestId })
```

要求：

- 输出使用 Zod 严格校验；Provider 原始响应不能直接写入草稿。
- 每次调用带稳定 `requestId` 以支持幂等和审计。
- API key 只存在于 Kubernetes Secret，不返回前端、不写日志。
- 设置连接、首字节和总超时；记录耗时、模型标识和结果大小，不记录完整字幕正文。
- Provider 不可用时保留已完成阶段，可从失败阶段重试。

首版 OpenAI 默认实现：

- Speech：使用 Audio Transcriptions API，默认模型为 `gpt-4o-transcribe-diarize`，输出说话人及段级时间戳；Provider 适配器同时支持将来切换为带词级时间戳的 `whisper-1`。
- Translation：使用 Responses API 的文本模型，按字幕段批量返回结构化 JSON。
- Highlights：使用 Responses API 的结构化输出，返回候选边界、标题、理由和分数；不可用时启用确定性降级算法。
- OpenAI 只接收 Worker 从视频中提取的音频和后续转写文本，不上传原始视频或渲染成片。
- `OPENAI_API_KEY` 只从 Kubernetes Secret 注入 Worker；不注入 API Pod、前端构建环境或浏览器。
- 模型通过 `AI_VIDEO_TRANSCRIPTION_MODEL` 和 `AI_VIDEO_TEXT_MODEL` 配置，部署时可独立切换。
- Audio Transcriptions 单文件限制为 25 MB；Worker 将长音频压缩并按静音/句间停顿切成小于 25 MB 的分片，保留全局时间偏移，并使用前一分片末尾文本作为下一分片上下文。分片合并必须去除重叠文本。

确定性精彩片段降级：按标点停顿形成 15–90 秒窗口，优先完整句子，结合语速、信息密度、关键词重复和静音比例评分，保证即使模型失败也能生成可编辑候选。

### 9.3 FFmpeg 管线

分析阶段：

```text
source -> ffprobe JSON
source -> 16 kHz mono PCM/FLAC -> speech provider
```

渲染阶段针对每个片段单独执行：

```text
trim -> crop 9:16 by focus_x -> scale 1080x1920
     -> subtitle ASS generation/burn-in
     -> H.264 + AAC -> faststart MP4
```

字幕先由服务端生成 ASS，所有用户文本必须转义 ASS 控制字符。不要把用户文本直接拼进 shell 命令；使用参数数组启动 FFmpeg。

## 10. 对象存储与生命周期

定义统一 `ObjectStorage` 接口：

```js
startResumableUpload()
writeUploadChunk()
queryUploadOffset()
abortResumableUpload()
headObject()
openReadStream()
createWriteStream()
createDownloadUrl()
deleteObject()
```

实现：

- `local`：开发环境使用，根目录固定且校验 resolved path，不能暴露任意文件路径。
- `gcs`：生产固定使用 `gs://ebay-mag-terraform-state/production/cloudsql-pgsql/data/` 前缀，通过 GKE Workload Identity 访问，不把长期服务账号 JSON 放入镜像。

上传链路不配置也不依赖 GCS Bucket CORS。GCS resumable session URI 仅由 API 持有；浏览器只连接 `api.freesavevideo.online`。每个分块经 API 接收一次并向 GCS发送一次，因此 API 处理字节约为源文件大小的 2 倍，但 GCS 只保存一份对象。API 必须采用流式 backpressure，严禁 `express.raw()` 把整个分块读入内存。

该 Bucket 同时保存 Terraform state，当前已启用对象版本控制和 7 天 soft delete，但未启用 Uniform bucket-level access，Public Access Prevention 为 inherited。AI 视频实现不得修改、枚举或清理 `production/cloudsql-pgsql/data/` 以外的对象。运行时 ServiceAccount 只授予完成任务所需的 create/get/delete 权限；平台管理员仍然可以按 IAM 权限审计 Bucket。

GCS 目录是对象名前缀，不需要单独创建目录。对象 key 只能由服务端生成，且不得包含用户 ID、Clerk ID、任务 ID、原文件名、视频标题或语言。数据库保存完整 key、generation 与任务之间的映射：

```text
production/cloudsql-pgsql/data/<2-char-random-prefix>/<128-bit-random-id>
```

对象元数据也不写入原文件名、用户邮箱或字幕摘要。每次写入使用新的随机 key，禁止覆盖已有对象；删除时带 generation precondition，避免 Bucket 的版本控制产生业务无法追踪的旧版本。随机对象名降低存储控制台中的可辨识性，但不替代 IAM；真正的访问保护依赖 Bucket 权限、最小权限和短期签名 URL。

默认保留策略：

| 资产 | 保留时间 |
| --- | --- |
| 未完成上传 | 6 小时 |
| 源文件和中间文件 | 任务完成后 24 小时 |
| 草稿元数据 | 30 天 |
| 成片和字幕文件 | 7 天 |
| 失败任务工作文件 | 24 小时 |

`ai_video_assets` 为每个对象保存 `expires_at`、`object_key`、`object_generation` 和清理状态。清理 CronJob 默认每小时运行一次，使用 `FOR UPDATE SKIP LOCKED` 分批领取到期资产，按精确 key 和 generation 删除；删除成功后记录 `deleted_at`，失败则指数退避重试。用户删除任务只做软标记，由同一清理流程异步执行，避免 API 请求因批量删除超时。

应用删除后对象立即不能通过正常签名 URL 访问，但由于现有 Bucket 启用了 7 天 soft delete，底层数据仍可能由管理员恢复并继续占用存储最多 7 天。设计中的“保留时间”表示应用可访问时间，不表示物理数据已经越过 soft-delete 恢复窗口。

当前可用 Service Account 没有 `storage.buckets.update`，因此首版不依赖 Bucket CORS 或 lifecycle 变更。数据库资产记录和每小时清理 CronJob 是正式清理机制；创建 GCS session 前必须先提交任务与上传会话记录，防止产生无法追踪的孤儿对象。

## 11. 前端设计

新增路由建议：`/[lang]/ai-video`。

页面按状态展示四个区域：

1. 输入区：上传文件或从最近下载结果导入，显示格式、时长和额度提示。
2. 处理中：阶段进度、预计仍需等待提示、取消操作；不承诺精确完成时间。
3. 草稿编辑：视频预览、候选片段卡片、起止时间、画面焦点、字幕列表、语言和样式。
4. 结果区：每个片段独立预览和下载，展示过期时间。

前端不把大视频放入 Svelte store、localStorage 或当前下载队列。使用 `File.slice()` 逐个读取 16 MiB 分块，只保存任务 ID、服务端 offset 和轻量 UI 状态。页面刷新后可以恢复服务端 offset，但浏览器不会持久保存文件本体；用户需要重新选择同一文件，前端和 API 通过 `file_fingerprint` 验证后继续上传。

编辑规则：

- 时间输入服务端和前端都校验 15–90 秒。
- 字幕段拖动首版不支持；允许修改文本，片段边界变化时自动筛选相交字幕。
- 预览通过源文件签名 URL + CSS 9:16 容器模拟裁切，不为每次编辑重新渲染。
- 用户离开页面时自动保存草稿，版本冲突时提示重新加载，不能静默覆盖。
- 所有错误使用稳定错误码映射 10 个现有语言，禁止把 Provider 原始错误展示给用户。

## 12. 会员生命周期语义

- 进入页面不要求会员，因此非会员可以看到功能介绍。
- 创建任务、提交上传确认或导入前必须具有 `ai_video_studio`。
- 一旦任务完成额度预留并进入 `queued_analysis`，它获得 `accepted_at`，会员随后到期不取消该任务。
- 同一任务的草稿保存、渲染、重试临时故障和下载不再次要求有效会员。
- 创建新任务始终重新检查会员和额度。
- 非会员不能通过猜测 job ID 读取其他任务；所有操作始终校验所有权。

## 13. 安全、隐私和内容边界

- 上传和导入接口同时应用用户级速率限制、大小限制和并发限制。
- 分块上传路由使用独立的按字节、会话和并发计量，不套用普通 API 的每分钟请求数限制；每次请求只允许一个分块，并设置读取停滞和总时长超时。
- API 使用流式 backpressure 转发，内存缓冲设置硬上限；客户端断开时立即中止本次上游请求，但保留 GCS 已确认 offset 供重试。
- GCS resumable session URI 加密存储，不返回浏览器、不进入日志或错误响应；上传会话过期后密文与不完整对象一起清理。
- 对象默认私有；签名下载 URL 建议 10 分钟有效。
- 日志只记录 job ID、user ID、阶段、耗时、大小和错误码，不记录完整字幕、源 URL 或签名 URL。
- 下载导入只允许 HTTPS 和显式支持的资源来源，禁止重定向到内网、环回、链路本地或云元数据地址。
- ffprobe/ffmpeg 在独立 Worker 容器运行，设置 CPU、内存、临时磁盘和进程时间限制。
- 输出文件名、字幕和 ASS 内容都必须转义；子进程始终使用参数数组。
- 删除任务时清理对象和可识别内容；用量审计保留聚合字段，不保留字幕正文。
- 首版应在上传前明确告知用户文件将发送到服务器和配置的 AI Provider 处理，并展示保留时间。

## 14. 可观测性与运维

最低指标：

- 各状态任务数和最老排队时间；
- 每阶段成功率、P50/P95 耗时；
- Provider 请求失败率和超时率；
- FFmpeg 失败、OOM、超时次数；
- Worker heartbeat 和失效租约数量；
- 每日输入分钟数、输出分钟数、对象存储字节数；
- 额度拒绝和并发拒绝次数。

健康检查分开：API `/health` 不因 Worker 离线而失败，但返回 AI Worker 最近 heartbeat 摘要；Worker Deployment 自己提供存活探针。连续无 Worker heartbeat 或队列最老等待超过阈值时告警。

Helm 需要新增：

- `aiVideo.enabled`；
- Worker Deployment 及资源限制；
- 对象存储配置；
- API 上传 chunk size、全局并发、停滞超时和 session 加密 Secret；
- Provider URL/model/secret 引用；
- 月额度、输入限制、并发和保留时间；
- 清理 CronJob。

Worker 的产品代号按当前决定使用 `argoCD`。Kubernetes Deployment 使用合法资源名 `argocd-system-worker`，实际 Pod 名形如 `argocd-system-worker-<replicaset>-<suffix>`；标签保留 `app.kubernetes.io/part-of: argoCD`。

## 15. 第三阶段落地批次

### 3A：任务基础设施

- 数据表和数据访问层；
- 对象存储接口及 local/GCS 实现；
- 固定 GCS data 前缀、不透明且不可覆盖的对象名、generation 校验和最小权限 ServiceAccount；
- API 分块中转、GCS resumable session、offset 幂等、摘要校验和跨 Pod 断点恢复；
- 额度预留事务；
- 创建、上传确认、列表、详情和取消 API；
- PostgreSQL Worker 租约；
- Helm Worker 和清理任务骨架。

验收：会员可以在无 Bucket CORS 的情况下上传文件；中断后只重传未确认分块，任务能跨 API/Worker 重启恢复；API 内存不随文件大小增长；非会员、超额和并发请求被稳定错误码拒绝。

### 3B：AI 分析草稿

- ffprobe 和音频提取；
- Speech/Translation/Highlight Provider 接口；
- 确定性精彩片段降级；
- 字幕和候选片段入库；
- 前端任务进度和草稿编辑器。

验收：一段有语音的视频能生成 3 个合法候选和可编辑翻译字幕；Provider 临时失败可从阶段断点重试。

### 3C：竖屏渲染与交付

- 草稿版本和渲染快照；
- 9:16 FFmpeg 渲染、字幕烧录、SRT/VTT；
- 结果预览、签名下载和过期清理；
- 站内下载结果的 `mediaImportToken` 接入。

验收：用户编辑后能得到 15–90 秒、1080×1920 的 MP4，刷新页面不丢任务，过期后文件不可下载。

### 3D：上线保护

- 指标、管理查询、告警和日志脱敏；
- 失败注入、超限、租约回收和清理测试；
- 10 语言文案与移动端体验；
- 小流量开关和回滚说明。

验收：关闭 `aiVideo.enabled` 不影响下载、录制和随机聊天；Worker 停止不会丢任务，恢复后可继续处理。

## 16. 测试策略

### 单元测试

- 状态迁移矩阵；
- 片段边界和焦点校验；
- 配额预留、提交、释放和并发事务；
- Provider 响应 schema；
- ASS/文件名转义；
- 对象 key 和 SSRF 校验。

### 集成测试

- PostgreSQL `SKIP LOCKED` 保证同一任务只被一个 Worker 领取；
- Worker 崩溃后租约回收；
- 上传确认 HEAD 校验；
- Provider 超时后重试不重复计量；
- 草稿乐观锁和渲染 revision 幂等；
- Clerk 用户不能访问其他用户任务。

### 媒体样本测试

至少覆盖横屏、竖屏、可变帧率、长静音、无音轨、非英语、损坏文件、超长字幕、emoji 和 ASS 特殊字符。用短小且可再分发的固定样本进入测试仓库或测试存储，不提交真实用户视频。

### 手工验收

- 桌面和移动端完整流程；
- 页面刷新、断网恢复、取消、重试和文件过期；
- 月度/年度会员相同额度；
- 会员在任务受理后到期仍能完成当前任务；
- 非会员能看页面但不能创建任务。

Web 生产构建由用户手动执行；开发检查仍运行类型检查、API 测试、编码检查和差异检查。

## 17. 默认值与待上线配置

以下不是硬编码产品承诺，而是首版安全默认值：

| 配置 | 默认值 |
| --- | --- |
| 每月输入额度 | 120 分钟 |
| 单文件最大时长 | 60 分钟 |
| 单文件最大大小 | 1 GiB |
| 同时运行任务 | 每用户 1 个，Worker 全局 1 个 |
| 上传分块 | 16 MiB，严格顺序 |
| 同时上传 | 每用户 1 个，API 全局 3 个 |
| 候选片段 | 默认 3，最多 5 |
| 单片段时长 | 15–90 秒 |
| 输出 | 1080×1920 MP4 |
| 源文件保留 | 完成后 24 小时 |
| 成片保留 | 7 天 |
| 签名下载 URL | 10 分钟 |
| OpenAI 转写模型 | `gpt-4o-transcribe-diarize`，可切换为 `whisper-1` |
| OpenAI 文本模型 | 部署环境配置，不在代码中硬编码 |

上线前必须验证指定 GCS 前缀、GCS Workload Identity、精确 generation 删除、7 天 soft-delete 语义、`OPENAI_API_KEY` Secret 和 OpenAI 模型权限。Highlights 可以在 OpenAI 临时失败时使用降级实现；没有语音识别能力时不得把任务伪装为成功。

## 18. 实施入口与完成定义

后续“落地第三阶段”应默认从 3A 开始，而不是一次提交全部 3A–3D。每个批次保持数据库向前兼容，并用 `AI_VIDEO_ENABLED=false` 默认关闭生产入口，直到对象存储、Provider、Worker 资源和隐私文案全部就绪。

整个第三阶段完成的定义：会员能从上传或站内下载结果创建任务，获得可编辑的 AI 精彩片段与翻译字幕，渲染并下载竖屏成片；任务、额度、失败恢复、文件生命周期和会员到期语义均由服务端可靠执行。
