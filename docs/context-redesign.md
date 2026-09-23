# Agent 上下文管理重构（设计）

> 目标：把「模型上下文」从当前**每步重算、多来源拼接、双日志易漂移**的实现，重构为
> **单一权威、显式分层、可持久化**的模型上下文管线；允许打破现有设计，但**功能必须完整**。

## 1. 现状审计（问题清单）

| # | 现状 | 问题 |
|---|------|------|
| P1 | 模型上下文 = system(index0) + 原始会话日志 + 每步 `assemble()` 现算的裁剪/压缩 | 模型可见内容**每步重算**；任何一处重算规则变化都会改写前缀，缓存/正确性都脆弱 |
| P2 | `agent_chat_session.model_messages_json` 同时是**模型上下文源**和 **UI 投影源** | 压缩无法持久化（会丢 UI 历史），只能靠「内容哈希 + Redis 摘要」间接复现；跨实例/重启不稳 |
| P3 | 能力块（技能片段 + deferred 目录）作为**一条 user 消息**注入并逐轮落库 | 体量大（实测 51k→24k 字符）；且它是「伪 system」，语义含糊；任何 catalog 变化都会追加新块 |
| P4 | deferred 工具靠**目录广告**，首次调用后**并入 tools[]** | tools 数组中途变化 → 前缀失效；provider 对历史 tool_call 的声明要求与目录机制互相打架 |
| P5 | 压缩是**启发式 + LLM 摘要**，摘要按内容哈希缓存在 Redis | 压缩边界与摘要未作为「一等持久化状态」，只能被推导，难以审计与回放 |
| P6 | `forLog` 的通用 2 万字符截断曾把注入目录整段切掉 | 说明「模型可见内容」没有单一写入点，隐藏的截断/改写会静默破坏上下文 |
| P7 | 旧路径残留：`attachVolatileContext`（子 run 用）与新管线并存 | 两条装配逻辑，行为不一致，容易再次走岔 |

## 2. 目标架构

### 2.1 分层（自上而下，顺序即缓存前缀顺序）

1. **SystemPrompt**（role=system, index 0）——会话内**字节不变**：base persona + 宿主不变量规则
   (+ plan / delegated 规则，二者同属不变量)。
2. **CapabilityBlock**（role=user, 标记 `__context_stable__`）——技能片段 + 工具目录；
   **按 catalog 版本缓存**，内容不变则不重复写。
3. **Turns**（user/assistant/tool）——**只追加**；只允许「持久化的压缩」改写旧区段。
4. **TurnContext**（role=user, 标记 `__context__`）——记忆/画像/滚动摘要/绑定页；逐轮追加，体量小。

不变式（用测试固化）：
- index 0 在会话内 byte-identical；
- CapabilityBlock 在 catalog 不变时 byte-identical；
- Turns 只追加；压缩只发生在「追加区段摘要」这一种持久化操作上；
- 模型可见消息 = 上述四段的纯函数。

### 2.2 单一写入点：Model Surface

- 引入 **Model Surface**：模型实际看到的有序消息序列，**独立持久化**（新列 `agent_chat_session.model_surface_json`，
  或先落 Redis `agent:surface:{conversationId}` 再异步镜像 DB）。
- **原始日志**（现 `model_messages_json`）继续作为 **UI transcript 与事实来源**，**永不因压缩而改写**。
- 压缩以 **CompactionSegment**（`{from, to, summary}`）列表形式记录；Surface = 原始日志应用 segments + 确定性裁剪。
  segments 一旦写入**不可变**，新增只追加 → 模型前缀天然稳定。
- `AgentLoop` 每步只做「取 Surface + 拼 tools」，不再现算上下文。

### 2.3 工具上下文

- `tools[]` 在会话内**冻结**（稳定前缀）。
- deferred 工具不再「首次调用即并入 tools」引发前缀失效：
  - 方案 A（推荐）：目录仅保留 **名称 + 参数签名**（已实现），并让 deferred 工具**始终不并入 tools**，
    其 schema 随首次调用结果返回；provider 若要求历史声明，则用方案 B。
  - 方案 B：引入**统一网关** `invokeTool({name, arguments})`（始终声明）+ `searchTools`，
    deferred 工具永不出现在 tools[]，由网关转发；目录可进一步退化为按需检索。
- 目标：**没有任何工具被隐藏**，同时 tools 数组稳定。

## 3. 分阶段落地（每阶段可独立上线，测试全绿）

| 阶段 | 内容 | 风险 | 收益 |
|------|------|------|------|
| S1 | 抽出 `context` 包内的纯函数组件（SystemPromptFactory / CapabilityBlockBuilder / TurnContextBuilder / ToolDirectory / Compactor / TokenEstimator），`ContextManager` 退化为门面；补契约测试 | 低（行为不变） | 单一装配路径、可测、可演进 |
| S2 | Model Surface：压缩 segments 显式持久化，模型可见日志与 UI 日志解耦；`AgentLoop` 不再每步重算 | 中 | 压缩可持久/可回放；前缀稳定；消灭 P1/P2/P5 |
| S3 | 工具网关/按需发现，冻结 tools 数组；目录进一步瘦身 | 中 | 消灭 P4；前缀更小 |
| S4 | 清理旧路径（`attachVolatileContext`），统一所有 run（root/child）走同一管线 | 低 | 消灭 P7 |

## 4. 功能完整性保障

- 每阶段结束跑 `knowledge-agent-skills` 全量测试（当前 170 项）。
- 会话持久化、图片、子 agent、plan 模式、saved skill、profile、memory 等流程**均不改变对外契约**。
- 迁移用增量列 + 兼容读取（无 surface 时回退到现有装配），可灰度。
