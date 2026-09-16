# 运营功能规划（landing-page-vite × apps/admin）

> **范围**：以「落地页获客 → 产品激活」增长闭环为主线的运营能力建设，交付面为
> `apps/landing-page-vite` 与 `apps/admin` 两个前端应用，以及支撑它们的 `knowledge-system` 后端接口。
>
> **与既有文档的关系**：
> - `docs/LANDING_OPS.md` 记录**已建成**的落地页运营底座（表结构、公开接口、管理接口、部署）；
>   本文是建立在其之上的**能力演进规划**，并取代其 §10「后续可做」作为前进基线。
> - `docs/ADMIN_OPERATIONS_ROADMAP.md` 覆盖**平台侧**运营（用户/内容治理、AI 成本、稳定性）。
>   本文不重复该范围，只在交叉处做衔接（见 §9），并修正该文档中已被代码证伪的基线描述。
>
> **状态**：规划基线。各期实施时单独立项，接口与 DDL 以实施评审为准。

---

## 0. 一页速览

| 阶段 | 目标 | landing-page-vite | apps/admin | 后端 |
| --- | --- | --- | --- | --- |
| **P0** 闭环修复（1–2 周） | 数据可信、转化不断、写入可控 | 同意管理、事件字典落地、表单漏斗事件、模板/插件深链、归因交接 | 接通 6 个已定义未使用的统计接口、转化目标、保存漏斗、周期对比、权限与审计修复 | 独立权限码、审计表、过滤规则、目标/漏斗表 |
| **P1** 无发版运营（3–5 周） | 内容、结构、投放位、实验全部后台可改 | 动态 Head/SEO、区块化首页、推广位、`useExperiment`、可配置表单、性能 | 内容 CMS v2、页面 SEO v2、实验管理、推广位管理、短链 v2、订阅 CRM、市场精选位 | SEO/区块/推广位/实验/素材表与接口 |
| **P2** 增长自动化（4–6 周） | 触达、归因闭环、异常自愈 | Campaign 页渲染、订阅双确认/退订、推荐位 | 邮件活动、跨域联合漏斗、告警、运营工作台、数据导出 | Campaign/人群/邮件/告警表与接口 |

**一句话架构主张**：落地页是**配置驱动的转化面**（只读配置 + 上报数据），admin 是该闭环的**唯一写入源**。
凡「运营需要改的东西」都必须能走两条管道之一：**下行配置流**（admin 写 → 后端存 → 落地页运行时读）或
**上行数据流**（落地页上报 → 后端聚合 → admin 展示）。任何绕过这两条管道的硬编码，都是本期要消除的债。

---

## 1. 运营模型

### 1.1 两条数据流

```
        下行：配置流（无发版运营）
  ┌──────────────┐   PUT/POST   ┌──────────────────┐   GET /ops/*   ┌────────────────────┐
  │  apps/admin  │ ───────────► │ knowledge-system │ ─────────────► │ landing-page-vite  │
  │  （控制台）  │              │  landing_* 表    │   运行时读取   │ （转化面，只读）   │
  └──────────────┘              └──────────────────┘                └────────────────────┘
         ▲                                ▲                                   │
         │  GET /admin/ops/stats/*        │  POST /ops/collect                │
         └────────────────────────────────┴───────────────────────────────────┘
        上行：数据流（埋点 → 聚合 → 洞察）
```

### 1.2 职责边界（一条铁律）

| 应用 | 应当做 | 不应当做 |
| --- | --- | --- |
| `apps/landing-page-vite` | 渲染配置、采集行为、执行分流、渲染实验变体 | 写入任何运营配置；保存业务状态；决定展示什么内容 |
| `apps/admin` | 唯一的运营写入源、聚合洞察、触发触达 | 直接渲染 C 端页面；绕过接口直连数据库 |
| `knowledge-system` | 存配置、收埋点、做聚合、鉴权与审计 | 承载前端可推导的展示逻辑 |

### 1.3 能力分层

| 层 | landing-page-vite | apps/admin |
| --- | --- | --- |
| 采集层 | `src/ops/analytics.ts`（已建）→ 扩展 vitals / 表单 / 实验曝光 / 同意 | — |
| 配置层 | `src/ops/content.ts`（已建）→ 扩展 seo / layout / promotion / experiment | 内容 CMS、SEO、推广位、实验、素材 |
| 转化层 | CTA、表单、公告条、退出意图、Campaign 页 | 线索管理、投放位配置、活动编排 |
| 洞察层 | — | 运营看板、漏斗、目标、渠道、会话、告警 |
| 治理层 | 同意管理、DNT、预览模式（禁采集） | 权限、审计、发布审批、回滚 |

---

## 2. 现状基线

### 2.1 已建成（可直接复用，勿重造）

**落地页 `apps/landing-page-vite/src/ops/`**

| 文件 | 能力 |
| --- | --- |
| `analytics.ts`（282 行） | 自托管埋点 SDK：session/visitor 标识、**首次归因持久化**、批量上报（8s / 20 条）、`visibilitychange`+`pagehide` 走 `sendBeacon`、尊重 DNT、全链路 try/catch 不影响页面 |
| `content.ts` | 文案外置：拉 `/api/knowledge-system/ops/content` 合并进 i18n，2s 超时静默回退 |
| `RouteAnalytics.tsx` / `LangSync.tsx` | 路由级 pageview；`/zh`、`/en` 前缀与语言同步 |
| `github.ts` / `StarCount.tsx` | GitHub Star 社会证明（1h 本地缓存） |
| `changelog.ts` | 更新日志读取 |

- 埋点调用点已铺开：`Hero`、`FinalCTA`、`Header`、`Footer`、`OpenSource`、`Changelog`、`Plugins`、`Templates`、`TemplatesPreview`、`SubscribeForm`。
- 事件已用：`pageview`、`cta_click`、`template_use`、`plugin_install`、`subscribe`。
- 静态 SEO：`index.html` 内置 title/description/OG/Twitter/canonical/hreflang + `SoftwareApplication` JSON-LD；`public/robots.txt`、`public/sitemap.xml`、`public/og-image.png`。
- 外链统一经 `buildTrackedUrl` 追加 `utm_source=kotion-landing`。
- 模板/插件数据来自产品侧公开接口：`/knowledge-wiki/space/public/templates`、`/knowledge-wiki/plugin/public/plugins`。

**管理端 `apps/admin/src/pages/ops/`**（6 个页面，均为**真实实现，无 mock、无 TODO**）

| 页面 | 路由 | 现状 |
| --- | --- | --- |
| `OpsDashboard.tsx`（351 行） | `/ops/dashboard` | 7/30/90 天切换、实时胶囊、4 张指标卡、AreaChart 趋势、渠道归因、TOP 页面、事件排行、临时漏斗构建器 |
| `LandingContent.tsx`（256 行） | `/ops/content` | 按「内容键 + 语言」编辑 JSON 草稿、发布、历史版本回滚 |
| `Subscribers.tsx`（179 行） | `/ops/subscribers` | 列表、状态筛选、搜索、CSV 导出 |
| `ChannelLinks.tsx`（185 行） | `/ops/links` | 创建带 UTM 短链、复制、点击数列、删除 |
| `ChangelogAdmin.tsx`（127 行） | `/ops/changelog` | GitHub Releases 同步、置顶/隐藏 |
| `SeoSettings.tsx`（94 行） | `/ops/seo` | `public.*` 设置的 JSON 文本框 |

