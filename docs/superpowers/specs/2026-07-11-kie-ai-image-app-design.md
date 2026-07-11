# Kie AI Image Workspace 设计规格

日期：2026-07-11  
状态：待用户确认

目标平台：Next.js on Vercel

包管理器：pnpm

## 1. 产品定义

这是一个无登录、浏览器本地优先的 Kie AI 图片工作台。

用户在浏览器中配置自己的 Kie API Key，创建多个独立房间，提交文本生图或图生图任务，并把 Kie 返回的图片 URL 收集到图库。应用不保存图片二进制，不承诺 URL 永久有效，也不建立云端账号或跨设备同步。

第一版的核心价值：

1. 同一个 prompt 可一次创建多份独立任务，例如 `5x` 表示提交 5 个任务。
2. 房间、任务、prompt、参数和图片 URL 只保存在当前浏览器站点空间。
3. 新房间默认空白，不自动继承任何描述词。用户只能通过可见的复制按钮手动复制。
4. 页面关闭后，Kie 远端任务仍可能继续。再次打开时，客户端凭本地保存的 `taskId` 补查结果。
5. 图库直接渲染 Kie URL。URL 失效时保留任务和 prompt 元数据，图片显示不可用状态。
6. 顶栏显示官方剩余 credits、连接状态，以及仅由本浏览器任务计算出的消费统计。

## 2. 明确移除的内容

本版本不包含：

- 登录、邮箱、密码、MFA、组织、租户或用户账户。
- S3、对象存储、数据库、服务端磁盘、图片二进制归档。
- 服务端保存 API Key、房间、任务、图片 URL 或用户偏好。
- 服务端 webhook 持久化和后台 worker。
- 跨浏览器、跨设备或多人同步。
- 平台共享 credits、平台代付或公共 API Key。
- 保证图片 URL 长期可访问。
- 浏览器静默写入用户本地磁盘。

因此，每个浏览器配置文件和每个站点 origin 都是独立工作区。清除站点数据、换浏览器、换域名或使用隐私窗口都会得到不同的数据集。

## 3. 架构

```text
Browser
  ├─ React UI
  ├─ one cross-tab queue leader
  ├─ in-memory active queue for the leader tab
  ├─ localStorage: API Key and lightweight preferences
  ├─ IndexedDB: rooms, tasks, prompts, parameters, result URLs
  └─ direct render of Kie result URLs
          │
          ├─ same-origin Next.js stateless proxy
          │      └─ Kie create/query/credits/download APIs
          │
          └─ Kie temporary file upload API
                 └─ reference image URL for image-to-image
```

Next.js 服务端是无状态代理。每个请求携带当前浏览器提供的 Key，代理转发后立即丢弃，不写数据库、不写日志、不缓存、不进入环境变量。

同一 origin 的多个标签页共享 IndexedDB。使用 Web Locks 选出唯一队列 leader，由 leader 负责提交、轮询和 credits 定时刷新；其他标签页通过 BroadcastChannel 接收状态。若浏览器不支持 Web Locks，则用 IndexedDB 原子 lease、递增 fencing token 和短租约续期兜底。任何标签页都不能仅凭内存状态提交共享的 `queued` 任务。

### 3.1 为什么不能使用 webhook

浏览器关闭后，任何服务端 webhook 都不能直接写入该浏览器的 IndexedDB。没有账号和服务端数据库时，服务端也无法可靠判断结果属于哪个浏览器工作区。

因此采用客户端恢复：

1. 创建任务前先在 IndexedDB 写入本地任务。
2. Kie 返回 `taskId` 后立即更新本地记录。
3. 页面打开时扫描非终态任务。
4. 对每个已知 `taskId` 调用 `recordInfo` 补查。
5. 若 Kie 仍保留结果，则保存返回的图片 URL。

边界：如果创建请求超时且客户端没有收到 `taskId`，应用不能可靠找回该任务，也不能自动重试，否则可能重复扣费。

## 4. 本地数据模型

### 4.1 localStorage

仅保存小型、同步读取的数据：

```ts
type LocalPreferences = {
  schemaVersion: number
  activeRoomId?: string
  locale: "zh-CN" | "en"
  theme: "light"
  galleryLayout: "grid" | "compact"
  pollingEnabled: boolean
}
```

API Key 固定保存到当前 origin 的 `localStorage`，符合浏览器独立和重开恢复要求。设置页提供清除和替换动作；不提供 `sessionStorage` 模式，避免 origin 级队列 leader 无法读取其他标签页的会话 Key。所有同源标签页通过 `storage` 事件获知 Key 已更换，但禁止通过 BroadcastChannel 发送明文 Key。

