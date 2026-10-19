# 路由缓存（Keep-alive）

类似 Vue `<keep-alive>` 的路由级缓存：离开页面时**不卸载**页面组件树，回来时直接复用，编辑
器、滚动位置、筛选条件、WebSocket 订阅都还在。

实现分两半：

| 位置 | 职责 |
| --- | --- |
| `packages/core/src/routing/RouteCacheOutlet.tsx` | React 层：槽位渲染、隐藏层、冻结 location、`inert` |
| `packages/core/src/routing/route-cache.ts` | 纯逻辑：LRU 槽位表、保留策略、默认上限、排除名单 |
| `packages/common/src/hooks/use-route-cache.tsx` | 页面侧 API：`useRouteCacheActive` / `useOnRouteCacheActivated` |

`Layout` 里原来的 `<Outlet />` 已替换为 `<RouteCacheOutlet />`，Web 与 Electron 共用同一份
壳层，因此两端行为一致。

## 语义

- **槽位（slot）按路由 pattern 区分**：`/space-detail/:id` 是一个槽位。所以在两个空间、或同一
  空间的两个页面之间切换时复用同一个槽位（参数变化走 React 更新而不是重挂载），这与 Vue
  `<keep-alive>` 的默认行为一致（按组件缓存，而不是按完整 URL）。
- **LRU 上限**：桌面 5 个槽位、移动端 3 个（`ROUTE_CACHE_MAX_DESKTOP/MOBILE`）。超出时淘汰
  "最久没显示过"的后台槽位并真正卸载它；当前可见的槽位永远不会被淘汰。
- **默认开启**：所有壳层（`Layout`）下的页面路由都参与缓存。路由需要单独关闭时用
  `RouteConfig.keepAlive = false`。
- **永不缓存**（即使没显式关闭）：`*` 兜底里没匹配到的 404 / loading 页；以及
  `/share/:shortCode`（公开分享）、`/collaborate/:token`（一次性邀请）——
  见 `ROUTE_CACHE_EXCLUDED_PATHS`。
- **插件运行时新增的路由**（`LivePluginRoutes` 解析的 `*` 路由）也能缓存：槽位由
  `usePluginRoutes()` 里最长匹配的顶层路由 pattern 决定（`plugin:/ai` 之类）。

## 行为细节

- 后台槽位仍然挂载，但所在层是 `position: absolute; inset: 0` + `visibility: hidden` +
  `opacity: 0` + `pointer-events: none` + `inert` + `aria-hidden`：
  - 用 `visibility` 而不是 `display: none`，是为了保留布局盒子——**内部滚动位置、媒体状态、
    动画进度不会丢**；
  - `inert` 让后台页面退出 Tab 焦点顺序；如果焦点还在后台页面里，切走时会失焦。
- 后台槽位渲染的是**冻结的 element**（离开时路由器给出的最后一个 element），路由上下文
  （params / matches）一起冻结；`useLocation()` 也会返回离开时的 location。因此后台页面
  不会因为当前导航而重新拉数据、也不会把用户跳走。
- 槽位重新可见时，用当前路由的新 element 原地更新同一棵子树（不重挂载），页面里依赖
  `useParams` 等的 effect 会正常重跑。
- 可见状态通过 `RouteCacheActivityProvider` 传给页面：`active=false` 表示"在后台挂载"。

## 页面 / 插件作者须知（重要）

缓存改变了"卸载 = 停止"的假设：**看不见的页面仍然挂载着**。因此：

1. **全局监听器、定时器、标题栏注册要判断是否可见**：

   ```tsx
   import { useRouteCacheActive } from "@kn/common"

   const active = useRouteCacheActive()
   useEffect(() => {
       if (!active) return
       const onKeyDown = (e: KeyboardEvent) => { /* Ctrl+K ... */ }
       document.addEventListener("keydown", onKeyDown)
       return () => document.removeEventListener("keydown", onKeyDown)
   }, [active])
   ```

   否则后台页面会抢占快捷键 / 覆盖移动端顶栏标题。`plugin-main` 的 `SpaceDetail` 已按此
   改造三处：Ctrl+K、移动端 header、无 pageId 时的自动跳转。

2. **只想在回到页面时刷新数据**，用 `useOnRouteCacheActivated`（对应 Vue 的
   `onActivated`；初次挂载不会触发，挂载 effect 已覆盖）。

3. 一次性流程（登录后回调、邀请、公开分享等）建议直接
   `keepAlive: false`，不要依赖后台保活。

## 手动验证

`apps/vite/route-cache-smoke.html` 是一个独立的小路由页（`pnpm app:dev` 后打开
`/route-cache-smoke.html`），用于在浏览器里亲手确认：

1. 在 A 页输入内容 / 点计数器 / 滚动列表 → 切到 B 再回 A：状态、滚动都在，且"挂载次数"仍是 1；
2. 顶部状态条列出所有**仍挂载**的页面，切走的页面标记为"后台"，其 `ticks` 继续增长
   （这也说明未加 `useRouteCacheActive` 的副作用会在后台继续跑）；
3. 可见状态下按 `g` 只有当前页计数变化；后台页不会响应（监听器已按可见性挂载）；
4. 依次打开 6 个页面后，最久未显示的页面被淘汰；回到它时状态是全新的（被淘汰，而不是坏了）。

## 关闭 / 排障

- 单个路由：`RouteConfig.keepAlive = false`。
- 整个应用临时关闭（排查线上问题用，无需重新构建）：

  ```js
  localStorage.setItem("kn:route-cache", "off")
  location.reload()
  ```

  正常开启：`localStorage.removeItem("kn:route-cache")` 后刷新。

- 自动化检查：`pnpm --filter @kn/core check:route-cache`（LRU 保留策略 + 槽位匹配策略）。

## 已知边界

- 后台页面里的 Radix Portal（Dialog / Sheet）会挂到 `document.body`，不在隐藏层里；页面在
  弹窗打开时被程序化导航走，弹窗仍可能可见。导航通常由用户点击触发，出现概率低；遇到时
  在离开前关闭弹窗即可。
- 后台页面的 React 状态更新（Redux、订阅回调）仍会执行——这是保活的代价；上限（5/3）用于
  兜住内存。工作区槽位最重（编辑器 + Y.Doc + WebSocket），只有它一个 pattern，所以最多只有
  一个工作区实例被保活。
- 路由树因插件安装/卸载重建（`App` 重建 router）时，已缓存的槽位可能保留指向旧 router 的
  element（React 复用同一位置的组件）——页面仍然能正常渲染，下一次导航/淘汰会刷新或释放它；
  不依赖旧 router 状态的新页面不受影响。
