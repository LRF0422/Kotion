# 落地页运营体系（Landing Ops）

面向 `apps/landing-page-vite` 的自托管运营能力，数据落在现有 Java 后端
`knowledge-service/knowledge-system`，管理界面集成进 `apps/admin`。

> 状态：后端接口与建表已完成并通过编译；落地页埋点/SEO/内容外置与 admin 页面进行中。
>
> **前进基线**：本文描述的是**已建成**的底座。后续能力演进（P0 闭环修复 / P1 无发版运营 / P2 增长自动化）
> 见 [OPERATIONS_PLAN.md](./OPERATIONS_PLAN.md)，本文 §10「后续可做」已被该规划取代。
>
> **实施进展**：P0/P1/P2 的实施结果、与规划的偏差、以及尚需人工验证的部分，统一记录在
> [OPERATIONS_PLAN.md](./OPERATIONS_PLAN.md) §12。阅读本文时请以 §12 为准判断「已实现 / 待实现」。

## 1. 总体结构

| 层 | 位置 | 职责 |
| --- | --- | --- |
| 数据表 | `script/migration/V31__landing_ops.sql` | 事件、会话、文案、订阅、短链、更新日志、设置 |
| 后端 | `knowledge-service/knowledge-system` | 采集、聚合统计、CMS、订阅、短链、changelog |
| 网关 | `knowledge-gateway/.../AuthProvider.java` | 放行公开路径 `/ops/**` |
| 落地页 | `apps/landing-page-vite` | 埋点上报、读取已发布文案、SEO、订阅 |
| 管理端 | `apps/admin` | 运营看板、内容 CMS、订阅线索、渠道链接、更新日志、SEO 设置 |

落地页与管理端都通过网关访问，前端用 `/api` 前缀（nginx / vite 代理到网关）。

## 2. 数据表（V31）

| 表 | 说明 |
| --- | --- |
| `landing_event` | 埋点事件（pageview 与自定义事件），按 `stat_day` 索引 |
| `landing_session` | 会话归因（首次来源、UTM、设备、语言），`session_key` 唯一 |
| `landing_content` / `landing_content_revision` | 文案草稿/发布与历史版本 |
| `landing_subscriber` | 邮件订阅线索 |
| `landing_link` / `landing_link_click` | 渠道短链与点击明细 |
| `landing_changelog` | GitHub Releases 聚合缓存 |
| `landing_setting` | `public.` 前缀对外暴露的 SEO/社交设置 |

所有表为全局表，不在多租户白名单内，不会被租户拦截器追加 `tenant_id` 条件。

## 3. 公开接口（无需登录）

