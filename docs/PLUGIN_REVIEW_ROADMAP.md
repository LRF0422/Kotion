# 插件审核与生态治理规划（Plugin Review & Governance Roadmap）

> 本文是 [Admin 模块持续运营功能规划](./ADMIN_OPERATIONS_ROADMAP.md) 中「插件审核」能力的专项补充。
> 先给出对现有 admin 插件审批链路的审查结论（含本轮已补全项），再规划后续该有的能力。
> 接口与 DDL 为规划草案，实施时以评审为准。
>
> 涉及代码：
> - 前端：`apps/admin/src/pages/plugins/PluginList.tsx`、`apps/admin/src/api/index.ts`
> - 开发者侧：`packages/core/src/components/Shop/PluginManager/*`、`packages/core/src/components/Shop/PluginUploader/*`
> - 后端：`knowledge-wiki` 的 `AdminPluginController` / `PluginController` / `PluginApplication` / `wiki_plugin*` 表
> - 迁移：`V13__plugin_submission_lifecycle.sql`、`V22__plugin_review_audit.sql`、`V23__plugin_review_reason_and_claim.sql`、`V24__plugin_safety_and_reports.sql`
> - 数据库：wiki 域表（`wiki_plugin*`）位于 `knowledge_wiki` 库；迁移用 `DATABASE()` 取当前库，随连接指向该库执行

---

## 1. 审查结论

### 1.1 已有能力（链路是通的）

| 环节 | 现状 |
| --- | --- |
| 提交 | 开发者通过 `/knowledge-wiki/plugin/submissions` 提交，状态 `PENDING`；候选版本落 `wiki_plugin_version` |
| 队列 | 后台 `GET /admin/plugin/list` 按「候选版本优先」聚合审核状态，支持分类/状态/关键字筛选与分页 |
| 审核 | `START → IN_PROGRESS`，`APPROVE → DONE`（候选版本转 ACTIVE、旧版本转 IN_ACTIVE），`REJECT`（候选转 DRAFT + REJECTED） |
| 权限 | 读权限 `platform.plugins.read` 与审核权限 `platform.plugins.review` 分离，并有 `clientId == kotion-platform-admin` 限制 |
| 并发安全 | 状态流转使用条件更新（claim）避免并发重复审核；候选版本唯一约束由 V13 保证 |

### 1.2 本轮补全的缺口

| # | 缺口（补全前） | 补全内容 |
| --- | --- | --- |
| 1 | **驳回无原因**：`PluginReviewDTO` 只有 `decision`，前端用 `window.confirm`，开发者无从得知为何被驳回 | 新增 `reason` 字段并强校验（`REJECT` 必填，≤500 字）；前端改为驳回原因对话框 |
| 2 | **无审核审计**：谁在何时以何理由审核不可追溯 | `wiki_plugin_version` 新增 `review_comment/reviewer_id/reviewer_name/review_time`，`START/APPROVE/REJECT` 均落审计并回显 |
| 3 | **无审核时间线**：详情只能看到当前候选版本 | 新增 `GET /admin/plugin/{id}/versions` 与详情「版本历史」区块 |
| 4 | **候选复用时审计残留**：驳回候选被重新提交后旧的审核信息仍在 | `resubmit/createVersion` 显式清空审计列 |
| 5 | **SRI 只展示不校验**：审核人无从确认产物与声明的完整性哈希一致 | 详情新增「校验完整性」按钮，浏览器内计算 SHA-384 比对 |
| 6 | **信息不足**：详情缺少安装/收藏/下载/评分、仓库地址 | 新增「运行数据」区块与仓库链接；新增「最近一次审核」区块 |
| 7 | **开发者无感知**：我的提交里看不到驳回原因 | `PluginSubmissionRecord` 透传 `reviewComment/reviewerName/reviewTime`，列表卡片展示驳回原因 |
| 8 | **审核入口分散**：审核动作在客户端 `/plugin/submissions/{id}/review` | 新增语义一致的 `POST /admin/plugin/{id}/review`（方法级鉴权覆盖类级，保持 review 权限可独立授权） |

### 1.3 仍然存在的缺口（后续规划输入）

- **效率**：无批量审核、无待办分配、无审核超时/SLA。
- **流程粒度**：只有「通过/驳回」，缺少「要求修改（保留候选、通知开发者）」这一中间态；缺少开发者撤回提交。
- **安全**：除 SRI 外无恶意代码扫描、无能力/权限声明审查、无沙箱预览。
- **治理**：已上架插件无法下架/紧急召回；无举报与评分治理。
- **触达**：审核结果不通知开发者（无站内信/邮件）。
- **数据**：无审核时效、通过率、驳回原因分布等运营指标；驳回原因为自由文本，无法结构化统计。
- **元数据**：无最低宿主版本/兼容性、无权限清单、无多端支持声明。

