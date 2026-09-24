# Agent 内核 & 插件能力审查报告

> 日期：2026-09。范围：全仓 `packages/*`，重点 `plugin-*/src` 与 `@kn/common/src/ai/{plugin-agent,kernel}`。
> 方法：贡献点 grep 盘点、依赖方向检查、`tsc -p` 四包 + `check:plugin-agent`。

---

## 0. 结论摘要

- **分层与规范总体合规**：内核不依赖 `@kn/ui` / `@kn/core` / 插件；插件不依赖 `@kn/core`。
- **最大问题：artifact 层几乎没人用**。21 个插件里 **14 个**有 agent 工具/技能，但只有 **2 种** artifact kind 能产出（`page`、`source-list`）。业务插件的产出无法进入产物架 / 工作目标。
- **本次修掉 2 处「规范写了、实现没有」**（renderer 级 mapper、legacy mapper 桥），并清掉 2 个死导出。

---

## 1. 插件侧

### 1.1 贡献点分布（21 个插件）

| 类别 | 插件 |
|---|---|
| 用**新契约** `agent` | plugin-ai（renderers + 搜索来源 mapper）、plugin-main（`include` + 页面 renderer）、plugin-plugin-studio（tools + skills） |
| 仍用 **legacy** `editorExtension[].tools/skills` | bilibili、bitable、chart、comment、drawnix、excalidraw、file-manager、github、logicflow、mermaid、netease-music、office、sticky-note、zhihu（**14 个**） |
| 无 agent 能力 | plugin-api、plugin-api-client、plugin-theme、plugin-block-reference、plugin-speech-to-text 等 |

### 1.2 🔴 P0：artifact 覆盖接近于零

可产出的 artifact 只有两种：

| kind | 来源 | 消费者 |
|---|---|---|
| `page` | core 的 `createPage` / `openPageSide` | 产物架、分栏、工作目标 |
| `source-list` | plugin-ai 的 `web_search` renderer mapper | 同上 |

**14 个业务插件的工具全部没有 `artifactFromResult`**（github 的 repo/issue/PR、bitable、chart、mermaid、office、excalidraw、drawnix、logicflow、zhihu、bilibili、netease、sticky-note、comment、file-manager）。
后果：「agent 正在操作哪个产物」对业务对象**无解**，产物架永远是空的或只有页面。

**修复路径**：本次已补齐两条声明通道（§3.2），每个插件只需加一个 mapper——legacy 工具可直接在 `ExtensionWrapper.tools` 上加，无需迁移。

### 1.3 🟠 P1：命名空间只覆盖新契约

- 决策「工具一律命名空间」只在 `agent.tools` 实现；legacy 工具保留裸名。
- 实测**当前无跨插件重名**（0 冲突），但 14 个 legacy 插件没有重名保护；一旦同名，策略是「后者覆盖 + warn」——静默。
- 建议：要么把 legacy 纳入命名空间（需适配期，模型已知名会变），要么把 legacy 重名升级为**硬失败**而非静默覆盖。

### 1.4 🟡 P2：能力/技能未迁移

- 14 个插件的 skills 仍在 extension 上；`resolveSkills` 对 legacy 技能不做 local→wire 映射（裸名等价），行为正确但无法享受命名空间。
- 这些插件的工具都是 **editor-bound**：workspace scope 下工厂抛错被跳过（符合预期），业务能力只存在于 page scope。

---

## 2. 内核侧

### 2.1 ✅ 分层合规

| 层 | 实测依赖 | 结论 |
|---|---|---|
| `plugin-agent/` | 仅 common 内部 + react 类型 | ✅ 无 `@kn/ui`/`@kn/core`/插件 |
| `kernel/` | `../plugin-agent`、`../../core/AppContext`、`../../hooks/use-plugin-state`、`../use-capability-providers`、`../image` | ✅ 无 `@kn/ui` |
| 插件 | `@kn/common` + ui/icon(+editor) | ✅ 无 `@kn/core`（grep 命中的只是文案字符串） |

### 2.2 🔴 P0（已修）：规范与实现不一致

1. **renderer 级 `artifactFromResult`**：规范 §4.1 声明了、契约里没有 → `web_search` 来源**永远进不了产物架**（只有卡片 + 点击后的分栏能用）。
   已补：契约字段 + `PluginManager` 聚合保留 + `useAgentToolArtifactMappers` 的 fallback（**工具实现优先，renderer 补位**）；plugin-ai 已声明。
2. **legacy `editorExtension[].tools` 不能带 mapper** → 14 个业务插件无法声明 artifact。
   已补：`core/editor.ts` 增加可选 `artifactFromResult`，适配器透传。

### 2.3 🟠 P1：声明但未接线

| 契约字段 | 状态 |
|---|---|
| `agent.context` | 内核聚合了，**无消费者**；context 白名单也未落地 |
| `agent.actions` | home 改用 `ChatEmptyState` 后**没有入口** |
| `agent.agents` | **无 UI** |

建议：排期接线，或明确标注为 `planned`/移除，避免「规范说支持、实际没有」。

### 2.4 🟡 P2：死代码（已清）

- `parseAgentWireName`、`isNamespacedAgentTool`：0 非测试引用 → 删除。
- 历史已清：`reslove*` 别名、`getAgentPaneHostImpl`、`AgentSheet*`、`artifactOf`、`openView`。

### 2.5 已知边界（规范 §8 已记）

- **target 是内存态**：不跨刷新恢复（transcript 恢复，但「聚焦哪个」重置）。
- **dock 未接 `<AgentPaneHost/>`**：provider 在根部，能力已具备。
- 无命令面板 / 快捷键入口。

---

## 3. 本次改动

| 文件 | 改动 |
|---|---|
| `plugin-agent/types.ts` | `AgentToolRendererContribution.artifactFromResult?` |
| `core/PluginManager.ts` | renderer 聚合保留 mapper（`...renderer`） |
| `kernel/use-agent-renderers.ts` | mapper registry：工具实现优先，renderer 补位 |
| `core/editor.ts` + `plugin-agent/adapter.ts` | legacy 工具可声明 mapper 并透传 |
| `plugin-ai/ai/artifacts/WebSearchSources.tsx` | 导出 `webSearchArtifact`（id=query，去重合并） |
| `plugin-ai/src/index.tsx` | 声明 `web_search` 的 artifact mapper |
| `plugin-agent/namespace.ts` + check | 删除两个死导出 |

验证：`tsc -p` 四包自身源码 0 错；`check:plugin-agent` passed。

---

## 4. 建议优先级

| 优先级 | 事项 |
|---|---|
| **P0** | 让 2–3 个核心业务插件落地 artifact：**plugin-bitable / plugin-office / plugin-chart**（用户按「产物」看表格与图表最直观）。注意 insert 类工具当前**不返回 block id**，需先补 `blockId`（可在插入后读 `doc.resolve(selection.from).nodeBefore.attrs.blockId`）。 |
| **P1** | legacy 重名保护升级为硬失败；`agent.actions` 接线首页快捷动作。 |
| **P2** | target 持久化到会话元数据；dock 接分栏；`agent.context` 白名单落地。 |