网关放行 `/ops/**`（含自动派生的 `/*/ops/**`），对应系统服务 `/ops/*`。
外部访问需带服务前缀：`/knowledge-system/ops/*`（落地页经 nginx/vite 的 `/api` 代理后为
`/api/knowledge-system/ops/*`）。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/ops/collect` | 埋点批量上报（自动过滤爬虫，尊重 DNT/Sec-GPC） |
| GET | `/ops/content?locale=zh` | 某语言全部已发布文案 |
| GET | `/ops/content/{key}?locale=zh` | 单条已发布文案 |
| POST | `/ops/subscribe` | 订阅更新 |
| GET | `/ops/go/{slug}` | 渠道短链跳转并计数（302） |
| GET | `/ops/changelog?limit=20` | 更新日志 |
| GET | `/ops/settings` | 公开设置（`public.` 前缀，去前缀返回） |

### collect 请求体

```json
{
  "siteId": "kotion-landing",
  "sessionId": "s-xxx",
  "visitorId": "v-xxx",
  "referrer": "https://www.zhihu.com/",
  "language": "zh-CN",
  "utm": { "source": "zhihu", "medium": "social", "campaign": "launch" },
  "events": [
    { "name": "pageview", "path": "/", "title": "Kotion", "ts": 1730000000000 },
    { "name": "cta_click", "path": "/", "props": { "location": "hero", "target": "demo" } }
  ]
}
```

响应 `R<{accepted, skipped?}>`，单批最多 40 条事件。

## 4. 管理接口（`X-Ops-Token` 无关，走平台 JWT）

前缀 `/admin/ops`，读操作要求 `platform.dashboard.read`，写操作要求
`platform.settings.manage`（或管理员角色），且 `clientId = kotion-platform-admin`。

| 分组 | 接口 |
| --- | --- |
| 统计 | `GET /stats/overview`、`/timeseries`、`/pages`、`/events`、`/channels`、`/referrers`、`/tech`、`/event-props`、`/realtime`、`/sessions`、`POST /stats/funnel` |
| 文案 | `GET /content`、`GET/PUT /content/{key}`、`POST /content/{key}/publish`、`GET /content/{key}/revisions`、`POST /content/{key}/rollback` |
| 订阅 | `GET /subscribers`、`PATCH/DELETE /subscribers/{id}`、`GET /subscribers/export` |
| 短链 | `GET/POST /links`、`PUT/DELETE /links/{id}`、`GET /links/{slug}/stats` |
| 更新日志 | `GET /changelog`、`POST /changelog/refresh`、`PATCH /changelog/{id}` |
| 设置 | `GET/PUT /settings` |

统计接口通用查询参数：`siteId`（默认 `kotion-landing`）、`days`（默认 30，1–365）、`limit`。

## 5. 配置项

后端 `application-*.yml` 可选配置：

```yaml
knowledge:
  landing:
    github-repo: LRF0422/knowledge-repo   # 更新日志抓取来源
    github-token: ""                       # 可选，提升 GitHub API 限额
```

## 6. 部署步骤

1. 确认 Flyway 与 `knowledge-system` 指向**同一个库 `knowledge`**，然后执行迁移：
   ```bash
   cd backend/knowledgecloud
   export FLYWAY_URL='jdbc:mysql://<host>:3306/knowledge?useSSL=false&useUnicode=true&characterEncoding=utf-8&serverTimezone=GMT%2B8'
   export FLYWAY_USER='<migrator>'
   export FLYWAY_PASSWORD='<password>'
   mvn -N -Pdb-migrate flyway:info
   mvn -N -Pdb-migrate flyway:migrate
   mvn -N -Pdb-migrate flyway:info
   ```
   > `landing_*` 与平台其它表同库（`knowledge`）。V31 的 DDL 不带 schema 前缀，
   > 落库位置完全由 `FLYWAY_URL` 决定；若指向别的库，运行时会出现
   > `Table 'landing_event' doesn't exist`。
2. 重新构建并发布 `knowledge-system` 与 `knowledge-gateway`：
   ```bash
   mvn -o -pl knowledge-service/knowledge-system,knowledge-gateway -am package -DskipTests
   ```
3. 若路由由 Nacos 动态配置，确认 `/knowledge-system/**` 已路由到 system 服务。
4. 上线后用 `POST /ops/collect` 与 `GET /ops/content?locale=zh` 做连通性自检。

## 7. 落地页接入

代码位于 `apps/landing-page-vite/src/ops/`：

| 文件 | 作用 |
| --- | --- |
| `analytics.ts` | 自托管埋点 SDK：会话/访客标识、首次归因、批量上报、`track`/`openExternal`/`buildTrackedUrl` |
| `content.ts` | 文案外置：拉取 `/api/knowledge-system/ops/content` 并合并进 i18n，失败回退内置文案 |

> 文档数据化：Docs 页正文有 279 处走 `docs.*` i18n 键，因此通过与首页相同的覆盖机制即可
> 在不发版的前提下修改文档内容（CMS 内容键建议 `landing.docs`）。
| `changelog.ts` | 读取更新日志 |
| `github.ts` / `StarCount.tsx` | GitHub Star 社会证明（1 小时本地缓存） |
| `RouteAnalytics.tsx` | 路由级 pageview |
| `LangSync.tsx` | `/zh`、`/en` 路径前缀与语言同步 |