Key 只在设置页输入，其他界面仅显示掩码，例如 `kie_••••••7C2A`。

客户端为当前 Key 计算 SHA-256 fingerprint，只用于把任务、参考图和 credits 快照绑定到创建它们的 Key。fingerprint 不能替代 Key，也不发送给 Kie。切换 Key 后，旧任务继续保留，但只有重新提供 fingerprint 匹配的 Key 才能补查。

### 4.2 IndexedDB

使用 Dexie 管理结构化本地数据。禁止保存图片 Blob、base64 图片或完整上传文件。

建议表：

```ts
type Room = {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}

type Turn = {
  id: string
  roomId: string
  prompt: string
  mode: "text-to-image" | "image-to-image"
  model: string
  parameters: Record<string, unknown>
  referenceUploadIds: string[]
  taskIds: string[]
  createdAt: number
}

type TaskStatus =
  | "queued"
  | "submitting"
  | "waiting"
  | "queuing"
  | "generating"
  | "success"
  | "fail"
  | "stale"
  | "unknown"
  | "canceled-local"

type Task = {
  localTaskId: string
  remoteTaskId?: string
  retryOfLocalTaskId?: string
  keyFingerprint: string
  roomId: string
  turnId: string
  batchId: string
  batchIndex: number
  model: string
  requestSnapshot: Record<string, unknown>
  status: TaskStatus
  failureCode?: string
  failureMessage?: string
  creditsConsumed?: number
  submissionAttemptId?: string
  leaseOwner?: string
  leaseUntil?: number
  fencingToken: number
  requestStartedAt?: number
  pollAfter?: number
  createdAt: number
  updatedAt: number
  completedAt?: number
}

type Asset = {
  id: string
  localTaskId: string
  roomId: string
  url: string
  outputOrdinal: number
  availability: "unchecked" | "available" | "load-error" | "unavailable"
  favorite: boolean
  tags: string[]
  collectionIds: string[]
  width?: number
  height?: number
  createdAt: number
  lastCheckedAt?: number
}

type ReferenceUpload = {
  id: string
  keyFingerprint: string
  displayName: string
  mimeType: string
  size: number
  temporaryUrl: string
  status: "ready" | "expiring" | "expired" | "load-error"
  expiresAt: number
  createdAt: number
}
```

其他表：`savedPrompts`、`parameterPresets`、`collections`、`accountSnapshots`。

ID 和幂等规则：

- `Turn.taskIds` 只保存 `localTaskId`。
- `Asset.localTaskId` 只引用本地 Task，不引用 Kie `remoteTaskId`。
- Asset 建立唯一索引 `[localTaskId+outputOrdinal]`，重复轮询使用事务 upsert，并允许更新同一输出的新临时 URL。
- `outputOrdinal` 固化首次成功结果数组顺序。后续刷新只有在结果数量和顺序契约一致时才按 ordinal 更新 URL；结构变化进入 contract error，不静默新增或合并卡片。
- `ReferenceUpload` 和 `accountSnapshots` 同样带 `keyFingerprint`，统计不能混合不同 Key。

### 4.3 数据迁移与导出

- 每次数据库 schema 升级必须提供 Dexie migration。
- 设置页支持导出 JSON，内容只包含元数据、设置和 URL。
- 导出默认不包含 API Key，且不得导出图片二进制。
- 导入前校验 schema、大小、字段和 URL 格式。
- 支持清空当前浏览器全部数据，并进行二次确认。

## 5. Kie API 集成

基础地址：`https://api.kie.ai`。

### 5.1 任务创建

```http
POST /api/v1/jobs/createTask
Authorization: Bearer <KIE_API_KEY>
Content-Type: application/json
```

应用的 `/api/kie/tasks` 路由只接受已注册模型的规范化输入，通过模型适配器映射为 Kie payload。客户端不能指定任意上游 URL、任意 HTTP header 或任意 Kie endpoint。

创建限流按 Kie 文档保守实现：账号级最多 20 次请求/10 秒。客户端队列默认并发 3，并采用 token bucket 平滑提交，避免一次 `10x` 瞬间打满额度。

### 5.2 任务查询

```http
GET /api/v1/jobs/recordInfo?taskId=<TASK_ID>
Authorization: Bearer <KIE_API_KEY>
```

官方状态映射：

- `waiting`
- `queuing`
- `generating`
- `success`
- `fail`

