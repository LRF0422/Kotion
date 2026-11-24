# Agent 操作对象（AgentOperationTarget）

`AgentPageTarget` 回答的是"这是哪个页面、怎么读写它的文档"。它是 agent 的**一种**操作对象，
不是全部：文件、空间、多维表格的行、图表、思维导图节点、正文选区……都是 agent 可能操作的东西。
每个插件最清楚自己界面里"当前被操作的是什么"，不应该由中心代码硬编码一个 `switch (kind)`。

本能力把"当前操作对象"抽象成一个**类型开放**的查询模型：

```
插件 / 核心 surface  ──注册 provider──▶  agent-operation-target（合并、去重、排序）
                                              │
                                              ├─ getCurrentTarget 工具（agent 主动查询）
                                              └─ 现有页面 provider（页面仍是默认来源之一）
```

## 1. 模型

`packages/common/src/ai/agent-operation-target.tsx`：

```ts
interface AgentOperationTarget {
  kind: string                      // 'page' | 'space' | 'file' | 'plugin:bitable/table' | ...
  label?: string                    // 给模型看的类型名：页面 / 多维表格 / 文件
  id: string                        // kind 内稳定身份
  title?: string
  summary?: string                 // 给模型看的一句话：这是什么/选中了什么
  spaceId?: string
  canEdit?: boolean
  capabilities?: string[]          // 'document.write' | 'file.read' | ...
  operations?: AgentTargetOperation[]  // 真正可调用的工具 + 说明（可预填 args）
  attributes?: Record<string, unknown> // 小型、可 JSON 化的结构化事实
  selection?: { kind, id?, text?, attributes? } // 选区/行/节点等子对象
  source?: string                  // 诊断用：哪个 surface 描述它
  priority?: number                // 越大越优先，默认 50
}
```

`kind` 是开放字符串：

- 核心类型用裸名：`page`、`space`、`file`；
- 插件特有对象加命名空间：`plugin:bitable/table`、`plugin:mindmap/node`。

`operations[].tool` 必须是**真实工具名**。模型据此从"这是什么"直接走到"调哪个工具"，
不需要猜一套只存在于插件文档里的操作名。

## 2. 注册 provider

### React surface（推荐）

```ts
import { useAgentOperationTargetProvider } from '@kn/common'

useAgentOperationTargetProvider({
  id: 'file-manager.current-file',
  label: '文件管理器当前文件',
  priority: 80,
  getTargets: () => selectedFile ? {
    kind: 'file',
    id: selectedFile.id,
    title: selectedFile.name,
    summary: `文件管理器中选中的 ${selectedFile.ext} 文件`,
    capabilities: ['file.read', 'file.write'],
    operations: [
      { tool: 'readFile', description: '读取文件内容', args: { fileId: selectedFile.id } },
      { tool: 'saveFile', description: '覆盖保存文件', args: { fileId: selectedFile.id } },
    ],
    attributes: { size: selectedFile.size, updatedAt: selectedFile.updatedAt },
  } : null,
})
```

Hook 会按 `id` 注册，`getTargets` 通过 ref 读取最新状态，切换选中项不会导致反复注册。

### 非 React 代码

```ts
import { registerAgentOperationTargetProvider } from '@kn/common'

const unregister = registerAgentOperationTargetProvider({
  id: 'my-plugin.selection',
  getTargets: () => currentSelection,
})
// 插件卸载 / 页面离开时
unregister()
```

### 内核分栏产物

分栏里的 `AgentArtifact` 已经被映射成通用对象，无需插件再写 resolver：

```ts
useAgentArtifactTargetProvider(conversationId, session.targetArtifact)
```

页面产物会与内置页面 provider 合并（`kind:id` 去重、优先级高者做主目标、`operations` 取并集）。

## 3. Agent 如何查询

工具 `getCurrentTarget`（`scope: 'any'`、`requiresEditor: false`，任何 scope 都可用）：

