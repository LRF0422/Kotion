# 动态表单与填写请求（agent form requests）

> `askUserChoice` 只能问「二选一」。要版本号 + 更新说明 + 是否灰度这种一次多字段的输入，
> 让模型**在运行时声明一整张表单**，宿主渲染、校验、回收答案——而且答案只回到对话一次。
> 需要重复多行同类记录时用 `batch`（批量填写），一次提交多条。

## 为什么需要

`askUserChoice` 的模型是「给两个选项，点一个」。但很多 agent 任务需要的是**一组结构化字段**：

- 发布插件：版本号（`text`）、更新说明（`textarea`）、是否灰度（`checkbox`）、发布渠道（`radio`）；
- 新建页面：标题、路径、父页面、是否公开；
- 查询/导出：时间范围（`date`）、包含哪些字段（`multiselect`）、条数上限（`number`）；
- 批量导入：同一组字段要重复填好几条（成员、发布项、页面）——用 `batch` 批量模式，一次提交多条。

把它们拆成串行单选题，用户体验是「被审问」：每答一个等一轮模型调用、字段一多就丢上下文，
模型还要在多次工具调用之间自己拼装信息。动态表单把这件事压成**一次交互**：
schema 是数据不是代码，模型按需声明，宿主负责渲染与校验。

## 契约

### 1. 字段

支持 8 种类型：

| 类型 | 形态 | 值 |
| --- | --- | --- |
| `text` | 单行输入 | `string` |
| `textarea` | 多行输入（`rows` 只是显示行数） | `string` |
| `number` | 数字输入（`min` / `max` 校验，`step` 只是 UI 提示） | `number` |
| `select` | 下拉单选（必须给 `options`） | `string` |
| `radio` | 平铺单选（必须给 `options`） | `string` |
| `multiselect` | 多选（必须给 `options`） | `string[]` |
| `checkbox` | 单个布尔勾选 | `boolean` |
| `date` | 日期，`YYYY-MM-DD`（含真实性校验，`2026-02-30` 不通过） | `string` |

每个字段：

- `key`：答案的键，必须匹配 `^[A-Za-z_][A-Za-z0-9_.-]*$`，长度 ≤ 64，同一张表单内不可重复；
- `label`：控件上方的文案（≤ 200 字）；
- `type`：上面 8 种之一，缺省按 `text`；
- `description` / `placeholder`：辅助说明与占位符（字段说明 ≤ 500 字）；
- `required`：必填；`checkbox` 的 required 语义是「必须勾上」（如「我已阅读…」），`false` 不算填了；
- `options`：`select` / `radio` / `multiselect` 必填，选项可以是字符串简写，
  也可以是 `{ value, label, description? }`；选项值与显示名各 ≤ 120 字，选项值不可重复；
- `defaultValue`：打开表单时的预填值，类型不符或不在选项内会被**丢弃**而不是报错；
- `min` / `max` / `step`：数字字段边界与步进；
- `minLength` / `maxLength`：文本字段长度边界；
- `rows`：`textarea` 的可见行数（1–20，纯 UI）。

表单级约束（`normalizeFormRequestInput` 在工具边界统一处理，模型传什么都先规整）：

- 最多 **20 个字段**；每个字段最多 **50 个选项**；
- `title` ≤ **120 字**，`description` ≤ **2000 字**；
- `maxLength` / `minLength` 的边界上限是 10000 字；**不声明 `maxLength` 时仍按 10000 字上限校验（超出即报错）**
  （防止一次粘贴把表单答案变成上下文炸弹）；`submitLabel` ≤ 40 字；
- 未知字段类型、非法/重复 key、`min > max`、`minLength > maxLength` 都会直接给出可读错误，
  而不是渲染一张坏表单。

**明确不支持**（不是「还没做」，是刻意不做）：

- **条件字段**（显示/隐藏、联动）——模型描述一张静态表单就够了，条件逻辑会让可预测性崩塌；
- **文件上传**——上传走专门的文件服务与权限模型，不走「表单答案」通道；
- **`pattern` 正则校验**——正则来自模型，一次灾难性回溯就能卡死 UI；需要格式约束请用
  `minLength` / `maxLength` / `number` 边界，或让用户在自由文本里填、由工具自己校验。

### 2. 批量填写（batch）

一张表单也可以是**批量模式**：同一组字段重复多次，用户添几行就填几条记录（批量建页面、
批量导入成员等）。传 `batch` 即启用；不传 / `false` 就是原来的单条模式。

```jsonc
// requestUserForm 参数片段
{
  "title": "批量导入成员",
  "batch": { "minRows": 1, "maxRows": 10, "defaultRows": 3, "rowLabel": "成员", "addLabel": "添加成员" },
  "fields": [ /* 同一组字段 */ ]
}
```