**埋点事件**：`pageview`、`cta_click`（props: location/target）、`template_use`、`plugin_install`、`subscribe`。
所有出站链接经 `buildTrackedUrl` 统一附加 `utm_source=kotion-landing` 及对应 medium。

**SEO**：`index.html` 内置 title/description/OG/Twitter/canonical/hreflang 与
`SoftwareApplication` 结构化数据；`public/robots.txt`、`public/sitemap.xml`、`public/og-image.png`（1200×630）。

**分语言 URL**：同一套页面同时挂载在 `/` 与 `/:lang`，语言切换会同步更新 URL 前缀。

## 8. admin 运营模块

新增导航分组「运营」，页面位于 `apps/admin/src/pages/ops/`：

| 页面 | 路由 | 说明 |
| --- | --- | --- |
| 运营看板 | `/ops/dashboard` | PV/UV/事件/时长、趋势、渠道归因、TOP 页面、事件排行、转化漏斗 |
| 落地页内容 | `/ops/content` | 按内容键 + 语言编辑「i18n 键 → 文案」覆盖表，草稿/发布/历史回滚 |
| 订阅线索 | `/ops/subscribers` | 列表、状态流转、CSV 导出 |
| 渠道链接 | `/ops/links` | 创建带 UTM 的短链、复制、点击统计 |
| 更新日志 | `/ops/changelog` | 同步 GitHub Releases、置顶/隐藏 |
| 分享与 SEO | `/ops/seo` | `public.*` 公开设置编辑 |

API 客户端：`apps/admin/src/api/ops.ts`（调用 `/knowledge-system/admin/ops/*`）。

## 9. 验证

- 后端：`mvn -o -pl knowledge-service/knowledge-system,knowledge-gateway -am compile -DskipTests` → BUILD SUCCESS
- 落地页：`pnpm --filter @kn/landing-page-vite build` → 成功
- admin：`pnpm --filter admin build` → 成功

> 说明：仓库的 `tsc --noEmit` 会连带检查 `packages/*` 源码，而其中存在大量既有类型错误，
> 因此本项目沿用仓库既有标准，以 `vite build` 作为前端构建门禁。

## 10. 后续演进

本文描述的是**已建成的底座**。其上的能力演进（P0 闭环修复 / P1 无发版运营 / P2 增长自动化）
统一见 [OPERATIONS_PLAN.md](./OPERATIONS_PLAN.md)，该文档也是实施进展的唯一事实来源（§12）。

原 §10 列出的待办已全部纳入规划并实施：

| 原待办 | 归属 | 状态 |
| --- | --- | --- |
| 事件采样与网关限流、日汇总表 | P0-4 / P2 | 采样开关与流量过滤已落地（`landing_filter_rule` + `public.ops.sample-rate`）；日汇总表仍留待数据量增长后评估 |
| 独立权限码 `platform.landing.manage` | P0-2 | 已落地，读 `platform.landing.read`、写 `platform.landing.manage`，过渡期兼容旧码 |
| 文案 CMS「从当前线上文案导入」 | P1-5 | 已落地（`POST /admin/ops/content/import` + 覆盖率接口） |
| 落地页首屏代码分割 | P1-13 | 已落地：二级路由 `React.lazy` 分包 |

新增的配套能力（表结构与接口清单见 OPERATIONS_PLAN.md §5）：

- **数据层**：`V32__landing_ops_p0.sql`（审计 / 过滤规则 / 事件字典 / 转化目标 / 保存漏斗）、
  `V33__landing_ops_p1.sql`（通用配置资源 / 实验与曝光 / 订阅标签）、
  `V34__landing_ops_p2.sql`（邮件活动 / 告警 / 推荐邀请）。
