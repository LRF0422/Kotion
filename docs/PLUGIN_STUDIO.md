# 插件开发台（Plugin Studio）

在桌面客户端里开发、热更、打包插件——**而这个功能本身就是一个插件**。
更重要的是：**agent 可以独立完成"建工程 → 写代码 → 热更预览"，不需要你选目录。**

- 插件包：[`packages/plugin-plugin-studio`](../packages/plugin-plugin-studio)
- 桌面能力层：[`apps/desktop/src/main/plugin-dev`](../apps/desktop/src/main/plugin-dev)
- 能力契约：[`packages/common/src/core/desktop-bridge.ts`](../packages/common/src/core/desktop-bridge.ts)（`DevBridge`）

## 为什么这么做

宿主本来就支持"从 URL 加载 UMD 插件"（`PluginScriptLoader` + `PluginManager.installPlugin`）。
开发台没有另起一套机制，而是把它接到**本地构建产物**上：

```
插件工程 (磁盘)                                      宿主窗口
┌────────────────┐   spawn(ELECTRON_RUN_AS_NODE)   ┌──────────────────────┐
│ src/index.tsx  │ ───────────────────────────────▶│ dev-server.mjs (子进程)│
│ package.json   │                                  │  esbuild + 文件监听    │
└────────────────┘                                  └──────────┬───────────┘
                                                               │ NDJSON(build/code)
                                                    ┌──────────▼───────────┐
                                                    │ DevSessionManager     │
                                                    │  (主进程)             │
                                                    └──────────┬───────────┘
                                        desktop:event:dev      │ dev.*
                                                    ┌──────────▼───────────┐
                                                    │ preload 固定能力白名单 │
                                                    └──────────┬───────────┘
                                          ┌────────────────────┴───────────────────┐
                                          │                                        │
                                 ┌────────▼────────┐                    ┌──────────▼─────────┐
                                 │ 开发台 UI（用户） │                    │ agent 工具（AI）    │
                                 └────────┬────────┘                    └──────────┬─────────┘
                                          └──────────────┬──────────────────────────┘
                                                         │ pluginHost.installFromSource()
                                                  ┌──────▼───────┐
                                                  │ 宿主窗口热更   │
                                                  └──────────────┘
```

关键取舍：

| 决定 | 原因 |
| --- | --- |
| 构建跑在**子进程**，不是渲染进程 | 编译是 CPU 密集的；插件代码写坏了不能把整个知识库应用拖死（实测构建失败 1–2ms 内返回，会话存活） |
| 用 `ELECTRON_RUN_AS_NODE` 复用 Electron 自带的 Node | 用户机器上不需要单独装 Node |
| 产物通过 **Blob URL** 走 `installPluginFromSource()` | 不需要给插件产物找 HTTP 源；且复用与远程插件**完全相同**的激活路径（apiVersion 握手、`KPlugin` 提取、服务注册） |
| 工程默认放在 **`userData/plugin-projects`** | 该目录本来就在 fs 白名单里 → 建工程**不需要目录对话框**，agent 才能全自动完成；同时 esbuild 就在 app 旁边，更容易解析 |
| 开发台是普通插件 | 可卸载、可随市场分发；不往 core 里塞开发工具 |
| 工具层**依赖注入** | `studio-tools.ts` 运行时不依赖 `@kn/common`，测试不需要加载整棵 React 树 |

## 用法

### 人：图形界面

`pnpm desktop:dev` → **设置 → 插件开发台**：

- **新建工程**：输入包名即可，**不弹目录选择器**，工程建在内置目录里。
- **添加已有目录**：想开发磁盘上已有的工程时才用（这时才需要选目录）。
- 列表自动显示内置目录里的所有工程（包括 **agent 创建的那些**）。
- **开始监听** → 保存文件即自动热更；**构建一次 / 热更到当前窗口 / 停止监听**。
- 侧边栏面板显示当前工程的构建状态与日志。

### agent：工具驱动

插件向 agent 注册了 14 个工具（`editorExtension.tools`，见 `PluginManager.resolveTools`）：

| 工具 | 作用 |
| --- | --- |
| `listPluginProjects` | 列出内置目录里的工程（含 pluginKey / 入口 / 是否在监听） |
| `createPluginProject` | 在**内置目录**创建模板工程，**不需要选目录** |
| `writePluginProjectFile` | 写工程文件（自动建父目录），用于改源码 |
| `readPluginProjectFile` | 读工程文件（带行号；编辑前必须先读，宿主强制） |
| `editPluginProjectFile` | 精确替换（`oldString`→`newString`，唯一性校验；改代码优先用它） |
| `listPluginProjectFiles` | 列出工程内源码文件（跳过 node_modules/dist） |
| `searchPluginProject` | 在工程源码里搜索（返回文件+行号） |
| `runPluginProject` | 开始监听 + 把首个构建热更进当前窗口（**实时预览**入口） |
| `buildPluginProject` | 一次性构建 + 热更 |
| `stopPluginProject` | 停止监听、回收子进程 |
| `pluginProjectLogs` | 构建日志，用于排查编译错误 |
| `listHostApiPackages` | 列出可查阅的标准宿主包与类型入口 |
| `searchHostApi` | 在标准包源码里按名字搜索类型/接口（返回文件+行号） |
| `readHostApiFile` | 读取标准包里的一个源码文件，查看真实接口定义 |

所以你可以直接说：

> 「给我做一个插件：侧边栏显示当前页面的字数统计。」

