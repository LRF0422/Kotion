# 订阅权益 · 后续开发路线图

> **本文范围**：截至 commit `898e8a18` 已完成的部分之后，**接下来要做的事**。
> **关联文档**：[SUBSCRIPTION_PLAN.md](./SUBSCRIPTION_PLAN.md)（整体设计与已实现部分）。
> **状态**：待办清单。每项含「目标 / 代码落点 / 验收」，实施时单独立项。

---

## 0. 现状快照（已完成，作为基线）

| 层 | 已完成 |
| --- | --- |
| 数据 | Flyway `V36__subscription_plans.sql`：五表 + 三档种子；**尚未在任何环境执行**（部署步骤） |
| 后端 | 方案目录、权益解析（60s 缓存）、客户端与平台端接口、授予/撤销与审计 |
| 共享模块 | `knowledge-tool/knowledge-core-entitlement`：注解/SPI/Gate/拦截器/Feign 客户端/自动装配 |
| 内部鉴权 | `Knowledge-Internal-Token` 服务令牌；knowledge-system 实现 `/entitlement/internal/*` |
| 配额拦截 | `space.count` + `space.members` + 插件/协作门禁（wiki）、`storage.bytes` + `file.maxSize`（file-center）、`ai.runs.daily` + `ai.credits.monthly` + `ai.runs.concurrent`（agent）、`export.pdf`（前端） |
| 前端 | `useEntitlements`、设置页「订阅方案」、方案对比、升级占位、`PaywallGate`（组件已有，**未铺开**） |
| Admin | 用户订阅列表、授予/撤销；方案目录接口 |

**一句话**：能展示、能授予、能拦其中 5 个配额；剩余权益、正确性边界、用量展示与运营能力待做。

---

## 1. 优先级总览

| 阶段 | 目标 | 关键交付 |
| --- | --- | --- |
| **P1-a** 剩余权益接入 | 完整覆盖 P0 矩阵里的能力开关与配额 | `space.members`、插件三类、`ai.advancedModels`、`collaboration.*`、`export.pdf` |
| **P1-b** 拦截正确性 | 堵住绕过路径、并发超卖、多实例缓存、错误码 | 存储全写路径、预占锁、AI 中途熔断、上下文方案、统一错误码 |
| **P1-c** 用量与前端体验 | 用户看得到用量、拦得住的地方有升级引导 | `/subscription/me/usage`、PaywallGate 铺开、配额进度条 |
| **P2** 运营化 | 不发版也能发码/试用/到期治理 | 兑换码、试用、到期任务与降级、Admin 权益配置 |

---

## 2. 待办清单

### 2.1 P1-a 剩余权益接入

> **进度（2026-09）**：`space.members`、`plugin.install` + `plugin.installed.count`、`plugin.publish`、`collaboration.team`、`collaboration.guest`、`export.pdf` **已落地**；`ai.advancedModels` **阻塞**（见下）。

| 权益编码 | 状态 | 落点 | 说明 |
| --- | --- | --- | --- |
| `space.members` | ✅ 已接入 | `SpaceMemberApplication.inviteMembers` | 按空间统计成员，仅计新增；超出抛 `MEMBER_QUOTA_EXCEEDED` |
| `plugin.install` + `plugin.installed.count` | ✅ 已接入 | `PluginApplication.installPlugin` | 能力开关 + 已装数量；超出抛 `PLUGIN_QUOTA_EXCEEDED` |
| `plugin.publish` | ✅ 已接入 | `PluginApplication` submit / resubmit / publishVersion / createPlugin | 免费版抛 `ENTITLEMENT_REQUIRED` |
| `collaboration.team` | ✅ 已接入 | `SpaceMemberApplication.inviteMembers` | 邀请成员需团队协作能力 |
| `collaboration.guest` | ✅ 已接入 | `SpaceApplication.createCollaborationInvitation` | 页面级访客协作需 Pro+ |
| `export.pdf` | ✅ 已接入（前端） | `PageEditor/index.tsx` 导出菜单 | 无权限时禁用并提示升级；**后端导出接口仍需补校验** |
| `ai.advancedModels` | ⛔ 阻塞 | `knowledge-agent-skills` `ModelController` / 创建 run | `LlmClientFactory` 无法区分「基础/高级」模型，需先定义模型档位配置，再过滤列表 + 创建 run 二次校验 |

