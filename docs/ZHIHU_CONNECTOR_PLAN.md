# 知乎 Connector 规划（可行性 + 实施方案）

> 状态：规划稿 · 结论：**可以做，且应基于知乎官方开放平台，而不是逆向爬虫**
> 参考来源：知乎数据开放平台 `developer.zhihu.com`、知乎 OAuth `openapi.zhihu.com`，
> 以及社区实现 klarkxy/zhihu-search、dawnswwwww/zhihu-cli。

---

## 1. 结论

- **可行，属于"中等体量插件"，不是高风险项目。**
- 关键变化：知乎已上线**官方数据开放平台**（Bearer Token 鉴权），提供搜索、全网搜索、
  热榜、直答、用户公开数据、知识库 RAG、PDF/PPT 工具，并同时提供 API / Skill / MCP 三种形态。
- 另有 `openapi.zhihu.com` 提供第三方 **OAuth 登录**与用户社交关系数据。
- 仓库已有一套成熟的 connector 范式可复用：`packages/plugin-github`。
- **浏览器端可直连**：实测 `developer.zhihu.com` 的 CORS 为 `access-control-allow-origin: *`，
  预检明确允许 `Authorization`、`X-Request-Timestamp`、`Content-Type`，因此 Web 端无需后端代理
  （只要请求不带 `credentials: 'include'`）。桌面端天然无此限制。

---

## 2. 知乎官方能力现状

### 2.1 数据开放平台（developer.zhihu.com）

鉴权：所有数据接口统一使用 `Authorization: Bearer <Access Secret>`，并必须带秒级
`X-Request-Timestamp`。常见错误码：`0` 成功、`10001` 参数错误、`20001` 鉴权失败、
`30001` 频率限制、`30002` 额度不足、`90001` 内部错误。

| 能力 | 端点（方法 + 路径） |
|---|---|
| 站内搜索 | `GET /api/v1/content/zhihu_search`（Count ≤ 10） |
| 全网搜索 | `GET /api/v1/content/global_search`（Count ≤ 20，支持 host/publish_time filter） |
| 热榜 | `GET /api/v1/content/hot_list`（Limit ≤ 30） |
| 直答（对话/生成） | `POST /v1/chat/completions`（OpenAI 风格，model: zhida-fast/thinking/agent） |
| 额度查询 | `GET /api/v1/quota`（不消耗业务额度） |
| 用户创作/关注/收藏/收藏夹 | `GET /api/v1/user/contents | followees | collections | favlists | favlist_contents` |
| 知识库列表/内容/上传/检索 | `/api/v1/knowledge/bases | items | files | search`（RAG） |
| PDF 解析 | `POST /resources/v1/files` + `/api/v1/pdf-parse/tasks`（异步轮询） |
| PPT 生成 | `POST /api/v1/ppt-generation/tasks`（异步轮询） |

要点：
- 官方另有 **Skill 包**（zip，含 SKILL.md、面向 Agent、snake_case）与 **MCP-over-SSE**，
  可用于直接对接 Agent。
- `user_*` 默认只能读**当前调用方本人**数据；读他人需其 OAuth 授权（`X-OAuth-Token`）。
- 额度按自然日限免，`quota` 可查各能力剩余额度。
- 直答接口兼容 OpenAI 语义，便于复用现有 chat 客户端。

### 2.2 OAuth（openapi.zhihu.com）

`GET /authorize`（app_id + redirect_uri + response_type=code）→ `POST /access_token` 换
`access_token`（默认 30 天）→ `GET /user`、`/user/followers`、`/user/followed`、`/user/moments`。

---

## 3. 仓库现状与可复用范式

### 3.1 插件机制
- 插件继承 `KPlugin`（`packages/common/src/core/PluginManager.ts`），通过 `PluginManager` 注册。
- 编辑期扩展通过 `ExtensionWrapper`（`packages/common/src/core/editor.ts`）贡献：
  `extendsion`（Tiptap 节点）、`slashConfig`、`tools`（AI 工具）、`skills`（AI 技能）。
- 设置面板：`PluginConfig.settings`（`PluginSettingsConfig`）→ 出现在全局设置对话框。
- 市场分类常量：`PLUGIN_CATEGORIES = ["APP","FEATURE","CONNECTOR"]`
  （`packages/core/src/components/Shop/PluginUploader/schema.ts`），**知乎插件应归入 CONNECTOR**。

### 3.2 最接近的参考实现：`packages/plugin-github`
目录结构即目标模板：

