# Free / Pro / Pro+ 订阅（全新设计）

> **状态**：P0 已实现，后端 `knowledge-system` 编译通过。
> **范围**：三档订阅 + 权益模型 + C 端订阅页 + 平台端授予；**完全不做支付**。
> **前置决定**：整体废弃旧「会员（BASIC/PRO + Ping++）」设计，代码与表一并移除，按新模式从零建立。

---

## 0. 一句话结论

**方案（Plan）是配置，权益（Entitlement）是运行时契约，配额（Quota）是计数。**
`knowledge-system` 是权益唯一权威源；业务服务只做「取权益 → 校验 / 计数」；前端只做展示与引导，后端始终是最终裁判。升级由**管理员授予**完成，不经过任何支付渠道。

---

## 1. 为什么废弃旧设计

旧实现（`knowledge-system`，作者 Qwen）存在硬伤，不适合在其上叠加：

| 问题 | 说明 |
| --- | --- |
| 只有两档且二元 | `MembershipLevelEnum` = `BASIC/PRO`，`hasProMembership` 只认 `PRO`，无法表达 Pro+ |
| 权益不可机读 | `membership_level.benefits` 是展示用 JSON 字符串数组，没有 feature key / 数值额度 |
| 支付在关键路径 | `/membership/subscribe` 必须调 Ping++；`/payment/status/{orderNo}` 会**5 秒后伪造支付成功**（安全问题） |
| 门禁覆盖窄 | `ProMembershipInterceptor` 只在 `knowledge-system` 注册，AI / wiki / file-center 完全不受控 |
| DDL 漂移 | 表只存在于手工脚本 `doc/sql/blade/membership-system.sql`，不在 Flyway |
| 无 C 端/管理端 | 前端零接入，admin 无会员页 |

**已删除**：`MembershipController`、`PaymentCallbackController`、`ProFeatureController`、`PingxxPaymentService`、`PingxxProperties`、`MembershipWebMvcConfiguration`、`ProMembershipInterceptor`、4 个实体、5 个枚举、3 个 VO、4 个 Mapper、8 个 Service、手工 SQL、core-permission 的 `@RequireProMembership`，以及 `pom.xml` 的 `com.pingxx` / `zxing` 依赖与 `application-dev.yml` 的 `pingxx` 配置。

---

## 2. 新模型

### 2.1 三档

| planCode | 名称 | tier |
| --- | --- | --- |
| `FREE` | 免费版 | 0 |
| `PRO` | 专业版 | 1 |
| `PRO_PLUS` | 专业增强版 | 2 |

`PlanCode.fromCode` 对未知编码**回退 FREE**，脏数据不会放大权益。

### 2.2 权益两类

- **FEATURE**：布尔能力开关，如 `ai.advancedModels`、`export.pdf`。
- **QUOTA**：数值额度，如 `space.count`、`ai.runs.daily`、`ai.credits.monthly`、`storage.bytes`；`-1` 表示不限。

编码唯一定义在 `com.knowledge.system.domain.EntitlementCodes`（前端对应 `packages/common/src/entitlements/index.tsx` 的 `ENTITLEMENT_CODES`）。

### 2.3 权益矩阵（V36 种子，可直接改库调整）

| 权益 | Free | Pro | Pro+ |
| --- | --- | --- | --- |
| `core.editor` | ✓ | ✓ | ✓ |
| `space.count` | 3 | 30 | 不限 |
| `space.members` | 1 | 10 | 50 |
| `storage.bytes` | 1 GB | 50 GB | 200 GB |
| `file.maxSize` | 64 MB | 512 MB | 2 GB |
| `ai.agent` | ✓ | ✓ | ✓ |
| `ai.runs.daily`（每日次数） | 30 | 300 | 1000 |
| `ai.credits.monthly`（月度积分） | 1k | 20k | 100k |
| `ai.runs.concurrent` | 1 | 3 | 10 |
| `ai.advancedModels` | — | ✓ | ✓ |
| `plugin.install` | ✓ | ✓ | ✓ |
| `plugin.installed.count` | 3 | 不限 | 不限 |
| `plugin.publish` | — | ✓ | ✓ |
| `export.pdf` | — | ✓ | ✓ |
| `collaboration.team` | — | ✓ | ✓ |
| `collaboration.guest` | — | — | ✓ |
| `support.priority` | — | — | ✓ |

---

## 3. 数据库（Flyway `V36__subscription_plans.sql`）

| 表 | 作用 |
| --- | --- |
| `subscription_plan` | 方案目录（含展示价格，仅展示，不支付） |
| `subscription_entitlement` | 权益定义字典（category / value_type / unit） |
| `subscription_plan_entitlement` | 方案权益取值（唯一来源，`(plan_code, ent_code)` 唯一） |
| `user_subscription` | 用户订阅关系，每用户一行（`(user_id, is_deleted)` 唯一），`end_time` 为空表示永久 |
| `subscription_grant_log` | 授予/撤销审计 |