- **公开接口扩展**：`/ops/config`（SEO + 区块 + 推广位 + 精选位一次下发）、`/ops/page/{slug}`（投放页）、
  `/ops/experiments` 与 `/ops/exposure`（实验）、`/ops/r/{code}`（邀请）、
  `/ops/unsubscribe`、`/ops/confirm`、`/ops/campaign/open|click/{trackingId}`、`/ops/journey`（跨域旅程）、`/ops/sitemap.xml`。
- **构建期 SEO**：`apps/landing-page-vite/scripts/prerender.mjs` 为路由白名单产出独立 meta 的静态 HTML，
  并生成 `sitemap.xml` / `robots.txt` / `404.html`；nginx 通过路由白名单把未知路径返回真正的 404 状态。
  `pnpm --filter @kn/landing-page-vite build` 已包含该步骤（仅想构建 SPA 时用 `build:spa`）。

---

## 11. 界面重构后的可运营面（区块 props 与精选位）

apps/landing-page-vite 首页已重构为「Ink & Vermilion」编辑风格：暖纸底、近黑墨色、单一朱红强调色。
原先的六色 scene 调色板折叠为中性色 + 单强调色（--scene-* 保留为别名，仍引用它们的运营 payload 不会失效）。
重构同时把「运营能改的东西」继续收敛到既有的两条管道，没有新增硬编码。

### 11.1 区块 props（SECTION 资源）

Home 会把每个区块的 props 透传给对应组件，读取逻辑集中在
apps/landing-page-vite/src/ops/section-props.ts（未知键静默忽略，类型不符回退内置默认值）。
admin「运营 → 首页区块 → 自定义 props」展开项已内置各区块可用字段提示。

| sectionKey | 可用 props |
| --- | --- |
| hero | badge, title1, title2, desc, ctaLabel, ctaHref, secondaryLabel, secondaryHref, meta[], showStats |
| stack-cloud | heading, items[] |
| capability-bento | eyebrow, title, desc, cards[], hidden[]（card: editor / collab / bitable / ai / canvas / links） |
| workflows | eyebrow, title, desc |
| ecosystem-spotlight | eyebrow, title, desc, limit（1-12） |
| everywhere-you-work | eyebrow, title, desc |
| templates-preview | eyebrow, title, desc, limit（1-12） |
| open-source | eyebrow, title, desc |
| faq | eyebrow, title, desc |
| final-cta | eyebrow, title1, title2, desc, primaryLabel, primaryHref |

优先级：内置文案 < 区块 props < 运行中的实验变体（目前 hero-cta 的 ctaLabel / ctaHref 仍以实验为准）。

示例（admin 的「自定义 props」输入框，JSON）：

    { "limit": 4, "eyebrow": "精选插件" }

### 11.2 精选位（FEATURED 资源）

/ops/config 下发的 featured 现在被落地页消费：

- ecosystem-spotlight：目标为 plugin 的精选位渲染为「运营精选」区块，排在官方插件网格之前，
  深链到 LIVE_DEMO_URL/plugin/{targetId}。
- templates-preview：目标为 template 的精选位按 position 置顶，并展示 badge / blurb，
  深链到 LIVE_DEMO_URL/template/{targetId}。

维护入口：admin「运营 → 市场运营 → 精选位」，字段 targetType / targetId / name / badge / blurb / 顺序。

### 11.3 视觉系统速查

- 设计令牌集中在 apps/landing-page-vite/src/index.css（:root 与 .dark）。强调色为 --kn-accent，
  语义色只有这一处，其余是暖纸 / 墨色中性阶。
- 品牌 logo 使用与 public/favicon.svg 同源的橙→粉渐变 K（components/Logo.tsx），是页面上唯一的多色元素；
  文字标识跟随 --kn-ink 自适应深浅色。
- 区块标题统一走 components/SectionHeading.tsx（强调色短线 + 等宽 eyebrow + 左对齐标题），
  通过 index 传入序号 01–08。
- 移动端：Radix ScrollArea 的内容包裹层默认为 display:table，会被视口的 overflow-x:hidden 裁剪；
  index.css 末尾已用属性选择器强制其为 block 盒，避免首页在窄屏横向溢出。