```
plugin-github/src/
  index.tsx                 # KPlugin + settings + locales
  types/config.ts           # PluginConfigData 子类型 + DEFAULT
  services/github-client.ts # 鉴权/请求封装
  services/*-service.ts     # 业务请求
  services/github-cache.ts  # TTL 缓存
  services/github-errors.ts # 错误归一化
  hooks/use-github-config.ts
  hooks/use-github-data.ts
  components/GitHubSettings.tsx   # 设置 UI（含"测试连接"）
  extension/index.tsx       # ExtensionWrapper
  extension/nodes/*.tsx     # atom 节点 + ReactNodeView
  extension/tools/*.ts      # AI 工具
  extension/skills/*.ts     # AI 技能
```

- 配置存储：`usePluginConfig`（`packages/common/src/hooks/use-plugin-config.ts`）+
  `HybridPluginConfigStorage`（API 优先、localStorage 兜底，见
  `packages/common/src/services/plugin-config-service.ts`）。
- 节点模式：`atom: true, draggable: true`，attrs 存数据快照，NodeView 用 `useActive` 触发浮层操作，
  带 `lastSyncAt` + 刷新（见 `github-issue-node.tsx` / `GitHubIssueCard`）。
- 构建：`rollup.config.mjs` → `baseConfig({ input: "src/index.tsx", pkg })`；
  package.json 声明 `@kn/common|editor|ui|icon` 依赖与 `publishConfig`。
- 注册：`apps/vite/src/bundled-plugins.ts` 与 `apps/desktop/src/renderer/src/bundled-plugins.ts`。

### 3.3 AI 技能系统
- 技能注册表在 `packages/common/src/ai/skills/skill-registry.ts`，支持内置技能、示例技能、
  SkillsMP 市场、以及从 **URL/JSON 导入**（`use-skill-registry.ts` 内 `fetch(url)`）。
- 因此官方知乎 Skill 包可直接作为"可安装技能"进入现有技能市场，无需重写。

### 3.4 缺口
- 仓库当前**没有任何 MCP 客户端**（`packages/core/src/ai` 无 MCP 引用），所以官方 MCP 不能直接复用，
  一期走 **REST 直连**。
- 仓库目前无 Zhihu 相关代码，属于全新包。

---

## 4. 可行性验证结果（已实测）

| 验证项 | 结果 |
|---|---|
| API 是否真实存在 | 是。未带 Token 请求 `/api/v1/content/hot_list` 返回 `{"Code":20001,"Message":"Authorization failed","Data":null}` |
| 浏览器能否直连（CORS） | 可以。预检返回 `access-control-allow-origin: *`，且 `allow-headers` 含 `Authorization, X-Request-Timestamp, Content-Type` |
| 桌面端 | 无 CORS 限制，天然可行 |
| 参考实现 | 社区已有 CLI / Skill / MCP 多份可参考实现，接口已被人跑通 |

---

## 5. 风险与约束

1. **Access Secret 是账号级密钥。** 现有 `usePluginConfig` 会把配置同步到后端
   （`SAVE_PLUGIN_CONFIG`）+ localStorage。需明确策略：
   - A. 沿用混合存储（与 GitHub PAT 一致，最简单）；
   - B. 仅存 localStorage（不上云，但换设备需重填）；
   - C. 后端代理持有密钥（最安全，但要动后端）。
   → 建议一期用 A，并在设置页与文档明确提示；对企业/多租户场景预留 C。
2. **额度与限流。** 官方按自然日限免额度，超限 `30002`、频繁 `30001`。
   必须有 TTL 缓存 + 串行限流 + 额度展示，否则工具会随机失败。
3. **可读范围有限。** 官方偏"搜索/直答/知识库"，**没有**任意问题/回答全文的通用读取端点。
   因此定位不能是"全站同步器"，而是"检索 + 引用 + 直答"。
4. **版权 / ToS。** 建议只落地**标题 + 摘要 + 作者 + 链接**（快照），不整篇抓取入库；
   全文通过链接回源。热榜/搜索结果本身就是摘要形态。
5. **他人数据需 OAuth。** `user_*` 读他人需对方授权，属重能力，建议放三期。
6. **接口演进。** 开放平台较新，字段/端点可能变化，client 层要做防御式解析与版本兼容。

---

## 6. 推荐定位与范围

**定位：知乎知识源 Connector（检索 / 引用 / 直答）。**

