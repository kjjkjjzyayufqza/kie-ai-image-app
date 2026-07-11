# Kie AI Image App 安全优先产品与技术设计

日期：2026-07-11  
状态：待用户书面审阅  
仓库：`kie-ai-image-app`

## 1. 执行摘要

Kie AI Image App 是公开注册、多租户、用户自带 Kie API Key 的图片生产工作台。任何人可以注册，但匿名用户不能生成图片；完成邮箱验证、强制 MFA/Passkey 并连接自己的 Kie 凭据后，才能提交任务。

产品支持文本生图、图生图、多房间、同 prompt 批量生成、复杂参数批次、关闭浏览器后继续运行、Kie webhook、服务端补查、永久资产归档、实时 credits 与资产库。

安全是首要设计约束。浏览器、Next.js Web 运行时、日志、数据库备份和普通管理员都不能取得已保存的 Kie 明文 Key。核心架构为：

```text
Browser
  -> Vercel WAF / Bot Management
  -> Next.js BFF on Vercel
  -> Auth0 Universal Login
  -> Neon Postgres with FORCE RLS + transactional outbox
  -> AWS SQS FIFO + isolated Lambda workers
  -> AWS KMS / Kie API / private S3

Kie webhook
  -> AWS API Gateway + AWS WAF
  -> isolated webhook Lambda
  -> inbox/outbox -> SQS -> authoritative recordInfo -> private S3
```

`localStorage` 只保存非敏感 UI 偏好和未提交草稿。Kie API Key、webhook HMAC、Auth0 token、session、signed URL 永不进入 `localStorage`。

“交易所级”在本设计中表示采用金融级控制思路，不代表自动取得任何认证。公开上线仍必须通过独立渗透测试、密钥轮换、恢复演练、持续监控、事故响应和值班制度。

## 2. 产品模式

### 2.1 首发模式：公开多租户 BYOK

- 用户公开注册。
- 每个用户可连接多个自己的 Kie 账户/Key。
- 每个连接必须同时配置 Kie API Key 和 Kie webhook HMAC Key。
- 每个连接独立显示 credits、状态、任务、消费和健康度。
- 每个任务固定绑定一个 connection 和 credential version。
- 用户只看自己的连接、任务、资产和统计。

### 2.2 禁止的首发模式

- 禁止匿名生成。
- 禁止把一个共享 Kie Key 暴露给所有用户消费。
- 禁止在浏览器保存 Kie Key。
- 禁止只靠前端限流控制付费调用。
- 禁止把平台共享 credits 与 BYOK 混在同一账务模型。

如果未来由平台承担 credits，必须单独设计预付双重记账账本、原子额度预留/结算、支付、退款、反欺诈和全局熔断，不属于本规格。

## 3. 目标

1. 完整支持 GPT Image 2 Text-to-Image 和 `gpt-image-2-image-to-image`。
2. GPT Image 2 图生图支持最多 16 张有序参考图、单张 30MB、1K/2K/4K 和官方比例限制。
3. 支持同一 prompt 一次生成 `1-10` 张，包括 `5x`。
4. 支持多 prompt 批次、参数预设、参数扫描和高级 JSON。
5. 支持多个独立房间；新房间为空，不自动继承隐藏 prompt 或描述词。
6. 只通过 Copy 图标复制可见 prompt，再由用户手动粘贴。
7. 浏览器关闭后，任务仍能提交、补查、完成和归档。
8. 输入和生成图片永久存入用户隔离的私有对象存储，不依赖 Kie 临时 URL。
9. 提供永久资产库、标签、收藏、集合、比较、搜索、谱系和导出。
10. 近实时显示当前连接的官方 credits、任务、消费、队列、webhook 和归档健康。
11. 使用白色 shadcn/ui 风格，桌面和手机无重叠、截断或布局跳动。
12. 通过强身份、KMS、RLS、WAF、多维限流、幂等、审计、备份和上线门禁保护用户。
13. 不采用 TDD；垂直功能完成后集中执行逻辑、集成、安全、浏览器和构建验证。

## 4. 非目标

1. 不使用 File System Access API，不自动写入用户电脑目录。
2. 不做团队协作、组织 RBAC、评论或审核流。
3. 不在首发提供平台共享 credits 或收费账本。
4. 不把 Vercel/AWS 临时文件系统当持久层。
5. 不把 Kie 临时 URL 当最终资产地址。
6. 不实现房间间隐藏上下文或自动 prompt 拼接。
7. 不显示完整 Kie Key、HMAC Key、Auth token 或 signed URL。
8. 不伪造 Kie 未公开的 Key 名称、创建时间、过期时间、cap 或账单字段。
9. 不直接信任 webhook body 中的状态或结果 URL。
10. 不声称只靠代码即可达到交易所合规等级。

## 5. 安全原则

1. 默认拒绝，最小权限。
2. 身份、租户、credential 和 asset 都由服务端推导，不接受客户端声明所有者。
3. Web、credential ingest、credential authorization、webhook、Kie execution、media worker 和管理员权限分离。
4. 密钥只在最小 worker 内存中短暂解密。
5. 所有付费调用必须服务端授权、限流、幂等和审计。
6. 所有外部输入，包括 Kie 官方结果 URL，都视为不可信。
7. 数据库 RLS 是第二道授权边界，不替代应用授权。
8. 任何 at-least-once 执行都必须幂等。
9. 生成成功和永久保存是两个独立状态。
10. 安全关键依赖故障时，生成、密钥修改和账户恢复 fail closed。
11. 安全事实必须可审计、可撤销、可告警、可恢复。

## 6. 身份与会话

### 6.1 身份提供商

- 使用 Auth0 Universal Login，不自建密码系统。
- 使用 OIDC Authorization Code Flow with PKCE。
- production、preview、development 使用完全独立的 Auth0 tenant、client 和 callback allowlist。
- 用户必须验证邮箱。
- Passkey/WebAuthn 为首选登录方式。
- MFA 对所有生成用户强制开启；允许 WebAuthn 安全钥匙、平台生物识别和 TOTP。
- SMS 不作为密钥修改、账户恢复或管理员操作的高可信因子。
- 恢复码只显示一次，存储 hash，使用后立即失效。

### 6.2 Auth0 攻击防护

- 开启 breached password detection。
- 开启 brute-force、suspicious IP 和 bot protection。
- 高风险登录启用 Adaptive MFA；若计划不支持 Adaptive MFA，则使用 Always MFA。
- 注册、登录、重置和恢复使用 CAPTCHA/managed challenge 作为辅助控制。
- 错误响应不暴露邮箱是否存在。
- Auth0 日志实时流入 SIEM。

### 6.3 会话

- Browser 只持 `__Host-kie-session; HttpOnly; Secure; SameSite=Lax; Path=/` cookie，不设置 Domain。
- JWT、access token 和 rotating refresh token 由 BFF/Auth0 SDK 管理，不进入 `localStorage`。
- 应用另建 server-side session registry：随机 opaque session ID，cookie 存原值，数据库只存 hash、user/tenant、device、Auth0 token-family、idle/absolute expiry、last_seen 和 revoked_at；每次 BFF 请求都校验，保证被盗 cookie 可立即撤销。
- Access token 短期有效；refresh token rotation 开启 reuse detection。
- 应用会话 30 分钟 idle、12 小时 absolute。
- 登录、step-up、角色变化和恢复后旋转 session ID。
- 用户可查看并撤销设备会话。
- 登出、密码/Passkey 重置、异常 token reuse 和账户恢复会撤销相关 token family。
- OIDC 固定 issuer、audience 和允许算法；严格验证 JWKS、state、nonce、PKCE、`iss/aud/exp/iat`。
- 所有 GET 无副作用。所有 mutation 校验精确 production Origin、session-bound CSRF token 和 Content-Type；CORS 使用 exact allowlist，不回显任意 Origin。