**后端**（`knowledge-system`）

- `AdminLandingOpsController` `@RequestMapping("/admin/ops")`：**31 个端点**（统计 11 / 文案 6 / 订阅 4（含导出）/ 短链 5 / 更新日志 3 / 设置 2）。
  类级鉴权 `(platform.dashboard.read or administrator) and principal.clientId == 'kotion-platform-admin'`，
  写操作 `WRITE_AUTH = (platform.settings.manage or administrator) and clientId == ...`。
- `LandingPublicController` `@RequestMapping("/ops")`：`/collect`、`/content`、`/content/{key}`、`/subscribe`、`/go/{slug}`、`/changelog`、`/settings`（**无鉴权**，网关 `AuthProvider` 放行 `/ops/**` 并派生 `/*/ops/**`）。
- `V31__landing_ops.sql`：9 张全局表 `landing_event` / `landing_session` / `landing_content` / `landing_content_revision` / `landing_subscriber` / `landing_link` / `landing_link_click` / `landing_changelog` / `landing_setting`。
- 后端已具备但**前端未接通**的统计能力：`/stats/referrers`、`/stats/tech`、`/stats/event-props`、`/stats/sessions`、`/links/{slug}/stats`。

### 2.2 已建成但未接通（P0 里最便宜的一批收益）

| 后端接口 | 前端状态 | 价值 |
| --- | --- | --- |
| `GET /admin/ops/stats/referrers` | `getOpsReferrers` 已定义、**零调用** | 回答「流量从哪来」，补 GA 替代品的核心一屏 |
| `GET /admin/ops/stats/tech` | `getOpsTech` 已定义、**零调用** | 设备/浏览器/OS 分布，指导适配与投放 |
| `GET /admin/ops/stats/event-props` | `getOpsEventProps` 已定义、**零调用** | 「哪个 CTA 有效」「点的是哪一项」，转化优化必需 |
| `GET /admin/ops/stats/sessions` | `getOpsSessions` 已定义、**零调用** | 会话级明细，漏斗排查的原始证据 |
| `GET /admin/ops/links/{slug}/stats` | `getOpsLinkStats` 已定义、**零调用** | 单渠道点击趋势，评估投放效果 |
| `PUT /admin/ops/links/{id}` | `updateOpsLink` 已定义、**零调用** | 短链无法编辑/启停，只能删了重建 |

> 结论：**P0 的第一批工作不需要任何后端改动**，只需在 admin 加面板与表单。

### 2.3 缺口清单

**A. 度量与洞察**

- A1 无「转化目标」概念，只有临时手填漏斗 → 无法回答「本月订阅转化率是多少、环比如何」。
- A2 无周期对比/同比，趋势只能看绝对值。
- A3 会话/来源站点/设备/事件属性四类面板缺失（接口已有）。
- A4 数据质量无治理：爬虫仅在服务端按 UA 过滤，无内部 IP/测试设备排除、无口径说明、无采样开关。
- A5 漏斗不可保存、不可看趋势。
- A6 无异常告警：转化骤降、埋点断流无人知晓。
- A7 **无事件字典**：事件名与属性散落在各组件字符串里（`track("cta_click", { location: "hero", target: "demo" })`），改名即断数据，无契约、无校验。

**B. 转化路径**

- B1 模板「使用」跳的是 demo 首页（`TemplatesPreview.tsx` 中 href 指向 `LIVE_DEMO_URL`），未深链到具体模板 → 明确转化断点。
- B2 **无归因交接**：跳转产品时只带 UTM，不带 `visitorId/sessionId`，因此无法构建「落地页 → 注册 → 激活」的联合漏斗。
- B3 线索只有邮件订阅一种；无 Demo 预约/咨询/白皮书下载等表单类型，字段不可配置。
- B4 无表单漏斗事件（`form_start` / `form_error` / 放弃），表单优化无数据依据。
- B5 无公告条、退出意图弹窗、吸底 CTA 等主动转化位。
- B6 订阅无双重确认（double opt-in）与公开退订链接 → 送达率与合规风险。

**C. 内容与结构运营**

- C1 内容 CMS 只能逐键编辑：无一键从线上文案导入、无缺失键/未翻译覆盖率视图、无分组与搜索。
- C2 无定时发布、无预览链接、无发布备注 UI（接口支持 `note`，前端未暴露）。
- C3 **无区块化**：首页 10 个区块的顺序写死在 `pages/Home/index.tsx`，运营不能调整叙事顺序或隐藏区块。
- C4 Docs 正文仍是内联 i18n（`Docs/index.tsx` 有 **279 处 `docs.*` 引用**，字典内 `docs:` 命名空间定义 **342 个键**），无 CMS 通道。
- C5 无素材库：OG 图硬编码为 `https://kotion.top/og-image.png`。
- C6 模板/插件无「精选/排序/上下架」运营位，落地页展示完全依赖产品侧返回的原始顺序。

**D. 渠道与投放**

- D1 短链只能建/删（见 §2.2），无启停、无点击趋势、无二维码。
- D2 无 UTM 生成器，渠道口径靠手填，易漂移。
- D3 无「渠道 → 转化」对比，点击量与目标转化割裂。
- D4 **无 A/B 实验能力**，文案/CTA/区块改动只能凭感觉。
- D5 无推荐/邀请机制。

**E. 触达与留存**

- E1 订阅线索只能导 CSV，**运营闭环断在最后一步**：不能发信。
- E2 无线索标签/人群分组/细分筛选（仅有状态与模糊搜索）。
- E3 无站内公告（落地页与主应用均无）。
- E4 无自动化：新版本发布（changelog）不会触达订阅者。

**F. SEO 与站点健康**

- F1 **SPA 单一 head**：所有路由（`/templates`、`/plugins`、`/doc/*`、`/changelog`、`/en/*`）共享 `index.html` 的同一份 title/description/OG/canonical。
- F2 `sitemap.xml` 为手写静态文件，仅有 5 条中文 URL，缺 docs 子页、`/en/*` 变体、模板/插件详情页。
- F3 `/` 与 `/zh` 渲染相同内容且 `canonical` 固定指向 `/` → 重复内容风险（`App.tsx` 用 `buildRoutes("")` 与 `buildRoutes(":lang")` 同时挂载）。
- F4 结构化数据只有 `SoftwareApplication`，缺 `ItemList`（模板/插件）、`FAQPage`（FAQ 区块）、`BreadcrumbList`（文档）。
- F5 无软 404 处理：nginx `try_files $uri /index.html` 使任意路径返回 200，爬虫会索引垃圾 URL。
- F6 未采集 Core Web Vitals；构建产物偏大（`dist` 约 17MB，脚手架字体/依赖未按路由切分）。
- F7 admin「分享与 SEO」是 JSON 文本框，且**加载时过滤 `public.*`、保存时不过滤**——可写入非公开键，与文档契约相悖。

**G. 工程与治理**