- `batch` 可以是 `true`（默认规格：`minRows: 1` / `maxRows: 20` / `defaultRows: 1`），
  也可以是对象 `{ minRows, maxRows, defaultRows, rowLabel, addLabel }`：
  - `minRows` / `maxRows`：**1–50**，越界夹取；`maxRows` 缺省 20
    （`DEFAULT_FORM_BATCH_MAX_ROWS`），`MAX_FORM_BATCH_ROWS` = 50 是硬上限；
    `minRows > maxRows` 直接给出可读错误；
  - `defaultRows`：打开时先显示几行，夹到 `[minRows, maxRows]`，缺省 = `minRows`；
  - `rowLabel` / `addLabel`：一行记录的名词（如「成员」「条目」，行标题显示为「成员 1」「成员 2」）
    与「添加一条」按钮文案（各 ≤ 40 字）。
- **一张表单只能是单条记录或批量记录之一**：有 `batch` 就是批量，没有就是单条，不存在混用。
- 答案在 **`rows: FormValues[]`**（单条仍然是 `values`）；`formRequests.submit` 对批量表单接受数组。
- 校验（`validateFormRows`）语义：
  - **空行不计**：一行的所有字段都未填（空字符串 / 空数组 / `false` / 未设）就算空行；
    编辑器总会留着一行空白，提交时被忽略而不是报错；
  - 有效记录至少 `minRows` 条、最多 `maxRows` 条（提交的数组长度也不能超过 `maxRows`，
    UI 到上限后会禁用「添加」）；
  - 逐字段错误键是 **`"rowIndex.fieldKey"`**（如 `"0.version"`），行号是**提交时的原始下标**（从 0 起），
    所以 UI 能把错误放回出错的那一行，即使存储时会丢掉空行；
  - 返回的 `rows` 只含非空且有效的记录；未知键照旧忽略。
- 工具结果：`requestUserForm` / `getFormRequest` 在批量 answered 时返回 **`rows` + `rowCount`**
  （单条返回 `values`）；`listFormRequests` 每项带 **`batch`** 标记，批量已结束的还带 `rowCount`。
- 通知文案按行列出：标题带「共 N 条」，正文是「第 1 条：字段：值；…」「第 2 条：…」。
- UI 把批量模式渲染成**一张表格**：**列 = 字段**（表头是字段 `label` + 必填标记 + `description`），
  **行 = 一条记录**，用户直接**在单元格里编辑**，不再是一记录一张卡片：
  - 单元格按字段类型给控件：text / number / date 用输入框，textarea 用多行输入，
    select / radio 用下拉，multiselect 用弹层勾选，checkbox 用勾选框；
  - **首列是行号，末列是删除**（删到 `minRows` 时禁用）；表格**下方是添加行**（到 `maxRows` 时禁用）；
    打开时按 `defaultRows` 先给几行；
  - 校验错误 `"rowIndex.fieldKey"` 直接显示在**对应单元格下面**，不是整表只给一条错误；
  - 键盘操作：**Enter 跳到同列下一行**（批量模式不提交表单，`textarea` 里仍是换行，IME 组合中不拦截），
    **Tab 按原生焦点顺序切换单元格**；
  - 表格**横向滚动**（字段多时列宽不挤压）、**表头 sticky**（行多时仍知道每列是什么），最多 50 行；
  - 已结束的只读摘要也按同一套「列 = 字段、行 = 记录」展示（带行号与各列的值）。

**是表格，但不是电子表格。** 它只做「同一组字段重复填多行」：没有公式、列类型、排序 / 筛选、
粘贴导入和分页；默认最多 20 行、硬上限 50 行，超过这个量级的大批量数据应走文件导入或专用分页页面。

### 3. 四个工具

| 工具 | 作用 |
| --- | --- |
| `requestUserForm` | 创建表单并等待：默认 `wait: true`，`timeoutMs` 默认 300000（5 分钟）、上限 600000（10 分钟）；`wait: false` 立即返回 `formId`；传 `batch` 则进入批量模式（答案在 `rows` + `rowCount`） |
| `getFormRequest` | 取状态/等待：`formId` 省略 = 本会话唯一 pending 的那张；`wait: false` 只读一次（**answered 会被消费**）；批量 answered 返回 `rows` + `rowCount` |
| `listFormRequests` | 本会话的表单列表（默认包含已结束的），用于「刚才那张表单填了吗」；每项带 `batch` 标记，批量已结束的还带 `rowCount` |
| `cancelFormRequest` | 撤回待填写的表单；正在等它的 run 收到 `status: 'cancelled'`（带 reason） |