### 6.4 Step-up

以下操作要求 5 分钟内完成 phishing-resistant MFA 或等价 fresh MFA。成功后服务端创建绑定 session、action、target、nonce、2 分钟有效且一次消费的 step-up transaction marker；API 同时验证 Auth0 `auth_time`、`amr/acr` 和 marker，不能只信 UI 或陈旧 token：

- 添加、轮换、禁用、紧急销毁 Kie credential。
- 查看安全中心和撤销其他会话。
- 导出全部资产。
- 永久删除资产或账户。
- 修改存储/任务/消费上限。
- 管理员权限变化和安全配置。

### 6.5 恢复

- 失去原 MFA 的恢复触发 24 小时安全冷却。
- 冷却期间禁止生成、credential 变更、导出和账户删除。
- 通知全部已验证渠道和现有会话。
- 恢复完成后撤销旧会话、旧恢复码和 remembered browser。

## 7. 多租户隔离

### 7.1 Tenant 来源

- 首发固定 `1 user = 1 tenant`；注册事务同时创建 `users`、`tenants` 和唯一 owner `tenant_memberships`。
- Auth0 `sub` 只映射内部随机 user UUID，再通过 membership 得到 tenant UUID。
- 任何 API 都不接受客户端 `tenant_id` 作为授权依据。
- 所有对象查询从已验证 session 派生 tenant。
- 首发不提供邀请或第二成员；保留 membership 表只是为了让 owner/tenant 语义和 RLS 一致，不代表已实现团队功能。

### 7.2 Postgres RLS

- 所有业务表含 `tenant_id NOT NULL`。
- 跨表关系使用 `(tenant_id, id)` composite foreign key，防止跨租户关系注入。
- 所有 tenant 表执行 `ENABLE ROW LEVEL SECURITY` 和 `FORCE ROW LEVEL SECURITY`。
- Web runtime DB role 不是 table owner，必须 `NOBYPASSRLS`。
- 在同一事务使用 `set_config(..., true)` 设置 tenant context，禁止连接池 session 级 `SET` 泄漏。
- 应用层仍显式加入 tenant 条件并检查所有权。

### 7.3 数据库角色

- `web_runtime`：只能执行用户范围查询和允许的 stored procedures。
- `webhook_runtime`：只能读取 connection 验签元数据、写 inbox/outbox。
- `dispatcher_runtime`：只能 claim outbox 和 job lease。
- `worker_runtime`：只能执行窄 stored procedures，参数必须含已绑定 tenant/job ID。
- `migration_runtime`：DDL 权限，无 credential 解密能力。
- `security_audit_runtime`：append-only 写权限。

### 7.4 跨租户 bootstrap

Webhook、dispatcher 和 worker 在取得 tenant context 前不得直接扫描 tenant 表。数据库提供极窄 `SECURITY DEFINER` procedures：

- `resolve_callback_route(route_keyed_hash)`。
- `claim_outbox(operation_id)`。
- `resolve_worker_job(job_id, fencing_token, allowed_operation)`。

这些 procedure 使用 dedicated NOLOGIN owner、固定 `search_path`、无 dynamic SQL、`REVOKE ALL FROM PUBLIC`，输入只接受 opaque hash/ID；原子返回已绑定 tenant/job/operation并在同一事务设置 transaction-local tenant context。调用者提供的 tenant 永不参与授权决定。

## 8. Kie Credential Vault

### 8.1 数据结构

每个用户可有多个 `provider_connections`。每个连接有独立 API Key version 和 HMAC version：

- `provider_connections`：tenant、用户自定义 label、状态、公开 callback locator、active versions、健康和 credits cache。
- `credential_secret_versions`：secret kind、version、ciphertext、nonce、tag、wrapped DEK、KMS key ID、状态、created/destroyed time。
- `keyed_fingerprint`：由 credential ingest 通过独立 AWS KMS HMAC key 计算，用于 UI 识别和内部去重，不支持还原 Key，也不需要在环境变量保存 fingerprint pepper。

UI 只显示 label、短 fingerprint、状态、最近验证和轮换时间，不再次显示完整 Key 或真实前后缀。

### 8.2 Envelope encryption

1. Credential broker 为每个 secret version 生成随机 256-bit DEK。
2. 使用 AES-256-GCM 加密 API Key 或 HMAC Key。
3. 使用 AWS KMS customer-managed symmetric key 包裹 DEK。
4. Encryption context/AAD 绑定：

```text
app, environment, tenant_id, connection_id, provider, secret_kind, version
```

5. context 不含邮箱、Key、prompt 或其他敏感文本，因为 AWS CloudTrail 会记录它。
6. 数据库只保存 ciphertext、nonce、tag 和 wrapped DEK。

### 8.3 AWS 身份

- Vercel 与 AWS 使用 OIDC federation 获取短期凭据；禁止保存 AWS Access Key。
- environment、project 和 role 写入 AWS trust policy 条件。
- production、preview、development 使用不同 AWS account/role/CMK。

### 8.4 服务权限分离

- Next.js Web/BFF：无 KMS Decrypt；不能读取历史 Key。
- Credential ingest：接收浏览器直达的新 plaintext、验证、GenerateDataKey/Encrypt；不能解密已有 secret。
- Credential authorization service：无公网业务入口、无 Kie/媒体 egress；验证 DB operation、lease、fencing token 后，为 exact tenant/connection/kind/version 创建短 TTL、exact encryption-context 的 per-operation KMS grant。
- Webhook verifier：只能使用 credential authorization service 获取当前 route 所需 HMAC grant，不可选择或解密 API Key。
- Kie execution service：只能使用已签发的单 operation grant；内部解密后调用固定 Kie endpoint，永不向 caller 返回 API Key。
- Media worker：无 credential Decrypt 权限。
- Migration/admin：无业务 credential Decrypt 权限。

KMS-capable identities 只属于 AWS Lambda control-plane execution roles；ECS Fargate media role和 Vercel OIDC 均无 Decrypt，Vercel 最多取得 enqueue/invoke/presign 窄权限，永远不能 AssumeRole 到 Decrypt role。API Key 与 webhook HMAC 使用不同 CMK，KMS policy 强制 app/environment/secret_kind context。Per-operation grant 在完成后 retire，watchdog 撤销泄漏 grant。

Credential authorization service 是密钥系统的最高敏感 root of trust；隔离 account/VPC、无用户入口、最小代码和双人审批。它仍是系统性 blast radius，不能用“encryption context”虚假声称完全消除运行时风险。

明文只在 credential ingest 或单次 Kie execution 内存中短暂存在，不进入 Next.js runtime、SQS、outbox、service 参数持久层、返回值、日志、trace 或异常。Buffer 使用后 best-effort 清零。

### 8.5 连接向导