- G1 **权限码未独立**：6 个运营页面的导航权限全用 `platform.dashboard.read`，而写操作后端要求 `platform.settings.manage` → 只读用户能看到编辑表单，点击才失败。
- G2 `canAccessNavItem` 在 `user.permissions === undefined` 时返回 `true`（fail-open），且**路由无守卫**，直接改 hash 即可进入任意页面。
- G3 无运营操作审计：谁改了文案、谁发布了什么、谁删了短链，无从追溯。
- G4 `request()` 无条件 `response.json()`；`del<void>` 类接口若返回 204/空体将抛 `SyntaxError`（影响 `deleteOpsLink`、`deleteOpsSubscriber` 等）。
- G5 `Subscribers.tsx` 未使用 `usePagedData` 的 `error` → 请求失败时显示「暂无订阅」；搜索绑定 `onChange` 无防抖，每次按键发一次请求；删除无二次确认。
- G6 运营模块**零测试**，构建门禁为 `vite build`。
- G7 隐私合规：除 DNT 外无同意弹窗；`landing_subscriber` 已存 `ip_hash`（好），但无公开的隐私说明页与数据删除路径。

### 2.4 既有文档与代码不一致（需修正，避免以讹传讹）

| 文档断言 | 代码事实 |
| --- | --- |
| `ADMIN_OPERATIONS_ROADMAP.md` §1.1 称 `pages/users`、`pages/roles` 存在 | `apps/admin/src/pages/` 下**无** `users`/`roles` 目录，无路由、无导航、无 API |
| 同文 §2.2 接口前缀 `/knowledge-agent-skills/admin/ai/...` | 实际调用 `/knowledge-agent/admin/ai/...`（`AdminAiUsageController`） |
| 同文 §2.1/§2.3 称 Dashboard/空间治理已完成 | 属实；但缺空间活动流、`commentCount`、页面只读预览 |
| 同文 §2.4 称登录日志已规划 | 后端 `GET /knowledge-log/login/list` 与写入链路已存在，但 **`knowledge_log_login` 只在 `doc/sql/blade/admin-operations-p0.sql` 里，没有 Flyway 迁移**；admin `getLoginLogList` 已定义但 `LogList.tsx` 无「登录日志」Tab |
| `LANDING_OPS.md` §10 承诺「短链点击统计」 | 后端有 `GET /links/{slug}/stats`，admin **未实现** |
| `LANDING_OPS.md` §4 称写操作需 `platform.settings.manage` | 后端确实如此，但前端**未按此控制入口**（见 G1） |

> 另记：`script/migration` 存在**两个 V29 前缀**（`V29__agent_chat_session_version.sql`、`V29__agent_model_price.sql`），
> 新增迁移前应先评估 Flyway 顺序歧义，新迁移从 **V32** 起编号。

---

## 3. 目标态能力地图

| 能力域 | landing-page-vite（消费 + 上报） | apps/admin（配置 + 洞察） |
| --- | --- | --- |
| **1 采集** | 埋点 SDK 扩展：vitals、滚动、表单、实验曝光、统一外链；同意管理；预览模式禁采集 | 事件字典维护、数据质量规则、口径说明 |
| **2 洞察** | — | 看板 v2（目标/保存漏斗/周期对比/会话/来源/设备/属性）、实时、导出、告警 |
| **3 内容** | 远程文案 + 每页 SEO + 区块编排 + 导航 + JSON-LD 运行时注入 | 内容 CMS v2、页面 SEO、区块编排、素材库 |
| **4 转化** | 可配置表单、公告条、退出意图、吸底 CTA、Campaign 页渲染 | 线索管理、投放位配置、Campaign 页编排 |
| **5 渠道** | `/go/:slug` 已建、模板/插件深链、归因参数透传 | 短链 v2、UTM 生成器、渠道转化对比、二维码 |
| **6 实验** | `useExperiment` 稳定分流 + 变体渲染 + 曝光上报 | 实验 CRUD、流量分配、结果显著性、护栏指标 |
| **7 触达** | 订阅（双确认/退订）、公告条消费 | 人群分组、邮件活动、站内公告、自动化 |
| **8 SEO/健康** | 动态 head、JSON-LD、预渲染、软 404、vitals 上报 | SEO 管理、sitemap/robots 生成、404 监控 |

---

## 4. 路线图

### P0：闭环修复（1–2 周）

> 目标：**让已建成的数据可信、转化链路不断、写操作可控**。本阶段近半工作不需要后端改动。

| 编号 | 功能 | 落点 | 关键内容 | 验收 |
| --- | --- | --- | --- | --- |
| P0-1 | 接通 6 个闲置接口 | admin | 新增「来源站点」「设备/浏览器/OS」「事件属性」「会话明细」「单链点击趋势」面板；`ChannelLinks` 加编辑与启停 | 6 个函数均有调用点；短链可改可停；看板可下钻到会话 |
| P0-2 | 独立权限码 + 路由守卫 | admin / 后端 | 新增 `platform.landing.read` / `platform.landing.manage`；`AdminLandingOpsController` 类级与 `WRITE_AUTH` 改用新码（过渡期 `or` 旧码）；修 `canAccessNavItem` fail-open；路由级权限守卫；按写权限隐藏编辑按钮 | 只读账号看不到编辑/发布/删除入口；直接改 hash 无法进入无权限页 |
| P0-3 | 运营操作审计 | admin / 后端 | 写接口落 `landing_ops_audit`（操作人、动作、目标、before/after 摘要、IP、时间）；admin 新增「运营变更记录」Tab（按人/类型/时间筛选） | 改文案/发布/删短链/改设置均可在 admin 查到 |
| P0-4 | 数据口径与质量 | admin / 后端 | `landing_filter_rule`（内部 IP、UA 关键字、测试 visitorId）；`/ops/collect` 采样开关；看板右上角「数据口径」说明浮层 | 排除规则生效（排除后计数下降可验证）；口径有唯一文档出处 |
| P0-5 | 事件字典 | landing / admin | `src/ops/events.ts` 集中定义事件名与属性 schema（TS 字面量类型 + 运行时校验）；后端 `landing_event_dict` 存同名清单供 admin 展示与校验 | 组件内不再出现裸字符串事件名；admin 能看到「已注册 / 已收到 / 未注册」三类对比 |
| P0-6 | 转化目标（Goals） | admin / 后端 | `landing_goal` 表（name、type=event\|path、value、enabled）；看板顶部展示目标完成数与转化率 | 可配置「订阅」「模板使用」为目标并在看板看到转化率 |
| P0-7 | 保存漏斗 + 漏斗趋势 | admin / 后端 | `landing_funnel` 表 + CRUD；漏斗步骤标签化；支持「按天看每步转化率」 | 漏斗可命名保存、可复用、可看趋势；不再依赖手输逗号串 |
| P0-8 | 模板/插件深链 + 归因交接 | landing | 「使用模板」跳转到具体模板而非 demo 首页；出站统一附 `kn_vid`/`kn_sid`/UTM | 点击模板可落到对应模板；出站 URL 可见归因参数 |
| P0-9 | 表单与出站事件补全 | landing | `form_start`/`form_submit`/`form_error`；所有外链统一 `outbound_click`（不再只覆盖 CTA） | 订阅表单三步事件齐全；除 CTA 外的外链也有事件 |
| P0-10 | 同意管理（Consent） | landing | `ops/consent.ts` 状态机（unknown/granted/denied）；未授权时 `track()` 直接丢弃；按地区默认策略；提供设置入口与说明页链接 | 拒绝后网络面板无 `/ops/collect` 请求；接受后恢复上报 |
| P0-11 | 工程缺陷修复 | admin | 修 `request()` 空响应体解析；`Subscribers` 用 `error` 态 + 搜索防抖/回车 + 删除二次确认 + `StatusBadge`；`SeoSettings` 保存前过滤 `public.*`；`ChannelLinks` 去硬编码默认值 + 删除确认 | `del<void>` 不再报错；失败显示错误而非空态；保存不会写入非公开键 |
| P0-12 | 文档对齐 | docs | 按 §2.4 修正两份文档的过期断言；`LANDING_OPS.md` §10 指向本文；补 `knowledge_log_login` 缺失迁移的说明 | 文档描述与代码一致 |

