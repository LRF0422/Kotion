# 响应式规范（Responsive Guidelines）

本仓库（含所有插件）统一遵循一套**三层设备体系**。新写的页面、组件、编辑器扩展都应按本规范适配，避免各自散写媒体查询。

所有 API 从 `@kn/ui` 导入。

---

## 1. 三层设备（Device Tiers）

| 层级 | 宽度 | 定位 | 框架表现 |
|---|---|---|---|
| `mobile` | `< 768px` | 手机，单手拇指操作 | 底部 Tab 栏 + 顶部 AppBar；编辑器吸附键盘工具栏 |
| `tablet` | `768 – 1023px` | 平板，桌面调性但更紧凑 | 图标侧边栏；侧面板**可折叠** |
| `desktop` | `≥ 1024px` | 桌面，完整多栏 | 图标侧边栏 + 固定侧面板 + 完整工具栏 |

断点与 Tailwind 的 `md`(768) / `lg`(1024) 对齐，定义在
`packages/ui/src/hooks/breakpoints.ts`（**唯一事实来源**，勿在别处硬编码 768/1024）。

---

## 2. 决策原则：先 CSS，后 JS

> 能用 CSS 断点解决的，就不要用 JS 分支。

| 变化类型 | 用什么 | 例子 |
|---|---|---|
| **纯外观**：列数 / 间距 / 字号 / 显隐 | Tailwind `md:` / `lg:` 前缀 | `grid-cols-2 md:grid-cols-3 lg:grid-cols-4` |
| **结构性**：不同组件树 / 不同交互 | `useResponsive()` 或 `<DeviceSwitch>` | 移动用 Sheet 抽屉、桌面用固定侧栏 |
| **设备专属内容**：某层独有的元素 | `<ShowOn>` / `<HideOn>` | 仅移动端显示返回键 |
| **CSS 兜底**（前缀不够用时） | `html[data-device="…"]` 选择器 | `html[data-device="tablet"] .x { … }` |

`<html>` 上的 `data-device` 属性由 `ResponsiveProvider` 自动维护。

---

## 3. API 速查

### `useResponsive()`
```ts
const {
  device,            // 'mobile' | 'tablet' | 'desktop'
  isMobile, isTablet, isDesktop,
  isMobileOrTablet,  // 触屏 / 窄屏
  isTabletOrDesktop, // 有空间放桌面式框架
} = useResponsive()
```
- 首帧即同步读取真实宽度，**无布局闪烁**。
- 全局共享一个 resize 监听（来自 `ResponsiveProvider`）；插件即使没被 Provider 包裹也能用（自带兜底监听）。

> `useIsMobile()` 仍可用，等价于 `useResponsive().isMobile`（仅 `< 768` 为 true）。新代码优先 `useResponsive()`。

### `<DeviceSwitch>` —— 一行替代嵌套三元
```tsx
<DeviceSwitch
  mobile={<BottomSheetNav />}
  desktop={<SidebarNav />}   // tablet 缺省 → 自动回退到 desktop
/>
```
级联回退：`tablet` 缺省回退 `desktop`→`mobile`；`mobile` 缺省回退 `tablet`→`desktop`。

### `<ShowOn>` / `<HideOn>`
```tsx
<ShowOn device="mobile"> <BackButton/> </ShowOn>
<HideOn device={["mobile","tablet"]}> <DenseToolbar/> </HideOn>
```

---

## 4. 硬性约定

- **触摸目标 ≥ 44px**：`mobile`/`tablet` 上的可点元素（按钮、列表项）最小高宽 44px（`h-11`）。
- **安全区**：贴边的固定元素用安全区工具类 —— `pb-safe` / `pt-safe` / `pl-safe` / `pr-safe`，或 Tailwind 间距 `*-safe-top|bottom|left|right`。底部固定栏务必加 `pb-safe`。
- **结构差异用 `<DeviceSwitch>`**，不要写 `isMobile ? (...) : isTablet ? (...) : (...)` 这种嵌套三元。
- **不要硬编码断点数字**，从 `@kn/ui` 引 `BREAKPOINTS` / `useResponsive`。
- **平板≈桌面**：除非有明确理由，平板复用桌面布局，仅把固定侧栏改为**可折叠**（见 `SpaceDetail` 实现）。

---

## 5. 插件适配 Recipe

插件通过 `KPlugin` 注册 `routes` / `menus` / `editorExtension`（见
`packages/common/src/core/PluginManager.ts`）。其中的页面组件和编辑器扩展组件都应按本规范适配。

### Before（散写、无平板、易抖动）
```tsx
import { useIsMobile } from "@kn/ui"

function FileManager() {
  const isMobile = useIsMobile()
  return isMobile
    ? <Sheet>…sidebar…</Sheet>
    : <div className="grid grid-cols-[240px_1fr]">…</div>
}
```

### After（统一 API、含平板、声明式）
```tsx
import { useResponsive, DeviceSwitch } from "@kn/ui"

function FileManager() {
  // 结构性差异 → DeviceSwitch
  return (
    <DeviceSwitch
      mobile={<MobileFileManager />}   // Sheet 抽屉
      tablet={<DesktopFileManager collapsible />}  // 可折叠
      desktop={<DesktopFileManager />}
    />
  )
}

// 纯外观差异 → CSS 前缀，无需 JS
function Gallery() {
  return <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">…</div>
}
```

### 编辑器扩展工具栏
- 桌面/平板：随 `EditorMenu` 显示完整工具栏（默认行为）。
- 移动：高频命令会进入键盘吸附工具栏 `MobileEditorToolbar`（复用扩展的 `menuConfig`）。扩展只要正确声明 `menuConfig` 即可被两端复用，无需自己判断设备。

---

## 6. 参考实现

| 场景 | 文件 |
|---|---|
| 三层 hook / 原语 | `packages/ui/src/hooks/use-responsive.tsx`、`packages/ui/src/components/responsive/` |
| 平板可折叠侧栏 | `packages/plugin-main/src/pages/SpaceDetail/index.tsx` |
| 网格三层 CSS 化 | `packages/plugin-main/src/pages/Home/index.tsx`、`SpaceHub/index.tsx` |
| 移动底部 Tab / AppBar | `packages/core/src/components/mobile/MobileTabBar.tsx`、`packages/core/src/Layout.tsx` |
| 编辑器吸附工具栏 | `packages/editor/src/editor/MobileEditorToolbar.tsx` |
| 安全区 / 键盘 | `packages/ui/src/hooks/use-virtual-keyboard.tsx`、`packages/ui/globals.css` |