迁移同时 `DROP TABLE IF EXISTS` 旧的 `payment_record / subscription_order / user_membership / membership_level`，并 `INSERT IGNORE` 种子三档 + 16 项权益 + 48 条取值。所有查询 Mapper 标 `@InterceptorIgnore(tenantLine = "true")`，避免租户拦截器给无 `tenant_id` 的配置表补列。

---

## 4. 后端（`knowledge-system`）

### 4.1 文件

- 实体：`SubscriptionPlan` / `SubscriptionEntitlement` / `SubscriptionPlanEntitlement` / `UserSubscription` / `SubscriptionGrantLog`
- 枚举：`PlanCode` / `EntitlementCategory` / `EntitlementValueType` / `SubscriptionSource` / `SubscriptionStatus`
- 服务：`ISubscriptionPlanService`（目录与权益取值）、`IUserSubscriptionService`（状态与授予）、`IEntitlementService`（解析 + 进程内 60s TTL 缓存，授予后主动失效）
- 控制器：`SubscriptionController`（`/subscription`）、`AdminSubscriptionController`（`/subscription/admin`）
- 门禁：`@RequireEntitlement` + `EntitlementInterceptor` + `SubscriptionWebMvcConfiguration`

### 4.2 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/knowledge-system/subscription/catalog` | 权益定义 + 三档取值（前端对比表唯一数据源） |
| GET | `/knowledge-system/subscription/me` | 当前用户订阅（未订阅返回免费版） |
| GET | `/knowledge-system/subscription/me/entitlements` | 当前生效权益（features + quotas） |
| GET | `/knowledge-system/subscription/me/check?code=` | 校验单个权益 |
| GET | `/subscription/admin/users` | 用户订阅分页（用户为主表左连，未订阅按 FREE） |
| POST | `/subscription/admin/grant` | 授予/调整（`{userId, planCode, days?, remark?}`） |
| POST | `/subscription/admin/revoke` | 撤销回 FREE |
| GET | `/subscription/admin/grants` | 授予日志 |
| GET | `/subscription/admin/catalog` | 方案目录 |

### 4.3 权益能力已抽象到 `knowledge-tool`

共享模块 **`knowledge-tool/knowledge-core-entitlement`**（包 `com.knowledge.core.entitlement`）承载全部跨服务权益能力，业务服务**只加依赖即可**：

- `constant/EntitlementCodes`：权益编码唯一来源。
- `annotation/RequireEntitlement`：声明式门禁注解。
- `model/EntitlementSnapshot`：features/quotas 快照（跨服务传输对象，含 `free()` 兜底）。
- `EntitlementResolver`：解析 SPI。权益权威源用本地实现，避免自调用；其他服务用默认实现。
- `EntitlementGate`：统一入口（解析 + 进程内 TTL 缓存 + `hasFeature` / `getQuota` / `evict`）。
- `interceptor/EntitlementInterceptor` + `config/EntitlementWebMvcConfiguration`：拦截 `@RequireEntitlement`。
- `client/IEntitlementClient`：Feign 客户端（`/entitlement/internal/*`）。
- `client/FeignEntitlementResolver`：默认解析器，解析失败回退 FREE（fail-closed）。
- `EntitlementAutoConfiguration` + `META-INF/spring.factories` / `AutoConfiguration.imports`：自动装配上述 Bean。

接入方式：

1. `pom.xml` 加 `knowledge-core-entitlement` 依赖（AI / wiki / file-center 已加）。
2. 在需要门禁的接口标 `@RequireEntitlement(EntitlementCodes.xxx)`；或在业务代码注入 `EntitlementGate` 判断能力与配额。
3. 权益权威源 `knowledge-system` 提供本地 `SystemEntitlementResolver`，并实现 `IEntitlementClient`（`/entitlement/internal/*`，`service` 角色鉴权）作为内部数据源。

可配置项：`knowledge.entitlement.enabled`（默认 true）、`knowledge.entitlement.cache-ttl-seconds`（默认 60）。

### 4.4 配额拦截（已落地）

各执行点调用 `EntitlementGate` 做强制校验，超限抛明确错误：

| 配额 | 服务 | 执行点 | 计数来源 |
| --- | --- | --- | --- |
| `space.count` | knowledge-wiki | `SpaceApplication.createSpace`（仅新建） | `wiki_space` 按 userId 统计 SPACE/COLLABORATION |
| `file.maxSize` | knowledge-file-center | `UploadSessionApplication.create` | 请求 `expectedSize` |
| `storage.bytes` | knowledge-file-center | `UploadSessionApplication.create` | `FileMapper.sumActiveSize(tenantId, userId)` |
| `ai.runs.daily` + `ai.credits.monthly` | knowledge-agent-skills | `RunQuota.checkCreateAllowed`（创建）+ `AgentLoop` 每轮熔断 | `CreditUsageService`（今日根 run 数 / 本月积分，按模型单价折算） |
| `ai.runs.concurrent` | knowledge-agent-skills | `RunQuota.checkCreateAllowed` | `AgentRunMapper.countActiveByUser` |

