# 小红书（RED）Connector 规划（可行性 + 方案选型）

> 状态：规划稿 · 结论：**可以做，但和知乎的性质完全不同**——小红书**没有面向普通开发者的官方内容 API**，
> 必须选择"第三方付费 API / 自建逆向 / 桌面浏览器自动化"中的一条路，且都带账号与合规风险。

---

## 1. 结论速览

| 问题 | 答案 |
|---|---|
| 有官方内容读取 API 吗？ | **没有。** 官方开放平台（open.xiaohongshu.com / 小红书大学）只覆盖**电商交易**（商品、库存、订单、物流、售后）。 |
| 有官方内容发布 API 吗？ | **没有**（面向普通创作者/开发者）。发布只能靠浏览器自动化或逆向。 |
| 浏览器能直连吗？ | **不可靠。** 实测 `edith.xiaohongshu.com` 预检在携带 `x-s/x-t` 时不返回 `Access-Control-Allow-Origin`，且签名头本来就依赖浏览器环境外计算 → **需要后端或桌面代理**。 |
| 可行路径 | ✅ 第三方付费数据 API（最省心，只读）<br>✅ 自建逆向（cookie + X-s/X-t 签名，只读，维护成本高）<br>✅ 桌面浏览器自动化（可读可发，最重但最稳）<br>❌ 官方内容 API（不存在） |

---

## 2. 能力现状

### 2.1 官方开放平台 = 电商（不是内容）

- `open.xiaohongshu.com`：OAuth 服务授权（`appId` + `appSecret`），面向**商家/ERP/服务商**。
- `school.xiaohongshu.com/.../open`：官方文档目录明确只有 Logistics / Inventory / Order & Package / Product & Item 等 API。
- `miniapp.xiaohongshu.com/doc`：交易组件（小程序电商）。
- **结论**：如果你的目标是"在小红书开店/同步商品订单"，官方通道完全够用；如果是"读笔记/发笔记"，官方不提供。

### 2.2 蒲公英 / 聚光（品牌与投放，门槛高）

- 蒲公英（`pgy.xiaohongshu.com`）：达人选号、内容合作；聚光：广告投放。
- 有合作方 API（创作者搜索/资料、笔记表现、粉丝分布、成本效益等），但需要**品牌/代理商资质与开通权限**，属于机构级接入，不是个人开发者能直接用的。

### 2.3 社区 / 第三方通道（内容相关，事实上的选择）

| 通道 | 能力 | 形态 | 风险/成本 |
|---|---|---|---|
| 官方电商开放平台 | 商品/订单/库存 | REST + OAuth | 与内容无关 |
| 第三方数据 API（JustOneAPI、TikHub 等） | 热搜、灵感流、笔记搜索、笔记详情、评论、用户资料、话题、分享链接解析；另有蒲公英/电商专区 | REST，付费 Key | **按量付费**；依赖第三方稳定性；合规由对方承担但风险仍在 |
| 轻量逆向 MCP（如 `xyj2570/xhs-mcp`） | 搜索、笔记详情、用户资料、用户笔记、探索流；**只读** | npx + 用户 Cookie | Cookie 7–30 天过期；签名随平台变更即失效 |
| 浏览器自动化（如 `xpzouying/xiaohongshu-mcp`） | 读 + **发布图文/视频**、扫码登录、评论 | Docker/Chromium 或浏览器插件 | 重（~500MB）；需本机运行；最抗风控 |
| 自建逆向（MediaCrawler、RedCrack 等） | 搜索/详情/评论/用户/点赞 | Python + 纯算签名 | 维护成本高，算法频繁变；**法律与封号风险最高** |
| RSSHub 小红书路由 | 用户/关键词动态 | RSS | 已被平台风控，社区反馈非示例路由不可用 |

---

## 3. 可行性实测