一期（MVP）：
- 设置页：填 Access Secret、测试连接（调 `quota`）、显示剩余额度。
- 编辑器节点：知乎搜索结果卡片、热榜卡片（引用式，存快照 + 链接）。
- AI 工具：`zhihuSearch`、`zhihuHotList`、`zhihuAsk`、`zhihuQuota`。
- AI 技能：`zhihu-researcher`（按需搜索/直答并给出来源链接）。

二期：`global_search`、用户公开数据（本人创作/关注/收藏）、更多卡片样式、缓存/限流完善。

三期：OAuth 登录与他人数据、知识库 RAG、PDF/PPT 工具、官方 Skill/MCP 桥接。

---

## 7. 架构设计

新建包 `packages/plugin-zhihu`（category = CONNECTOR）：

```
packages/plugin-zhihu/
  package.json / rollup.config.mjs / tsconfig.json
  src/
    index.tsx                       # KPlugin 注册 + settings + locales(zh/en)
    types/config.ts                 # ZhihuPluginConfig + DEFAULT_ZHIHU_CONFIG
    types/zhihu.ts                  # 官方 DTO 类型
    services/zhihu-client.ts        # Bearer + X-Request-Timestamp + 错误码归一
    services/zhihu-search-service.ts
    services/zhihu-hot-service.ts
    services/zhihu-ask-service.ts   # /v1/chat/completions（兼容 OpenAI）
    services/zhihu-quota-service.ts
    services/zhihu-cache.ts         # TTL 缓存（对齐 github-cache）
    services/zhihu-errors.ts        # 错误码 → 文案
    services/zhihu-rate-limit.ts    # 简单令牌桶/串行队列
    hooks/use-zhihu-config.ts
    hooks/use-zhihu-data.ts
    components/ZhihuSettings.tsx
    components/ZhihuCard.tsx / ZhihuHotListCard.tsx / ZhihuLogo.tsx
    extension/index.tsx             # nodes + slashConfig + tools + skills
    extension/nodes/zhihu-content-node.tsx
    extension/tools/search-tools.ts / ask-tools.ts / hot-tools.ts / account-tools.ts
    extension/skills/zhihu-researcher.ts
```

关键实现：

- **鉴权**：`headers: { Authorization: \`Bearer \${secret}\`, 'X-Request-Timestamp': String(Math.floor(Date.now()/1000)) }`；
  统一走 `zhihu-client.ts`，集中处理错误码与重试策略（`30001`/rate limit 退避，`20001` 引导去设置）。
- **缓存**：搜索 5–10 min、热榜 5 min、额度 1 min；key 含 query/limit。
- **限流**：单并发队列 + 最小间隔，避免触发 `30001`。
- **节点快照**：attrs 存 `title/url/excerpt/authorName/voteUpCount/commentCount/contentType/editTime/lastSyncAt`，
  离线可渲染，刷新时重新拉取。
- **AI 工具**：`execute: (editor) => async (params) => {...}`，网络请求在工具内完成；
  `readOnly` 明确的只读工具；无 secret 时返回引导文案而非抛异常。
- **技能**：`requiredTools/optionalTools` 关联上述工具，`systemPromptFragment` 说明"先搜后答、必须附来源链接"。
- **注册与发布**：加入 `bundled-plugins.ts`；发布到插件市场时 category 选 CONNECTOR，
  声明 `NETWORK` 权限（`BasicInfoStep` 中已有 `network` 权限项）。

---

## 8. API → 工具映射

| 用户意图 | 官方端点 | AI 工具 | 编辑器入口 |
|---|---|---|---|
| 搜知乎 | `GET /api/v1/content/zhihu_search` | `zhihuSearch` | `/zhihu-search` |
| 搜全网 | `GET /api/v1/content/global_search`（二期） | `zhihuGlobalSearch` | — |
| 看热榜 | `GET /api/v1/content/hot_list` | `zhihuHotList` | `/zhihu-hot` |
| 问知乎 | `POST /v1/chat/completions` | `zhihuAsk` | — |
| 查额度 | `GET /api/v1/quota` | `zhihuQuota` | 设置页 |
| 我的创作/收藏 | `/api/v1/user/*`（二期） | `zhihuUserContents` 等 | — |
| 知识库检索 | `POST /api/v1/knowledge/search`（三期） | `zhihuKnowledgeSearch` | — |

---

## 9. 分期与工作量（单人估）