agent 会：`createPluginProject` → `writePluginProjectFile` 写 `src/index.tsx` 和面板组件 →
`runPluginProject` 热更 → 你立刻能看到效果 → 不满意就继续说，agent 改完自动热更 →
`buildPluginProject({ writeToDisk: true })` 出 `dist/index.js`，可直接上传插件市场。

### 工程约定

```jsonc
// package.json
{
  "name": "my-kn-plugin",
  "knPluginStudio": {
    "pluginKey": "my-kn-plugin",   // 宿主注册表的键
    "entry": "src/index.tsx",      // 可选，默认按 src/index.ts / index.tsx 查找
    "displayName": "My Plugin"     // 可选
  }
}
```

```tsx
// src/index.tsx —— 默认导出一个 KPlugin 实例即可
import { KPlugin, PluginConfig } from '@kn/common'
import React from 'react'
import { DevPanel } from './DevPanel'

class MyPlugin extends KPlugin<PluginConfig> {}

export const myPlugin = new MyPlugin({
  name: 'My Plugin',
  status: 'ACTIVE',
  dockPanels: [{ id: 'my-panel', title: 'My', icon: React.createElement('span', null, '🛠'), component: DevPanel }],
})
```

**由宿主注入、不要打包进产物的依赖**：`react`、`react-dom`、`@kn/common`、`@kn/core`、
`@kn/ui`、`@kn/icon`、`@kn/editor`、`@kn/plugin-api`。
需要额外的宿主全局时用 `dev.start({ externals: ['some-lib'] })` 声明。

## 打包分发

开发台的构建产物就是标准插件 UMD 包：

```
dist/index.js   ← 自带 __KN__.definePlugin 注册代码与 apiVersion 2.2.0
```

把它上传到插件市场即可安装（与仓库里其他插件完全同一条链路）。

## 测试

```bash
# 无需 Electron
pnpm test:plugin-dev

# 真实 Electron：preload 白名单 + IPC + 子进程 + 事件推送 + 路径白名单
pnpm test:plugin-dev:electron
```

| 测试 | 数量 | 覆盖 |
| --- | --- | --- |
| `bundler.test.mjs` | 19 | 清单解析、esbuild 打包、宿主模块 shim、注册代码、构建错误上报 |
| `dev-server.test.mjs` | 10 | NDJSON 协议、文件监听重建、stdin 手动构建、错误隔离、干净退出 |
| `studio-tools.test.mjs` | 46 | **agent 工具面**：名称/描述/schema、create→write→run→build→list→stop 的每次能力调用、失败装订、缺能力时的提示 |
| `studio.smoke.mjs` | 25 | 真实 `PluginManager.installPluginFromSource` + Blob URL + 真实 loader；热更替换、单实例、坏代码不中断、恢复；**内置目录建工程并可直接构建** |
| `electron.smoke.mjs` | 25 | 真实 preload 能力白名单、`dev.*` IPC、`ELECTRON_RUN_AS_NODE` 子进程、`desktop:event:dev` 推送、**无对话框 scaffold + list + 读写文件**、越界路径拒绝 |

合计 125 项检查。

## 能力清单（`desktop.dev.*`）

| 能力 | 作用 |
| --- | --- |
| `dev.start` | 启动/重启工程会话（子进程 + 监听），返回首个构建 |
| `dev.build` | 一次性构建，等到新构建落地再返回 |
| `dev.stop` | 停止监听、回收子进程 |
| `dev.status` | 单个或全部会话状态 |
| `dev.logs` | 会话日志尾部 |
| `dev.scaffold` | 写模板工程；**省略 `parentDir` 即用内置目录**，返回 `managed: true` |
| `dev.list` | 枚举工程目录 |
| `dev.readFile` / `dev.writeFile` | 读写工程文件（agent 改源码用） |
| `dev.hostApi` | 只读标准宿主包源码：列出包（无参）/ 搜索（`query`）/ 读文件（`package`+`path`） |
| `dev.files` | 枚举/搜索一个工程的源码文件：列出（无 `query`）/ 搜索（`query`，返回文件+行号） |

配套宿主服务：`pluginHost.installFromSource()` / `uninstall()` / `subscribe()`
（`packages/core/src/App.tsx` 注册，插件通过 `useOptionalService('pluginHost')` 使用）。

## 已知边界

1. **主进程代码不能热更**：热更只覆盖窗口内的插件模块；改了 `apps/desktop/src/main/**` 仍需重启。
2. **打包后的 app 需要带上 esbuild**：开发台在 `ELECTRON_RUN_AS_NODE` 子进程里用 esbuild 编译。
   `pnpm desktop:dev` 与本地构建都能解析到它；若要让**已打包**的 app 在终端用户机器上也能编译插件，
   需要在 `electron-builder` 的 `files` / `asarUnpack` 里带上 `esbuild` 及其平台二进制
   （当前 `files` 只含 `out/**`）。开发台在缺少该能力时会给出提示，不会崩。
3. **插件是可信代码**：本地构建产物在宿主窗口内执行，拥有与宿主相同的权限。只在开发机上使用。
4. **文件路径白名单**：`dev.*` 的每个路径都经过与 `fs.*` 相同的 allowlist（标准用户目录 +
   对话框授予的目录）。内置工程目录位于 `userData`，本来就在白名单内。
5. **agent 工具需要打开的编辑器**：插件的工具是通过 `editorExtension.tools` 贡献的
   （`PluginManager.resolveTools(editor)` 需要有编辑器实例），与仓库里其他插件工具同一机制。