**重点设计**

- **P0-5 事件字典**是后续一切的前置：没有稳定的事件契约，实验、目标、漏斗、告警都会持续返工。
  建议落地为 `export const EVENTS = { cta_click: {...}, ... } as const`，`track()` 只接受 `keyof typeof EVENTS`，
  开发环境对未注册属性告警。后端字典表用于**观测**（发现前端已上线但未登记的事件），不做强拦截。
- **P0-8 归因交接**要在此刻定好参数名（建议 `kn_vid` / `kn_sid` / `kn_utm_*`），
  因为产品侧要消费它；P2 的跨域联合漏斗完全依赖这一步。若产品侧短期不改造，
  则退化为「按 UTM + 时间窗近似匹配」，需在文档中明确标注口径。
- **P0-10 同意管理**必须在**任何对外投放之前**完成：当前埋点在页面加载即写 `localStorage` 并入队，
  面向欧盟/英国流量存在合规风险。

### P1：无发版运营（3–5 周）

> 目标：**运营改内容、改结构、改投放位、跑实验，全程不发版**。

| 编号 | 功能 | 落点 | 关键内容 | 验收 |
| --- | --- | --- | --- | --- |
| P1-1 | 动态 Head / SEO | landing / 后端 | `ops/seo.ts` 按路由设置 title/description/canonical/hreflang/OG/JSON-LD；从 `/ops/seo?path=` 读取；`/` 与 `/zh` 互相 canonical | 每个路由 title/description 唯一；`view-source` 可见正确的 canonical 与 hreflang |
| P1-2 | 预渲染 + 软 404 | landing / 部署 | 构建期预渲染静态路由（`/`、`/templates`、`/plugins`、`/doc`、`/changelog` 及 `/en/*`）；nginx 对未知路径返回 404 状态 | `curl` 直取 HTML 可见正文与 meta；未知路径返回 404 而非 200 |
| P1-3 | 页面 SEO 管理 v2 | admin / 后端 | `landing_seo` 表（path+locale → title/description/og_image/canonical/robots/json_ld）；表单化编辑 + Google SERP 预览 + 覆盖率检查 + 「未配置页面」清单 | 运营可在后台改任意页面 TDK 并即时验证；SERP 预览与线上一致 |
| P1-4 | sitemap / robots 生成 | 后端 / admin | 按 `landing_seo` + 模板/插件/文档数据生成分语言 sitemap；robots 由后台配置；admin 提供「重新生成」与预览 | `sitemap.xml` 含全部语言变体与详情页；不再手工维护 |
| P1-5 | 内容 CMS v2 | admin / landing / 后端 | 一键从线上 `resources.ts` 导入初始化（约 666 个叶子键/语言）；缺失键与未翻译覆盖率视图；按命名空间分组与搜索；定时发布；预览链接（签名 token，landing 读 draft 且禁采集）；发布备注接 UI；批量发布 | 冷启动 5 分钟完成初始化；能看到「zh 已译 100% / en 已译 62%」；预览链接可分享给非技术同事 |
| P1-6 | 首页区块化 | landing / admin / 后端 | `landing_section` 表（page_key、section_key、position、enabled、props）；`Home/index.tsx` 改为按配置渲染，保留内置顺序为默认值 | 后台可调区块顺序、隐藏区块，刷新即生效，无需发版 |
| P1-7 | 推广位 | landing / admin / 后端 | `landing_promotion`（announcement / exit_intent / sticky_cta）；生效区间、目标页面、语言、频次上限；landing 侧渲染 + 曝光/点击/关闭上报 | 后台配置的公告条在指定页面指定时段出现；频次上限生效 |
| P1-8 | 实验平台 | landing / admin / 后端 | `landing_experiment` / `_variant` / `_exposure`；`useExperiment(key)` 用 `hash(key+visitorId)%100` 稳定分流；支持 `?exp_<key>=<v>` 预览；后台配流量分配、启停、看结果与显著性 | 同一访客始终命中同一变体；后台能看到各变体曝光/转化与置信区间 |
| P1-9 | 短链 v2 + UTM 生成器 | admin / 后端 | 编辑、启停、批量导入、按渠道分组；点击趋势图与「点击→目标转化」对比；二维码生成下载；UTM 生成器带落地页预览 | 渠道表能同时看到点击与转化；可下载二维码用于线下投放 |
| P1-10 | 订阅线索 CRM | admin / landing / 后端 | `landing_subscriber_tag` + 标签筛选、按渠道/时间/来源页细分、批量状态流转、CSV 导入去重、退订处理；landing 侧公开退订链接 + 双确认邮件流 | 可按渠道导出人群；退订链接可用且落状态 |
| P1-11 | 模板 / 插件市场运营 | admin / 后端 | 精选位、排序权重、分类、上下架；曝光与使用转化看板（打通落地页 `template_use`/`plugin_install` 与产品侧数据） | 后台置顶的模板在落地页首个展示；能比较各模板的曝光→使用转化 |
| P1-12 | 素材库 | admin / 后端 | `landing_asset`：上传/选取 OG 图与截图，供 SEO 与内容 CMS 引用；替换硬编码 `og-image` | 后台换 OG 图后分享卡片更新 |
| P1-13 | 性能与 vitals | landing | 路由级代码分割（Templates/Plugins/Docs/Changelog 独立 chunk）、埋点延迟加载、字体子集、图片 WebP/AVIF + `srcset` + `loading=lazy`；`web_vitals` 上报 | LCP(P75) < 2.5s、CLS < 0.1、INP < 200ms；首屏 JS < 500KB gzip |

**重点设计**

- **P1-1/P1-2 SEO 方案取舍**（必须一次定对，否则返工）

  | 方案 | 成本 | 效果 | 建议 |
  | --- | --- | --- | --- |
  | (a) 运行时动态 head | 低 | 解决 meta 唯一性，但爬虫首屏仍空 | **必做**，P1-1 先上 |
  | (b) 构建期预渲染静态路由 | 中 | 静态路由完全可抓取，动态列表仍需 JS | **推荐**，与 (a) 组合 |
  | (c) 迁移 SSG（Astro / Vite SSG） | 高 | 最彻底 | 暂不做；若模板/插件详情页要做 SEO，P2 单独评估 |

  预渲染要同时解决**软 404**：生成路由白名单，nginx 对白名单外路径返回 404 状态而非 `index.html`。