> `core.editor` / `ai.agent` 三档均为 true，可暂不拦。

**验收**：每项免费版触发时返回明确错误，Pro/Pro+ 正常；有对应后端校验，不只靠前端。

### 2.2 P1-b 拦截正确性

1. **存储：覆盖所有写入路径**
   - 现状只拦「上传会话创建」；文件还可能经复制（`FileServiceImpl.copyFile`）、agent 下载（`WebDownloadSkill`）、远程下载（`RemoteFileDownloadService`）落入。
   - 方案：把额度校验收敛到一个 `StorageQuotaGuard`（file-center 内），所有新增文件的路径都调用它。
2. **并发超卖**：两个并发上传可同时通过 `used + size <= limit`。
   - 复用 `V20` 的 `knowledge_upload_owner_lock` 思路：按 `(tenant,user)` 行锁 + 复查；或引入「预占额度」表，完成/失败后释放。
3. **回收站是否计入**：当前 `sumActiveSize` 排除 `trashed=1`。需产品确认（不计入更友好，但可被刷）。
4. **AI：run 中途熔断**
   - 现状仅在「创建 run」时检查当日 token，单个 run 可越额。
   - 落点：`AgentLoop` 每轮累加 token 处（`AgentLoop` 内 token 结算 / `Checkpoint`）比较日额度，超限以明确事件中断。
5. **权益主体：团队上下文**
   - 现状只有用户级 `resolve(userId)`；`resolveByContextId` 未实现。
   - 需定义：个人上下文取本人；团队上下文取 Owner 方案（或引入上下文级套餐）。
6. **多实例缓存一致性**
   - `EntitlementGate` 是进程内缓存（60s）；授予只失效当前实例。
   - 方案：Redis 广播失效（pub/sub）或把 TTL 降到可接受范围；至少保证后台授予后最多 60s 生效。
7. **统一错误码**
   - 现在 wiki 用 `WikiException(2004)`、file-center 抛 `IllegalStateException`、agent 抛 `QuotaExceededException`，前端无法统一识别。
   - 目标：统一返回 `ENTITLEMENT_REQUIRED` / `QUOTA_EXCEEDED`（含 `entitlementCode`），前端据此弹升级。

**验收**：有绕过测试用例（复制/下载/并发）证明拦得住；多实例授予 ≤60s 生效；错误码可被前端稳定识别。

### 2.3 P1-c 用量与前端

1. **`GET /subscription/me/usage`**（knowledge-system 聚合）
   - storage：内部调用 file-center 或由 file-center 暴露内部用量接口；
   - AI 当日 token：agent-skills 内部用量接口；
   - 空间数量：wiki 内部用量接口；
   - 返回统一结构 `{ code, used, limit, unit, unlimited }`。
   - 备选：各服务上报到 knowledge-system 的日汇总表，避免实时聚合。
2. **前端**
   - 用 `PaywallGate` 替换 2.1 各入口的手写判断；
   - 设置页订阅面板加「用量进度条」（storage / AI token / 空间数）；
   - 捕获统一错误码后自动弹 `UpgradeDialog`；
   - 额度文案与单位统一（`quota-format.ts` 已具备）。
3. **升级入口**：当前是占位弹窗；至少补「联系管理员」与（P2）兑换码入口。

**验收**：设置页能看到三类用量进度；触发限额时直接出现升级引导而非裸错误。

### 2.4 P1-c Admin

1. **权益可视化编辑**：`AdminSubscriptionController` 增加 `subscription_plan_entitlement` 的读写，页面可改三档额度；保存后失效缓存。
2. **用户用量**：在订阅管理页展示单用户 storage / AI token / 空间数。
3. **授予日志页**：接口 `/subscription/admin/grants` 已有，前端补抽屉/页面。

### 2.5 P2 运营化