| 验证项 | 结果 |
|---|---|
| `edith.xiaohongshu.com` CORS（带 `content-type,x-s,x-t`） | 预检 **未返回 ACAO** → 浏览器带签名头会被拦 |
| `edith.xiaohongshu.com` CORS（不带特殊头，另一端点） | 返回 ACAO（反射 origin），但签名头场景不可用 → 结论仍是不可靠 |
| `open.xiaohongshu.com` CORS | `access-control-allow-origin: 0`（异常值，非可用 CORS） |
| 官方开放平台范围 | 文档目录仅电商交易类，**无内容读写 API** |
| 发布通道 | 社区成熟方案为浏览器自动化，非 API |

**关键推论**：小红书 web API 需要 `x-s` / `x-t` / `x-s-common` 签名头 + 登录 Cookie（含 `a1`/`web_session`/`xsec_token` 等），签名需在 Node/Python 侧计算，**必须在后端或 Electron 主进程做代理**，渲染进程直连不可行。

---

## 4. 风险与约束（比知乎高一个量级）

1. **无官方背书**：不在平台开放生态内，接口随时变更，无版本兼容承诺。
2. **账号风险**：高频/自动化访问可能触发风控，轻则验证码，重则限流/封号；发布类操作风险更高。
3. **合规与法律**：抓取用户内容涉及《反不正当竞争法》《个人信息保护法》与平台用户协议；商用尤其敏感。**建议只存摘要+链接，不落地全文，且仅供个人知识管理场景。**
4. **Cookie 生命周期**：7–30 天失效，需要重新登录；Cookie 属高敏凭证，不能明文上云。
5. **签名维护成本**：X-s/X-t 算法会变，需要持续跟进（社区库通常滞后数天到数周）。
6. **CORS/架构约束**：必须引入后端或桌面代理，Web 端单独不可用。
7. **发布不可逆**：和知乎一样，发布必须"预览 + 明确确认"，绝不能交给 Agent 自动执行。

---

## 5. 推荐定位与范围

**定位：小红书知识源/发布 Connector**，分两阶段、三条可选路线。

### 路线 A（最省心，推荐先跑通）：第三方数据 API，只读
- 购买一个第三方 API Key（JustOneAPI / TikHub 等），read-only。
- Kotion 侧只做：设置页（Key + 渠道选择）、搜索/笔记详情/用户笔记/评论卡片、AI 工具与技能。
- 优点：无需维护签名、无 Cookie、无封号风险（风险转移给第三方）。
- 缺点：按量付费；数据新鲜度取决于第三方。

### 路线 B（免费但需维护）：自建逆向，只读
- 后端/桌面加代理：Cookie + X-s/X-t 签名。
- 优点：不按量付费。
- 缺点：算法维护、Cookie 管理、账号风险，全部自己扛。

### 路线 C（要发布就绕不开）：桌面浏览器自动化
- Electron 主进程内嵌 Chromium（Playwright/Puppeteer）或对接 `xiaohongshu-mcp`。
- 扫码登录一次，之后读 + 发（图文/视频），预览 + 二次确认。
- 优点：最贴近真实用户，能力最全。
- 缺点：包体/复杂度大，仅桌面端可用。

**建议：先做路线 A 的只读 MVP，把"小红书内容进 Kotion"跑通；发布（路线 C）作为独立阶段。**

---

## 6. 架构设计（复用 plugin-zhihu 范式）

新建 `packages/plugin-xhs`（category = CONNECTOR），与 `plugin-zhihu` 同构，差异点在**代理层**：

```
packages/plugin-xhs/
  src/
    index.tsx                    # KPlugin + settings + locales(zh/en)
    types/config.ts              # 渠道(api|proxy) + apiKey + proxyBaseUrl + cookie(可选)
    types/xhs.ts                 # 归一化 DTO（note/user/comment）
    services/
      xhs-client.ts              # 通过 proxyBaseUrl 请求；统一错误
      xhs-third-party-service.ts # 路线 A：第三方 API 适配器
      xhs-proxy-service.ts       # 路线 B/C：Kotion 代理接口
      xhs-cache.ts / xhs-rate-limit.ts / xhs-errors.ts
    hooks/use-xhs-config.ts
    components/XhsSettings.tsx  # 渠道、Key、测试连接、额度/状态
    components/XhsNoteCard.tsx  # 笔记卡片（封面/标题/作者/点赞/链接）
    extension/nodes/xhs-note-node.tsx
    extension/tools/*.ts        # xhsSearch/xhsNoteDetail/xhsUserNotes/xhsExplore
    extension/skills/xhs-researcher.ts
```