- **P1-6 区块化**的 schema 必须版本化（`props` 里带 `schemaVersion`），否则后续改结构会让历史配置无法渲染。
  渲染器要对未知 `section_key` 安静跳过而不是整页崩溃。
- **P1-8 实验分流**不要用 `Math.random()`：必须由 `visitorId` 派生，否则刷新即换组、数据不可用。
  曝光事件在**变体真正渲染后**上报，避免只算分配不算曝光。
- **P1-5 预览模式**是运营自助的关键安全阀：预览 token 携带 `key+locale+version`，
  landing 命中预览时**必须关闭埋点**，否则草稿流量会污染线上数据。

### P2：增长自动化（4–6 周）

| 编号 | 功能 | 落点 | 关键内容 | 验收 |
| --- | --- | --- | --- | --- |
| P2-1 | Campaign 落地页构建器 | landing / admin / 后端 | `landing_campaign_page`（slug、locale、blocks JSON、SEO、生效区间）；landing 新增 `/c/:slug` 由区块 schema 渲染；admin 拖拽编排 + 预览 + 发布 | 非研发 30 分钟上线一个投放页；URL 可配短链 |
| P2-2 | 邮件 / 触达活动 | admin / 后端 | `landing_campaign` + `landing_campaign_send` + `landing_email_template`；复用 `knowledge-message` 既有的 `EmailMessageProvider`；人群选取、模板、测试发送、排期、打开/点击统计、退订 | 可向「zhihu 渠道 + 已订阅」人群发信并看到打开率；退订回写状态 |
| P2-3 | 跨域联合漏斗 | landing / admin / 后端 / 主应用 | 主应用注册/激活成功时上报 `signup`/`activated`（带 `kn_vid`）；后端按 visitorId 关联 `landing_session`；admin 展示「访问 → 注册 → 激活」联合漏斗 | 能看到分渠道的端到端转化率，而非仅落地页点击 |
| P2-4 | 告警与巡检 | admin / 后端 | `landing_alert_rule`：转化率骤降、流量异常、`/ops/collect` 断流、短链 404；触达方式邮件 + Webhook | 人为停掉埋点 30 分钟内收到告警 |
| P2-5 | 运营工作台 | admin | 待办首页：待发布草稿、待确认订阅、异常指标、待处理实验、即将到期的推广位 | 运营每天打开 admin 只需看这一屏 |
| P2-6 | Docs 内容化 | admin / landing | 文档正文走 CMS（建议内容键 `landing.docs`），支持非研发更新；保留内置文案为回退 | 改一段文档不发版，2 分钟内生效 |
| P2-7 | 推荐 / 邀请 | landing / admin / 后端 | 复用短链与邀请码，追踪「邀请 → 注册 → 激活」，输出推荐榜 | 可识别 TOP 推荐人与其带来的激活数 |
| P2-8 | 数据导出与对接 | admin / 后端 | 定时导出（对象存储 / Webhook）、只读 API Token（不再复用平台 JWT）、BI 直连视图 | 数据仓库可自动拉取日粒度指标 |

---

## 5. 技术落点（代码级）

### 5.1 `apps/landing-page-vite`

```
src/ops/
├── analytics.ts        【改】抽取 consent 判定；新增 vitals/scroll/form 辅助上报
├── events.ts           【新】事件字典（名称 + 属性 schema，唯一事实来源）
├── consent.ts          【新】同意状态机 + 地区默认策略 + UI 触发
├── seo.ts              【新】按路由设置 head（title/desc/canonical/hreflang/OG/JSON-LD）
├── experiment.ts       【新】useExperiment / 稳定分流 / 曝光上报 / 强制预览
├── layout.ts           【新】拉取区块与推广位配置，提供 useSections/usePromotions
├── preview.ts          【新】识别预览 token，命中时禁用埋点并读取 draft
├── attribution.ts      【新】出站归因参数（kn_vid/kn_sid/utm）拼装与持久化
├── content.ts          【改】支持 preview token、分组读取、覆盖率上报
├── github.ts / changelog.ts  【保持】
src/components/
├── AnnouncementBar.tsx 【新】
├── ExitIntentModal.tsx 【新】
├── StickyCta.tsx       【新】
├── LeadForm.tsx        【新】可配置字段 + 表单漏斗埋点（替代 SubscribeForm 的硬编码）
├── ConsentBanner.tsx   【新】
src/pages/
├── Home/index.tsx      【改】由 layout 配置驱动区块顺序与显隐
├── Campaign/index.tsx  【新】/c/:slug 区块渲染
```

### 5.2 `apps/admin`

```
src/api/ops.ts                    【改】补 seo/layout/promotion/experiment/asset/goal/funnel/audience/campaign/alert/audit
src/pages/ops/
├── OpsDashboard.tsx   【改】目标、来源站点、设备、事件属性、会话明细、周期对比、保存漏斗
├── LandingContent.tsx 【改】导入初始化、覆盖率、分组搜索、定时发布、预览、备注
├── SeoSettings.tsx    【改】JSON 文本框 → 路径/语言表单 + SERP 预览 + 覆盖率
├── Subscribers.tsx    【改】标签、细分、批量、导入、退订状态、错误态、防抖
├── ChannelLinks.tsx   【改】编辑/启停/趋势/二维码/UTM 生成器
├── Promotions.tsx     【新】公告条 / 退出意图 / 吸底 CTA
├── Experiments.tsx    【新】实验 CRUD + 结果
├── Goals.tsx          【新】转化目标
├── SectionLayout.tsx  【新】首页区块编排
├── Assets.tsx         【新】素材库
├── MarketOps.tsx      【新】模板/插件精选与排序
├── Audience.tsx       【新】人群与标签
├── Campaigns.tsx      【新】邮件活动（P2）
├── CampaignPages.tsx  【新】投放页编排（P2）
├── Alerts.tsx         【新】告警规则（P2）
├── OpsAudit.tsx       【新】运营变更记录（P0-3）
└── OpsHome.tsx        【新】运营工作台（P2）
src/layout/AdminLayout.tsx        【改】新增「增长运营」导航分组；按写权限渲染入口
```

### 5.3 后端新增（`knowledge-system`，新迁移从 V32 起）

| 迁移 | 表 | 期 |
| --- | --- | --- |
| V32 | `landing_ops_audit`、`landing_filter_rule`、`landing_event_dict` | P0 |
| V33 | `landing_goal`、`landing_funnel` | P0 |
| V34 | `landing_seo`、`landing_section`、`landing_promotion`、`landing_asset` | P1 |
| V35 | `landing_experiment`、`landing_experiment_variant`、`landing_experiment_exposure`、`landing_subscriber_tag` | P1 |
| V36 | `landing_campaign`、`landing_campaign_send`、`landing_email_template`、`landing_audience`、`landing_audience_member`、`landing_alert_rule`、`landing_campaign_page` | P2 |