1. 用户完成 step-up。
2. Browser 生成 ephemeral P-256 DPoP key，并向 BFF 申请 `credential_enrollment_intent`。
3. BFF 校验 session 和 fresh step-up，创建绑定 tenant/user/session/action/DPoP public key、2 分钟有效、一次消费的 opaque capability；数据库只存 capability hash。
4. Browser 将 Kie API Key、Kie webhook HMAC Key、label、capability 和 DPoP body proof 直接 POST 到隔离 AWS credential-ingest endpoint；精确 CORS 只允许 production app Origin。Next.js runtime 不接触 plaintext。
5. Credential ingest 原子消费 capability，执行严格长度/格式、多维限流和 DPoP 校验。
6. Credential ingest 用新 Key 调 `/api/v1/chat/credit` 验证连接，再立即 envelope encrypt。
7. 响应只返回 connection ID、fingerprint、credits 和时间；capability/DPoP key 立即失效。
8. 用户应为应用创建专用、低额度 Kie Key，并在 Kie 控制台设置小时/日/总量 cap。
9. UI 显示 AWS worker NAT EIP 集合；用户可在 Kie 开启 IP allowlist。

### 8.6 轮换和删除

- API Key 与 HMAC Key 独立版本化，不覆盖历史版本。
- 新任务只用 active version；旧任务固定原 version。
- Graceful disable：立即拒绝新任务，旧 secret 在 live 数据中保留到关联任务 terminal 且资产归档完成，然后逻辑删除 live wrapped DEK。
- Emergency destroy：立即删除 live wrapped DEK；未完成任务标 `orphaned_credentials`，不再调用 Kie，也不信 webhook URL。
- Kie 外部先撤销导致 401：connection 标 `revoked_external`，任务标 `blocked_auth`。
- 应用删除 Key 不等于远端撤销；UI 明确要求用户在 Kie 控制台撤销。
- HMAC verifier 最多尝试 active 和一个未过 grace 的 previous version，禁止遍历全部历史 secret。
- 删除 live wrapped DEK 不等于立即清除 PITR、逻辑备份或 WORM 副本。Restore pipeline 必须重放 deletion tombstones，备份到期后才物理消失。
- 每个 tenant 使用独立 KMS KEK；账户永久删除在法定/运营冷却期后安排 KEK deletion，才能实现 tenant 级最终 crypto-erasure。

## 9. Kie 官方能力边界

### 9.1 GPT Image 2 Image-to-Image

```text
POST https://api.kie.ai/api/v1/jobs/createTask
model = gpt-image-2-image-to-image
```

- `prompt`：必填，最多 20,000 字符。
- `input_urls`：必填，最多 16 个。
- 输入格式：JPEG、JPG、PNG、WEBP。
- 单张输入：最多 30MB。
- `resolution`：`1K | 2K | 4K`。
- `aspect_ratio`：`auto`、`1:1`、`3:2`、`2:3`、`4:3`、`3:4`、`16:9`、`9:16`、`2:1`、`1:2`、`3:1`、`1:3`、`21:9`、`9:21`、`5:4`、`4:5`。

采用更严格的官方描述并集：

- `auto` 只允许 1K。
- `1:1` 不允许 4K。
- `5:4`、`4:5` 只允许 1K。
- `3:1`、`1:3`、`9:21` 不允许 2K/4K。

该模型未公开 `num_images`、seed、mask、strength、quality、output format 或 cancel。生成五张必须创建五个任务。GPT Image 2 未承诺百分比进度，UI 不显示虚假进度。

### 9.2 查询

```text
GET https://api.kie.ai/api/v1/jobs/recordInfo?taskId=...
```

- 状态：`waiting | queuing | generating | success | fail`。
- `resultJson` 是 JSON 字符串，通常含 `resultUrls`。
- 可含 `creditsConsumed`、时间和错误。
- 查询建议 2-5 秒；每 Key 每秒最多 10 次。
- 任务创建默认每账户每 10 秒最多 20 次。

### 9.3 Webhook HMAC

```text
base64(HMAC-SHA256(taskId + "." + timestamp, webhookHmacKey))
```

- timestamp 来自 `X-Webhook-Timestamp`。
- signature 来自 `X-Webhook-Signature`。
- HMAC 不覆盖 state、result URL 或 callback locator。
- Webhook 只能唤醒；worker 必须使用该任务固定的 API Key version 调 `recordInfo`。

### 9.4 Credits 与 Key 信息

Kie 公开 API 可获取：

- `/api/v1/chat/credit` 的当前剩余 credits。
- 已知 task 的状态、错误、时间和 `creditsConsumed`。

Kie 未公开 API 获取：

- Key 名称、ID、创建时间、过期时间。
- 小时/每日/总量 cap 和剩余 cap。
- Key 列表、轮换、撤销、完整账单和全部历史任务。

UI 只展示官方余额、采样时间和本应用聚合统计，不伪造不可查字段。

### 9.5 临时 URL

Kie 文档对结果保留存在 24 小时与 14 天两种描述。系统按最短窗口处理：终态后立即归档到 S3；UI 永远不直接依赖 Kie URL。

## 10. Durable 任务架构

### 10.1 接受请求

1. 用户提交 generation request，并提供 tenant-scoped `Idempotency-Key`。
2. 服务端验证 Auth0 session、tenant、connection、模型 schema、输入 Asset、quota、rate 和 kill switch。
3. 同一 Postgres 事务创建 Turn、Batch、N 个 queued Job、credit/storage reservation 和一条 scheduler-wakeup outbox；此时不直接产生 submit SQS message。
4. 唯一 `(tenant_id, Idempotency-Key)` 保证 100 次重放只创建一个 Batch。
5. 事务提交后返回 202；此时浏览器可安全关闭。

### 10.2 Transactional outbox

- API 只在 Job 与 scheduler-wakeup outbox 同时提交后返回成功。
- 请求尾部 best-effort 唤醒 dispatcher。
- AWS EventBridge 每分钟启动 outbox dispatcher，恢复“DB 已提交但投递前崩溃”的窗口。
- Dispatcher 使用原子 claim、短 lease、fencing token 和 `FOR UPDATE SKIP LOCKED` 或等价机制。
- Outbox 只含 tenant/job/connection/version 等 ID，不含 Key、HMAC、prompt、signed URL 或 output URL。
- DB scheduler 按 tenant 公平和 priority 原子 claim eligible Job，重新检查 pause/cancel/kill switch 后，才在同一事务写 submit outbox。
- SQS message 只含 Job ID 和 operation ID。

### 10.3 SQS 与 worker

- 使用 AWS SQS FIFO queues 和 DLQ；message group 按 connection/job 分组。
- 队列至少分为 submit、reconcile、archive、account-refresh、asset-export。
- Consumer 按 at-least-once 设计；每一步先 CAS 状态和 fencing token。
- Submit consumer 在任何网络调用前提交 one-shot ProviderAttempt 状态 `prepared -> create_started`；只有持有有效 fencing token 的 attempt 可进入 `create_started`。
- 一旦 `create_started` 提交，任何 worker crash、lease 失效、响应丢失或 DB commit 失败都使 attempt 进入 `submission_uncertain`，绝不自动再次 POST。
- Kie execution service 通过 credential authorization service 的 per-operation KMS grant 使用 Job 固定 credential version，内部调用 Kie，永不返回 Key。
- `429` 明确未入队，可安全退避重试。
- timeout、connection reset 和不明确 `5xx` 标 `submission_uncertain`，禁止自动再次 create，避免重复扣费。
- `retry-generation` 等任何可能产生新 Kie 费用的 mutation 都要求新的 tenant-scoped Idempotency-Key，并明确创建新的 ProviderAttempt/成本风险。

### 10.4 分布式限流与资源授权

每次提交原子检查：

