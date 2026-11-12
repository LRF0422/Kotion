# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Knowledge Repo is a monorepo-based knowledge management platform with a plugin architecture. It consists of web, desktop (Electron), and landing page applications sharing core packages.

## Essential Commands

```bash
# Development
pnpm dev                    # Start all apps in dev mode (Turborepo)
pnpm app:dev                # Start main web app only
pnpm desktop:dev            # Start Electron desktop app
pnpm room-server:dev        # Start collaboration WebSocket server (port 1234)

# Building
pnpm build                  # Build all packages
pnpm build:core             # Build specific package (also: build:ui, build:editor, build:ai, etc.)
pnpm desktop:package:win    # Package desktop app for Windows (also: :mac, :linux)

# Code Quality
pnpm lint                   # Lint all packages
pnpm format                 # Format with Prettier

# Utilities
pnpm ui:add [component]     # Add shadcn/ui component
pnpm clean:packages         # Clean all dist directories
```

## Architecture

### Monorepo Structure

- **apps/vite/** - Main React web application (Vite + React 18)
- **apps/desktop/** - Electron desktop app using electron-vite
- **apps/landing-page/** - Next.js marketing site
- **packages/core/** - Application core with plugin system
- **packages/editor/** - Tiptap 3.x rich text editor integration
- **packages/common/** - Shared utilities, types, HTTP client, logger
- **packages/ui/** - shadcn/ui component library
- **packages/room-server/** - Hocuspocus collaboration server

### Package Responsibilities (Important!)

**packages/core** - 核心功能，被所有应用和插件依赖：
- `src/ai/` - AI Agent 系统（工具发现、技能系统、Provider）
- `src/components/` - 核心 UI 组件
  - `Skills/` - AI 技能管理 UI（SkillManager, SkillCard 等）
  - `settings/` - 全局设置对话框（SettingDlg）
  - `MessageBox/` - 消息提示组件
- `src/hooks/` - 核心 React Hooks
- `src/store/` - Redux 状态管理
- `src/services/` - 核心服务（`upload/` 断点续传、`file/` 文件服务）。**服务实现归宿主**：`fileService`、
  `uploadTaskService` 由 core 在 `App.tsx` 的 `coreServices` 注册，插件（含 file-manager）只通过
  `useFileService()` 调用，不要在自己的 `services` 里再注册同名服务（ServiceRegistry 会拒绝）。
  文件选择器弹窗属于插件 UI，内核通过 `@kn/common` 的 `setFileSelectorImpl` 桥调用。
- `src/context/` - React Context（如 MobilePageHeaderContext）
- `src/storage/` - 存储服务装配（选择后端并注册 `storage` 服务）+ 旧 localStorage 迁移

**packages/common** - 基础工具，被所有包依赖：
- `src/core/PluginManager.ts` - 插件管理器
- `src/core/editor.ts` - 编辑器类型定义（ExtensionWrapper）
- `src/core/desktop/` - 桌面能力契约（**按域拆分**：`capabilities.ts` 能力名 / `contract.ts` 参数结果 / 每域一个模块；
  `desktop-bridge.ts` 只是 re-export）。`catalog.ts` 是能力目录（每条能力的摘要/门禁/调用式/示例），
  插件开发台的 `listDesktopCapabilities` / `getDesktopCapability` 读它；加能力必须同步它，
  `pnpm --filter @kn/common check:desktop-capabilities` 会检查 union/preload/主进程 handler/catalog 四方对齐。
  模块划分与能力域对照见 [docs/DESKTOP_CAPABILITIES.md](docs/DESKTOP_CAPABILITIES.md)
  - `ssh.*` 在主进程用 `ssh2` 提供远程执行 / **交互式 pty 终端（流式）** / **SFTP 目录能力** /
    **本地端口转发（`ssh -L`）与 SOCKS5 动态代理（`ssh -D`）**：
    过网络策略 + 每个主机在本次运行内首次需用户确认（开终端、开隧道会单独写明），主机密钥在认证**之前**校验
    （`known_hosts` 含 hash 形式 + TOFU 记住）。**隧道是独立授权类别**：`-L` 按「主机 + 目标地址」、`-D` 按「主机」授权；
    监听端口只绑 `127.0.0.1`，隧道独占一条 SSH 连接（不进连接池），全局最多 8 条、每条最多 64 个并发转发连接，
    保持到插件关闭 / 撤销主机 / 退出应用。**宿主不接收也不保存任何凭证**（认证走 ssh-agent 与默认密钥）。
    只接受密码的机器用 `ssh.credentials*`（明文只进不出，落盘走 safeStorage）；**宿主只提供接口，凭据界面由插件实现**。
    打包时 `ssh2` 由 `scripts/prepare-ssh-deps.cjs` 物化进产物。详见 [docs/SSH.md](docs/SSH.md)。
  - 通用能力组（`apps/desktop/src/main/capabilities/`，**宿主只给原语，不给协议客户端**）：
    `net.socket*` 原始 TCP/TLS 字节流（插件自己实现 IMAP/SMTP 等协议，**没有 `mail.*`**）、
    `shell.*` 系统浏览器 + `127.0.0.1` 回环 OAuth 回调、`storage.secret*` 插件级 safeStorage 加密 KV、
    `notification.*` 系统通知与角标、`background.*` 主进程持有的定时器、
    `http.request` 的二进制响应（`responseType` / `bodyBase64` / `charset`）。
    出网一律走 `net.policy.*`，新目标/新来源首次使用前弹窗确认。
    详见 [docs/DESKTOP_CAPABILITIES.md](docs/DESKTOP_CAPABILITIES.md)，
    自测 `pnpm --filter @kn/desktop test:capabilities:electron`。
- `src/storage/` - 存储契约 + 通用 KV 引擎 + 内存/localStorage 后端
- HTTP 客户端、Logger、工具函数

**packages/plugin-main** - 主应用插件，提供页面路由：
- `src/pages/` - 应用页面（SpaceDetail, PageEditor 等）
- 只放应用级别的页面和路由逻辑
- **不要放核心功能组件**（如设置、AI 技能等应该在 core）

**packages/plugin-ai** - AI 功能插件：
- AI 聊天界面
- AI 文本/图像生成扩展
- **不包含 AI Agent 核心逻辑**（Agent 核心在 core/ai）

### 判断功能放置位置的原则

| 功能特征 | 放置位置 |
|---------|---------|
| 被多个插件使用 | packages/core |
| 全局设置/配置 | packages/core/components/settings |
| 基础 UI 组件 | packages/ui |
| AI Agent 核心逻辑 | packages/core/ai |
| 特定编辑器扩展 | packages/plugin-xxx |
| 应用页面路由 | packages/plugin-main/pages |
| 工具函数/类型 | packages/common |

### 本地存储（重要）

应用与插件都用 **`@kn/common` 的 `StorageService`** 读写本地数据，不要直接写 localStorage：
桌面端由主进程 SQLite 实现（`storage.*` 能力），Web 端回退 localStorage。
用 `useStorage()` / `useStorageScope(namespace)` / `resolveStorage()`；插件命名空间用
`pluginStorageNamespace(pluginKey)`，应用用 `app.<area>`。

详细语义、打包与原生模块 ABI 注意事项见 **[docs/STORAGE.md](docs/STORAGE.md)**。
改动存储契约时，`packages/common/src/storage/storage.check.ts` 与
`apps/desktop/src/main/storage/sqlite-store.check.ts` 的用例要一起更新。


### 路由缓存 / Keep-alive（重要）

壳层（`packages/core/src/Layout.tsx`）用 `<RouteCacheOutlet />` 代替 `<Outlet />`：离开页面时
不卸载页面组件树，回来直接复用（类似 Vue `<keep-alive>`）。槽位按路由 pattern 区分，桌面 5 /
移动端 3 个，LRU 淘汰。

**看不见的页面仍然挂载**，所以页面里 document/window 级监听、定时器、移动端 header 注册必须用
`@kn/common` 的 `useRouteCacheActive()` 判断可见性；"回到页面再刷新"用
`useOnRouteCacheActivated()`。单个路由要退出缓存：`RouteConfig.keepAlive = false`。
完整语义、排障开关与已知边界见 **[docs/ROUTE_CACHE.md](docs/ROUTE_CACHE.md)**；
逻辑自测 `pnpm --filter @kn/core check:route-cache`。

### Plugin System

Plugins extend functionality and are loaded dynamically. Each plugin exports:
```typescript
export const yourPlugin: Plugin = {
  name: 'pluginname',
  extensions: [...],  // Tiptap extensions
  components: [...]   // React components
}
```

Key plugins:
- **plugin-ai/** - AI text/image generation, chat (DeepSeek, Claude)
- **plugin-bitable/** - Multi-dimensional tables (Table, Kanban, Gallery, Gantt)
- **plugin-excalidraw/** - Hand-drawn diagrams
- **plugin-drawio-v2/** - Professional diagrams
- **plugin-mermaid/** - Text-based diagrams
- **plugin-mindmap-canvas/** - Mind mapping

### Global Namespace

The application uses `window.__KN__` for global state scoping.

### Real-time Collaboration

Powered by Hocuspocus (WebSocket-based). Server runs on port 1234 by default.

## Technology Stack

- **Build**: Turborepo, Vite 5, Rollup 4, electron-vite
- **Frontend**: React 18, TypeScript 5, Tailwind CSS 3, shadcn/ui
- **Editor**: Tiptap 3.x (headless rich text editor)
- **State**: React-Redux, React Router 6
- **AI**: Vercel AI SDK with DeepSeek and Anthropic providers
- **Desktop**: Electron with electron-builder

## Environment Variables

Copy `.env.example` to `.env.local`. Key variables:
- `VITE_API_BASE_URL` - Backend API gateway
- `VITE_COLLABORATION_WS_URL` - WebSocket server URL
- `VITE_AI_IMAGE_API_KEY` - AI image generation key

## Package Workspace

Uses pnpm workspaces with `workspace:*` protocol. Shared configs in:
- `packages/eslint-config/` - ESLint rules
- `packages/typescript-config/` - TypeScript settings
- `packages/rollup-config/` - Rollup bundling

## AI Skills System

AI 技能系统位于 `packages/core/src/ai/skills/`，支持：

### 技能来源
- **内置技能** - `skills/built-in/` 预设技能
- **示例技能** - `skills/examples/` 可安装的示例
- **SkillsMP 市场** - `skills/skillsmp/` 集成 skillsmp.com（145,000+ 技能）
- **自定义技能** - 用户创建或从 URL/JSON 导入

### 关键文件
```
packages/core/src/ai/skills/
├── skill-registry.ts      # 技能注册和持久化
├── use-skill-registry.ts  # React Hook
├── skillsmp/              # SkillsMP 市场集成
│   ├── client.ts          # API 客户端
│   ├── types.ts           # 类型定义
│   └── use-skillsmp.ts    # React Hook
└── examples/              # 示例技能
```

### SKILL.md 格式（Anthropic 标准）
```markdown
---
name: skill-name
description: 技能描述
---
# 指令内容...
```

### UI 组件
- `SkillManager` - 技能管理主界面（设置 → AI 技能）
- `SkillsMPMarketplace` - SkillsMP 市场浏览/搜索
- `SkillCard` - 技能卡片展示
- `CreateSkillDialog` - 创建/导入技能对话框

## Responsive / 响应式规范

本仓库使用统一的**三层设备体系**（mobile `<768` / tablet `768–1023` / desktop `≥1024`）。
所有页面、组件、插件都应遵循 **[docs/RESPONSIVE.md](docs/RESPONSIVE.md)**，不要各自散写媒体查询。

核心 API（均从 `@kn/ui` 导入）：
- `useResponsive()` → `{ device, isMobile, isTablet, isDesktop, isMobileOrTablet, isTabletOrDesktop }`
- `<DeviceSwitch mobile tablet desktop />`、`<ShowOn>` / `<HideOn>` —— 声明式、含级联回退
- `useIsMobile()` 仍可用（= `useResponsive().isMobile`，向后兼容）
- 断点常量唯一来源：`packages/ui/src/hooks/breakpoints.ts`（勿硬编码 768/1024）

原则：**纯外观差异用 Tailwind `md:`/`lg:` 前缀；结构性差异才用 `useResponsive`/`<DeviceSwitch>`**。
触摸目标 ≥44px；固定贴边元素用安全区类 `pb-safe`/`pt-safe`/`*-safe-*`。

## 长任务（后台执行）

长工具（构建 / 装依赖 / 发布）可以带 `background: true`：立即返回 `{ taskId }`，活继续在后台跑，
**由 agent 自己决定要不要等**（`getBackgroundTask({ wait: true })`、`listBackgroundTasks`、`cancelBackgroundTask`）；
没人等它时完成结果会作为一条通知推进对话。机制、边界与改法见 **[docs/AGENT_BACKGROUND_TASKS.md](docs/AGENT_BACKGROUND_TASKS.md)**，
自测 `pnpm --filter @kn/common check:background-tasks`。

**任务输出的持续监控**（"构建在打什么日志"）是**独立观测通道**，不要塞进对话/transcript：
桌面宿主用 `dev.logsSince({root, sinceSeq})` 增量读 dev-server 日志（条目带单调 `seq`），
`packages/common/src/ai/tasks/` 的 `TaskMonitorEngine` 负责拉取/规则/合并/持久化，UI 在后台任务面板行内显示实时日志。
引擎的日志源是 `MonitorSource`（`dev:<root>` 构建日志 / `task:<taskId>` 插件长任务），由 `createMonitorReader` 统一路由；
插件任务在任务板打开时自动建监控（上限 8 并发），命中 error 规则会在任务行显示「N 条告警」。
设计、边界与实施状态见 **[docs/AGENT_TASK_MONITORING_DESIGN.md](docs/AGENT_TASK_MONITORING_DESIGN.md)**；
自测 `pnpm --filter @kn/common check:task-monitor`、`node apps/desktop/src/main/plugin-dev/manager.test.mjs`。

**插件通用长任务**是全套工具（不是只给构建日志用）：宿主 `task.*`（9 条能力：状态/进度/增量日志/取消/心跳/结果/清理）
+ `@kn/common` SDK（`runLongTask` / `startLongTask` / `useLongTasks` / `createInMemoryTaskBridge` 测试桥）
+ 后台任务面板的「插件任务」区 + 4 个 agent 工具（`listLongTask` / `getLongTask` / `getLongTaskLogs` / `cancelLongTask`）。
接入方法、限制与最佳实践见 **[docs/LONG_TASKS.md](docs/LONG_TASKS.md)**；
自测 `pnpm --filter @kn/common check:long-tasks`、`node apps/desktop/src/main/capabilities/tasks.test.mjs`。

## 动态表单（agent 向用户要数据）

`askUserChoice` 只能单选；一次要多个字段时用 `requestUserForm` 声明一张表单（8 种字段类型，一次交互收齐）。
需要一次填多条同类记录时传 `batch`（批量）：以表格填写，列 = 字段、行 = 记录，一次提交多条（默认最多 20 行、上限 50 行）。
填写入口是 chat header 的**「填写请求」面板**（跨会话、可在面板里直接填）；等待超时（默认 5 分钟）后表单仍可稍后填写，
答案会作为一条通知回到发起它的会话。契约、边界与实现位置见 **[docs/AGENT_FORM_REQUESTS.md](docs/AGENT_FORM_REQUESTS.md)**，
自测 `pnpm --filter @kn/common check:form-requests`。

## Logging

Use the centralized logger from `@kn/common`:
```typescript
import { logger } from '@kn/common';
logger.info('message');
```