- 配额 `-1` 不限、`<= 0`（未配置）跳过；免费版兜底数值写进 `EntitlementSnapshot.free()`，权益服务不可用时不会把额度降成 0 而全量拦截。
- 内部调用鉴权：`EntitlementFeignConfiguration` 用 `Knowledge-Internal-Token` 携带服务令牌，knowledge-system 的 `EntitlementClient` 校验该头（与 wiki 的 `OrganizationMembership` 内部接口同构），不依赖被透传的用户 Authorization。
- 管理员授予/撤销会同时失效 `IEntitlementService` 与 `EntitlementGate` 两级缓存，改动即时生效。

---

## 5. 前端（`packages/common` + `packages/core`）

- `packages/common/src/api/types.ts`：`PlanCode` / `SubscriptionPlan` / `SubscriptionCatalog` / `UserSubscriptionInfo` / `PlanEntitlements` 等。
- `packages/common/src/api/index.ts`：`GET_SUBSCRIPTION_CATALOG / GET_MY_SUBSCRIPTION / GET_MY_ENTITLEMENTS / CHECK_MY_ENTITLEMENT`。
- `packages/common/src/entitlements/index.tsx`：`ENTITLEMENT_CODES` + `EntitlementsProvider` + `useEntitlements()`（`hasFeature / quota / isUnlimited / refresh`，无 token 不发请求，缺省 fail-closed）。
- `packages/core/src/App.tsx`：登录态路由下用 `EntitlementsProvider` 包裹 `Layout`。
- `packages/core/src/components/subscription/`：
  - `PlanBadge.tsx` 方案徽标；`SubscriptionPanel.tsx` 当前方案 + 额度 + 对比 + 升级入口；
  - `PlanComparison.tsx` 由接口渲染，不硬编码；`UpgradeDialog.tsx` 支付未开放占位；`PaywallGate.tsx` 声明式门禁；`quota-format.ts` 额度格式化。
- `packages/core/src/components/settings/SeetingDlg.tsx`：新增「订阅方案」导航项与内容，徽标由硬编码 `Free` 换成 `PlanBadge`。
- i18n：`packages/core/src/locales/resources.ts` 增加 `settings.nav.subscription` 与 `settings.subscription.*`（zh + en）。

---

## 6. 平台端（`apps/admin`）

- `apps/admin/src/api/index.ts`：`getAdminUserSubscriptions / grantUserSubscription / revokeUserSubscription / getSubscriptionGrantLogs` 及类型。
- `apps/admin/src/pages/membership/SubscriptionUsers.tsx`：用户订阅列表（搜索、方案筛选、分页）、调整（方案 + 天数 + 备注）、撤销。
- `apps/admin/src/App.tsx` 路由 `/subscription`；`AdminLayout` 菜单「订阅管理」（权限码 `platform.subscription.manage`，管理员角色豁免）。

---

## 7. 验证

- 后端共享模块 + 权威源：`mvn -o -pl knowledge-service/knowledge-system -am compile -DskipTests` → **BUILD SUCCESS**（含 `knowledge-core-entitlement`）。
- 后端消费者：`mvn -o -pl knowledge-service/knowledge-system,knowledge-service/knowledge-agent-skills,knowledge-service/knowledge-wiki,knowledge-service/knowledge-file-center -am compile -DskipTests` → **BUILD SUCCESS**（file-center / agent-skills 另经 `clean compile` 验证）。
- 前端：`tsc --noEmit` 检查 `packages/common` / `packages/core` / `apps/admin`。
- 数据库：部署时经 `mvn -N -Pdb-migrate flyway:migrate` 应用 V36（需先 `flyway:info/validate`）。

---

## 8. 后续

- **P1 权益落地（进行中）**：跨服务客户端与 `space.count` / `file.maxSize` / `storage.bytes` / `ai.runs.daily` / `ai.credits.monthly` / `ai.runs.concurrent` 已落地；**待办**：`space.members`、`plugin.installed.count`、`plugin.publish`、`export.pdf`、`collaboration.*` 等其余权益接入，以及前端 `PaywallGate` 铺到具体功能与配额进度条。
- **P2 运营化**：兑换码、试用、到期提醒任务、admin 可视化权益配置。
- **支付**：保留 `subscription_plan` 的价格字段与 `subscription_grant_log` 来源枚举（`REDEEM`/`TRIAL`/`PAYMENT` 预留），将来接入时不需要改模型。