`resultJson` 是字符串。服务端先做 JSON parse，再校验其中的 `resultUrls` 为 `https` URL 数组，最后返回规范化对象。不能直接把上游字符串注入页面。

Kie 没有可信百分比进度，所以 UI 只显示阶段、已等待时间和最后检查时间，不伪造进度条百分比。

### 5.3 Credits

```http
GET /api/v1/chat/credit
Authorization: Bearer <KIE_API_KEY>
```

官方接口只提供剩余 credits 数值。UI 必须把数据来源分开：

- 官方：剩余 credits、连接成功/失败、请求延迟、最后检查时间。
- 本浏览器计算：活动任务数、今日/7 天/30 天任务数和已知 credits 消耗。

不能声称能显示 Key 创建时间、Key 过期时间、账单、全账号历史、消费上限或其他浏览器任务，除非 Kie 后续提供并验证相应接口。

刷新时机：

- 首次配置 Key。
- 页面获得焦点。
- 提交任务后。
- 批次出现终态后。
- 页面可见时每 30 秒。
- 用户点击刷新按钮。

失败时保留上次成功值，并明显标记为过期数据。

### 5.4 GPT Image 2 图生图

模型 ID：`gpt-image-2-image-to-image`。

第一版完整支持：

- `prompt`：必填，最多 20,000 字符。
- `input_urls`：1 至 16 张参考图。
- 输入格式：JPEG、JPG、PNG、WEBP。
- 单张输入最大 30 MB。
- `resolution`：`1K`、`2K`、`4K`。
- `aspect_ratio`：`auto`、`1:1`、`3:2`、`2:3`、`4:3`、`3:4`、`16:9`、`9:16`、`2:1`、`1:2`、`3:1`、`1:3`、`21:9`、`9:21`、`5:4`、`4:5`。

组合约束由适配器和 UI 同时执行：

- `5:4`、`4:5`、`3:1`、`1:3`、`9:21` 不允许 `2K` 或 `4K`。

不额外禁止 `auto + 2K/4K` 或 `1:1 + 4K`。这是 2026-07-11 当前 Kie Playground 的公开约束；实现时由 contract fixture 固化，若 Kie 更新规则则更新适配器版本。

文档未提供的参数不得伪装成支持项，包括 `num_images`、`seed`、`mask`、`quality`、输出格式和远端取消。`5x` 是五个独立任务，不是一个任务内请求五张。

### 5.5 参考图上传

图生图需要公网 URL，本地文件不能直接放入 `input_urls`。由于本应用不拥有对象存储，参考图通过 Kie File Upload API 转成临时 URL。

流程：

1. 浏览器选择、粘贴或拖入图片。
2. 客户端校验 MIME、扩展名、magic bytes、数量和大小。
3. 浏览器以 `credentials: 'omit'`、`redirect: 'error'` 固定直传 `https://kieai.redpandaai.co/api/file-stream-upload`。
4. `uploadPath` 使用应用固定前缀加随机 ID，`fileName` 使用 `crypto.randomUUID()` 和验证后的扩展名；同时使用 `formData.append('file', file, randomRemoteName)` 覆盖 multipart file part 的 `filename=`，不发送原始路径或原文件名。
5. 严格校验响应中的实际 MIME、bytes、临时 URL 和过期信息。
6. 将临时 URL 写入 `ReferenceUpload`，原文件名只作为本地 `displayName`。
7. 提交任务时只发送 URL。
8. 不在 IndexedDB 中保存原文件或 Blob。

原因：Vercel Functions 请求体存在约 4.5 MB 限制，而模型允许单图 30 MB。大文件必须浏览器直传 Kie。2026-07-11 已验证该 endpoint 的 OPTIONS 会对任意 origin 返回允许 `POST`、`Authorization` 和 `Content-Type`；上线前仍必须用生产 origin 和测试 Key 完成 multipart 实传，并验证 30 MB 边界。若 contract test 失败，则阻断图生图上线，不引入自有存储，也不虚假声称支持 30 MB。

Kie 上传文档对 24 小时和 3 天存在冲突。优先使用响应 `expiresAt`；没有该字段时按最短 24 小时计算。临近过期或已经过期的参考图禁止提交，用户必须重新选择。随机远端文件名避免 Kie 的同名覆盖行为。

### 5.6 下载

应用优先调用 Kie `/api/v1/common/download-url` 为 Kie 生成的 URL 获取临时直链。该直链按文档约 20 分钟有效。

下载策略：