---

## 2. 后续功能规划

### 2.1 第一期（P0，审核提效与闭环）

> 目标：审核员「批得动、追得到」，开发者「收得到、改得明」。
>
> 状态：**本轮已落地**（除文末备注的增强项）。对应迁移 `V22__plugin_review_audit.sql`、`V23__plugin_review_reason_and_claim.sql`。

**a. 批量审核 ✅**
- 列表多选（仅 `PENDING/IN_PROGRESS` 可勾选），支持批量开始审核/批量通过/批量驳回（驳回原因与分类对所选条目共用）。
- 接口：`POST /knowledge-wiki/admin/plugin/batch-review`，body `{ ids: number[], decision, reason?, reasonCode? }`。
- 实现：`PluginApplication.batchReview` 用 `TransactionTemplate` 逐条独立事务，返回 `{ requested, succeeded, failures: [{ id, message }] }`；前端展示成功数与前三条失败明细。

**b. 审核通知 ✅（站内信，邮件/Webhook 待补）**
- `PluginReviewNotifier` 在 APPROVE/REJECT 后调用 `IMessageClient.sendInstantMessage` 推送并落库；失败回退 WebSocket 通知，全程 best-effort 不影响审核。
- 内容：插件名、版本、结论、驳回分类与原因。
- 备注：各审核员工作量统计、"详情入口深链"、邮件/Webhook 仍为增强项。

**c. 结构化驳回原因 ✅**
- `wiki_plugin_version.review_reason_code` + 枚举 `PluginReviewReason`（`ARTIFACT_INVALID`、`INTEGRITY_MISMATCH`、`DESCRIPTION_MISMATCH`、`SECURITY_RISK`、`POLICY_VIOLATION`、`OTHER`），驳回时后端强校验。
- 管理端驳回对话框必选分类，详情/版本历史/开发者「我的提交」均回显分类标签。

**d. 运营指标 ✅（P90/按审核员待补）**
- 接口：`GET /knowledge-wiki/admin/plugin/stats/review`，返回队列规模、通过率、平均审核时效与驳回原因分布（全枚举覆盖，便于画图）。
- 管理端顶部指标卡展示待审核/审核中/已通过/已驳回/通过率/平均时效。
- 备注：P90 与按审核员维度需按 `reviewer_id` 聚合，后续补充。

**e. 待办与 SLA ✅（SLA 阈值暂为常量）**
- `claimed_by/claimed_by_name/claimed_time` + `POST /admin/plugin/{id}/claim`、`/release`（乐观更新：只有首个把 `claimed_by` 从 null 置为本人者成功）。
- 列表对 `PENDING/IN_PROGRESS` 且等待超过 48h 的候选高亮「超时」；详情展示认领人并提供认领/释放。
- 备注：SLA 阈值后续改为系统参数 `plugin.review.slaHours`，并支持队列按滞留时长排序。

### 2.2 第二期（P1，安全审查与治理）

> 状态：**本轮已落地**（评分刷量检测留待有评分入口后再做）。对应迁移 `V24__plugin_safety_and_reports.sql`。

**a. 能力声明与权限审查 ✅**
- 提交 schema 增加 `permissions`，后端白名单校验（`NETWORK/STORAGE/CLIPBOARD/DOM/EXTERNAL_RESOURCES/EDITOR_EXTENSION/BACKGROUND_TASKS`），落 `wiki_plugin_version.permissions_json`。
- 提交向导新增「能力声明」勾选区；审核页以只读清单展示，高风险能力（网络/DOM/外部资源）高亮。
- 版本更新与重新提交均会刷新声明。

**b. 产物安全扫描 ✅（启发式，外部扫描引擎待接）**
- 审核页「运行启发式扫描」在浏览器端拉取产物，按规则集检测 `eval`/`new Function`/进程调用/远程脚本/dangerous innerHTML/混淆等，结论与明细经 `POST /admin/plugin/{id}/scan-report` 落 `scan_status/scan_report` 供审计与回显。
- 备注：服务端异步扫描与恶意样本库检测为后续增强。

**c. 沙箱预览 ✅**
- 详情「沙箱预览」在 `sandbox="allow-scripts"` 的无同源 iframe 中内联执行候选产物，`postMessage` 回传 console/error 日志；iframe 不授予宿主权限与网络访问。

**d. 下架 / 紧急召回 ✅**
- `wiki_plugin` 增加 `suspended/suspend_reason/suspend_time/suspend_by(_name)`；`POST /admin/plugin/{id}/suspend`、`/restore`。
- 下架后从市场列表与详情隐藏、禁止安装；后台新增「已下架」筛选页签；下架/恢复均通知开发者。