- user/tenant/connection/IP/设备速率。
- user 和 connection 活动并发。
- Kie 创建 18/10s 安全桶。
- Kie query 低于 10/s。
- 每批任务数、Batch Matrix 总任务数。
- 每日上传字节、永久存储、导出和 SSE/轮询额度。
- 用户设定的本应用 credits 日/月预算。

限流存储故障时生成 fail closed；只读历史可降级。

Kie 没有公开 account ID，多个 connection 可能属于同一 Kie account。首发对同一 tenant 的全部 Kie connection 共享一个保守的创建/query safety bucket；不把 connection 错当独立账户，也不允许用户声明分组来放宽官方账户级限制。

### 10.5 暂停和取消

- Scheduler 支持优先级和公平队列。
- 尚未 claim/提交的 Job 可暂停、继续和取消。
- 取得 provider taskId 后，若模型无 cancel API，只能隐藏/静音；服务端仍必须补查和归档。
- 全局、tenant、user、connection 四级 kill switch 在 DB 中控制，1 分钟内生效，不依赖重新部署。

## 11. 多租户 Webhook

### 11.1 Callback locator

- Submit worker 在调用 Kie 前生成 192-bit opaque `callback_route_id`，先提交 keyed route hash 与 Job 绑定，再把 plaintext route 仅放入本次 Kie create request。
- Callback：`https://hooks.example.com/api/webhooks/kie/v1/{route}`。
- Submit/webhook 服务通过独立 AWS KMS HMAC key 计算 route keyed hash；DB 和 tombstone 只存 hash，不存 plaintext。route hash 先落库再提交 Kie，解决 callback 早于 create response。
- route 是高熵定位符，不是认证 secret；真正认证仍是 connection 的 Kie HMAC。
- route 不含 tenant/user/connection 可读信息；API Gateway access log format、AWS WAF sampled request 和应用日志都必须省略/脱敏 URI path。

### 11.2 验签

1. API Gateway/AWS WAF 执行 IP/route rate limit 和 64KB body limit。
2. Lambda 严格验证 Content-Type、JSON、taskId 长度/字符和 header 唯一性。
3. timestamp 必须是十进制 Unix 秒，允许窗口正负 300 秒。
4. Base64 严格解码后必须 32 bytes。
5. 用 route 找到候选 connection 和 active/previous HMAC version。
6. Webhook role 只解密 HMAC secret，常量时间比较等长 digest。
7. 相同 `(connection_id, taskId, timestamp)` 为同一事件；signature/payload digest 仅用于诊断。
8. 完全相同的已接收重放即使过时也返回 200 no-op，减少 provider 重试；新伪造请求拒绝。

### 11.3 可信边界

- Callback 不能创建 Job、选择 tenant、选择 credential 或提供可抓取 URL。
- 除 taskId 外的 callback body 字段全部忽略。
- 验签后写 inbox + outbox，p95 目标低于 500ms，然后返回 200。
- Worker 用固定 API key version 查询 `recordInfo`。
- `recordInfo.taskId` 与 create response、connection 必须一致；`recordInfo.param.callBackUrl` 的 route keyed hash 也必须匹配。若上游未返回 param，则等待 create response 绑定，不能弱化校验。

### 11.4 早到、重复和乱序

- 早到 callback 先写 signed claim；create response 返回后用 partial unique `(connection_id, provider_task_id)` CAS 绑定。
- create response 与 callback taskId 不一致时不自动选择任何一方。
- 重复回调只产生一个 authoritative query 和一个 Asset。
- terminal 状态单调，迟到 fail 不覆盖 success/archived。
- 已删除 route 保留无 tenant 信息的 tombstone，late callback 返回 200 并丢弃。

### 11.5 HMAC 激活门槛

- 公开首发强制配置并验证 HMAC；缺少 HMAC 的 connection 保持 `incomplete`，不能提交生成。
- Durable polling 始终作为已激活 connection 的漏回调补偿，不是绕过 HMAC 设置的替代模式。
- Callback locator 不能替代官方 HMAC，也不能授权结果抓取。

## 12. 补查和浏览器关闭

- Submit worker 成功保存 taskId 后安排 reconcile。
- Webhook 为主，durable polling 为补偿。
- 前 15 分钟按 Kie 建议退避查询。
- 之后在 30 分钟、2 小时、6 小时和 23 小时低频补查。
- 任意时刻收到可信 callback 会立即唤醒。
- 浏览器是否打开不参与任务生命周期。
- Worker/函数/部署重启不丢状态；DB 是事实源，SQS 是执行器。
- DLQ、卡住 lease 和 stale Job 由 watchdog 告警并支持安全重放。

## 13. 资产安全与永久归档

### 13.1 存储

- 使用 private Amazon S3。
- 开启 Block Public Access、versioning、SSE-KMS、bucket policy 最小权限。
- Object key 只由服务端生成：`tenants/{tenantId}/assets/{assetId}/{variant}`。
- 用户输入不能成为 object key 或任意 path。
- 每个对象记录 checksum、bytes、magic MIME、尺寸、owner 和状态。

### 13.2 上传

1. Browser 只提交文件名、声明 MIME、bytes 和目标模型。
2. BFF 从 session 推导 tenant，原子预留 storage quota，预分配 quarantine Asset；无 reservation 不签 URL。
3. 服务端签发 exact key 的 S3 presigned POST policy，包含 `content-length-range`、允许 MIME、SSE-KMS、短 TTL 和禁止覆盖条件；不使用无法可靠限制大小的普通 presigned PUT。
4. Browser 直接 POST 到 S3，绕过 Vercel Function payload 限制。
5. Finalize 只接受 Asset ID；服务端从 DB 取 key 后执行 HEAD、ETag、实际字节、magic bytes、完整解码、像素/帧上限。
6. 只允许 JPEG/PNG/WebP；拒绝 SVG/GIF、polyglot、截断和解码失败。
7. 隔离 media worker 生成去 EXIF 的安全预览 derivative；原图保持 private，不能 inline 执行。
8. 未 finalize/失败/过期 upload intent 释放 quota reservation 并在 24 小时内清理对象；若未来启用 multipart，必须同时 abort incomplete multipart。

### 13.3 Kie 输入

- Job 保存输入 Asset ID 和顺序，不保存浏览器 URL。
- Kie caller 在 create 前为 exact S3 object 生成 GET-only presigned URL。
- URL TTL 足够 Kie 读取但尽量短；URL 不进入 DB、SQS、日志或 trace。

### 13.4 输出抓取与 SSRF

Archive queue 和 outbox 只传 Job ID。Kie execution service 使用 per-operation grant 调 `recordInfo`，清零 API Key 后，将 result URL 通过 private VPC mTLS 的单次内存请求交给 Media Fetch Fargate；URL 不写 DB/SQS/log。Media service 归档到 quarantine S3，只返回 Asset ID/checksum/metadata。失败重试重新按 Job ID 调 `recordInfo`，不保存 URL。

Kie execution service egress 只允许 `api.kie.ai`；Media Fetch Fargate 无 KMS credential Decrypt 权限，所有外部访问强制经过受控 egress proxy。即使 URL 来自 Kie `recordInfo`，仍视为不可信：

