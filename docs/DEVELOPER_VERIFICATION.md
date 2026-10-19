# 开发者认证（Developer Verification）

> 发布 / 管理插件的前置身份审核。实现「未认证不能发布插件、不能管理插件」的服务端边界，
> 并在客户端提供提交、进度查询与拦截引导。

## 1. 规则

| 状态 | 含义 | 能否发布 / 管理插件 |
| --- | --- | --- |
| 无记录 | 从未提交 | ❌ |
| `PENDING` | 已提交，等待人工审核 | ❌ |
| `APPROVED` | 审核通过 | ✅ |
| `REJECTED` | 审核驳回，可修改资料重新提交 | ❌ |
| `SUSPENDED` | 已撤销，可修改资料重新提交 | ❌ |

- 每个用户至多一条认证档案（`wiki_developer.uk_developer_user`）。
- 提交即进入 `PENDING`；`PENDING` 不能重复提交，`APPROVED` 不能重复提交。
- 驳回 / 撤销必须填写原因，原因原样展示给开发者；内部备注僅后台可见。
- 证件号只在审核后台完整返回；开发者本人接口只返回掩码（`idNumberMasked`）。
- 通过认证后，插件详情页的「开发者」展示认证时填写的 `displayName`（回退到账号名）。

## 2. 服务端边界

发布门禁集中在 `PluginApplication.requireDeveloperVerified()`，以下入口在鉴权/权益校验之后调用：

- `POST /plugin`（历史兼容的创建/发版入口）
- `POST /plugin/submissions`（上架）
- `PUT /plugin/submissions/{id}`（驳回后重新提交）
- `POST /plugin/{id}/versions`（发布新版本）

未认证统一抛出 `WikiException.DEVELOPER_NOT_VERIFIED`（业务码 **1100**），
平台异常处理器以 HTTP 400 + 业务码 + 本地化文案返回。客户端可按 `error.code === 1100`
识别（见 `packages/core/src/components/Developer/developer-api.ts`）。

> 只有「发布 / 管理」被拦截；浏览、安装、评分、举报不受影响。
> `createInnerPlugin`（平台可信内建）不受此门禁限制。

## 3. 接口

### 开发者侧

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/knowledge-wiki/developer/me` | 当前用户的认证档案，未提交时 `data = null` |
| `POST` | `/knowledge-wiki/developer/apply` | 提交 / 重新提交认证，body 见 `DeveloperApplyDTO` |

`DeveloperApplyDTO`：`displayName`、`contactName`、`contactEmail`、`contactPhone`、
`idType`（`ID_CARD` / `PASSPORT` / `BUSINESS_LICENSE` / `OTHER`）、`idNumber`，
可选 `intro`、`qualificationPath`（先走通用上传接口拿到对象路径）。

### 后台侧

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| `GET` | `/knowledge-wiki/admin/developer/list` | `platform.plugins.read` | 分页 + `status` + `searchValue` |
| `POST` | `/knowledge-wiki/admin/developer/{id}/approve` | `platform.plugins.review` | `PENDING → APPROVED` |
| `POST` | `/knowledge-wiki/admin/developer/{id}/reject` | `platform.plugins.review` | `PENDING → REJECTED`，`reason` 必填 |
| `POST` | `/knowledge-wiki/admin/developer/{id}/revoke` | `platform.plugins.review` | `APPROVED → SUSPENDED`，`reason` 必填 |

复用插件审核权限，现有审核员无需新增授权；接口同时要求
`principal.clientId == 'kotion-platform-admin'`（与插件后台一致）。

## 4. 数据表（V42）

`backend/knowledgecloud/script/migration/V42__developer_verification.sql`

```sql
wiki_developer(
  id, user_id UNIQUE, user_name,
  display_name, contact_name, contact_email, contact_phone,
  id_type, id_number, intro, qualification_path,
  status, reject_reason, review_comment,
  reviewer_id, reviewer_name, review_time,
  tenant_id, create_user, create_time, update_user, update_time, is_deleted
)
```

状态流转使用条件更新（`WHERE status = ?`）避免并发重复审核：
`approve` / `reject` / `revoke` 更新 0 行即视为状态冲突。

## 5. 客户端实现

| 文件 | 作用 |
| --- | --- |
| `packages/core/src/components/Developer/developer-api.ts` | 共享档案 store（`useDeveloperProfile`）、提交、状态码 1100 判定 |
| `packages/core/src/components/Developer/DeveloperVerificationDialog.tsx` | 提交表单 / 审核中 / 驳回原因 / 撤销 / 已通过面板 |
| `packages/core/src/components/Developer/DeveloperStatusCard.tsx` | 插件管理面板里的「开发者认证」入口与状态 |
| `packages/core/src/components/Shop/PluginUploader/index.tsx` | 上架 / 重新提交前拦截 |
| `packages/core/src/components/Shop/PluginUploader/PluginPublisherHost.tsx` | 插件（含 Plugin Studio）请求发布时拦截 |
| `packages/core/src/services/plugin-marketplace.ts` | 暴露 `getDeveloperProfile()` / `openDeveloperVerification()` 给 Plugin Studio |

体验约定：

- 点击「发布插件 / 重新提交」时先读共享快照；未认证直接打开认证表单，不进入三步向导。
- 认证弹窗每次打开强制刷新一次状态，审核通过后点「继续」直接回到发布流程。
- Plugin Studio 在 build 之前检查 `getDeveloperProfile()`，未认证时打开认证弹窗并中止，
  避免构建 + 上传后才发现 1100。
- 快照过期导致服务端仍返回 1100 时，错误信息会显示在提交流程中，重新打开认证弹窗即可刷新。

## 6. 后台页面

`apps/admin/src/pages/developers/DeveloperList.tsx`，菜单位置：平台能力 → 开发者认证。

- 状态页签：待审核 / 已通过 / 已驳回 / 已撤销 / 全部；支持开发者名称、账号、联系方式搜索。
- 详情：完整证件号、资质材料下载、简介、审核记录。
- 操作：通过（可选内部备注）、驳回（原因必填）、撤销（原因必填）。

## 7. 自测

后端（需要 Java 8 + Maven；当前开发机未安装 JDK，未在本机执行）：

```bash
cd backend/knowledgecloud
mvn -pl knowledge-service/knowledge-wiki -am test \
  -Dtest=DeveloperApplicationTest,PluginApplicationTest
```

覆盖点：

- `DeveloperApplicationTest`：新建 / 审核中重复提交 / 已认证重复提交 / 驳回后重提 /
  通过 / 驳回（原因必填）/ 撤销（仅已通过）/ `requireApproved` / 展示名来源。
- `PluginApplicationTest#publishingRequiresVerifiedDeveloper`：未认证发版返回业务码 1100，
  且不会落候选版本。

前端类型检查：

```bash
pnpm --filter @kn/core build
pnpm --filter @kn/plugin-plugin-studio build
pnpm --filter admin build
```