关键设计：
- **代理契约**（新增，建议放 `@kn/common` 或后端）：`GET /xhs/search`、`/xhs/note/:id`、`/xhs/user/:id/notes`、`/xhs/explore`，前端只带业务参数，Cookie/签名/Key 不下发到渲染进程。
- **Cookie 安全**：若走路线 B/C，Cookie 存**后端或 Electron safeStorage**，绝不进 localStorage/插件配置。
- **卡片**：只存 `title/cover/author/likes/url/excerpt` 快照 + `lastSyncAt`，正文不落地（合规）。
- **发布**：桌面专属，`xhsPublishNote` 工具默认不对 Agent 开放；UI 走"预览 → 确认发布"。
- **注册**：`apps/vite/src/bundled-plugins.ts` + `apps/desktop/...`；市场 category=CONNECTOR，声明 NETWORK（发布再加 DESKTOP）。

---

## 7. 分期与工作量（单人估）

| 阶段 | 内容 | 估时 |
|---|---|---|
| P0 | 选型确认（A/B/C）+ 代理契约设计 | 0.5–1 天 |
| P1 | 路线 A 只读 MVP：设置页 + 搜索/详情 + 卡片 + 3 个工具 + 技能 | 2–4 天（取决于第三方 API 文档质量） |
| P2 | 用户主页/评论/话题 + 缓存限流 + 卡片完善 | 2–3 天 |
| P3 | 路线 B 自建代理（Cookie + 签名）+ 后端接口 | 4–8 天，且需持续维护 |
| P4 | 路线 C 桌面发布：扫码登录 + 图文发布 + 预览确认 | 5–10 天 |
| P5 | 蒲公英/电商（如有资质） | 视权限而定 |

---

## 8. 验收标准

- 设置页可选渠道、填 Key/代理地址、测试连接成功。
- 搜索/详情返回归一化数据（中英 i18n、错误码中文提示）。
- 笔记卡片可插入、含来源链接、刷新；**不整篇落地正文**。
- Web 端经代理可用（路线 A/B）；发布功能仅桌面端可用。
- 发布必须"预览 + 二次确认"，Agent 不得自动调用。
- 账号/合规提示在设置页显式展示。

---

## 9. 待确认决策点（决定整体投入）

1. **通道选型**：A 第三方付费 API / B 自建逆向 / C 桌面自动化？（三者可组合，但 P0 必须定一个）
2. **是否接受非官方通道**及其账号/合规风险？如果答案为否，则**只能做官方电商 Connector**，与内容无关。
3. **是否需要"发布笔记"**？需要则必然引入桌面浏览器自动化（P4）。
4. **是否有第三方 API 预算**？有则 A 最划算，能省掉 4–8 天的逆向维护。
5. **后端能否改动**（加 `/xhs` 代理）？不能则只能做桌面端，或改用第三方 API 直连（需确认其 CORS）。

---

## 10. 建议的下一步

先回答第 1、3 两个问题：
- 若"只读 + 有预算"→ 直接做 **路线 A**，最快 2–4 天出 MVP，与 `plugin-zhihu` 共用大量代码。
- 若"只读 + 无预算"→ 做 **路线 B**，但要接受长期维护。
- 若"要发布"→ 在只读基础上加 **路线 C**（桌面独占）。

确认后，我可以按 `plugin-zhihu` 的现有结构直接搭 `packages/plugin-xhs` 骨架。
