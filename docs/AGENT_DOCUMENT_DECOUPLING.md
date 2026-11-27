# Agent 与文档编辑解耦（能力包模型）

> 状态：已实施（提示/能力层）。本文记录 agent 的"身份"与"文档编辑能力"分层，以及各 surface
> 如何声明"当前有文档能力在起作用"。
> 相关：[AGENT_PAGE_MODEL.md](AGENT_PAGE_MODEL.md)（页面身份/权限）、
> [AGENT_OPERATION_TARGET.md](AGENT_OPERATION_TARGET.md)（通用操作对象）、
> [agent-kernel-spec.md](agent-kernel-spec.md)（内核契约）。

## 1. 为什么改

在此之前，agent 的默认身份就是"文档编辑器"：

- 内置技能 `document-editing` 是 eager 的，片段开头是
  `You are an intelligent document editing assistant working inside Kotion's knowledge base.`；
- 工作台 skill 要求"需要落地成果时，写进页面，而不是只在对话里回答"；
- 所有文档工具有 `core: true`，无论有没有文档都随 `tools[]` 全量下发；
- 结果：即使只是一个提问，模型也倾向于先 `createPage` 再回答；没有打开页面的场景（`/home`、
  `/ai`、独立助手页）表现得像"缺了文档就无法工作"。

但 agent 实际承担的是通用工作：检索、文件/空间/插件操作、长任务、对话。文档编辑只是它**可能**用到
的一种能力。因此把文档编辑从"身份"降级为"按需能力包"，只在需要时加载和执行。

## 2. 模型

### 2.1 身份（always-on）

内置技能 `general-assistant`（`skills/built-in/general-assistant.ts`）是每一轮都展开的身份：

- 你是通用 Agent，不是文档编辑器；
- 提问/讨论/总结 → 直接回答，不为"落地"建页；
- 明确要写/改文档 → 用文档能力；
- 要产出内容但**没有指定位置、当前也没有文档** → 先用 `askUserChoice` 问清：
  新建页面 / 已有页面 / 只在对话里给内容；
- 工具列表里有文档工具 ≠ 用户想编辑文档。

它 `requiredTools: []`，所以任何 scope / 白名单过滤都不会把身份丢掉。

### 2.2 能力包（on-demand）

文档编辑是**一个能力包**，不只是 `document-editing` 一个技能：全部 17 个文档域技能
（document-read / write / delete / format / table / layout / callout / color / interaction /
refactor、columns-layout、formatting-layout、content-analysis、content-generation、translation、
writing-improvement）以及总规范 `document-editing` 都声明 `capability:document`。

- 总规范 `document-editing` 声明 `tags: ['document', 'policy', 'capability:document']`；
- 只有 surface 传入 `activeCapabilities: ['document']` 时，这一族技能的提示片段才 eager 下发；
- 没有该能力时，它们仍以**索引条目**（名字 + 一句话用途 + 工具名）随请求下发，
  模型需要时调用 `load_skill('document-editing')` 取完整规则和工具参数；
- `load_skill` 是会话级的：加载过一次之后，后续轮次把它当作可调用的 deferred 工具集合，
  不再重复发现。

实现位置：`capabilities/catalog-to-run-input.ts`

```ts
export const CAPABILITY_TAG_PREFIX = 'capability:'
export function skillCapability(skill): string | null
export function skillFragmentIsEager(skill, activeCapabilities?: ReadonlySet<string>): boolean
```

规则：

1. 带 `capability:<id>` 标签、且 `<id>` 不在 `activeCapabilities` 里 → 片段延迟；
2. 其余 `builtin` 技能仍然 eager；
3. 带 `essential` 标签的仍然 eager。

### 2.3 各 surface 如何声明

| surface | `activeCapabilities` | 含义 |
| --- | --- | --- |
| 页面侧 dock（`ChatConversation`） | `targetPage || agentEditor` → `['document']` | 会话有绑定页/可见编辑器，文档能力在起作用 |
| `/ai` 工作台（`useWorkspaceAgent`） | `hasDocument` → `['document']` | 只有 `createPage`/`editPage` 真正拿到隐藏编辑器后才激活；之前是通用 run |
| 独立助手面板（`AIAssistantPanel`） | `editor` 存在 → `['document']` | 面板可无页面运行；绑定编辑器时才展开文档规范 |