四个工具都是**只读工具**（`readOnly`）：它们不写文档、不占文档写锁，因此在工作台（无文档的 run）
里也能用。`requestUserForm` 只会在**有表单宿主的界面**上创建请求：宿主由
`FormRequestsPanel` 挂载时注册（`registerFormRequestHost`），当前界面没有渲染表单的能力时会
**快速失败**并提示改用文字提问——而不是把 run 空等 5 分钟、后面却没有任何人看得见这张卡片。

等待预算的语义和后台任务一致：**超时不是失败**。`requestUserForm` 超时后返回
`status: 'pending'`、`timedOut: true`，表单**仍可填写**（用户可能只是去倒杯水了）；
之后 `getFormRequest({ formId, wait: true })` 可以再次把它「挂起等待」。

结果状态只有三种：

- `answered`：带 `values`（单条）或 `rows` + `rowCount`（批量）；只含声明过的字段，未知键被忽略；
- `cancelled`：带 `cancelReason`（用户关闭 / agent 撤回）；
- `pending`：还没人填；`waitExpiredAt` 标记「已经没人在等了」。

**一个步骤里只放一张表单。** 同一批工具调用按顺序执行，两个 blocking 的
`requestUserForm` 会串行（用户填完一张才看到下一张）。要问三个字段，就放进一张表单的三个字段。

### 4. 两条投递路径（恰好一次）

表单被填写后，答案只走其中一条：

1. **有等待者**（`requestUserForm` / `getFormRequest({ wait: true })` 正挂着）→
   工具结果**直接带答案**（单条 `values`，批量 `rows` + `rowCount`），请求被标记 `deliveredAt`，不会再发通知；
2. **没人等**（等待超时、或用户稍后从统一面板里填）→ 请求保持
   「answered 但未投递」，等这一轮 run 空闲下来，宿主用 `takeUndelivered` 认领，
   把答案作为一条通知推进对话。认领后 `deliveredAt` 落定，**只发一次**。

几个容易踩的细节：

- 看一张 **pending** 的表单**不消费**任何东西（`wait: false` 只是瞄一眼）；
- 看一张 **answered** 的表单就是消费（`getFormRequest` / `consume` / `takeUndelivered` 都会标记已投递）；
- 通知里每个字段是一行「标签：值」，选择类字段显示选项的 `label`；**批量表单按「第 N 条：字段：值；…」
  逐行列出**（标题带「共 N 条」）。超长值截断，
  完整答案仍可用 `getFormRequest({ formId })` 重读；
- 答案**只回到发起它的会话**（`conversationId`）：别的会话的卡片/通知不会拿到它。

## 统一「填写请求」面板

会话内联卡片只解决「你正看着发起它的那个会话」。用户可能在别的会话、甚至切走了页面，
所以还有一个统一的收件箱：

- **入口在 chat header**（`FormRequestsPanel`；侧边 dock 与 `/ai` 页共用同一个 `ChatHeader`），
  图标角标 = **待填写**表单数量；
- 列出**整个窗口**的请求，不只是当前会话——跨会话找回来正是这个面板的意义；
- 分「待填写 / 已结束」两组：待填写按到达顺序（最早的最靠上），已结束按处理时间倒序；
- 可以**在面板里直接展开填写**（桌面 Popover / 移动端 Sheet），不用先跳回发起会话；
  每行显示所属会话，可「打开所在会话」；批量表单标注「批量 · N 条」（待填写时 N 是默认行数、
  已填写后是实际条数；`rowLabel` 作为行名词显示），已结束的批量摘要按行展示；
- 面板同时向内核**注册自己是表单宿主**（`registerFormRequestHost`，引用计数，dock 与 `/ai` 页
  同时挂载/StrictMode 双挂载都安全）：没有面板的界面里 `requestUserForm` 会快速失败，不会静默空等；
- 会话内也会内联展示**本会话**的待填写表单（`FormRequestCard` 适配层 → `AgentFormCard` 渲染），
  两种入口改的是同一份注册表数据，在一个地方填写，另一个地方立刻变成只读摘要；
- footer 明码标注两条边界：**刷新页面会清空**；**等待超时后表单仍可填写**（提交后答案会作为通知送回会话）。

## 实现位置（改这块要看哪）