- 只允许 HTTPS、443、无 userinfo。
- 每个模型适配器维护精确 CDN hostname；禁止 wildcard/suffix。
- 自定义 resolver/HTTP agent 验证完整 CNAME 链并拒绝 loopback、private、link-local、metadata、reserved、multicast、IPv6 特殊和 IPv4-mapped 地址。
- 实际 socket 连接固定到已验证公共 IP，同时保留原 hostname 做 TLS SNI、证书和 Host 校验；禁止普通 `fetch(hostname)` 二次解析造成 DNS rebinding。
- `redirect: manual`，最多两跳，每跳重新校验 scheme/host/port/DNS/IP。
- 禁用代理环境变量和自动解压；抓取请求不携带 Kie Authorization、cookie、S3 token 或其他 credential。
- 连接、总时长、Content-Length、实际流 bytes、解码像素和帧数均有硬上限。
- 默认单图 64MB、100MP；模型适配器只能收紧，放宽必须安全评审。
- magic MIME 与 adapter allowlist 不符时进入 quarantine。

### 13.5 幂等归档

- 权威 success 后 upsert pending Asset，再抓取。
- S3 key 和 `(tenant_id, job_id, output_ordinal)` 唯一。
- 上传成功但 DB commit 失败时，retry HEAD/checksum 后 finalize，不重复对象。
- Kie 完整 URL 不持久化；失败重试重新调用 `recordInfo`。
- generation 和 archive 分开状态，Kie success + S3 fail 显示“生成成功，保存失败”。

### 13.6 查看、下载和删除

- View/download API 只接受 Asset ID，服务端经 RLS/所有权查 S3 key。
- Inline view 只签已经完整解码、去 EXIF、重编码的安全 derivative；原图只能以 `Content-Disposition: attachment` 和安全 `Content-Type` 下载。
- 签发 exact key、GET-only、最长 5 分钟 URL；S3 response headers 也固定 disposition/type/no-store，不能只给 BFF JSON 加 header。
- 响应设置 `Cache-Control: private, no-store`、`Referrer-Policy: no-referrer`。
- 403/过期最多自动重签一次。
- 删除先进入 30 天 Trash；永久删除需 step-up。
- 被谱系引用的 Asset 保留关系 tombstone，不能造成跨租户引用。

## 14. 数据模型

核心表：

- `users`：Auth0 subject 映射、状态和安全冷却。
- `tenants`、`tenant_memberships`：首发一对一 owner 关系和 RLS 边界。
- `provider_connections`：tenant、label、state、callback public data、credits cache。
- `credential_secret_versions`：envelope ciphertext 和生命周期。
- `rooms`：tenant、标题、状态、时间。
- `turns`：prompt、模型、参数快照、输入顺序。
- `generation_batches`：idempotency key、数量、汇总状态。
- `generation_jobs`：双状态、固定 connection/API key version、callback keyed hash。
- `provider_attempts`：每次 create、provider taskId、时间、error、credits。
- `webhook_inbox`：keyed route hash、taskId、provider timestamp、signature/payload digest、verdict；语义唯一键不含 digest，不存 raw body/signature。
- `outbox_events`：ID-only payload、lease、fencing token、attempt、available time。
- `assets`：tenant、job、S3 key、checksum、bytes、MIME、尺寸、archive state。
- `asset_relations`：input/output/parent/child/order。
- `tags`、`asset_tags`、`collections`。
- `saved_prompts`、`parameter_presets`。
- `credit_snapshots`：connection、official balance、latency、observed time、error class。
- `rate_limit_buckets`、`quota_reservations`、`kill_switches`。
- `security_audit_events`：append-only 安全事件，不含敏感值。
- `callback_tombstones`：删除后处理 late callback 的无 PII locator hash。
- `deletion_tombstones`：credential/asset/account 删除序列，restore 后优先重放，防备份数据复活。

关键约束：

1. 所有业务关系使用 tenant composite FK。
2. `(tenant_id, client_idempotency_key)` 唯一。
3. `(connection_id, provider_task_id)` partial unique。
4. `(tenant_id, job_id, output_ordinal)` Asset 唯一。
5. Outbox dedupe key 唯一。
6. Webhook replay key 唯一。
7. Job 固定 credential version，不随 active version 改变。
8. 终态不可回退。
9. 新 Room 不复制旧 prompt 或参数。
10. 临时 URL、secret、token 不进入业务表。

双状态机：

```text
generation:
queued -> submitting -> waiting -> generating -> succeeded | failed | uncertain | blocked_auth

archive:
not_ready -> pending -> ingesting -> ready | failed | quarantined
```

## 15. Credits 与近实时状态

### 15.1 数据来源

- 官方：Kie `/chat/credit` 当前余额和采样时间。
- 官方任务：已知 task 的 `creditsConsumed`、状态和耗时。
- 本应用统计：今日/7 日/30 日任务、消费、成功率、模型分布、归档和存储。

所有字段标记“官方”或“本应用统计”。余额超过 60 秒未更新显示 stale，不把错误显示成 0。

每个 connection 都可单独调用 credit API，但多个 Key 可能返回同一 Kie account 余额。UI 称其为“该 credential 查询到的账户余额”，不声称各 connection 拥有相互独立的 credits。

### 15.2 刷新

- 打开、聚焦、提交、terminal 后触发 account-refresh SQS。
- 每个 connection 使用 Postgres single-flight 和 15 秒最短 TTL。
- 并发标签页/请求合并为一个 Kie 上游请求。
- 401 标 revoked_external；429/5xx 保留旧余额、时间和 stale/error，不覆盖成 0。

### 15.3 UI

顶栏：

- 当前 connection label/fingerprint。
- 官方 credits。
- last checked/stale。
- active/failed/archive backlog。

账户中心：

- Connection 状态、fingerprint、最后验证/轮换、延迟和最近错误。
- 官方 credits。
- 本应用消费和模型统计。
- Webhook/HMAC、poll fallback、DLQ 和 archive 健康。
- 存储 bytes、Asset 数和 quota。
- 专用 Kie Key cap/IP allowlist 配置状态由用户确认，不伪称 API 可读取。

### 15.4 传输

- 活动页面使用 tenant-authenticated SSE 或 2 秒轮询降级读取 DB 事件。
- Credits 不是 Kie 流式推送，只能描述为“近实时采样”。
- SSE 按 user/tenant quota，慢客户端断开重连，不允许无限连接耗费。

## 16. 模型与复杂功能

### 16.1 注册表

每个 adapter 定义：

- Kie model ID、模式、输出类型。
- Zod schema、默认值、跨字段约束。
- UI 字段、比例、分辨率、输入数量、MIME/大小。
- request builder、record parser、error mapper。
- callback/cancel/native batch/progress 能力。
- 精确 output CDN host/MIME allowlist。
- 官方文档链接和核对日期。

### 16.2 首发 adapter

1. GPT Image 2 Text-to-Image。
2. GPT Image 2 Image-to-Image。
3. Nano Banana 2。
4. Seedream 5 Lite Text-to-Image。
5. Seedream 5 Lite Image-to-Image。
6. Seedream 5 Pro Text-to-Image。
7. Seedream 5 Pro Image-to-Image。
8. Flux 2 Pro Text-to-Image。
9. Flux 2 Pro Image-to-Image。
10. Grok Imagine Text-to-Image。
11. Grok Imagine Image-to-Image。

每个首发 adapter 必须有 schema、request fixture、success/fail fixture、callback 声明、UI 表单和 E2E mock。Advanced JSON 也只能使用注册表中的 image model，不能透传任意 model ID。

### 16.3 房间与 prompt