1. 单图点击下载图标，打开或保存临时直链。
2. Kie 或图片域名允许 CORS 时，支持浏览器端 ZIP 批量打包。
3. CORS 不允许读取 Blob 时，禁用 ZIP，并保留逐张下载和浏览器右键保存。

应用不会把下载文件静默写入磁盘，也不会在服务端中转并保存文件。

## 6. 模型适配器

每个模型通过注册表描述能力，不使用一个巨型动态表单：

```ts
type ModelAdapter = {
  id: string
  label: string
  modes: Array<"text-to-image" | "image-to-image">
  schema: unknown
  defaults: Record<string, unknown>
  normalizeInput(input: unknown): NormalizedTaskInput
  toKiePayload(input: NormalizedTaskInput): Record<string, unknown>
  parseResult(payload: unknown): NormalizedTaskResult
}
```

首发必须支持：

- GPT Image 2 text-to-image。
- GPT Image 2 image-to-image。

架构预留并按官方文档逐个接入：

- Nano Banana 2。
- Seedream 5 Lite / Pro 的 text-to-image 和 image-to-image。
- Flux 2 Pro 的 text-to-image 和 image-to-image。
- Grok Imagine 的 text-to-image 和 image-to-image。

未完成 schema、参数联动和结果解析验证的模型不能出现在生产模型选择器中。高级 JSON 仅允许覆盖当前适配器白名单内的字段，不能绕过模型和 endpoint 白名单。

## 7. 批量任务与恢复

### 7.1 `5x` 语义

用户选择数量 `N` 后：

1. 创建一个 `batchId`。
2. 固化 prompt、模型、参考 URL 和参数快照。
3. 在 IndexedDB 预写 `N` 条 `queued` 任务。
4. leader 在 Dexie 事务内写入新的 `submissionAttemptId`、`leaseOwner`、`leaseUntil`、递增 `fencingToken`、`requestStartedAt` 并把状态改为 `submitting`，然后才发送请求。
5. 每条收到 `remoteTaskId` 后，只能在 `submissionAttemptId` 匹配且 `remoteTaskId` 仍为空时条件写入，再释放提交 lease；迟到响应只能绑定原 attempt。
6. 每条成功、失败、未知互不影响。
7. 只有 N 条均取得并持久化 `remoteTaskId` 后才显示“5x 已提交”；此前显示“正在提交 3/5”。
8. UI 汇总 `成功 3 / 生成中 1 / 失败 1`。

数量控件范围默认 1 至 10，并提供 `1x`、`2x`、`4x`、`5x` 快捷项。

### 7.2 状态机

```text
queued
  -> submitting
      -> waiting -> queuing -> generating -> success
      -> fail
      -> unknown

queued -> canceled-local
```

- `canceled-local` 只取消尚未提交的本地任务。
- 已提交任务停止轮询不等于取消 Kie 远端任务。
- 创建请求出现歧义超时时进入 `unknown`，不自动重提。
- Query 临时失败不直接标记任务失败，而是保留状态并退避。
- stale `submitting` 且没有 `remoteTaskId` 的任务进入 `unknown`，绝不自动重提。
- 对 `unknown` 的手动重试始终新建 `localTaskId`，通过 `retryOfLocalTaskId` 关联原任务；原 Task、attempt 和迟到响应保持不可变，绝不复用原 Task 发第二次 POST。

### 7.3 轮询

- 成功创建后约 2 秒首次查询。
- 生成中逐步退避，最长 15 秒。
- 页面隐藏后降低频率。
- Kie 查询总速率保持在 10 req/s 以下。
- 页面重新可见后立即补查到期任务。
- 终态后停止轮询并刷新 credits。
- 单个任务活动轮询约 15 分钟后进入 `stale` 并停止高频查询；页面聚焦、应用重开或用户手动刷新时仍可补查，`stale` 不等于生成失败。

### 7.4 重开恢复

启动时由 leader 扫描 `queued`、`submitting`、`waiting`、`queuing`、`generating`、`stale` 和可恢复的 `unknown` 任务：

- `queued` 且当前 Key fingerprint 匹配：重新进入提交队列，可安全继续尚未开始的 `5x`；不匹配则暂停并提示换回原 Key。
- `submitting` 且没有 `remoteTaskId`：转为 `unknown`，不自动提交。
- 有 `remoteTaskId` 且当前 Key fingerprint 匹配：重新查询 Kie。
- Key 缺失或 fingerprint 不匹配：暂停并提示用户重新提供匹配 Key，不误报任务不存在。
- `unknown` 且无 `remoteTaskId`：保留未知状态，允许用户手动标记已放弃。
- 查询成功：更新任务并提取 URL 到图库。
- 上游已无记录：显示“无法从 Kie 恢复”，不删除本地 prompt。