| 能力 | 说明 | 依赖 |
| --- | --- | --- |
| 兑换码 | 新表 `subscription_redeem_code`；`POST /subscription/redeem`；来源 `REDEEM` 已预留 | — |
| 试用 | `POST /subscription/trial`，按用户限一次；来源 `TRIAL` 已预留 | 开关配置 |
| 到期任务 | 复用 `@EnableScheduling`/`@Scheduled`（agent/file-center 已有先例），每日扫描 `end_time` 过期 → 置 `EXPIRED`、失效缓存 | — |
| 到期提醒 | 站内信/邮件（`knowledge-message` 已有能力），提前 N 天提醒 | 消息模块 |
| 自助升级 | 仍不做支付；先做走管理员/工单的闭环 | — |

---

## 3. 接口 / 表变更清单（草案）

- 新增：`GET /subscription/me/usage`；`GET/POST /subscription/admin/plan-entitlements`；`POST /subscription/redeem`；`POST /subscription/trial`。
- 新增表：`subscription_redeem_code`；可选 `subscription_quota_reservation`（并发预占）。
- 内部接口：各服务用量内部接口（`/internal/usage/{storage|ai|space}`）。
- 统一错误码常量：`ENTITLEMENT_REQUIRED` / `QUOTA_EXCEEDED`。

---

## 4. 待确认的决策

1. **权益主体**：维持用户级，还是引入上下文/团队级套餐？（影响 `resolveByContextId` 与团队功能）
2. **回收站是否计入存储**？
3. **超限行为**：硬拦（当前）还是软提示 + 宽限？
4. **单文件上限**是否取「套餐值」与「provider 上限（10GB）」的较小者（当前只看套餐值）。
5. **团队上下文**用 Owner 方案，还是每个成员各自方案？

---

## 5. 验证与测试计划

- **单元测试**：`EntitlementGate` 缓存/失效、`EntitlementSnapshot.free()` 兜底数值、各配额边界（limit-1 / limit / limit+1）。
- **集成测试**：内部服务令牌鉴权（伪造头必须拒绝）；授予后缓存失效。
- **越权/绕过测试**：复制文件、agent 下载、并发上传超卖。
- **前端**：`tsc` + 手工验证 PaywallGate 与用量进度条。
- **部署验证**：`flyway:info/validate/migrate` 应用 V36 后，核对三档种子与 `/subscription/catalog`。

---

## 6. 建议排期顺序

1. P1-b 的「统一错误码」+「团队上下文决策」先定，因为它们影响后续所有接入。
2. P1-a 剩余权益（空间成员、插件、模型、协作）。
3. P1-c 用量接口 + 前端铺开。
4. P1-b 的并发预占、AI 中途熔断、多实例缓存。
5. P2 运营化。

---

## 7. 进度更新（本轮已完成）

| 项 | 状态 |
| --- | --- |
| 统一错误码（40301/40302）+ 全局升级弹窗 | ✅ |
| 存储全写路径关口（`FileServiceImpl.createOrSaveFile`）+ owner 行锁防超卖 | ✅ |
| AI run 中途 token 熔断（`quota_exceeded` 终态） | ✅ |
| 跨实例缓存失效（Redis 全局/用户版本号） | ✅ |
| 自服务用量：空间 / 存储 / 今日 token + 订阅面板进度条 | ✅ |
| Admin：方案权益可视化编辑、兑换码管理、授予日志 | ✅ |
| P2：兑换码、试用、到期标记任务（`V37`） | ✅ |
| 前端：PDF 导出门禁、兑换/试用入口 | ✅ |

### 仍未做（需产品决策或后续迭代）

1. **团队上下文套餐**：资产/协作类配额目前以「空间 Owner 的用户方案」为准，尚无上下文级套餐；引入需定义 context→owner 解析，以及 `resolveByContextId` 的强制路径。
2. **回收站是否计入存储**：当前不计入（`trashed=1` 排除），口径可被刷，需产品确认。
3. **`ai.advancedModels`**：阻塞在缺少模型档位配置（见 §2.1）。
4. **Admin 单用户用量明细**：管理端目前展示方案/到期/日志，未显示该用户三类用量的具体数字。
5. **PaywallGate 全面铺开**：已接 PDF 导出 + 全局错误弹窗；其余前端入口（插件发布、团队邀请等）仍以后端拦截 + 全局提示为主。