```json
{
  "primary": {
    "kind": "file",
    "id": "f_123",
    "title": "Q3 预算.xlsx",
    "summary": "文件管理器中选中的 xlsx 文件",
    "canEdit": true,
    "capabilities": ["file.read", "file.write"],
    "operations": [
      { "tool": "readFile", "description": "读取文件内容", "args": { "fileId": "f_123" } }
    ]
  },
  "targets": ["…主目标 + 少量候选…"],
  "message": "当前主操作对象：file「Q3 预算.xlsx」…"
}
```

- 默认返回主目标 + 最多 3 个候选；`includeAll: true` 返回全部（上限 12）。
- 没有 provider 命中时明确返回"没有可识别的操作对象"，并提示如何查找页面 / 先选中插件对象，
  不让模型猜类型或编 id。

## 4. 解析规则

1. **按会话隔离**：`getTargets(context)` 收到 `conversationId` / `owner` / `sessionBinding`；
   一个会话的目标不能出现在另一个会话的答案里。provider 必须自己按 `conversationId` 过滤。
2. **合并而非覆盖**：同一 `kind:id` 由多个来源描述时，保留高优先级身份，`capabilities` /
   `operations` 取并集（页面 artifact + 页面 provider 就是这种情况）。
   插件自己的"当前选中"建议用 `priority: 90+`，以压过可见页面的 60 / 会话编辑目标的 80。
   `operations` 会按本次 run 的 `isToolAvailable` 过滤，不会把不可调用的工具报给模型。
3. **失败隔离**：某个 provider 抛错只记日志，不影响其他对象（页面仍可被描述）。
4. **同步且廉价**：`getTargets` 是快照读取，不做 I/O；需要元数据时提前拉好。
5. **默认按页兜底**：内置 `core.page` provider 始终注册，优先取会话编辑目标，其次可见页面。
   即使没有任何插件注册 provider，`getCurrentTarget` 仍能回答页面对象。路由 tab 的可见编辑器经
   `setActiveEditor` 自动登记到认领表，因此页面 provider 能报告其选区，文档工具也能直接复用它。
6. **认领按页成栈**：路由 tab、侧边分栏、浮动窗可以同时显示同一页；最新认领是当前 writer，
   关闭后自动回落到下一个仍存活的认领，不会出现"页面还开着、agent 却另取一个隐藏 writer"。

## 5. 分层职责

| 层 | 负责 | 不负责 |
| --- | --- | --- |
| `agent-page-target` | 页面身份、权限、文档能力、房间认证 | 非页面对象 |
| `agent-operation-target` | 当前对象的类型/身份/能力/可用工具、provider 注册与解析 | 具体工具的读写实现 |
| `agent-editor-registry` | 页面当前由哪个可见编辑器承载（写权归属） | 对象类型描述 |
| `session-page-binding` | 会话的页面编辑目标与租约 | 非页面对象 |
| 插件 provider | 自己界面的"当前选中/当前对象" | 中心注册表里的硬编码分支 |
| `getCurrentTarget` 工具 | 把解析结果投影给模型 | 改变目标（切换目标仍用 `editPage` / `focusArtifact`） |

## 6. 在插件开发台里使用

- 类型：`@kn/plugin-api` 已导出 `AgentOperationTarget` / `AgentOperationTargetProvider` /
  `AgentOperationTargetView` / `AgentTargetOperation` / `AgentTargetSelection`。
- 运行时函数：`@kn/common` 的 `registerAgentOperationTargetProvider` /
  `useAgentOperationTargetProvider` / `resolveAgentOperationTargets` /
  `serializeAgentOperationTargets`。
- 开发台 agent 工具 `listAgentTargets`：列出当前 provider 与解析结果，用来验证插件刚注册的对象；
  `includeTargets:false` 只看 provider。宿主较旧、没有该注册表时返回 `available:false`，不抛错。
- 插件作者的完整说明见 [PLUGIN_STUDIO.md](./PLUGIN_STUDIO.md#当前操作对象agentoperationtarget)。

## 7. 自测

```bash
pnpm --filter @kn/common check:document-target
```

该检查覆盖：认领表、确切页面目标、页面工具分类，以及 provider 注册/去重/优先级的基础行为
（schema 由 `agent-operation-target` 的导出类型保证）。