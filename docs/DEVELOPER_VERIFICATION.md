# 开发者认证（Developer Verification）

> 发布 / 管理插件的前置身份审核。认证档案属于**系统（身份）域**，放在
> `knowledge-system`；knowledge-wiki 在发布入口通过 Feign 读取认证状态并拒绝未认证用户。
> 客户端负责提交、进度查询与拦截引导。

## 1. 规则

| 状态 | 含义 | 能否发布 / 管理插件 |
| --- | --- | --- |
| 无记录 | 从未提交 | ❌ |
| `PENDING` | 已提交，等待人工审核 | ❌ |
| `APPROVED` | 审核通过 | ✅ |
| `REJECTED` | 审核驳回，可修改资料重新提交 | ❌ |
| `SUSPENDED` | 已撤销，可修改资料重新提交 | ❌ |

- 每个用户至多一条认证档案（`knowledge_developer.uk_developer_user`）。
- 提交即进入 `PENDING`；`PENDING` 不能重复提交，`APPROVED` 不能重复提交。
- 驳回 / 撤销必须填写原因，原因原样展示给开发者；内部备注仅后台可见。
- 证件号只在审核后台完整返回；开发者本人接口只返回掩码（`idNumberMasked`）。
- 通过认证后，插件详情页的「开发者」展示认证时填写的 `displayName`（回退到账号名）。

## 2. 模块边界

| 模块 | 职责 |
| --- | --- |
| `knowledge-system` | 认证档案实体/表、提交与审核、后台接口、`/developer/verification` 状态契约 |
| `knowledge-system-api` | `IDeveloperClient` Feign 契约与 `DeveloperVerificationVO` |
| `knowledge-wiki` | 发布门禁：提交 / 重提 / 发版前调用 `IDeveloperClient.verification()` |

认证表与 `knowledge_user` 等系统表同库（`knowledge` schema，表名 `knowledge_*`）。

## 3. 发布门禁

`PluginApplication.requireDeveloperVerified()` 在鉴权/权益校验之后调用，覆盖：

- `POST /plugin`（历史兼容的创建/发版入口）
- `POST /plugin/submissions`（上架）
- `PUT /plugin/submissions/{id}`（驳回后重新提交）
- `POST /plugin/{id}/versions`（发布新版本）

结果：

- 状态不是 `APPROVED` → `WikiException.DEVELOPER_NOT_VERIFIED`，业务码 **1100**（HTTP 400）。
- 系统服务不可用 → `DEVELOPER_VERIFICATION_UNAVAILABLE`，业务码 **1106**（fail-closed，不放行）。

> 只有「发布 / 管理」被拦截；浏览、安装、评分、举报不受影响。
> `createInnerPlugin`（平台可信内建）不受此门禁限制。

## 4. 接口

### 开发者侧（knowledge-system）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/knowledge-system/developer/me` | 当前用户的认证档案，未提交时 `data = null` |
| `GET` | `/knowledge-system/developer/verification` | 当前用户状态（服务间契约，也用于前端兜底） |
| `POST` | `/knowledge-system/developer/apply` | 提交 / 重新提交认证，body 见 `DeveloperApplyDTO` |

`DeveloperApplyDTO`：`displayName`、`contactName`、`contactEmail`、`contactPhone`、
`idType`（`ID_CARD` / `PASSPORT` / `BUSINESS_LICENSE` / `OTHER`）、`idNumber`，
可选 `intro`、`qualificationPath`（先走通用上传接口拿到对象路径）。

### 后台侧（knowledge-system）

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| `GET` | `/knowledge-system/admin/developer/list` | `platform.plugins.read` | 分页 + `status` + `searchValue` |
| `POST` | `/knowledge-system/admin/developer/{id}/approve` | `platform.plugins.review` | `PENDING → APPROVED` |
| `POST` | `/knowledge-system/admin/developer/{id}/reject` | `platform.plugins.review` | `PENDING → REJECTED`，`reason` 必填 |
| `POST` | `/knowledge-system/admin/developer/{id}/revoke` | `platform.plugins.review` | `APPROVED → SUSPENDED`，`reason` 必填 |