## 8. 房间与 prompt 行为

- 新建房间后 composer 必须为空。
- 不自动复制上一房间 prompt、负面词、参考图或参数。
- 不显示“继承描述词”“延续上下文”等隐藏行为。
- 每个用户 prompt 和任务卡片提供复制图标。
- 复制后只写系统剪贴板，并显示短暂 toast。
- “基于此结果再生成”会明确把 prompt 和参数填入当前 composer，用户确认后才提交。
- 房间支持新建、重命名、删除和搜索。
- 含活动任务的房间只允许软删除并移入“最近删除”，其 Task、Key fingerprint 和 `remoteTaskId` 保留到终态；没有活动任务时才允许永久删除本地元数据。删除不影响 Kie 已提交任务。

## 9. 图库

图库是 URL 索引，不是图片仓库。

### 9.1 卡片内容

- 直接使用 Kie URL 渲染缩略图。
- 显示模型、尺寸、房间、生成时间、任务状态。
- 收藏、标签和本地集合。
- 预览、复制 prompt、复制 URL、重新生成、刷新任务、下载。
- 任何操作都不得把图片 Blob 写入 IndexedDB。

### 9.2 URL 失效

`img` 触发 `error` 时：

1. 将本地 `availability` 标记为 `load-error`，文案为“暂时无法加载”，不能仅凭浏览器错误断定 URL 已过期。
2. 卡片显示稳定占位，不发生布局跳动，并提供重试。
3. 保留 prompt、模型、参数、taskId 和原 URL。
4. 提供“刷新任务”动作，再次查询 Kie。
5. 只有 Kie 权威查询或 download-url 接口明确确认不可用时，才标记 `unavailable`。

应用不定时探测所有图片 URL，以免产生大量跨域请求。只在可视渲染、用户刷新或任务补查时更新可用状态。

### 9.3 筛选

- 房间。
- 模型。
- 日期。
- 可用/暂时加载失败/不可用。
- 收藏。
- 标签和集合。
- prompt 文本搜索。

## 10. UI 规格

视觉方向：shadcn/ui 白色工作台，安静、紧凑、适合重复操作。

- 白色主背景，灰色分隔，黑色正文，状态色只用于反馈。
- 不使用渐变、装饰球或营销式 hero。
- 卡片圆角不超过 8px。
- 使用 Lucide 图标，图标按钮有 tooltip 和可访问名称。
- 不用文字胶囊替代熟悉的复制、下载、刷新、删除等图标。
- 固定工具条、缩略图和队列项尺寸，动态状态不得引发布局跳动。

### 10.1 桌面布局

```text
┌──────────────────────────────────────────────────────────┐
│ Model       Credits       Queue        Gallery   Settings│
├──────────────┬───────────────────────────────────────────┤
│ Rooms        │ Room timeline                             │
│ Search       │ Prompt / batch / result groups            │
│ + New        │                                           │
│              │                                           │
│              ├───────────────────────────────────────────┤
│              │ Sticky composer                           │
└──────────────┴───────────────────────────────────────────┘
```

左栏：房间搜索、新建、重命名、删除。

顶栏：模型、官方 credits、连接状态、任务抽屉、图库、设置。

主区：按 turn 分组显示 prompt 和批量结果。

底部：sticky composer。

### 10.2 Composer

- 多行 prompt 输入。
- text-to-image / image-to-image segmented control。
- 参考图拖放、粘贴、排序、删除。
- 模型参数面板。
- 数量 stepper 和快捷 `5x`。
- 预估任务数，不伪造价格。
- 提交、停止本地队列。
- 校验错误显示在对应控件附近。

### 10.3 移动端

- 房间栏和任务队列改为 drawer。
- Composer 保持底部可达，但展开参数时不得遮挡提交按钮。
- 图库使用 2 列或单列自适应网格。
- 触控目标至少 44px。
- 320px 宽度下不得横向溢出或文字覆盖。

## 11. 安全边界

本架构不能称为“交易所级安全”。浏览器保存 Key 的根本风险必须明确：同源 XSS、恶意浏览器扩展、被控制的设备或用户主动粘贴恶意脚本都可能读取 Key。

在无登录、无服务端 Key 托管前提下，采取以下最高可行措施：

### 11.1 前端