| 阶段 | 内容 | 估时 |
|---|---|---|
| P0 | 脚手架 + client + 错误码 + settings(密钥/测试连接/额度) | 0.5–1 天 |
| P1 | 搜索/热榜/直答 + 卡片节点 + slash + 3–4 个工具 + 1 个技能 | 2–4 天 |
| P2 | 全网搜索 + 本人用户数据 + 缓存/限流 + 卡片样式完善 | 2–3 天 |
| P3 | OAuth + 他人数据 + 知识库 RAG + PDF/PPT + Skill/MCP 桥接 | 3–5 天 |
| P4 | 打包、市场提交（CONNECTOR + NETWORK）、文档、i18n | 1–2 天 |

---

## 10. 验收标准

- client 单测：URL 构造、时间戳、错误码映射、缓存命中。
- 设置页「测试连接」调用 `quota` 成功并显示剩余额度。
- 无/错 Secret 时：设置页报 `20001` 文案；AI 工具返回明确引导，不崩溃。
- 限流路径：连续调用触发退避，不产生 `30001` 雪崩；额度耗尽展示 `30002` 提示。
- Web（`apps/vite`）与桌面（`apps/desktop`）都能插入卡片、Agent 能调用工具。
- 国际化 zh/en 覆盖。
- 不整篇抓取正文，仅存摘要 + 链接。

---

## 11. 待确认决策点

1. **密钥存储**：沿用 `usePluginConfig`（会同步后端）/ 仅本地 / 后端代理？（建议：一期沿用，预留代理）
2. **范围**：只做 P1 MVP，还是直接做到 P2 / P3？（建议：先 P1 跑通，再迭代）
3. **内容落地**：仅引用卡片（推荐，合规）还是要把正文导入文档（有版权风险）？
4. **是否需要 OAuth 登录知乎账号**，以及是否需要"他人数据"能力？
5. **是否需要在插件市场发布**（涉及 category=CONNECTOR、NETWORK 权限、审核流程）？

---

## 12. 建议的下一步

确认上述决策点后，按 P0 → P1 落地：先建 `packages/plugin-zhihu` 骨架与 `zhihu-client`，
在设置页打通"Access Secret + 测试连接 + 额度"，再补搜索/热榜/直答工具与引用卡片。

---

## 13. 追加：把本地文章发布到知乎（可行 · 走官方 Publisher OpenAPI）

### 13.1 结论
**可行。** 知乎官方已提供**内容发布 OpenAPI**（官方 `zhihu-publisher` Skill，author=zhihu，当前版本 0.1.11，**内测**），
支持三种形态：`article`（文章）、`question`（提问）、`pin`（想法）。它与数据读取平台是**两套独立鉴权**。

### 13.2 发布接口规格
- `POST https://openapi.zhihu.com/openapi/publish`（`BASE_URL` 可用环境变量 `ZHIHU_PUBLISH_BASE_URL` 覆盖）
- Headers（全部必填）：

| Header | 值 |
|---|---|
| `Content-Type` | `application/json` |
| `X-App-Key` | `ZHIHU_OPENAPI_APP_KEY`（用户 member token / URLToken） |
| `X-Timestamp` | Unix 秒级时间戳 |
| `X-Log-Id` | 调用方生成的唯一日志 ID |
| `X-Extra-Info` | 可为空串，**空值也必须发送**且参与签名 |
| `X-Sign` | Base64(HMAC-SHA256(sign_string, `ZHIHU_OPENAPI_APP_SECRET`)) |

- 签名串：`sign_string = app_key:{X-App-Key}|ts:{X-Timestamp}|logid:{X-Log-Id}|extra_info:{X-Extra-Info}`
- 请求体：

```json
{ "type": "article | question | pin", "confirmed": true,
  "confirm_note": "confirmed by user after local preview", "content": { } }
```

- 响应：`{ "status": 0, "msg": "success", "data": { "type": "article", "content_token": "123456", "url": "https://zhuanlan.zhihu.com/p/123456" } }`
  - **HTTP 200 不代表发布成功**，必须读 body 的 `status`（`0` 才成功）；失败返回 `status != 0`。
  - 鉴权失败可能 401；频率超限可能 429（`rate limit exceeded`）。
- **限流：每人每天最多 50 次发布。**
- **图片**：走官方 `zhihu-mediacloud-uploader`（独立 Skill/MCP）上传到知乎媒体云换 `media_key`；
  **仅支持图片，不支持视频/其他文件。**
- **凭证**：`APP_KEY` = 知乎个人主页 URL 里的用户名；`APP_SECRET` = 在
  `https://www.zhihu.com/playground/zhihu-publisher` 申请（内测，可能拿不到）；
  官方推荐存到 `~/.zhihu/openapi-credentials.json`，且不得泄露。