- 复用现有约定：全局表（不加 `tenant_id`）、`id/create_user/create_time/update_user/update_time/is_deleted`。
- 公开读取统一挂 `LandingPublicController`（`/ops/**`，网关已放行），**不得新增绕过网关白名单的路径**。
- 权限码迁移：类级 `platform.dashboard.read` → `platform.landing.read`，`WRITE_AUTH` 的 `platform.settings.manage` → `platform.landing.manage`，过渡期保留 `or` 旧码。
- 顺手修：把 `knowledge_log_login` 补成正式 Flyway 迁移（当前仅存在于 `doc/sql/blade/admin-operations-p0.sql`）。

---

## 6. 关键设计决策

| 决策 | 建议 | 理由 |
| --- | --- | --- |
| 落地页是否做 SSG | **不做整站 SSG**，P1 用「运行时动态 head + 构建期预渲染静态路由」 | 成本/收益最优；只有模板/插件详情页有 SEO 需求时才在 P2 评估 |
| 实验分流算法 | `hash(experimentKey + ":" + visitorId) % 100 < split` | 稳定、无需服务端分配、可离线复算 |
| 归因交接标识 | `kn_vid` + `kn_sid` + `kn_utm_*`，随出站 URL 传递并落 `localStorage` | 与现有 `analytics.ts` 的 visitor 语义一致，产品侧易消费 |
| 同意策略 | 按地区默认：EU/UK/BR 默认 `denied`，其他 `granted`；DNT 始终 `denied` | 合规风险与数据完整性的平衡 |
| 预览 | 签名 token 且**预览态禁采集** | 防草稿污染线上数据 |
| 权限 | 独立 `platform.landing.read/manage`，前端按钮级 + 路由级双重控制 | 现有 fail-open 与「能看不能写」是真实风险 |
| 数据保留 | `landing_event` 原始明细保留 180 天；P2 引入 `landing_stat_daily` 日汇总长期保留 | 明细表增长最快，汇总表支撑长期趋势 |
| 采样 | `/ops/collect` 提供采样开关（默认 100%） | 大促期间保护后端，且采样状态必须显示在看板上 |

---

## 7. 埋点与指标规范

### 7.1 事件字典（P0-5 产物，示例）

| 事件 | 触发时机 | 关键属性 |
| --- | --- | --- |
| `pageview` | 路由变化 | `path`, `title`, `referrer` |
| `section_view` | 区块进入视口 50% | `section`, `index` |
| `scroll_depth` | 25/50/75/100 各一次 | `depth` |
| `cta_click` | CTA 点击 | `location`, `target`, `variant?` |
| `outbound_click` | 任意外链点击 | `location`, `target`, `url` |
| `template_use` / `plugin_install` | 模板/插件使用 | `templateId`/`pluginId`, `location` |
| `form_start` / `form_submit` / `form_error` | 表单三态 | `formId`, `fields`, `error_code?` |
| `subscribe` | 订阅成功 | `location`, `confirmed?` |
| `experiment_exposure` | 变体渲染后 | `experiment`, `variant` |
| `web_vitals` | 页面隐藏时 | `lcp`, `cls`, `inp`, `ttfb` |
| `consent_decided` | 用户选择同意 | `state`, `region` |
| `campaign_impression` / `_dismiss` | 推广位曝光/关闭 | `promotionId`, `type` |
| `not_found` | 命中 404 | `path` |

**命名约束**：`snake_case`；属性名固定小写驼峰以下划线分隔；同一语义只能有一个事件名（改名必须走字典评审 + 双写过渡）。

### 7.2 指标

- **北极星**：落地页访客 → 激活的转化率。激活 = 订阅 ∪ 打开 Demo ∪ 下载桌面端 ∪ 使用模板（P2 前用加权近似，P2 后接产品侧真实激活）。
- **一级指标**：访客数、渠道转化率、订阅转化率、模板使用率、插件安装率、文档→安装转化率、内容发布耗时（目标 < 5 分钟、0 次发版）。
- **护栏指标**：LCP(P75) < 2.5s、CLS < 0.1、INP < 200ms、首屏 JS < 500KB gzip、埋点送达率 > 99%、同意后采集覆盖率。
- **数据质量**：埋点漏报率（前端入队数 vs 后端接收数）、未注册事件数、孤儿会话数。

---

## 8. 排期、依赖与验收

| 周 | landing-page-vite | apps/admin | 后端 |
| --- | --- | --- | --- |
| W1–W2（P0） | P0-5、P0-8、P0-9、P0-10 | P0-1、P0-2、P0-11 | P0-2、P0-3、P0-4、P0-5、P0-6、P0-7 |
| W3–W5（P1 前段） | P1-1、P1-6、P1-7 | P1-3、P1-5、P1-6、P1-7 | V33/V34 迁移 + 接口 |
| W6–W7（P1 后段） | P1-2、P1-8、P1-10、P1-13 | P1-8、P1-9、P1-10、P1-11、P1-12 | V34/V35 迁移 + sitemap 生成 |
| W8–W12（P2） | P2-1、P2-3、P2-6、P2-7 | P2-2、P2-3、P2-4、P2-5、P2-8 | V36 迁移 + 邮件/告警/导出 |

**依赖链**

```
P0-5 事件字典 ──┬─► P0-6 目标 ──► P0-7 漏斗 ──► P1-8 实验 ──► P2-4 告警
                └─► P1-13 vitals 口径
P0-8 归因交接 ─────► P1-9 渠道转化对比 ─────► P2-3 跨域联合漏斗
P0-10 同意 ────────► 对外投放前置条件（硬依赖）
P1-5 内容 CMS v2 ──► P1-6 区块化 ──► P1-7 推广位 ──► P2-1 Campaign 页
P1-3 页面 SEO ─────► P1-4 sitemap/robots
```

**每期完成的定义（DoD）**

1. `pnpm --filter @kn/landing-page-vite build` 与 `pnpm --filter admin build` 通过（本仓库以 `vite build` 为前端门禁）。
2. 后端 `mvn -o -pl knowledge-service/knowledge-system -am compile -DskipTests` 通过；迁移在测试库 `flyway:info` 无 Pending。
3. 新增写操作**全部**落审计，且能在 admin 查到。
4. 新增事件**全部**登记进事件字典。
5. 相关文档（`LANDING_OPS.md` / 本文 / `ADMIN_OPERATIONS_ROADMAP.md`）同步更新。
6. 至少为纯函数（分流算法、归因解析、SEO 生成、漏斗计算）补单测——这是当前 `apps/admin` 与落地页唯一的可测边界。

---

## 9. 与平台运营路线图的衔接

`docs/ADMIN_OPERATIONS_ROADMAP.md` 的四大方向（数据分析、AI 成本、内容治理、稳定性）继续有效，
但基线描述需按 §2.4 修正。两者在 admin 中的分工建议：

| 导航分组 | 承载内容 | 出处 |
| --- | --- | --- |
| 概览 | 平台仪表盘 + **运营工作台**（P2-5） | 两文共同 |
| 内容管理 | 空间/页面/评论治理 | 平台路线图 |
| 平台能力 | 插件审核、AI 配置与用量 | 平台路线图 |
| **增长运营**（本文范围） | 运营看板、内容 CMS、SEO、渠道、实验、推广位、线索、活动 | 本文 |
| 系统 | 日志审计、系统设置 | 平台路线图 |