- 不加载第三方统计、广告、聊天组件或远程脚本。
- 生产 CSP 基线：`default-src 'none'`；nonce-based `script-src` 且禁止 `unsafe-inline`/`unsafe-eval`；`style-src 'self' 'unsafe-inline'`；`object-src 'none'`；`base-uri 'none'`；`frame-ancestors 'none'`；`form-action 'self'`；`font-src 'self'`；`connect-src` 只允许 self、精确 Kie upload host，以及 contract test 验证过的精确 result/download host；`img-src` 只允许 self、data、blob 和同一套已验证的 Kie 结果 host。
- 全站设置 `Referrer-Policy: no-referrer`、`X-Content-Type-Options: nosniff`；跨域图片使用 `referrerPolicy="no-referrer"`。
- 不使用 `dangerouslySetInnerHTML` 渲染 prompt、错误或上游数据。
- 只把图片 URL 放入受控的 `<img src>`，不生成可执行 HTML。
- 依赖保持最少，安装后执行 audit，并固定 lockfile。
- Key 输入禁用自动完成，复制和显示必须由用户主动操作。
- 默认掩码，短时显示后自动隐藏。
- 导出、错误报告和 debug 信息永不包含 Key。
- 完全不注册 Service Worker，避免其截获带 Authorization 的同源请求。

### 11.2 无状态代理

- 请求体和响应体使用 Zod 严格校验并限制大小。
- 模型 ID、endpoint、参数字段全部 allowlist。
- 拒绝任意 URL 转发，避免 SSRF/open proxy。
- `Origin` 只与部署配置中的 canonical HTTPS origin 精确匹配，不能从 `Host` 推导；缺失、`null` 或重复 Origin 对 Key routes 一律拒绝。代理不返回跨域 ACAO，也不启用 credentialed CORS。Origin 只防浏览器跨站调用，不是用户认证。
- 上游 fetch 固定 scheme、host、path，设置 `redirect: 'error'`、`cache: 'no-store'`、硬 timeout 和响应字节上限。只重建允许的 `Authorization`、`Content-Type` header，不透传浏览器 headers。
- Authorization 只接受单个、长度受限、字符集合法的 `Bearer` 值。
- Key routes 使用 `dynamic = 'force-dynamic'`、`revalidate = 0`。成功和错误响应均设置 `Cache-Control: private, no-store, max-age=0`、`CDN-Cache-Control: no-store`、`Vercel-CDN-Cache-Control: no-store` 和 `Pragma: no-cache`。
- 不记录 Authorization、prompt、参考 URL 或完整上游 body。
- 给代理设置请求超时和响应大小限制。
- 错误响应只返回稳定错误码和安全消息。
- Vercel WAF 对 Key routes 设置 IP/route 速率限制和请求体上限，控制公开代理的 hosting-cost DoS；这不引入账号或数据库。

### 11.3 Key 使用限制

- Key 仅在单次请求内存中存在于服务端。
- 不写 Cookie、数据库、日志、监控属性或 Vercel 环境变量。
- 生产日志必须通过测试确认没有 header/body 泄漏。
- 若 Kie 支持 Key 额度上限、IP 限制或轮换，应由用户在 Kie 控制台配置。
- Vercel 出站 IP 可能变化；使用 Kie IP allowlist 前必须单独解决固定出口。

### 11.4 仍然存在的风险

- localStorage Key 可被同源 XSS 和扩展读取。
- 没有登录意味着拿到设备的人可看到本地 prompt 和 URL。
- 浏览器数据损坏或清除会永久丢失工作区。
- Kie URL 的访问控制和保留期限不由本应用控制。
- 客户端限流可以被绕过，最终额度保护依赖 Kie 账号本身。
- Vercel 代理无法阻止已泄漏 Key 被攻击者从其他客户端直接使用。
- Kie 官方建议 API Key 不出现在前端；本产品因用户明确选择浏览器本地 Key 而接受这一冲突，所以不能承诺服务端托管 Key 的安全等级。

设置页必须以简短文字展示这些事实，不能用“绝对安全”描述产品。

## 12. Next.js 路由

建议路由：

```text
POST /api/kie/tasks
POST /api/kie/task-status
POST /api/kie/credits
POST /api/kie/download-url
GET  /api/health
```

所有携带 Key 的浏览器到应用请求统一使用 `POST` 和 `application/json`，确保浏览器提供可校验的 `Origin`，并避免 taskId 出现在代理访问日志 URL 中。代理再把 task-status 和 credits 映射为 Kie 上游的 `GET`。请求通过 `Authorization: Bearer <key>` 从浏览器传入，服务端不建立 session。`/api/health` 不接收 Key。