复用插件审核权限，现有审核员无需新增授权；接口同时要求
`principal.clientId == 'kotion-platform-admin'`（与插件后台一致）。

## 5. 数据表

- `V42__developer_verification.sql`：最初的 `wiki_developer` 表（功能曾在 wiki 模块）。
- `V43__developer_verification_to_system.sql`：收敛到系统域 `knowledge_developer`。
  - 只存在 `wiki_developer` → `ALTER TABLE ... RENAME TO`；
  - 两个都不存在 → 直接创建最终表；
  - 两个都存在 → `INSERT IGNORE` 保留数据后删除旧表；
  - 已迁移过 → no-op。

```
knowledge_developer(
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

## 6. 客户端实现

| 文件 | 作用 |
| --- | --- |
| `packages/core/src/components/Developer/developer-api.ts` | 共享档案 store（`useDeveloperProfile`）、提交、业务码 1100 判定 |
| `packages/core/src/components/Developer/DeveloperVerificationDialog.tsx` | 提交表单 / 审核中 / 驳回原因 / 撤销 / 已通过面板 |
| `packages/core/src/components/Developer/DeveloperStatusCard.tsx` | 插件管理面板里的「开发者认证」入口与状态 |
| `packages/core/src/components/Shop/PluginUploader/index.tsx` | 上架 / 重新提交前拦截 |
| `packages/core/src/components/Shop/PluginUploader/PluginPublisherHost.tsx` | 插件（含 Plugin Studio）请求发布时拦截 |
| `packages/core/src/components/Shop/PluginManager/PluginList.tsx` | 管理插件里的「发布新版本」拦截 |
| `packages/core/src/services/plugin-marketplace.ts` | 暴露 `getDeveloperProfile()` / `openDeveloperVerification()` 给 Plugin Studio |

体验约定：

- 点击「发布插件 / 重新提交 / 发布新版本」时先读共享快照；未认证直接打开认证表单，不进入三步向导。
- 认证弹窗每次打开强制刷新一次状态，审核通过后点「继续」直接回到发布流程。
- Plugin Studio 在 build 之前检查 `getDeveloperProfile()`，未认证时打开认证弹窗并中止，
  避免构建 + 上传后才发现 1100。
- 快照过期导致服务端仍返回 1100 时，错误信息会显示在提交流程中，重新打开认证弹窗即可刷新。

## 7. 后台页面

`apps/admin/src/pages/developers/DeveloperList.tsx`，菜单位置：平台能力 → 开发者认证。

- 状态页签：待审核 / 已通过 / 已驳回 / 已撤销 / 全部；支持开发者名称、账号、联系方式搜索。
- 详情：完整证件号、资质材料下载、简介、审核记录。
- 操作：通过（可选内部备注）、驳回（原因必填）、撤销（原因必填）。

## 8. 自测

后端：

```bash
cd backend/knowledgecloud
mvn -pl knowledge-service/knowledge-system -am test -Dtest=DeveloperApplicationTest
mvn -pl knowledge-service/knowledge-wiki -am test -Dtest=PluginApplicationTest
```

覆盖点：

- `DeveloperApplicationTest`（system）：新建 / 审核中重复提交 / 已认证重复提交 / 驳回后重提 /
  通过 / 驳回（原因必填）/ 撤销（仅已通过）/ `verification()` 契约。
- `PluginApplicationTest#publishingRequiresVerifiedDeveloper`（wiki）：未认证发版返回业务码 1100，
  且不会落候选版本。

前端类型检查：

```bash
pnpm --filter @kn/core build
pnpm --filter @kn/plugin-plugin-studio build
pnpm --filter admin build
```

## 9. 备注

- `knowledge-system` 没有 i18n 资源，认证档案操作（1201-1206）返回中文业务文案；
  发布门禁（1100/1106）仍走 wiki 的 i18n。
- 存量插件开发者上线后需先审核通过才能继续发版；建议上线前批量通知或预审。