- 新建、搜索、重命名、归档、Trash。
- 新房间严格空白。
- Copy 图标只复制可见 prompt。
- 每个 Turn 保存最终 prompt、参数、input Asset IDs 和顺序。
- Prompt template、parameter preset 和参考图组必须显式选择。
- Batch Matrix 在提交前展示全部最终请求，不允许隐藏拼接。

### 16.4 GPT Image 2 图生图编辑器

- 最多 16 张参考图。
- 拖拽排序、替换、删除、全屏查看和来源跳转。
- 显示序号、MIME、尺寸、bytes、扫描状态。
- 比例/分辨率联动禁用非法组合。
- 输入可来自安全上传、本人 Asset 库或旧输出。

### 16.5 批量

- 数量 `1-10`，快捷 `1x/2x/4x/5x/8x/10x`。
- 多 prompt 列表和参数扫描。
- 提交前显示 Job 总数、连接、预计资源和用户预算状态。
- 同一 Batch 独立结果槽、部分失败、单项重试、archive 重试。

### 16.6 资产库

- 搜索 prompt、label、模型、tag。
- 按类型、房间、模型、日期、收藏、generation/archive 状态筛选。
- 网格/列表、全屏预览、缩放、比较。
- 收藏、标签、集合、批量选择、Trash、导出。
- 显示安全元数据、taskId、credits、耗时、checksum、谱系。
- “作为参考图”是显式操作。

## 17. UI 设计

- shadcn/ui 白色主题，中性灰、近黑正文、有限语义色。
- 不使用渐变、营销 Hero、装饰色块、嵌套卡片和夸张圆角。
- 卡片最大 8px 圆角；Lucide 图标 + Tooltip。
- 左栏约 264px：房间和资产入口。
- 顶栏：connection、credits、活动 Job、安全/账户状态。
- 主区：对话式 Turn、稳定图片网格。
- 底部：粘性 Composer。
- 右侧 Sheet：Job、Asset、Connection、安全中心。
- 手机使用 Drawer/Sheet，320px 无水平溢出。
- 生成和归档分开显示，不显示 GPT Image 2 虚假百分比。
- 所有操作可键盘访问、焦点恢复、ARIA live、200% zoom、44px touch target、reduced motion。

## 18. API 边界

主要 BFF API：

```text
GET/PATCH/DELETE /api/connections/...
POST /api/connections/enrollment-intent
GET/POST/PATCH/DELETE /api/rooms/...
POST /api/generations
GET  /api/jobs/:id
POST /api/jobs/:id/retry-generation
POST /api/jobs/:id/retry-archive
POST /api/jobs/:id/reconcile
POST /api/assets/upload-intent
POST /api/assets/:id/finalize
POST /api/assets/view-urls
GET  /api/assets/:id/download-url
POST /api/exports
GET  /api/account/status
POST /api/account/refresh
GET  /api/events
```

Credential plaintext 只进入独立 AWS endpoint：

```text
POST https://credentials.example.com/v1/connections
```

该 endpoint 要求一次性 enrollment capability、DPoP body proof、精确 Origin/CORS，并原子消费 intent；不接受普通 BFF session cookie，不返回 secret。

内部接口只接受 AWS/Vercel OIDC service identity 或 SQS/EventBridge，不接受用户提供任意 Job/tenant：

```text
outbox dispatcher
credential authorization service
Kie submit/query worker
media archive worker
account refresh worker
maintenance/purge worker
```

Webhook 独立位于 AWS API Gateway，自定义域名与 Web App 分离。

## 19. WAF、反滥用与成本 DoS

### 19.1 资源滥用

- Vercel WAF：DDoS、managed rules、Bot Protection、IP/JA4/ASN/route rate limit。
- AWS WAF：webhook、credential ingest 和 upload intent 单独规则。
- Auth0：attack protection、bot、breached password、MFA。
- 应用：tenant/user/connection/IP/device/model/route 多维限流。
- 同一 credential fingerprint 默认不能跨 tenant 重复绑定；例外必须安全审查。
- Generation `Idempotency-Key` 必填。
- Batch Matrix 和 ZIP 有硬任务/bytes/time 上限。
- Quota 达到时 fail closed，不启动 Kie/S3 副作用。
- 异常 credits 下降、KMS decrypt 激增、429/402、失败率、DLQ 积压触发告警和 kill switch。
- CAPTCHA 只辅助，不替代身份、quota 和服务端授权。

### 19.2 内容安全与公众滥用

- 公开注册前必须发布 Terms of Service、Acceptable Use Policy、隐私政策、版权/DMCA 和举报/申诉流程。
- 不提供公开图片广场；用户资产默认 private，减少传播风险。
- Prompt、上传和生成结果进入分层内容安全策略；Kie 自带 moderation 不能作为唯一控制。
- 上传/输出安全 derivative 可接入经过法律和隐私评审的商业内容安全服务；疑似违法内容进入隔离状态，不能生成 signed view URL。
- 建立用户举报、账号冻结、credential/tenant kill switch、证据 legal hold、申诉和误报恢复。
- 涉及 CSAM 或其他法定报告义务时按部署司法辖区由合格法务制定流程并对接有资质机构；开发者不得自行浏览或传播疑似内容。
- 内容审查使用独立 reviewer role、fresh MFA、最小可见范围、双人批准和完整审计；普通 support/admin 无资产查看权。
- Copyright takedown、重复侵权和执法请求均有工单、身份验证、保全和时限控制。
- Public signup 只有在 Legal/Safety owner 提供已批准政策与处置 runbook 后才能开启。

## 20. 日志、审计与隐私

### 20.1 允许列表日志

只记录 request ID、tenant opaque ID、actor opaque ID、action、target opaque ID、结果、时间、risk 和安全分类。

禁止记录：

- API Key、HMAC、DEK、token、cookie。
- signed URL、callback route 明文、Kie result URL。
- request/response body、Authorization headers。
- 完整 prompt、原图内容、Auth0 claims 全量。

上游即使在错误中回显 Key，也只能通过 error allowlist mapper。

IaC 同时约束托管层：API Gateway access log 不记录 URI path/body/Auth headers；AWS WAF 关闭或 redact URI/body sampled requests；Vercel logs/traces 禁 request/response body、headers 和 outbound URL；S3 不启用可能记录 SigV4 query 的 server-access log，改用不含签名查询串的 CloudTrail data events；SIEM ingestion 再做第二次字段 allowlist/redaction。

### 20.2 不可篡改审计

- DB audit table append-only。
- 每日流入独立 AWS account 的 S3 Object Lock WORM bucket。
- KMS CloudTrail 开启且不可由应用角色关闭。
- Auth0 logs、Vercel WAF、AWS WAF、CloudTrail 汇总 SIEM。
- 审计记录 key create/rotate/decrypt/destroy purpose、登录、step-up、生成、quota、admin 和恢复。
- KMS CloudTrail request ID 与应用 append-only audit event 关联；可变 purpose 由应用审计记录，不能伪称 KMS encryption context 会记录每次操作 purpose。
- 不在审计中保存 secret 或 prompt。

### 20.3 数据生命周期

- 普通 Asset 默认永久保存，直到用户 Trash + 30 天或永久删除。
- Abandoned upload 24 小时清理。
- Kie 临时 URL 不持久化。
- Connection 删除按 graceful/emergency 生命周期从 live vault 移除；备份由 tombstone 与 retention 控制，tenant KEK deletion 提供最终 crypto-erasure。
- 用户删除：停止新任务、取消未提交 outbox、销毁 secrets、删除 S3 objects；late callback 由无 PII tombstone 吞掉。
- 合规审计只保留最少无内容事件，保留期由部署地区政策配置。