参考图上传由浏览器直达固定 Kie 上传接口，不增加应用自己的持久化 route。直传 fetch 禁止 redirect 和 cookies，FormData 字段固定，响应按独立 schema 校验。只有 fingerprint 匹配当前 Key 且未临近过期的 ReferenceUpload 才能进入任务 payload。若真实 contract test 失败，本版本阻断图生图上线，不临时加入不安全的媒体代理。

URL 按用途使用不同 schema：reference upload URL、Kie result URL、download URL 均要求 `https:`、默认 443、无 userinfo、无 IP/localhost、长度受限，并匹配 contract fixture 维护的精确 hostname allowlist。未知 host 的 URL 可以保留为元数据，但不得渲染、打开或传入下载代理，直到 allowlist 经验证更新。服务端永不抓取图片或跟随用户提供的 URL。

## 13. 错误处理

稳定错误类别：

- `KEY_MISSING`
- `KEY_INVALID`
- `CREDIT_INSUFFICIENT`
- `MODEL_VALIDATION_FAILED`
- `UPLOAD_FAILED`
- `UPSTREAM_RATE_LIMITED`
- `UPSTREAM_TIMEOUT`
- `UPSTREAM_UNAVAILABLE`
- `TASK_NOT_FOUND`
- `RESULT_URL_UNAVAILABLE`
- `LOCAL_STORAGE_FAILED`

规则：

- 错误卡片保留在对应 turn 中。
- 批次局部失败不隐藏成功图片。
- 创建歧义超时明确提示可能已经扣费。
- 未知任务只允许用户手动创建一条带 `retryOfLocalTaskId` 的新任务，并再次提示重复扣费风险；原 Task 永不重提。
- IndexedDB 写入失败时停止新增任务，避免远端已扣费但本地无记录。
- 存储配额不足时提供 JSON 导出和清理入口。
- 统一 logger 只接收 requestId、route、status 和稳定错误码；禁止记录 request、Headers、上游 body、error cause/config。上游错误即使回显 Key、prompt 或 URL，也必须在响应和日志前被替换。

## 14. 性能

- 图库使用虚拟化或分段渲染，目标支持至少 2,000 条 URL 元数据。
- 图片使用 `loading="lazy"` 和稳定 `aspect-ratio`。
- IndexedDB 查询按房间、状态、创建时间、收藏建立索引。
- 任务轮询按可见性和 next poll time 调度，不为每个卡片创建独立 timer。
- 不注册 Service Worker。浏览器只使用普通 HTTP cache 加载应用静态资源；Kie 图片、API 响应和 Key 不进入应用控制的离线缓存。
- 图片 URL 不通过 Next Image Optimization 代理，避免服务端间接缓存和远程域名维护；使用受控原生图片组件。
- 预览和下载链接只接受已验证 HTTPS URL，使用 `noopener,noreferrer`；禁止 iframe、object、embed 或 HTML 注入。ZIP 设置单文件、总字节和任务数上限，完成后及时 `URL.revokeObjectURL()`，不写 IndexedDB 或 Cache Storage。

## 15. 测试与验证

用户明确不采用 TDD。实施顺序是先完成垂直功能，再补充高价值测试和完整验证。

### 15.1 单元和集成测试

- 模型适配器 schema 和参数组合。
- `5x` 展开为五个独立任务。
- 队列限流、退避、局部失败和歧义超时。
- 双标签页同时打开时，同一 queued Task 只提交一次。
- queued、stale submitting、丢 Key和换 Key 的恢复。
- leader 在 POST 前后崩溃、lease 过期、迟到响应和手动 retry 的竞态；每个 submission attempt 最多一个不可变 `remoteTaskId`。
- `resultJson` 安全解析。
- IndexedDB migration、恢复、导入和导出。
- 本浏览器 credits 统计。
- URL 失效状态转换。
- 离线和临时网络错误不得误判 URL 过期。
- 上传随机命名、过期阻断和同名隔离。
- 捕获真实 multipart，断言 field 和 file part 的 filename/header/body 均不含原文件名或本地路径。
- 代理 allowlist、Origin、no-store 和敏感信息脱敏。
- DOM-XSS payload 覆盖 prompt、上游错误、导入 JSON 和模型 label，并扫描危险 DOM sinks。
- mock Kie 故意在错误中回显 Key、Authorization、prompt、URL，验证响应、日志和 trace 零命中。
- 对生产构建响应断言 CSP 为 enforce 而非 Report-Only、每个响应 nonce 有效且变化、`script-src` 不含 `unsafe-inline`/`unsafe-eval`；Playwright 注入 inline script 必须被阻止且 Key 不泄漏。