**已发现但属平台路线图范围的缺口**（本文不展开，登记备查）：
空间活动流未接、空间详情缺 `commentCount`、页面只读预览未做、`PageList` 未用 `createUser/startTime/endTime` 筛选、
登录日志 Tab 未接（且缺 Flyway 迁移）、用户禁用/启用无前端页面、内容举报与敏感词、公告、留存/静默用户、
AI 限额、慢接口与异常聚合、操作审计页、租户管理页、存储治理。

---

## 10. 风险与对策

| 风险 | 影响 | 对策 |
| --- | --- | --- |
| SPA SEO 天花板 | 预渲染只能覆盖静态路由，模板/插件详情页仍难被索引 | P1 先解决静态路由；详情页 SEO 在 P2 单独评估 SSG 或独立渲染服务 |
| 隐私合规（GDPR/CCPA） | 无同意即采集，欧洲投放有法律风险 | P0-10 先于任何投放；补隐私说明页与数据删除路径 |
| `landing_event` 数据膨胀 | 查询变慢、成本上升 | P0-4 采样开关 + P2 日汇总表 + 180 天明细保留策略 |
| 权限收紧打断现有使用者 | 现有账号突然看不到运营菜单 | 新码与旧码过渡期并存，灰度一周后再移除旧码 |
| 跨域交接依赖主应用改造 | P2-3 可能被外部排期阻塞 | P0-8 先落参数；P2 提供「近似口径」降级方案并明确标注 |
| 邮件送达率 | 活动邮件进垃圾箱，闭环白做 | P2 前先配好 SPF/DKIM/DMARC 与独立发信域名 |
| 运营自助带来的误操作 | 改错文案/删错短链影响线上 | 草稿 + 预览 + 审计 + 回滚四件套（P0-3 / P1-5 / 已有 revision） |
| 文档与代码继续漂移 | 后续规划建立在错误基线上（已发生） | DoD 第 5 条强制同步；PR 模板加文档勾选项 |
| 两个 V29 迁移前缀 | Flyway 顺序歧义 | 新迁移从 V32 起；单独排一个迁移清理任务 |

---

## 11. 第一批可执行任务（建议本周启动）

按「投入产出比」排序，前 4 项**不需要后端改动**：

1. **接通 `getOpsReferrers` / `getOpsTech` / `getOpsEventProps` / `getOpsSessions`** —— 在 `OpsDashboard.tsx` 加 4 个面板，落后端已有接口，1–2 天出效果。
2. **修 `Subscribers.tsx`** —— 错误态、搜索防抖、删除确认、`StatusBadge`（`apps/admin/src/pages/ops/Subscribers.tsx`）。
3. **修 `request()` 空响应体解析** —— 影响所有 `del<void>`（`apps/admin/src/lib/request.ts`）。
4. **`ChannelLinks.tsx` 接通 `updateOpsLink` + `getOpsLinkStats`** —— 短链可编辑可启停、带点击趋势。
5. **建 `src/ops/events.ts` 事件字典**并改造 `analytics.ts` 的 `track()` 签名 —— 后续所有工作的地基。
6. **出站归因参数**（`src/ops/attribution.ts`）—— 定好 `kn_vid`/`kn_sid` 语义，为 P2 铺路。
7. **模板「使用」深链** —— `TemplatesPreview.tsx` 当前跳 demo 首页，改为跳具体模板。
8. **修 `SeoSettings.tsx` 保存过滤** —— 一行修复，堵住非 `public.*` 键外泄。
9. **文档对齐** —— 按 §2.4 修正两份文档的过期断言，并在 `LANDING_OPS.md` 顶部加本文链接。

---

## 12. 实施进展（P0 / P1 / P2）

> 本节是本轮实施的**唯一事实来源**：判断某项「已实现 / 待实现 / 有偏差」请以此为准。

### 12.1 交付概览

| 层 | 交付物 | 规模 |
| --- | --- | --- |
| 后端 · 数据 | `V32__landing_ops_p0.sql` / `V33__landing_ops_p1.sql` / `V34__landing_ops_p2.sql` | 16 张新表 + 2 次 `ALTER`（订阅确认/退订、短链分组） |
| 后端 · 代码 | 16 个实体 + 17 个 Mapper + 15 个 Service + 3 个扩展 Controller | 审计、过滤规则、事件字典、目标、漏斗、通用配置资源、实验、标签、活动、告警、推荐、工作台/导出、文案导入/覆盖率/预览令牌、公开配置与旅程上报 |
| admin · 契约与治理 | `src/api/ops.ts`（约 900 行契约）、`lib/permissions.ts`、`lib/use-async.ts`、`components/{DataState,JsonField}.tsx`、`lib/qr.ts` | 权限 fail-closed + 路由守卫 + 按写权限隐藏入口 |
| admin · 页面 | 23 个运营页面（6 个增强 + 17 个新增），导航重构为「增长 · 洞察 / 内容 / 转化 / 实验与治理 / 生态」5 组 | 全部真实实现，无 mock |
| landing · 模块 | `ops/{events,consent,attribution,vitals,config,seo,experiment,preview,referral}` + `components/{ConsentBanner,AnnouncementBar,ExitIntentModal,StickyCta,LeadForm}` | 事件字典 21 个事件、同意状态机、归因交接、Core Web Vitals、配置驱动 SEO/区块/推广位、A/B 分流、预览模式 |
| landing · 页面与构建 | 区块化 `Home`、`/c/:slug` 投放页、`NotFound`、退订/确认页、路由分包、`scripts/prerender.mjs`、nginx 软 404 | 预渲染 10 个路由 HTML + `sitemap.xml` / `robots.txt` / `404.html` |

### 12.2 已执行的验证

| 项 | 命令 | 结果 |
| --- | --- | --- |
| admin 构建 | `pnpm --filter admin build` | ✅ 9389 modules，`✓ built in 6.3s` |
| admin 类型 | `tsc --noEmit -p apps/admin/tsconfig.json` | ✅ `apps/admin/src` **0 error** |
| landing 构建 | `pnpm --filter @kn/landing-page-vite build` | ✅ 9792 modules + `[prerender] 生成 10 个路由 HTML + sitemap.xml + robots.txt + 404.html` |
| landing 类型 | `tsc --noEmit -p apps/landing-page-vite/tsconfig.json` | ✅ 新增代码 0 error（仅剩 `src/utils/create-portal.tsx` 2 处**既有**错误，未修改该文件） |
| 预渲染产物 | 抽查 `dist/templates/index.html`、`dist/en/plugins/index.html`、`dist/sitemap.xml` | ✅ title/canonical 按路由与语言区分；sitemap 10 条 URL（5 路由 × 2 语言） |
| QR 编码器 | `node apps/admin/scripts/qr.selftest.mjs` | ✅ `OK 24 cases`（含往返解码）；另经参考编码器逐模块比对 + macOS CoreImage 实际扫码 10/10 |
| 后端结构 | 自定义脚本（括号配平、包名、Java 8 语法、禁止 `DELIMITER`） | ✅ 77 个 `Landing*` 文件结构正常 |

### 12.3 与规划的偏差（实施时有意调整）

