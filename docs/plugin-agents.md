# 插件 Agent（Plugin Agents）设计

> 目标：**每个插件可以有自己的 agent，内核 agent 指挥这些插件 agent 干活。**
> 现状（§32/§33）的混乱不是实现 bug，而是模型问题：内核把所有插件的工具+技能平铺成**一张大目录**，再替它们兜 scope、命名、skill/工具对账、编辑器依赖。

---

## 1. 为什么现在混乱

| 表象 | 根因 |
|---|---|
| 工具要按 scope 过滤（§32） | 内核目录里混着需要编辑器与不需要编辑器的工具 |
| skill 与工具要对账（§33） | skill 属于插件，工具却离开了插件上下文，两者各走各的通道 |
| 跨插件重名风险 | 扁平命名空间里没有归属 |
| 编辑器绑定的个案处理 | 工具不知道「我是谁的、在什么场景下可用」 |

**一句话：能力的归属丢失了。** 插件 agent 模型把归属还给插件。

---

## 2. 目标模型

```
内核 agent（编排者）
  ├─ 内核内置工具        web_search / memory / plan / delegate …
  └─ 插件 agent 目录     每个插件 agent 一条：{ id, name, description, scope }
        │  按 description 选择、按下发 task 委派
        ▼
     插件 agent run（子 run）
        ├─ 该插件的 systemPrompt
        ├─ 该插件的工具（只在这里出现）
        └─ 该插件的技能（与工具同源）
```

- 内核 agent 只看到**有哪些插件 agent、各自能做什么**，看不到它们的工具细节。
- 插件 agent 在自己的 run 里，带着**自己的 prompt + 自己的工具 + 自己的技能**工作。
- 子 run 完成后结果回到内核 agent，由它汇总作答。

---

## 3. 契约

```ts
interface PluginConfig {
    /** 一个插件可以声明一个或多个 agent。 */
    agent?: PluginAgentDefinition | PluginAgentDefinition[]
}

interface PluginAgentDefinition {
    /** 稳定 id，编排工具用它委派。 */
    id: string
    /** 展示名（"文档表格专家"）。 */
    name: string
    /** 内核 agent 据此判断什么时候派给它 —— 这是它的「工具描述」。 */
    description: string
    /** 插件 agent 的人格与规则（子 run 的 system 片段）。 */
    systemPrompt?: string
    /** 何时可用：page 需要编辑器；workspace 随时；any 不限。 */
    scope?: AgentScope
    /** 只在这个 agent 的 run 里出现。 */
    tools?: AgentToolDefinition[]
    /** 与工具同源，天然对账。 */
    skills?: AgentSkillDefinition[]
    /** 可选：这个 agent 用更便宜的模型。 */
    model?: string
}
```

> 相对现状的关键变化：`agent.tools / agent.skills` 从「并入内核目录」改为「**只属于该插件 agent**」。

---

## 4. 内核变化

| 现状 | 改为 |
|---|---|
| `resolveAgentCapabilities(scope)` 返回扁平 tools/skills | `resolvePluginAgents(scope, { hasEditor })` 返回**可用插件 agent 列表** |
| 插件工具进内核 catalog（deferred） | 插件工具**只在子 run 下发** |
| skill 与工具对账（§33） | 不再需要：同一个 agent 的 skill 恒有它的工具 |
| 工具 scope 过滤（§32） | 变成 **agent 级**可用性：page-agent 无编辑器时**整个不出现** |
| 跨插件重名 | 每个子 run 只有自己的工具，重名不再是问题 |

编排工具（内核 agent 可见）建议形态：

```
delegate_to_plugin({ agent: "office.spreadsheet", task: "把这些数据做成透视表" })
list_plugin_agents()                      // 可选：让模型自查有哪些
```

产物/目标（内核规范 I10 等）不变，只是新增一条：**子 run 产出的 artifact 要汇总进产物架**（当前 `collectAgentArtifacts` 只看父 run 的 steps；需扩展到 sub-runs）。

---

## 5. 运行时：复用现有委派

后端已具备（实测）：

- `delegate({ task, tools?, maxSteps?, timeoutSec? })`；
- `Delegator.spawn` 用 `selectTools(ctx.getClientTools(), args.get("tools"))` **按名裁剪子 run 的工具**；
- 子 run 拥有独立的 budget / checkpoint / 事件日志 / 并发上限（`max-children-per-run`），事件走 `sub.spawned / sub.completed / sub.failed`。