### 15.2 Playwright

- 首次 Key 设置与连接检查。
- 新房间 composer 为空。
- 复制 prompt 后手动粘贴到另一房间。
- `5x` 生成和部分失败展示。
- 模拟关闭/重开后的 taskId 补查。
- 双标签页 leader 切换与零重复提交。
- 同源标签页 Key 替换同步时只广播 fingerprint/版本，不广播明文 Key。
- 图库筛选、收藏、集合和破图占位。
- 单图下载和 ZIP 能力降级。
- 320px、768px、1440px 的布局与无重叠检查。
- 键盘导航、焦点、tooltip 和可访问名称。

### 15.3 完成门禁

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm run build
```

另外执行：

- `pnpm audit` 并检查高危依赖。
- Playwright 截图人工检查桌面和移动端 UI。
- 使用 mock server 覆盖全部任务状态。
- credits contract test 必跑；生产 origin 的 upload OPTIONS 与小文件 multipart smoke 必跑，使用专用测试 Key且不创建生成任务。
- 30 MB 上传边界作为图生图上线门禁；真实生成 smoke 由用户明确选择后执行，默认不消耗生成 credits。
- 检查生产日志，确认无 Key、prompt 和 Authorization 泄漏。

## 16. 验收标准

1. 无登录即可使用，项目中不存在邮箱、账户、组织或租户流程。
2. 不配置数据库、S3 或其他应用自有图片存储。
3. API Key、房间、任务和 URL 在不同浏览器或 origin 间互不共享。
4. 新房间为空，只能通过复制图标手动复制 prompt。
5. `5x` 可靠创建五个独立任务，多标签页下每个本地任务最多提交一次，并分别显示状态。
6. 已持久化 `remoteTaskId` 且已保留或重新提供 fingerprint 匹配 Key 时，页面重开后能补查未完成任务；没有 `remoteTaskId` 的歧义提交不自动重试。
7. 图库只保存 Kie URL 和元数据，不保存图片 Blob/base64。
8. URL 失效时显示占位并保留 prompt、参数和 taskId。
9. GPT Image 2 image-to-image 的输入数量、30 MB 上传门禁、临时 URL 过期、比例和分辨率约束正确。
10. 顶栏区分官方剩余 credits 与本浏览器计算统计。
11. 所有代理 route 无状态、no-store、严格 allowlist，且不记录敏感数据。
12. 桌面和移动端 UI 无遮挡、溢出和明显布局跳动。
13. `pnpm run build`、lint、typecheck 和测试全部通过。

## 17. 实施顺序

用户确认本规格后：

1. 初始化 Next.js、TypeScript、pnpm、Tailwind、shadcn/ui。
2. 建立模型适配器、Zod schema 和无状态 Kie proxy。
3. 建立 Dexie schema、migration 和本地 Key 设置。
4. 实现房间、composer、批量队列和恢复轮询。
5. 实现 GPT Image 2 text-to-image 与 image-to-image。
6. 验证 Kie File Upload CORS，并实现参考图上传路径。
7. 实现 URL 图库、失效状态和下载降级。
8. 实现 credits 状态与本地统计。
9. 增加其他已验证模型适配器。
10. 补充测试，完成 build、UI 和安全验证。

## 18. 官方参考

- GPT Image 2 image-to-image：<https://docs.kie.ai/market/gpt/gpt-image-2-image-to-image>
- GPT Image 2 Playground：<https://kie.ai/gpt-image-2?model=gpt-image-2-image-to-image>
- Kie 接入与速率限制：<https://docs.kie.ai/1973359m0>
- Kie 查询任务：<https://docs.kie.ai/market/common/get-task-detail>
- Kie account credits：<https://docs.kie.ai/common-api/get-account-credits>
- Kie file upload：<https://docs.kie.ai/file-upload-api/quickstart>
- Kie file stream upload：<https://docs.kie.ai/file-upload-api/upload-file-stream/>
- Kie direct download：<https://docs.kie.ai/common-api/download-url>
- Vercel 4.5 MB body limit：<https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions>

实现期间必须以当前官方文档和真实 API 响应为准。若文档与响应不一致，适配器应拒绝未知结构并记录不含敏感内容的诊断信息，而不是猜测字段。