| 层 | 文件 | 职责 |
| --- | --- | --- |
| 框架 | [`packages/common/src/ai/agent/form-requests.ts`](../packages/common/src/ai/agent/form-requests.ts) | 契约类型（含 `FormBatchSpec`）+ 规整/校验（`validateFormValues` / `validateFormRows`）+ `FormRequestRegistry` 单例 + 排序/分组/值格式化 + 通知文案 + 表单宿主注册（`registerFormRequestHost` / `formRequestHostAvailable`） |
| 框架 | [`packages/common/src/ai/tools/form-tools.ts`](../packages/common/src/ai/tools/form-tools.ts) | 上表四个工具（按 `execCtx.conversationId` 限定在调用方会话；`batch` 参数与 `rows`/`rowCount` 结果） |
| 框架 | [`packages/common/src/ai/agent/use-form-requests.ts`](../packages/common/src/ai/agent/use-form-requests.ts) | `useFormRequests` / `usePendingFormRequests` / `useFormRequest`：`useSyncExternalStore` 订阅注册表 |
| 框架 | [`packages/common/src/ai/agent/use-form-request-notifications.ts`](../packages/common/src/ai/agent/use-form-request-notifications.ts) | 空闲投递：run 忙时答案留在注册表，idle 时 `takeUndelivered` 并交给宿主 |
| 框架 | [`use-editor-agent.ts`](../packages/common/src/ai/agent/use-editor-agent.ts) / [`use-workspace-agent.ts`](../packages/common/src/ai/kernel/use-workspace-agent.ts) | `onFormRequestAnswered(requests, note)` 选项与透传（工作台同样要能收到） |
| 元数据 | [`packages/common/src/ai/discovery/tool-metadata.ts`](../packages/common/src/ai/discovery/tool-metadata.ts) | 四个工具 `scope: 'any'` + `requiresEditor: false`：工作台（无文档）也要能问、能查 |
| 注册 | [`packages/core/src/ai/tools/register.ts`](../packages/core/src/ai/tools/register.ts) | `createFormTools` 与其它工具工厂并列注册 |
| UI | [`packages/ui/src/components/ai/AgentFormCard.tsx`](../packages/ui/src/components/ai/AgentFormCard.tsx) | **共享展示组件**（从 `@kn/ui` 导出）：单条模式用 `FieldSet` / `FieldGroup` / `Field` / `FieldLabel` / `FieldDescription` / `FieldError` / `Button`；批量模式用 `Table` / `TableHeader` / `TableBody` / `TableRow` / `TableHead` / `TableCell` + 单元格控件（`Input` / `Textarea` / `Select` / `RadioGroup` / `Checkbox` / multiselect 弹层），负责单元格编辑、行号 / 删除 / 添加行、错误定位到对应单元格、横向滚动 + sticky 表头、只读摘要；不 import `@kn/common`（结构类型镜像） |
| UI | [`packages/plugin-ai/src/ai/menu/chat/FormRequestCard.tsx`](../packages/plugin-ai/src/ai/menu/chat/FormRequestCard.tsx) | **薄适配层**：`useFormRequest` 订阅 live view + `validateFormValues` / `validateFormRows` + `formRequests.submit` / `cancel`，把 `AgentFormRequest` 与校验结果交给 `AgentFormCard`；不再自己渲染表单结构 |
| UI | [`packages/plugin-ai/src/ai/menu/chat/FormRequestsPanel.tsx`](../packages/plugin-ai/src/ai/menu/chat/FormRequestsPanel.tsx) | header 统一收件箱（桌面 Popover / 移动端 Sheet）：跨会话列表、角标、面板内填写、打开所在会话、批量标注；同时也是**表单宿主**注册点 |
| UI | [`ChatConversation.tsx`](../packages/plugin-ai/src/ai/menu/ChatConversation.tsx) / [`KernelConversation.tsx`](../packages/plugin-ai/src/ai/home/KernelConversation.tsx) | 会话内联待填写卡片 + `onFormRequestAnswered` 的通知落点（把答案变成新的一轮） |

**前端组件规范**：表单字段、提交区与批量表格必须用 **`@kn/ui`** 的组件（`FieldSet` / `FieldGroup` / `Field` /
`FieldLabel` / `FieldDescription` / `FieldError` / `Button` / `Input` / `Textarea` / `Select` /
`RadioGroup` / `Checkbox` / `Badge`，批量表格用 `Table` / `TableHeader` / `TableBody` / `TableRow` /
`TableHead` / `TableCell` …），**表单卡片内部不要**手写 label、错误块或原生 `<button>`；
跨插件共享的展示组件放 `packages/ui/src/components/ai/`（与 `ToolApprovalCard` 同类），
plugin-ai 只保留「注册表 + 校验 + 提交」的适配层。面板列表行/触发器等 chat chrome 沿用现有面板样式
（与 `BackgroundTasksPanel` 一致），不属于表单控件。