没有文档目标时**不传**（等价于空集合）。这时 agent 的能力目录仍然包含文档工具（工具列表在 run 创建时
冻结，且同一轮里 `createPage`/`editPage` 之后要能立即写），但模型的**身份与规则**是通用的：

- 需要写文档时，身份规则要求先确认位置、再 `load_skill('document-editing')`；
- 工具执行层的 `noDocumentTargetMessage` 也会把"先问清写到哪里"作为可操作错误返回。

> 工具可见性与提示身份是两件事。前者属于"同一轮内能否落地"，后者决定 agent 是否把文档编辑当成默认
> 行为。本次解耦只改后者（见 §5）。

## 3. 行为契约

| 场景 | 期望行为 |
| --- | --- |
| "解释一下 RAG" | 直接回答；不建页、不写文档 |
| "总结我们刚才聊的" | 直接回答 |
| "帮我写一份周报"（没有打开页面） | 先 `askUserChoice`：新建 / 已有页面 / 只在对话里；确认后 `createPage` 或 `editPage`，再 `load_skill('document-editing')` |
| "把这段写进《Q3 计划》" | 用 `editPage` 绑定该页（或确认已在目标），加载文档规范后写入 |
| 用户说"只在对话里给内容" | 不调用任何写入工具 |
| 当前页面已打开、用户要求改正文 | 文档能力已激活（`activeCapabilities` 含 `document`），按文档规则直接编辑 |

## 4. 兼容与边界

- **"先问位置"需要真实的提问通道**：`askUserChoice` 的元数据改为 `scope: 'any'` / `requiresEditor: false`，
  否则 workspace run 在没有文档时会把它过滤掉。`KernelConversation` 现在挂了
  `useUserChoiceBridge` + `UserChoiceCard`；没有选择 UI 的 surface（如独立助手面板）会拿到一个明确的
  工具错误，要求模型**在回复里直接提问并结束回合**，而不是像以前那样静默选中第一个选项。
- **`load_skill` 仍能拿到文档包**：能力包即使未激活也保留索引条目；工具可用时 `load_skill` 正常返回
  片段与 schema。
- **同一轮中途获得文档**：run 的 tools/skills 在创建时冻结，文档规范要到下一轮才 eager；本轮的写入由
  身份规则要求先 `load_skill`，因此不会"没有规则就写"。
- **页面会话基础设施不变**：`targetPage`、离屏编辑器、页面认领、`AgentPageTarget` 仍是页面能力自己的
  实现，不在本次改动范围内。它们属于下一层（架构层）解耦。
- **后端仍然 domain-blind**：`AgentPrompts` 不出现任何页面/文档概念；所有领域规则继续由客户端以技能
  形式提供。

## 5. 仍未解耦（后续工作）

本次是提示/能力层（方案 A），以下结构性耦合保留：

1. `ChatConversation` 仍内置 `targetPage` + 离屏编辑器 + 页面桥（约 400 处 page/editor 引用）；
2. `useCapabilityProviders` 仍以 editor 为构造参数，文档工具在无目标时靠执行期报错；
3. `AIAssistantPanel` 仍是独立实现（虽然已可无页面发送），没有复用工作台的隐藏编辑器能力；
4. `/ai-assistant` 仍由 core 提供，无法直接复用 plugin-ai 的工作台表面。

彻底解耦（方案 B）应把上述内容收敛为可选的 `DocumentCapability` 适配器：会话只持有通用
`AgentOperationTarget`，页面/文档适配器在需要时注册并申请编辑器。那是一次独立的重构，不应与本次
提示层改动混在一起。

## 6. 自测

```bash
pnpm --filter @kn/common check:plugin-agent   # 身份 eager / 文档包 on-demand / 索引条目
pnpm --filter @kn/common check:skill-tools    # load_skill 仍能交付能力包
pnpm --filter @kn/common check:document-target
pnpm --filter @kn/common check:agent-page
```

`check:plugin-agent` 的 `checkDocumentCapabilityIsOnDemand` 固定了以下不变量：

- `document-editing` 不再包含旧的 "You are an intelligent document editing assistant" 身份句；
- 17 个文档域技能全部标记 `capability:document`，无 `activeCapabilities` 时片段都不下发；
- 无 `activeCapabilities` 时 `description` 仍下发（索引可达）；
- 传 `['document']` 时片段带 `【技能名】document-editing` 前缀下发；
- `general-assistant` 在任何情况下 eager，并保留"先问位置"的规则；
- 工作台 skill 不再默认"写进页面"。