| # | 规划 | 实际做法 | 原因 |
| --- | --- | --- | --- |
| 1 | 每种配置一张表（`landing_seo` / `landing_section` / `landing_promotion` / `landing_asset` / `landing_campaign_page` / `landing_alert_rule`） | 统一为 `landing_resource` 单表 + `res_kind` 区分 | 这类记录都是「少量 + 编辑器」形态，单表让后台编辑体验与接口完全一致，且新增内容类型无需建表 |
| 2 | 邮件发送复用 `knowledge-message` 的 `EmailMessageProvider` | 定义 `LandingMailDispatcher` 接口 + 默认 `LoggingMailDispatcher`（只记日志并标记成功） | `knowledge-system` 没有邮件依赖，跨服务调用契约无法在本环境验证。**要真正发信必须注册一个真实实现**（见 §12.4） |
| 3 | 构建期预渲染 + 正文可抓取 | **meta 级**预渲染：为白名单路由生成含独立 title/canonical/hreflang/JSON-LD 的静态 HTML；正文仍由 JS 渲染 | 环境无 headless 浏览器（无 puppeteer/playwright），不引入重依赖。已解决元信息重复与 200 软 404 |
| 4 | 结构化数据由 SEO payload 注入 | `applyStructuredData` 只注入内置 `BreadcrumbList`；页面自带 `jsonLd` 字段走独立 `injectJsonLd` | 初版把 `OpsSeoPayload` 原样当 JSON-LD 写入，属于无效结构化数据，已修正 |
| 5 | 实验曝光只来自 `landing_experiment_exposure` | 结果聚合**双来源合并**：埋点事件（`experiment_exposure`/`experiment_conversion`）与 exposure 表，按变体取较大值 | 落地页以埋点管道上报为主；取最大值而非相加，避免两条路径同时启用时重复计数 |
| 6 | `assignVariant` 单哈希 | **两个独立哈希**：参与判定与变体判定分开 | 单哈希在 `trafficSplit < 100` 且总权重 100 时，会让「是否参与」与「落到哪个变体」强相关，导致后置变体永远拿不到流量 |
| 7 | 同意后采集 | 按地区：EU/UK/BR 默认拒绝并弹窗，其余地区**默示同意** | 初版门控是全局的，会让全球流量在用户未表态前全部停采，属于上线级回归 |
| 8 | 转化率口径 | 后端一律返回 **0–100 的百分比数值** | 前端曾用 `v > 1 ? v : v*100` 猜测，会把 0.5% 显示成 50% |
| 9 | 事件字典「未注册即拦截」 | 前端 DEV 环境告警、线上放行；后端字典只做观测对比 | 强拦截会让前端发版与后端登记互相阻塞 |

### 12.4 尚需人工/环境验证（本轮无法完成）

1. **后端从未编译过**：环境没有 JDK 与 Maven（`/usr/bin/javac` 是提示安装的桩），因此 16 个实体、17 个 Mapper、14 个 Service、2 个 Controller 仅通过静态检查。**上线前必须先 `mvn -o -pl knowledge-service/knowledge-system -am compile -DskipTests` 并修编译错误。**
2. **Flyway 迁移未在真实库执行**：V33/V34 的 `ALTER TABLE` 是有意**非幂等**的一次性语句（Flyway 按版本只跑一次）；执行前请确认目标库未手工加过同名列，并从 V32 起编号（`script/migration` 下存在两个 V29 前缀）。
3. **nginx 配置未做 `nginx -t`**：路由白名单式的软 404 需要在实际 nginx 上验证（白名单必须与 `scripts/prerender.mjs` 的 `ROUTES` 保持一致）。
4. **邮件投递未打通**：需注册 `LandingMailDispatcher` 的真实实现（SMTP 或 ESP），并配置发信域名 SPF/DKIM/DMARC；当前活动发送会「成功」但只写日志。
5. **跨域联合漏斗（P2-3）需主应用配合**：落地页已提供 `POST /ops/journey` 与 `landing_event` 的 `idx_landing_event_visitor` 索引，等待产品侧在注册/激活时上报 `signup` / `activated`（携带 `kn_vid`）。
6. **告警触达通道**：`email` / `webhook` 分支已实现调用点，但邮件通道依赖第 4 条，Webhook 未经真实端点验证。
7. **`/subscribers/filtered` 未接入前端**：admin 的订阅列表目前调用既有 `GET /subscribers`（`tagId`/`utmSource`/`days` 由前端本地筛选），后端提供的服务端筛选接口尚未被使用。
8. **文案预览是「后端完整、落地页只用了半条链路」**：`POST /admin/ops/content/preview-token` 签发签名令牌，
   `GET /ops/preview/content?token=&locale=` 返回草稿，落地页 `ops/content.ts` 在预览模式下已改为读该接口；
   但「预览令牌 → 自动进入预览模式」仍依赖运营手动打开后台生成的链接（链接已带 `kn_preview`）。
9. **数据保留与日汇总表未做**：`landing_stat_daily` 与 180 天明细保留策略仍待数据量增长后评估。
10. **P2-8 未做定时导出**：只提供手动 CSV/JSON 导出（`GET /admin/ops/export`），无定时任务、无只读 API Token、无 BI 直连。
11. **邮件发送器默认为空实现**：`LoggingMailDispatcher` 用 `@ConditionalOnMissingBean` 注册在 `@Component` 上，
   与真实实现的加载顺序在运行期是有依赖的；注册真实实现时建议改为 `@Bean` 方法以确保顺序。

### 12.5 本轮明确未纳入的范围

- 真正的 SSG / 正文级预渲染（见偏差 3）。
- 只读 API Token、定时导出、Webhook 推送、BI 视图。
- 主应用内（非落地页）的公告位与推广位消费——推广位当前只在 `landing-page-vite` 生效。
- `docs/OPERATIONS_PLAN.md` §9 中列出的**平台侧**运营缺口（用户禁用页、登录日志 Tab、内容举报、敏感词、公告、留存/静默用户、AI 限额、慢接口聚合、操作审计页、租户页、存储治理），仍归 `ADMIN_OPERATIONS_ROADMAP.md` 管理。

### 12.6 前端路由与页面清单（落点核对）

admin 运营路由（新增 17 / 增强 6）：

```
/ops/home           工作台(新)        /ops/dashboard     看板(增强)
/ops/goals          转化目标(新)      /ops/funnels       保存漏斗(新)
/ops/alerts         告警(新)          /ops/content       落地页内容(增强)
/ops/seo            页面 SEO(重写)    /ops/sections      区块编排(新)
/ops/promotions     推广位(新)        /ops/assets        素材库(新)
/ops/subscribers    订阅线索(增强)    /ops/audience      人群标签(新)
/ops/links          渠道链接(增强)    /ops/referrals     推荐邀请(新)
/ops/campaigns      邮件活动(新)      /ops/campaign-pages 投放页(新)
/ops/experiments    实验平台(新)      /ops/events        事件字典(新)
/ops/data-quality   数据口径(新)      /ops/audit         变更记录(新)
/ops/export         数据导出(新)      /ops/market        模板/插件精选(新)
/ops/changelog      更新日志(增强)
```

landing 路由：`/`、`/templates`、`/plugins`、`/doc`、`/doc/:section`、`/changelog`、`/c/:slug`（新）、
`/unsubscribe`（新）、`/confirm`（新）、`*` → 404（新），并全部同时挂载在 `/zh`、`/en` 前缀下。