**e. 举报与评分治理 ✅（评分治理待评分入口）**
- 新表 `wiki_plugin_report` + 客户端 `POST /plugin/report`（插件详情「举报该插件」入口）+ 后台「插件举报」页（`GET /admin/plugin/report/list`、`POST /admin/plugin/report/{id}/handle`）。
- 备注：评分/评论刷量检测依赖尚不存在的评分入口，暂缓。

### 2.3 第三期（P2，精细化与生态）

- **兼容性矩阵**：最低宿主版本、依赖插件、平台（web/desktop）声明与校验。
- **开发者体系**：开发者资料、认证/信任等级，认证开发者可走快速通道。
- **可信内建**：延续 `createInnerPlugin` 的可信直发，增加白名单与「跳过人审但保留扫描」策略。
- **审核规则引擎**：把审核清单/评分模板配置化，支持不同分类走不同检查项。
- **灰度发布**：候选版本按租户/用户比例灰度，再全量。
- **通用审计接入**：审核/下架等写操作接入三期「操作审计」表（见总规划 §4.3）。
- **导出**：审核台账导出 CSV，供合规留档。

### 2.4 权限点建议

| 权限 | 说明 |
| --- | --- |
| `platform.plugins.read` | 查看审核队列与详情（现有） |
| `platform.plugins.review` | 开始/通过/驳回（现有） |
| `platform.plugins.publish` | 下架/恢复已发布插件（建议新增，与日常审核分离） |
| `platform.plugins.scan.read` | 查看安全扫描报告（建议新增） |

---

## 3. 表结构草案（增量）

```sql
-- 结构化驳回/审核扩展（在 V22 已加 review_comment/reviewer_* 基础上）
ALTER TABLE wiki_plugin_version
    ADD COLUMN review_reason_code VARCHAR(32) NULL COMMENT 'ARTIFACT_INVALID|INTEGRITY_MISMATCH|DESCRIPTION_MISMATCH|SECURITY_RISK|POLICY_VIOLATION|OTHER',
    ADD COLUMN claimed_by         BIGINT      NULL COMMENT '审核认领人',
    ADD COLUMN claimed_time       DATETIME    NULL,
    ADD COLUMN scan_status        VARCHAR(16) NULL COMMENT 'PENDING|PASS|WARN|FAIL',
    ADD COLUMN scan_report        JSON        NULL,
    ADD COLUMN permissions_json   JSON        NULL COMMENT '能力/权限声明';

-- 插件举报（或复用通用 wiki_content_report，target_type='PLUGIN'）
CREATE TABLE IF NOT EXISTS wiki_plugin_report (
    id          BIGINT PRIMARY KEY AUTO_INCREMENT,
    plugin_id   BIGINT NOT NULL,
    version_id  BIGINT NULL,
    reason_type VARCHAR(32) NOT NULL,
    reason_text VARCHAR(500),
    reporter_id BIGINT NOT NULL,
    status      VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    handler_id  BIGINT,
    handle_note VARCHAR(500),
    handle_time DATETIME,
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_deleted  INT DEFAULT 0,
    KEY idx_status_time (status, create_time),
    KEY idx_plugin (plugin_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='插件举报表';
```

---

## 4. 优先级与依赖

```
P0 审核提效与闭环
├── 批量审核 ─────────────┐
├── 结构化驳回原因 ───────┼──> 运营指标（时效/通过率/原因分布）
├── 审核通知（站内信）────┘
└── 待办 SLA / 认领

P1 安全审查与治理
├── 能力声明 + 权限审查 ──> 审核页只读清单
├── 产物安全扫描 ─────────> 扫描报告
├── 沙箱预览
├── 下架/召回（新权限点 + 审计）
└── 举报与评分治理

P2 精细化与生态
├── 兼容性矩阵 / 依赖声明
├── 开发者体系与信任通道
├── 审核规则引擎（清单/评分配置化）
├── 灰度发布
└── 审计接入 / 台账导出
```

**横切约束**
- 管理端接口统一 `/admin/plugin/**`，网关 + 服务双层 admin 鉴权；高危操作（下架、批量）纳入审计。
- 状态机以服务端条件更新为准，前端展示状态不参与裁决，避免并发越权。
- 驳回原因/扫描结论等对开发者可见的信息与内部备注分离，内部备注不通过客户端接口下发。
- 分页口径：wiki 模块用 `current + pageSize`。

---

## 5. 建议的落地顺序

1. 先做 P0 的「结构化驳回原因 + 审核通知」——投入小、闭环价值最高（驳回原因已具备自由文本基础）。
2. 再做「批量审核 + 运营指标」——直接降低审核人力成本。
3. P1 的安全扫描与沙箱取决于是否引入外部扫描能力，需先做技术选型。
4. 下架/召回与举报建议与总规划二期的内容治理一并实施，复用举报与审计基础设施。
