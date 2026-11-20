# 自定义 Agent（人格 + 技能/工具白名单）

「自定义 Agent」是用户自己的轻量 Agent 配置：**名字 + 头像 + 工作指引（人格）**，
外加 **可手动勾选的技能与工具**。它在会话中通过选择器切换，指引作为每轮上下文注入，
不写进后端系统提示。

- 设置入口：**设置 → 自定义 Agent**（`AgentManager`，Notion 风格的编辑弹窗）
- 会话入口：`AgentPicker`（core 面板）/ `AgentSelector`（plugin-ai 对话）
- 数据：`packages/common/src/ai/agent/custom-agents.ts`，plugin-config 键
  `ai-custom-agents`（server 优先、localStorage 兜底）。

## 1. 数据模型

```ts
interface CustomAgent {
  id: string
  name: string
  description?: string
  avatar?: string          // 职业插画头像 id（@kn/ui AGENT_AVATAR_IDS）
  emoji?: string
  instructions: string     // 指引：作为 <context> 注入，不覆盖系统规则
  capabilities?: {         // 缺省 = 使用当前界面的全部能力（旧记录即此）
    mode: 'custom'
    skills: string[]       // 技能名（按 normalizeSkillKey 折叠匹配）
    tools: string[]        // 工具函数名（精确匹配）
  }
  createdAt: number
  updatedAt: number
}
```

`mode: 'all'` **不落盘**：没有 `capabilities` 就是「全部能力」，因此老记录与
「刚才显式切回全部」是同一份数据，不会出现两种表示。

## 2. 手动配置技能与工具

编辑弹窗中的「技能与工具」分段：

- **全部**（默认）：不限制，运行侧行为与改造前完全一致（目录对象原样返回，版本不变，
  provider 前缀缓存不受影响）。
- **手动选择**：显示技能/工具两个页签，可搜索、只看已选、全选/清空。
  从「全部」切过来时会**预选当前全部能力**（用户是"取消不要的"，而不是从零配），
  避免切换模式本身悄悄削减能力。

两条规则：

1. **勾选技能自动带上它的工具**（`requiredTools` + `optionalTools`）。工具页里这些行
   显示「来自技能 X」且不能单独取消；取消技能时它们一起失效。否则技能说明里让人调用的
   工具会不在工具列表里。
2. **白名单是"限制"不是"授权"**：列出当前环境没有的技能/工具不会凭空创造能力；空列表
   是合法的「纯聊天 Agent」。

`load_skill`（技能发现工具）只要启用了任何技能就会被自动保留 —— 技能的说明片段和工具
schema 是通过它送达的，删掉它等于给了一个永远加载不了的技能。

### 运行侧强制点（唯一的一处）

`filterCatalogForCustomAgent(catalog, agent)`（`custom-agents.ts`）作用在**各界面已完成
scope 过滤之后**的目录上：

- `skills[]` 只保留勾选的技能（其说明、索引项、声明的工具名一起离开提示词）；
- `tools[]` = 勾选工具 ∪ 保留技能声明的工具 ∪（有技能时）`load_skill`；
- `version` 变成 `...:ca<hash>`，避免后端 `capabilitiesVersion` 缓存命中另一个 Agent 的
  schema 集合；
- 未配置（`mode: 'all'`）时**返回同一个对象**，运行路径保持恒等。

调用点：

| 界面 | 位置 |
| --- | --- |
| 工作台 / kernel 对话 | `common/src/ai/kernel/use-workspace-agent.ts`（scope 过滤之后） |
| 编辑器 AI 面板 | `core/src/ai/system-agent/AIAssistantPanel.tsx` |
| plugin-ai 对话 | `plugin-ai/src/ai/menu/ChatConversation.tsx` |

第二道闸在发现通道：run 的 `allowedSkills`（`UseEditorAgentOptions`）经
`ToolExecutionContext` 传给 `load_skill`，白名单外的技能直接拒绝并列出该 Agent 可用的
技能名。只改目录不改 `load_skill` 是可以被一次发现调用绕过的，所以两处必须一致。

第二道闸之外还有**执行侧白名单**：`isToolAllowed`（`UseEditorAgentOptions` → `EditorToolExecutor`）
对解析后的工具名再判一次。目录不再宣传某个工具，但历史 transcript 里还留着名字、或者委派子
run 直接点名时，调用会以「没有被当前 Agent 启用」失败，而不是照常执行。

## 3. 让 Agent 自己配置 Agent

在对话里说「帮我建一个只做审稿的 Agent」即可，模型会调用三个工具
（`common/src/ai/tools/custom-agent-tools.ts`，core 启动时注册）：

| 工具 | 作用 |
| --- | --- |
| `listCustomAgents` | 列出已有 Agent（id / 名称 / 简介 / 指引 / 能力 / 是否在用） |
| `listAgentCapabilities` | 列出当前环境可用的技能与工具（`kind` / `query` 过滤，带 total） |
| `saveCustomAgent` | 新建（不传 id）或修改（传 id）；可带 skills / tools / `capabilitiesMode` / `activate` |

语义：

- **保存不等于启用**。创建后默认不切换当前 Agent；`activate: true` 才切换（用户说
  "建一个并用它"时才传）。因此一句话不会悄悄改变下一轮回答的人格。
- **名称必填**；**新建时指引必填**，修改时可省略 `instructions`（保留原指引，便于只调能力）。
  列表里的 `instructionsTruncated: true` 表示只返回了前 4000 字。指引上限复用
  `MAX_AGENT_INSTRUCTIONS_LENGTH`。
- **名字先校验**：`skills`/`tools` 与实时能力目录比对，未知名字直接报错并给出可用名称，
  而不是存下一个永远缺失该项的 Agent。目录不可用（能力提供者未就绪）时写入并回一条
  `warning`。
- 部分更新不会丢另一半：只传 `skills` 时保留原 `tools`；`capabilitiesMode: 'all'` 才清除
  白名单；规则集中在纯函数 `resolveCustomAgentCapabilities` 并可单测。
- 写入走 `PluginConfigStore`（与设置弹窗同一个 store）：选择器、设置列表通过订阅即时刷新。

工具元数据：`category: 'interaction'`、`scope: 'any'`、`requiresEditor: false`
（`discovery/tool-metadata.ts`）—— 在无文档的工作台也必须可用，且不参与文档写租约。

## 4. 已知边界

- **技能/工具被卸载后**：配置里的名字保留（重装即恢复）。编辑弹窗会列出「已配置但当前
  环境不可用」，运行侧只是忽略。
- **目录不可用**（极少数初始化失败）：弹窗显示说明，手动白名单不生效（能力为空时
  "限制"与"全部"等价），不会把 Agent 变成纯聊天。
- **设置里的配置面板是 passive 的**：`useCapabilityProviders(null, { passive: true })`。
  它只"读目录"；非 passive 的挂载会接管 `load_skill` 发现源与插件 edit-target 解析器，
  打开/关闭设置就会让正在使用的对话失去能力。
- **Ask 模式**仍然不发任何工具，白名单不改变这一点。

## 5. 自测

```bash
pnpm --filter @kn/common check:custom-agents   # 归一化、目录过滤、白名单工具、保存语义
pnpm --filter @kn/common check:skill-tools     # load_skill 的技能白名单
pnpm --filter @kn/common check:plugin-tools
pnpm --filter @kn/common check:agent
```