**唯一缺口**：子 run 目前**没有独立 system prompt**（继承父 persona，靠 `task` 传达）。两个选项：

| 选项 | 做法 | 代价 |
|---|---|---|
| **A（零后端改动）** | 把插件 agent 的 `systemPrompt` 作为 `task` 前缀下发 | 能用；prompt 与任务混在 user 消息里，语义不干净 |
| **B（推荐，小后端改动）** | `delegate` 增加 `agentId` / `systemPrompt` / `skills` 参数，`Delegator` 组装子 run 的系统片段 | 需改 Java（DelegateTool/Delegator/RunInput） |

---

## 6. 收益 / 代价

**收益**

- 结构上消除 §32（scope 过滤）、§33（skill 对账）、重名、编辑器个案——**这些补丁可以退役**。
- 每个插件 agent 的 prompt / 工具 / 技能自洽，作者拥有完整上下文。
- 内核 catalog 小而稳定 → 前缀缓存命中率更高、每轮 token 更少。
- 与既有能力天然对齐（委派、子 run 事件、子 agent 树 UI 已存在）。

**代价**

- **委派开销**：每个插件操作变成一次子 run（延迟 + token）。
- 模型选型依赖 `description` 质量（描述即接口）。
- 产物汇总需要内核扩展。
- 多一层「内核 agent 会不会选错 agent」的不确定性。

**因此建议混合，而不是全量委派**：内核内置 + 明确标注 `scope` 的**轻量直接工具**保留；**复杂/多步/需要专门 prompt** 的走插件 agent。

---

## 7. 迁移

| 阶段 | 内容 | 风险 |
|---|---|---|
| **P0** | 契约 + `resolvePluginAgents` + 内核只暴露 agent 目录；旧扁平路径 feature flag 双跑 | 低（纯前端/契约，可回退） |
| **P1** | `delegate` 支持 agent 的 prompt/skills（后端 B） | 中（Java） |
| **P2** | 14 个 legacy 插件按「每插件一个 agent」分组，tools/skills 收入其中 | 中 |
| **P3** | 删除扁平聚合与 skill 对账，§32/§33 的补丁退役 | 低（此时已无消费者） |

---

## 8. 需要拍板

1. **全量委派 vs 混合**？（建议混合：轻量工具直连 + 复杂工作流走插件 agent）
2. **后端 B 是否投入**？（不做 B 的话，插件 agent 的 prompt 得拼进 task，语义打折）
3. **产物是否允许来自子 run**？（建议允许，否则插件 agent 的产出进不了产物架与分栏）

---

## 9. 决策与实现记录

**已定（2026-09）**：① 混合委派 ② 改动后端 ③ 子 run 产物进产物架。

### 9.1 后端（knowledge-agent-skills）

- `DelegateTool` 新增参数：`agentId`、`systemPrompt`、`skills`（skills 目前仅记录）。
- `Delegator.spawn`：提供 `systemPrompt` 时——
  - 子 run 的 systemPrompt **替换**为插件 agent 的；
  - **清空继承的技能片段**（插件 agent 不背内核 agent 的上下文）；
  - 未提供时行为完全不变（继承父人格/技能/记忆）。
- 工具子集无需新增：`delegate({ tools })` 早已通过 `selectTools(ctx.getClientTools()/getDeferredTools())` 按名裁剪。
- 按仓库约束：只改 `com.knowledge.agent.core.*`，未触碰 `knowledge-core-*`。

### 9.2 前端契约（@kn/common）

- 新增 `PluginAgentDefinition`：`{ id, name, description, systemPrompt?, scope?, tools?, skills?, model? }`，
  **取代**原先未使用的 `AgentDefinitionDefinition`（tools 从 `string[]` 改为工具定义）。
- `resolveAgentCapabilities` 解析出 `ResolvedPluginAgent`：
  - 按 scope 过滤（`page` agent 在 workspace run 不出现）；
  - 其 tools 解析为 **wire 名**放进 `toolNames` —— 这就是将来子 run 的工具子集；
  - 带 `pluginName/pluginKey` provenance。

### 9.3 产物架：已天然满足（待运行时确认）

父 run 的 `steps` 本就包含子 agent 发起的**前端工具调用**（`ExecutionStep.subRunId`），
而 `collectAgentArtifacts` 正是遍历父 steps 的。所以**子 run 的 artifact 已经在产物架里**，
只要其工具声明了 `artifactFromResult`——本节无需额外改动。

