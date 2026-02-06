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

**packages/common** - 基础工具，被所有包依赖：
- `src/core/PluginManager.ts` - 插件管理器
- `src/core/editor.ts` - 编辑器类型定义（ExtensionWrapper）
- HTTP 客户端、Logger、工具函数

**packages/plugin-main** - 主应用插件，提供页面路由：
- `src/pages/` - 应用页面（SpaceDetail, PageViewer 等）
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

## Logging

Use the centralized logger from `@kn/common`:
```typescript
import { logger } from '@kn/common';
logger.info('message');
```
