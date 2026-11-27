# 编辑器获取稳定性（hidden editor lease）

> 症状：`getDocumentStructure` 等文档工具间歇性失败，错误是
> `无法取得编辑目标「…」的编辑器。为避免把内容写到别的页面，本次文档操作已停止。`
> 用户只能让 agent 重新 `editPage`，而重试经常继续失败。
>
> 本文记录这条链路的失效模式与修复。页面身份/权限模型见
> [AGENT_PAGE_MODEL.md](AGENT_PAGE_MODEL.md)；agent 与文档能力的解耦见
> [AGENT_DOCUMENT_DECOUPLING.md](AGENT_DOCUMENT_DECOUPLING.md)。

## 1. 为什么旧管理方式会“经常拿不到编辑器”

文档工具必须在一个 **live Tiptap editor** 上执行，而这个 editor 是共享协作 Y.Doc 的一个
租约（可见编辑器 / 浮窗 / 分屏 / 隐藏离屏会话）。旧实现把“租约记录存在”当成“编辑器可用”，
于是出现下面几条互相独立的失效链：

| # | 失效 | 后果 |
|---|---|---|
| 1 | 会话记录 `ready` 但 editor 已被销毁（HMR、React remount、协作 provider 重建） | `acquire()` 永远返回死 editor，页面在没有可见编辑器时**永久不可写**，直到会话被空闲回收 |
| 2 | 宿主只在首次就绪时 `markReady` | editor 实例重建后，manager 仍持有旧实例 |
| 3 | 侧栏缓存 / 工作台 handle / owner handle 只看“有没有缓存”，不看 liveness | 死句柄被反复复用 |
| 4 | 旧 handle 的 `release()` 无身份校验，直接减**当前记录**的 `refCount` | 新 generation 的 `refCount` 被误减到 0，60s 后空闲销毁，正在用的会话被回收 |
| 5 | `destroySession` 的 flush 窗口仍可被 `acquire` 取到 | 返回一个马上要 unmount 的 editor |
| 6 | 可见编辑器的 claim 晚一帧发布，而 acquisition 立刻去建隐藏会话或直接报错 | 要么两个 writer，要么“编辑器未就绪” |
| 7 | `resolveTools` 把“解析到编辑器但已失效”当成硬失败 | 模型被迫重新 `editPage`，形成重试循环 |

根因不是某一个页面，而是**租约生命周期与工具调用之间没有健康检查**。

## 2. 现在的稳定性模型

### 2.1 一个 generation 对应一次真实挂载

`offscreenSessionManager` 的每条记录带 `generation`：

- 记录被判定失效（ready 但 editor 不 live）时，删除并以新 generation 重建；
- 宿主按 `pageId:generation` 作为 React key，因此**一定 remount** 出新的隐藏编辑器，
  不会复用死实例；
- `markReady` / `markError` 都带 generation，旧挂载的迟到回调被忽略，不会误杀新会话。

### 2.2 `acquire` 只交付 live editor

`offscreenSessionManager.acquire`：

1. `closing` 记录：等待 flush 完成，再创建新记录，绝不交付正在销毁的 editor；
2. `ready` 但 editor 不 live：丢弃旧记录、发通知（宿主 remount）、创建新 generation，继续等待；
3. `markReady` 上报的 editor 不 live：直接忽略；
4. 句柄 `release()` 只在 `sessions.get(pageId) === record` 时减 `refCount`，旧 generation 的
   释放不会偷走新记录的引用。

### 2.3 每一层复用都检查 liveness

- `acquireLiveEditorForPage()`（`common/src/ai/editor-acquisition.ts`）是统一入口：
  可见 claim 优先；隐藏 handle 必须 live；死句柄释放 + `destroyIdle` + 重试新 generation；
  acquisition 过程中出现的可见 claim 会覆盖隐藏会话；
  **暂时性错误**（room 未同步、readiness 超时、页面仍在加载）再重建一次，
  **永久性错误**（整页组件、只读、回收站、未启用）立即失败，不做无意义等待。
- 侧栏 `offscreenTargetsRef` 缓存、owner handle、工作台 `handleRef` / aux handle 在复用前都
  用 `isLiveEditor` 校验；失效则释放并重新获取。
- 工作台/侧栏在目标页就是当前可见页时，会短暂等待可见编辑器的 claim（`waitForAgentEditor`），
  避免“claim 晚一帧”导致建第二个 writer 或误报未就绪。

### 2.4 工具层透明恢复

`useCapabilityProviders.resolveTools` 的 `bindTarget`：

- 解析到 editor 但 `!isLiveEditor` → 200ms 后**重试一次获取**（acquisition 会重建 generation），
  成功则本次工具调用继续，模型完全无感；
- acquisition 抛出的明确原因（整页组件、只读邀请、回收站、房间未同步）不重试，直接报给模型。

### 2.5 错误文案区分暂时/永久

`documentTargetUnavailableMessage` 现在会：

- **暂时性原因**：告诉模型“宿主已尝试重建编辑会话；可以直接重试这次操作”；
- **永久性原因**（整页组件、只读、回收站、页面类型插件未启用、block store 读失败）：
  明确“重试不会成功”，要求向用户说明，不要反复 `editPage`，也不要改用当前页面。

这样既避免模型把永久失败当成网络抖动，也避免它在一次真正的暂时失败后绕一大圈。

## 3. 不变量

1. 任何交给文档工具的 editor 都必须是 live 的（`isDestroyed !== true`）。
2. 一个 generation 的迟到回调不能修改/删除另一个 generation 的记录。
3. `closing` 期间的 editor 不可被交付。
4. 旧租约的 `release` 不得改变新 generation 的引用计数。
5. 可见编辑器（claim）优先于隐藏会话；可见页面的 editor 尚未发布时，短暂等待而不是立刻建隐藏会话。
6. 工具调用在“解析到死 editor”时可以透明恢复一次；明确失败必须带原因。

## 4. 自测

```bash
pnpm --filter @kn/core check:offscreen            # 会话生命周期（6 个场景）
pnpm --filter @kn/common check:editor-acquisition # claim 优先 / 死句柄重试 / 永久失败不重试
pnpm --filter @kn/common check:document-target    # 暂时/永久错误文案
pnpm --filter @kn/common check:agent
```

`check:offscreen` 覆盖：

- pending → ready 正常解析；
- ready 但 editor 已销毁 → 不交付，重建 generation，旧 generation 的 `markReady`/`markError` 被忽略；
- 上报 dead editor 不会把会话标记 ready；
- 旧 handle 的 `release` 不会减新 generation 的 `refCount`（`destroyIdle` 不得销毁仍被持有的新会话）；
- `markError` 拒绝等待者且允许后续重试；
- `closing` flush 窗口内不会交付旧 editor，新会话正常解析。

## 5. 仍然失败的情况（按设计）

- **协作房间确实没有同步**：隐藏编辑器拒绝离线写入，避免把占位内容当成文档保存；错误会带
  “room did not sync” 原因。
- **整页组件页面 / 只读邀请 / 回收站 / 页面类型插件未启用**：永久失败，不做无意义重试。
- **当前环境没有离屏编辑器 bridge**：只保留页面级工具，文档工具报环境不支持。

这些属于“失败关闭”，不是这次稳定性改造要消除的间歇性故障。