## 21. 备份、恢复与事故响应

- Neon 开启 protected production branch、最大可用 PITR。
- 每日 encrypted logical backup 到独立 AWS account + Object Lock。
- S3 开 versioning、SSE-KMS 和跨账户备份策略。
- 每季度实测 DB PITR、S3 restore 和 credential rotation。
- Runbook：Kie outage、webhook outage、KMS outage、SQS/DLQ、Key 泄漏、credits drain、RLS 错误、旧部署泄漏。
- Kill switch 顺序：停止 submit/decrypt -> 保全审计 -> 隔离 credential/tenant -> 调查 -> 恢复。
- 生产管理员使用独立 staff IdP、硬件安全钥匙、无共享账号。
- KMS policy、production data restore、平台安全配置和发布执行双人审批。
- Support impersonation 默认禁用；任何 break-glass 有短 TTL、双人审批和全量审计。

## 22. 供应链与部署安全

- 提交 `pnpm-lock.yaml`；CI 用 `pnpm install --frozen-lockfile`。
- Install scripts 使用明确 allowlist。
- GitHub Actions 固定完整 commit SHA，最小 `permissions`，fork PR 无 secrets。
- Main branch protection、两人 review、签名 release artifact。
- gitleaks/secret scan、CodeQL/SAST、OSV/Trivy/SCA、license scan、CycloneDX SBOM。
- 禁止第三方分析、广告和远端执行 JS。
- 严格 nonce CSP；可行时启用 Trusted Types。
- Production/preview/dev 的 Auth0、Neon、AWS account、credential vault/ciphertext、KMS context、S3、SQS 完全隔离；preview 禁止导入或复制 production BYOK credential。
- Preview 默认 `LIVE_KIE_ENABLED=false`，不能产生真实费用。
- 环境变量轮换后必须撤销上游旧 credential 并封锁旧 deployment；仅改 Vercel env 不会改变旧 deployment。

## 23. 部署依赖

- Vercel Enterprise Secure Compute：Next.js BFF、WAF/Bot、固定私网/出口、独立 prod/preview；不用二选一配置。
- Auth0 Enterprise：Universal Login、Passkey/MFA、Adaptive MFA、Attack Protection、log streaming。
- Neon production plan：Postgres、FORCE RLS、pooling、IP allow/private networking、最大 PITR。
- AWS：Lambda control plane/credential services/Kie execution、ECS Fargate media worker、KMS、private S3、SQS FIFO/DLQ、API Gateway、WAF、EventBridge、CloudTrail、Object Lock audit bucket。
- Vercel OIDC 到 AWS roles；无长期 AWS Access Key。
- 所有 Kie 调用只从 AWS VPC NAT Gateway EIP 集合出站，供用户设置 Kie IP allowlist；Vercel 不直接调用 Kie。
- 稳定 `app` 和 `hooks` 自定义域名。

## 24. 测试策略

不采用 TDD；功能实现后集中验证。安全测试是合并/上线门禁，不可因开发时间跳过。

### 24.1 模型与逻辑

- 每个首发 adapter 的 schema/request/success/fail fixture。
- GPT Image 2 20,000 字符、16 图、30MB、分辨率/比例组合。
- 双状态机、终态单调、quota、rate、idempotency、uncertain submission。
- JSON import/export 不含 secret/signed URL。

### 24.2 Tenant/BOLA

- 两个真实测试 tenant 跑所有 API、worker、asset 和 relation 交叉矩阵。
- 跨 tenant 一律 404/403；直接 DB RLS 查询同样拒绝。
- Composite FK 拒绝跨 tenant asset lineage。
- Runtime role 无 BYPASSRLS/table owner。
- `SECURITY DEFINER` resolve/claim procedures 固定 search_path、PUBLIC revoked；对随机 route/op/job ID、SQL/meta characters、跨 tenant 和直接调用做 fuzz/negative matrix。

### 24.3 Auth

- Passkey/MFA、step-up、session fixation/rotation/revoke、CSRF、Origin。
- Recovery 24 小时冷却和旧 session 撤销。
- Account enumeration、brute force、bot、refresh token reuse。
- Credential enrollment intent 绑定 tenant/session/action/ephemeral DPoP、2 分钟 TTL、单次消费；错误 Origin/CORS、replay 和 body tamper 全拒绝，Next.js runtime/log 不出现 plaintext。
- Admin hardware-key 和双人审批演练。

### 24.4 Credential/KMS

- DB dump、backup、browser storage、client bundle、logs/trace/workflow/SQS/outbox 全扫描，零明文 secret。
- Web/webhook/media/admin role 调 API Key Decrypt 必须 AccessDenied。
- Kie execution role 拿到其他 tenant ciphertext 和完整 context 仍必须 AccessDenied；只有 credential authorization service 为当前 lease 签发的 exact grant 可解密一个 version。
- Active/previous HMAC、API key 独立轮换、graceful drain、emergency destroy、external revoke。
- KMS context 绑定错误时 Decrypt 失败。
- CloudTrail decrypt request ID 与应用 append-only audit 的 opaque purpose 正确关联，二者都无敏感值。

### 24.5 Webhook

- Valid、错误 connection、缺/重复 header、bad Base64、bad length、过去/未来 timestamp。
- 同事件 100 次重放只产生一个 inbox/outbox/query/asset。
- 合法签名篡改 result URL/state，最终仍只使用 `recordInfo`。
- A connection 事件发送到 B route 必须失败。
- Callback 早于 create response、100 次并发、taskId mismatch/quarantine。
- HMAC rotation grace/expiry；一次最多尝试两个版本。
- 同一 `(connection, taskId, timestamp)` 即使 active/previous 产生不同有效 signature，也只能有一个 inbox/outbox。
- Unknown route 404、tombstone 200、oversized/non-JSON reject。
- API Gateway/WAF/Vercel/SIEM 托管日志样本不得出现 route plaintext、body、Auth headers 或 signed query。

### 24.6 Outbox/SQS/竞态

- DB commit 后进程死于 SQS send 前，由 EventBridge dispatcher 恢复。
- Duplicate dispatcher/consumer 在 `create_started` 前由 fencing 消解；`create_started` 后任何异常都不得自动产生第二个 provider POST。
- 在 DNS、connect、request headers、request body、response headers、taskId 落库前后和 DB commit 边界逐点 kill worker；遗留 started attempt 进入 uncertain，零自动重发。
- 同 idempotency key 100 并发只产生一个 Batch。
- 429 安全重试；timeout/reset/5xx 进入 uncertain，零自动重复 create。
- 浏览器关闭、worker crash、部署切换不影响完成。
- Graceful disable/delete 与 submit race 无越权调用。

### 24.7 Asset/SSRF

- 伪 MIME、polyglot、truncated、pixel/frame bomb、SVG/GIF、parser crash。
- Presigned POST exact key/content-length-range/MIME/SSE-KMS policy；超限在 S3 接收前拒绝，reservation 过期释放并清理。
- `127.0.0.1`、metadata、private IPv4/IPv6、userinfo、未知 host、DNS rebinding、跨 host redirect、慢流、超大响应。
- Media worker 资源受限，失败不影响其他 tenant。
- Upload 成功 DB 失败重试后只有一个 object/Asset。
- Signed URL exact path/method/TTL，跨 tenant IDOR 全拒绝。

### 24.8 Credits/实时