### 13.3 内容形态限制（官方校验规则）
| 形态 | 标题 | 正文 |
|---|---|---|
| article | 必填，≤ 100 字，禁换行 | 必填，9–100000 字 |
| question | 必填，4–51 字（含问号，缺则补 `？`） | 可选，无字数限制 |
| pin | 字段必需，可空串，≤ 50 字 | 可选，≤ 2000 字；正文/图片/链接卡片至少一项 |

- 正文最终为**知乎可发布 HTML**；有 HTML 安全白名单（禁 `script/iframe/style`、`on*` 等）。
- AI 生成/辅助内容建议声明 `ai_creation`（article/pin 支持；question 无此字段）。

### 13.4 官方流程（建议我们沿用）
`用户内容 → draft(latest-draft.md) → validate(转知乎 HTML + 长度预检 → latest.json) → preview(本地 HTML) → 用户明确确认 → publish(签名 + POST) → 记录 response`
发布不可逆，必须**先预览、再显式确认**；需求变更只能回改 draft，不允许直接改 validate/preview/request。

### 13.5 两套鉴权对比
| | 数据开放平台（读） | Publisher OpenAPI（写） |
|---|---|---|
| 域名 | `developer.zhihu.com` | `openapi.zhihu.com` |
| 鉴权 | `Authorization: Bearer <Access Secret>` + `X-Request-Timestamp` | `X-App-Key` + HMAC-SHA256 `X-Sign` |
| 凭证 | Access Secret | APP_KEY（用户 token）+ APP_SECRET（SK） |
| CORS 实测 | 开放（`*`，允许上述头） | **同样开放**（允许 `X-App-Key/X-Sign` 等） |

> 未带凭证实测：`POST /openapi/publish` 返回 `{"error":{"code":101,"name":"AuthenticationError","message":"authentication failed"}}`，
> 证明端点真实存在；CORS 预检返回 `access-control-allow-origin: *`，**Web 端也能直连发布**（桌面端同样可行）。

### 13.6 在 connector 中的实现方案
- 新增 `src/services/zhihu-publish-service.ts`：用 **WebCrypto**（`crypto.subtle.importKey` + `sign`）做 HMAC-SHA256 → Base64；生成 `X-Timestamp/X-Log-Id/X-Extra-Info/X-Sign`。
- 新增内容转换：Tiptap 文档/JSON → 知乎 HTML（标题 + 正文），做长度预检与 HTML 白名单清洗。
- 新增 UI：`/publish-zhihu` 命令 + 顶部/文档操作菜单 → `ZhihuPublishDialog`：
  形态选择（article/pin/question）、标题、正文、话题、评论权限、创作声明、**本地预览**、**「确认发布」二次确认**。
- 新增 AI 工具（高风险）：
  - `validateZhihuContent`（只读、可自动调用）
  - `previewZhihuContent`（只读）
  - `publishToZhihu`（**写操作**）：默认不暴露给 Agent 自动执行，或强制要求用户显式确认后才允许；`readOnly: false`。
- 图片：一期可先支持**无图/纯文本**发布；再接入官方媒体云上传（`media_key`）。
- 凭证安全：`APP_SECRET` 属高敏，不应写入日志/仓库；沿用 `usePluginConfig` 会同步后端，建议改为**仅本地存储**或**后端代理签名**（服务端持密钥，前端只发内容）。
- 审计：每次发布落本地 `request/response` 记录（对齐官方 `publish/latest-request.json`）。

### 13.7 工作量
- 纯文本发布链路（签名 + 转换 + 预览 + 确认 + 工具/UI）：**3–5 天**。
- 图片上传（媒体云 OpenAPI / 官方 uploader）：**+2–3 天**。
- 若走后端代理签名：**+1–2 天**（后端改动）。

### 13.8 发布相关的额外风险
1. **内测门槛**：`APP_SECRET` 需申请，可能暂不可用；接口与字段可能变。
2. **限流**：50 次/人/天，且发布不可撤销，需要强确认与审计。
3. **合规**：AI 生成内容需声明 `ai_creation`；正文 HTML 与话题有平台规则。
4. **形态限制**：视频暂不支持；文章标题 ≤100 字、pin 正文 ≤2000 字等硬限制。
5. **密钥安全**：APP_SECRET 泄露风险高于读取用的 Access Secret，必须谨慎存储。

### 13.9 建议
把它作为 **P5（发布能力）**：先做**手动确认的纯文本发布**（预览 + 二次确认），跑通签名与形态转换；
再补图片上传、后端代理签名、以及批量/多平台分发。发布工具**绝不默认交给 Agent 自动执行**。