### 9.4 下一步（P1 剩余）

1. 内核把**插件 agent 目录**写进每轮 `contextNote`（模型据此知道有哪些 agent 可委派）；
2. 插件 agent 的工具以 **deferred 通道**下发（可路由、不向内核广告），模型用
   `delegate({ agentId, tools, systemPrompt })` 委派；
3. 把 14 个 legacy 业务插件按「每插件一个 agent」分组；
4. 扁平聚合与 skill 对账（§32/§33 的补丁）随之退役。

### 9.5 验证

`check:plugin-agent` passed（新增 agent scope 断言）；`tsc -p` 四包自身源码 0 错；后端按 §9.1 修改。
---

## 10. P1 进展（委派已可用）

### 10.1 本轮落地

- **agent 工具可执行**：resolvePluginToolGroups 现在同时实例化 agents[].tools（按 agent 自身 scope 过滤），子 run 需要的执行器因此存在。
- **内核目录文案**：kernel/plugin-agents.ts 的 describePluginAgents(agents) 生成每轮目录（name / agentId / 描述 / 工具名 / 调用示例 / 该 agent 的 systemPrompt），纯函数 + 运行时检查。
- **接入每轮 contextNote**（volatile，不动 system 前缀）：
  - dock/编辑器面板：Chat.tsx 用 useAgentCapabilities(page)；
  - AI 首页：KernelHomePage 用 useAgentCapabilities(workspace)。
- 模型据此调用 delegate({ agentId, task, tools, systemPrompt })：后端已支持 systemPrompt（§9.1），tools 由既有 selectTools 裁出子 run 的工具子集。

### 10.2 还差什么（诚实清单）

1. **没有插件声明 agent.agents** → 目录目前为空。需要把 14 个 legacy 业务插件迁移为「每插件一个 agent」（tools/skills 收入其中），目录才有内容。
2. **后端尚未按 agentId 解析**：当前靠模型把 systemPrompt/tools 原样传回（目录里给了确切示例）。语义可用，但依赖模型自觉；要彻底干净，需要把插件目录随 run 下发（CreateRunRequest → Checkpoint → ToolContext → Delegator），由后端解析。
3. **退役 §32/§33** 要等第 1 步完成——那时插件工具不再进内核目录，scope 过滤与 skill 对账就无消费者。

### 10.3 验证

check:plugin-agent passed（新增 describePluginAgents 用例）；tsc -p 四包自身源码 0 错。
---

## 11. P1 样板：plugin-main 的 page-ops agent

### 11.1 本轮改动

- 契约：PluginAgentDefinition 新增 include（复用 core 注册的实现，与贡献级的 include 同一条桥）。
- 内核：agent 的 toolNames 现在同时来自 tools（内联）与 include（registry）；resolvePluginToolGroups 也实例化 agent 的 include，子 run 才有执行器。
- agent id 命名空间化（toAgentWireName）：两个插件都声明 page-ops 时模型仍能区分。
- plugin-main 声明 page-ops agent：scope any，include 6 个 core 实现，带聚焦 prompt（检索→汇总→createPage 落地→openPageSide 展示→汇报）。

### 11.2 现在能跑通的完整链路

1. 内核把可委派 agent 目录写进每轮 contextNote（dock 用 page scope、首页用 workspace scope）；
2. 模型据目录调用 delegate({ agentId, task, tools, systemPrompt })；
3. 后端：systemPrompt 覆盖子 run 人格并清空继承的技能片段；tools 由 selectTools 裁出子 run 的工具子集；
4. 子 run 以「页面操作员」人格执行，只拿得到那几个页面工具；
5. 子 run 的前端工具调用出现在父 run 的 steps 里（ExecutionStep.subRunId），产物架因此能收录它产出的 artifact。

混合形态：plugin-main 的 include 仍在贡献级保留（一次性操作可直连），只有多步工作流才委派。

### 11.3 下一步

1. **迁移 office / bitable**：把它们的 editorExtension[].tools 搬进各自 agent（这是真正消除扁平目录的一步）；
2. **后端按 agentId 解析**：当前靠模型把 systemPrompt/tools 原样传回（目录里给了确切示例），更干净的做法是插件目录随 run 下发，由 Delegator 解析；
3. 上述完成后再退役 §32（scope 过滤）/§33（skill 对账）的补丁。

### 11.4 验证

check:plugin-agent passed；tsc -p 四包自身源码 0 错。