## 明确的边界（不要误解）

- **注册表在内存里，随页面刷新消失。** 刷新后待填写表单是空的，**当初挂在表单上的 run 也没了**
  （它依赖的前端工具调用随页面一起消失）。刷新后的真相在宿主的会话状态里；这是「一张问题卡片」，
  不是持久化工作流。
- **没有表单界面就没有表单。** `requestUserForm` 依赖已挂载的表单宿主（`FormRequestsPanel`）；
  在某些嵌入式对话表面（没挂载 header 面板）里调用会**直接报错说明**，让模型改用普通文字提问，
  而不是创建一张永远没人能填的卡片。
- **不是后台任务。** 表单必须由**用户交互**完成，`requestUserForm` 是 frontend tool：
  等待期间这一步就是停在那里（服务端工具超时兜底），不会像 `background: true` 那样让 agent 继续干别的。
  两者共享的只是「空闲才注入 + 恰好一次」的投递语义。
- **只按会话隔离。** 列表与「省略 formId」只认调用方会话；显式传 `formId` 能读到别的会话的表单
  （诊断用），但答案通知永远不会跨会话。
- **一批工具里多个 blocking `requestUserForm` 会串行。** 工具批次顺序执行，第二张表单要等第一张
  有结果（或超时）才出现；请把字段合并进一张表单，需要多行同类记录就用 `batch`。
- **是表格，但不是电子表格。** 一张表单只能是**单条或批量之一**（有 `batch` 就是批量，不存在混用）；
  批量默认最多 20 行、硬上限 50 行，**空行不计入**有效记录；表格没有公式、列类型、排序 / 筛选、
  粘贴导入和分页——超过 50 行的大批量数据请走文件导入或专用分页页面，不要用一张两百行的表单当数据网格。
- **`cancelFormRequest` 是撤回请求，不是删除已填数据。** 已经 answered 的表单无法取消，
  答案也不会因为「撤回」而消失；它只是关闭「还能填」这件事。
- **不要在表单里收密码 / 密钥 / 个人敏感信息。** 宿主不落盘表单数据，答案会作为对话消息
  进入 transcript（进而进入模型上下文与服务端会话历史）。凭据类输入请走专门的密钥/凭据通道。
- **容量 100 条（进程内）。** 超出后先淘汰最老的终态表单；**已填写但未投递的答案最后才淘汰**
  （丢掉它就等于永远不告诉 agent）。待填写表单不会被淘汰。
- **超时后「没人等」不等于「答案不要了」。** 表单保持 pending 可填，填完走通知路径；
  `waitExpiredAt` 只是告诉 UI/agent「当前没有 waiter」。

## 与后台任务的关系

两者是同一套投递思路的两个方向：

| | 后台任务 | 动态表单 |
| --- | --- | --- |
| 谁产生结果 | 工具在后台跑完 | **用户**填完 |
| agent 能不能先干别的 | 能（`background: true`） | 不能（frontend tool，阻塞这一步） |
| 有人等 | 工具结果里直接给 | 工具结果里直接给 `values`（单条）/ `rows`（批量） |
| 没人等 | 空闲通知（`takeUndelivered`） | 空闲通知（`takeUndelivered`） |
| 恰好一次 | `deliveredAt` | `deliveredAt` |

## 自测

```bash
pnpm --filter @kn/common check:form-requests
```

覆盖：`normalizeFormRequestInput`（8 种字段、上限、非法 key/重复 key/坏选项；`batch` 的
`true` / 规格对象 / `minRows > maxRows` 报错 / `defaultRows` 夹取 / `false` 不启用）、
`validateFormValues`（必填、边界、选项、日期、checkbox 语义、未知键忽略）、
`validateFormRows`（**空行忽略**、错误键 `"行号.字段"`、`minRows` 不足、`maxRows` 超出、
未知键忽略、只返回非空有效行）、
注册表的 `wait`（有人等 / 超时不消费 / 取消唤醒）、两条投递路径的恰好一次、
批量 `submit` 存 `rows` 而非 `values` 且通知文案含「第 N 条」、
`cancel` 语义、容量淘汰顺序、看板纯函数（`sortFormRequests` / `groupFormRequests` /
`formatFormFieldValue` / `buildFormRequestNote`）的排序与稳定性，
以及工具层：四个工具的 schema、会话作用域、`formId` 省略解析、`scope: 'any'`（工作台可见）、
不占文档写锁、没有表单宿主时快速失败（不创建永远没人能填的请求）、
`requestUserForm` / `getFormRequest` 的 `rows` + `rowCount` 与 `listFormRequests` 的 `batch` / `rowCount` 标记。