- 并发 refresh coalesce。
- 401/429/5xx 保留旧余额并标 stale，不显示 0。
- 余额只返回所属 tenant/connection。
- SSE/轮询断线恢复和 quota。

### 24.9 UI/E2E

- 注册、MFA、连接 Kie、credits。
- 房间、新房间空白、Copy 手动粘贴。
- GPT Image 2 图生图上传/排序/16 图。
- `5x` 后关闭页面；mock webhook 完成；重开全部已归档。
- 生成成功但 archive 失败/重试。
- Asset 搜索、标签、收藏、比较、谱系、下载。
- 桌面 1440x900/1280x720，手机 390x844/320x568 截图，无重叠/溢出/控制台错误。

### 24.10 内容安全

- 举报、freeze、quarantine、legal hold、appeal、takedown 和 reviewer 双人审批流程。
- 普通 support/admin 无法查看隔离资产；reviewer 所有访问有 fresh MFA 和审计。
- 安全服务 outage 时公开上传/生成按策略 fail closed，不静默绕过。
- 测试 fixture 使用合成安全样本，不在开发/CI 中保存或传播真实违法内容。

### 24.11 必须通过

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm run build
pnpm security:scan
pnpm sbom
pnpm infra:validate
```

真实 Kie smoke test 只在专用低额度 sandbox Key、固定 IP 和用户允许扣费后执行。

## 25. 公网 Go-Live 门禁

本节是外部运营上线门禁，不等同于本地工程交付完成。Engineering 可在 `PUBLIC_SIGNUP_ENABLED=false` 下验收；公开注册只有以下全部通过才可开启，不能口头豁免：

1. 两 tenant 全 API/worker BOLA/RLS 矩阵通过。
2. Passkey/MFA、step-up、session、恢复冷却、CSRF、枚举测试通过。
3. 所有客户端/构建/日志/队列/备份扫描无明文 Key/HMAC/token/signed URL。
4. KMS role negative tests、credential/HMAC/KMS 轮换演练通过。
5. Webhook forged/replay/early/duplicate/out-of-order/mismatch corpus 通过。
6. SSRF/upload bomb/parser crash corpus 通过。
7. Idempotency/outbox/SQS/uncertain/kill switch chaos tests 通过。
8. Credits drain、429/402、Kie/KMS/SQS outage 告警和 runbook 演练通过。
9. DB PITR、S3 restore、credential revoke、旧部署封锁演练通过。
10. Lint/type/test/build/SAST/SCA/secret scan/SBOM 无未处置 Critical/High。
11. 独立安全审查和渗透测试完成；Critical/High 修复并复测。
12. 管理员硬件钥匙、双人审批、SIEM 告警和值班制度已实际启用。
13. Legal/Safety owner 已批准 ToS、AUP、隐私、举报、CSAM/执法、版权和申诉 runbook；`PUBLIC_SIGNUP_ENABLED` 才可开启。

责任与证据：

- Security owner：威胁模型、渗透测试报告、Critical/High 复测、KMS/RLS/WAF 证据。
- Operations owner：SIEM、告警、值班、kill switch、PITR/S3/Kie outage 演练记录。
- Legal/Safety owner：政策、举报/申诉、法定报告、版权和审查权限流程。
- Product owner：quota、BYOK 文案、无共享 credits、用户通知和 launch flag 审批。
- 每项证据记录不可变 artifact ID、owner、日期和有效期；过期门禁自动关闭 launch flag。

## 26. 验收标准

1. Git 仓库为 `kie-ai-image-app`，默认分支 `main`。
2. 任何人可注册，但必须邮箱验证、MFA 和自己的 Kie connection 才能生成。
3. Kie Key/HMAC 不进入浏览器存储、client bundle、普通 Web runtime、日志或 DB 明文。
4. DB dump 不能恢复 credential；只有最小 worker role 可按 context 解密单个版本。
5. 用户只能访问自己的 connection、credits、Job 和 Asset。
6. GPT Image 2 I2I 支持 16 图、30MB、1K/2K/4K 和严格组合校验。
7. `5x` 创建五个独立任务；浏览器关闭后继续完成和永久归档。
8. Webhook HMAC、重放、早到、重复、乱序和 mismatch 安全处理。
9. 漏 webhook 可 durable polling 补回。
10. Kie success + S3 fail 可自动/手动重试，不误报生成失败。
11. UI 只读私有 S3 Asset，不依赖 Kie URL。
12. 新房间无旧 prompt；Copy 只复制可见文本；Asset 输入必须显式选择。
13. Credits 标记官方来源、采样时间和 stale 状态。
14. Asset 可搜索、收藏、标签、比较、谱系、Trash、下载和导出。
15. WAF、quota、rate、idempotency、kill switch 和告警生效。
16. 桌面/手机无重叠、截断和不可操作控件。
17. 第 24.11 节命令和工程安全测试通过；若第 25 节外部门禁未完成，系统必须保持 `PUBLIC_SIGNUP_ENABLED=false`。

## 27. 实施顺序

1. 初始化 pnpm monorepo、Next.js、TypeScript、Tailwind、shadcn/ui。
2. 用 IaC 建 Auth0/Neon/AWS dev 环境和 OIDC roles。
3. 建 DB schema、FORCE RLS、roles、migrations 和 tenant negative tests。
4. 建 credential ingest、credential authorization、per-operation KMS grant、envelope encryption 和连接向导。
5. 建 S3 upload/finalize/media validation。
6. 建 outbox、SQS、dispatcher、Kie caller 和 reconcile worker。
7. 建多租户 webhook verifier、inbox 和 authoritative query。
8. 建 archive worker、SSRF 防护、S3 永久资产。
9. 建 GPT Image 2 adapters、房间、Composer、`5x` 和任务 UI。
10. 建 credits、账户/安全中心和近实时状态。
11. 建 Asset 库、比较、谱系、标签、Trash 和导出。
12. 扩展其余首发 adapters。
13. 集中完成测试、响应式、可访问性、安全扫描和 chaos。
14. 完成工程验收；第 25 节外部门禁另由指定 owner 签署后再开放公网。

## 28. 官方依据

- GPT Image 2 I2I：<https://docs.kie.ai/market/gpt/gpt-image-2-image-to-image>
- Kie task：<https://docs.kie.ai/market/common/get-task-detail>
- Kie webhook HMAC：<https://docs.kie.ai/common-api/webhook-verification>
- Kie credits：<https://docs.kie.ai/common-api/get-account-credits>
- Kie security/retention/rate：<https://kie.ai/getting-started>
- Auth0 passkeys：<https://auth0.com/docs/authenticate/database-connections/passkeys/passkey-apis>
- Auth0 MFA：<https://auth0.com/docs/secure/multi-factor-authentication/enable-mfa>
- Auth0 step-up：<https://auth0.com/docs/secure/multi-factor-authentication/step-up-authentication>
- Auth0 attack protection：<https://auth0.com/docs/secure/attack-protection/breached-password-detection>
- Vercel OIDC：<https://vercel.com/docs/oidc>
- Vercel WAF：<https://vercel.com/docs/vercel-firewall/vercel-waf>
- Vercel Bot Management：<https://vercel.com/docs/bot-management>
- Vercel Static IP：<https://vercel.com/kb/guide/how-to-allowlist-deployment-ip-address>
- Neon RLS：<https://neon.com/docs/guides/row-level-security>
- AWS KMS encryption context：<https://docs.aws.amazon.com/kms/latest/developerguide/encrypt_context.html>
- AWS S3 Object Lock：<https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html>
