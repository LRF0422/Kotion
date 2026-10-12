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
- `src/services/` - 核心服务
- `src/context/` - React Context（如 MobilePageHeaderContext）
- `src/storage/` - 存储服务装配（选择后端并注册 `storage` 服务）+ 旧 localStorage 迁移

**packages/common** - 基础工具，被所有包依赖：
- `src/core/PluginManager.ts` - 插件管理器
- `src/core/editor.ts` - 编辑器类型定义（ExtensionWrapper）
- `src/core/desktop-bridge.ts` - 桌面能力契约（含 `storage.*`）
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

### Local-first 领域数据（Space / Page / Block）

桌面端把 **Space / Page / Block / 页面文档** 也落在同一个 SQLite（schema v2/v3），
渲染端通过 `spacePageService` 端口读写，**端口本身没有变**。
**本地库是唯一权威，云端同步是可选能力（默认关闭）**：

- 本地模式（默认）：读只查本地库（没有就是没有，不发请求），写落本地 + outbox，
  `createPage/createSpace` 也用本地 id；不登录/不联网也能完整使用；
- 云同步开启后：后台 `SyncEngine` 推送 outbox（`claimOutbox` 取件）+ 拉取云端更新，
  断网照常改名/移动/收藏/新建页面；关闭同步不清空 outbox，再次开启时按序补推；
- 开关与门槛：`LocalFirstSyncControl`（核心服务 `localFirst`）+
  `LocalFirstSyncPolicyBridge`（默认「登录 + 付费方案 tier > 0」，即会员门槛；放宽改一行）；
  UI 在**设置 → 工作空间 → 本地数据与同步**。
- 主进程实现 `apps/desktop/src/main/domain/`（能力组 `spacepage.*`，与 `storage.*`
  共用连接与数据库文件）；渲染端装配在
  `packages/core/src/domain/space-page/local-first/`；
- Web 端、或本地库打不开时（第一次 `LOCAL_STORE_UNAVAILABLE` 后整体切换）自动退回纯 HTTP 的
  `createSpacePageService()`，行为与改造前一致；账号/组织切换会清掉本地缓存与队列（数据库是
  每台机器一份，不是每个账号一份）。

要点：**dirty 行不被干净的 upsert 覆盖**（且只在该实体最后一条排队项 ack 后清 dirty）；
**临时 id 换绑是原子的且按主键逐行更新**（行、父子引用、块、文档、outbox payload 与 coalesce key）；
**树完整性看 `pageTree.synced.<spaceId>` 标记而非"有没有行"**；**墓碑 `deleted` 是本地状态**，
拉取不会清除；**outbox 用 `claimOutbox` 取件（pending → inflight）**，推送期间的合并型编辑会另起
一条而不是覆盖在途 payload。

详细语义、离线矩阵、限制与测试见 **[docs/LOCAL_FIRST.md](docs/LOCAL_FIRST.md)**；
改动契约时 `packages/common/src/domain/space-page/local-store.ts`、
`packages/core/src/desktop/space-page-bridge.ts`、
`apps/desktop/src/main/domain/types.ts`、`apps/desktop/src/preload/index.ts` 四处要同步。


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

## Logging

Use the centralized logger from `@kn/common`:
```typescript
import { logger } from '@kn/common';
logger.info('message');
```
