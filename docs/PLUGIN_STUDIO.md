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

`pnpm desktop:dev` → **右侧边栏 → 插件开发台**：

- **新建工程**：输入包名、选一个**工程模板**即可，**不弹目录选择器**，工程建在内置目录里。
- **添加已有目录**：想开发磁盘上已有的工程时才用（这时才需要选目录）。
- 列表自动显示内置目录里的所有工程（包括 **agent 创建的那些**）。
- **开始监听** → 保存文件即自动热更；**构建一次 / 热更到当前窗口 / 停止监听**。
- **删除工程**：确认后先停止监听、卸载仍在窗口里的热更版本，再把工程目录**连同磁盘文件一起删除**（不可恢复，宿主拒绝删除不是插件工程的目录）。内置目录与已添加目录都可删除；只想停止跟踪而不删文件时仍可用「移除」。
- **生成图标**（调色板按钮）：按工程名/用途生成 `assets/icon.svg` 并把栏位图标换成同一字形——和 agent 用的是**同一个确定性生成器**，生成后按钮下方直接显示这张图。
- 侧边栏面板显示当前工程的构建状态与日志。

### 人：工程模板

新建时选择工程从哪个贡献点起步（`dev.scaffold({ template })`）。五个模板**都能直接构建通过**，模板只决定起点，不决定能否工作：

| 模板 | 起点 | 生成后改哪里 |
| --- | --- | --- |
| `panel`（默认） | 侧边停靠面板（`dockPanels`） | `src/DevPanel.tsx` |
| `page` | 整页渲染器（`pageTypes`） | `src/CanvasPage.tsx` |
| `settings` | 宿主设置对话框里的面板（`settings`） | `src/SettingsPanel.tsx` |
| `command` | 编辑器 “/” 斜杠命令（`editorExtension`） | `src/slash-command.ts` |
| `blank` | 能装上的空插件 | `src/index.tsx` 里自己加贡献点 |

模板会写进 `package.json` 的 `knPluginStudio.template`（仅作记录）。未知模板会被拒绝，不会静默退回 `panel`。

> 没有「Tiptap 节点」模板：`@tiptap/core` 不是宿主注入模块，插件自带一份会注册到**另一个 ProseMirror schema 实例**上，编辑器会拒绝。`command` 模板因此只贡献斜杠菜单项（`extendsion: []`）。

### agent：工具驱动

插件向 agent 注册了 24 个工具（顶层 `tools`，见 `PluginManager.resolveAgentCapabilities`）：

| 工具 | 作用 |
| --- | --- |
| `listPluginProjects` | 列出内置目录里的工程（含 pluginKey / 入口 / 是否在监听） |
| `createPluginProject` | 在**内置目录**按模板（`panel`/`page`/`settings`/`command`/`blank`）创建工程，**不需要选目录** |
| `writePluginProjectFile` | 写工程文件（自动建父目录），用于改源码 |
| `readPluginProjectFile` | 读工程文件（带行号；编辑前必须先读，宿主强制） |
| `editPluginProjectFile` | 精确替换（`oldString`→`newString`，唯一性校验；改代码优先用它） |
| `listPluginProjectFiles` | 列出工程内源码文件（跳过 node_modules/dist） |
| `searchPluginProject` | 在工程源码里搜索（返回文件+行号） |
| `runPluginProject` | 开始监听 + 把首个构建热更进当前窗口（**实时预览**入口）；可传 `externals` / `focus` |
| `buildPluginProject` | 一次性构建 + 热更；可传 `externals`（与会话不同时会重启会话）/ `focus` |
| `stopPluginProject` | 停止监听、回收子进程 |
| `deletePluginProject` | 停止监听、卸载窗口里的开发版本、**删除工程目录及磁盘文件**（不可恢复；宿主拒绝非工程目录） |
| `deletePluginProjectFile` | **删除工程里的单个文件**（如遗留的旧组件）。只能删工程内的文件，拒绝 `package.json` 与入口文件；必须先 `readPluginProjectFile` 读过；返回被删正文，误删可粘回 |
| `pluginProjectLogs` | 构建日志，用于排查编译错误 |
| `listPluginServices` | **列出已注册的 service 及其提供者**（core=宿主 / 某个已安装插件）；可按 `owner`、`query` 过滤。开发时"要调用谁的能力"先查它 |
| `listPluginIcons` | **查宿主真实存在的图标名**（`@kn/icon` 里的组件），返回 import + 可直接粘的栏位图标代码，以及按用途关键词的 emoji 建议。栏位图标别凭记忆拼名字 |
| `generatePluginIcon` | **给工程生成图标**：按插件名/关键词选字形配色，离线渲染 SVG 写进 `assets/icon.svg`，把 `knPluginStudio.icon` 指向它，并尽量把源码里那个 emoji 栏位图标换成同一字形 |
| `listHostGlobals` | 列出宿主通过 `window.__KN__` 暴露的全局模块（写 `externals` 前先查它） |
| `listHostApiPackages` | 列出可查阅的标准宿主包与类型入口 |
| `searchHostApi` | 在标准包源码里按名字搜索类型/接口（返回文件+行号） |
| `readHostApiFile` | 读取标准包里的一个源码文件，查看真实接口定义 |
| `installPluginDependencies` | 安装第三方 npm 包（调用 npm/pnpm/yarn 并写入 package.json） |
| `listMyPlugins` | 列出我在市场上的提交/已上架插件（拿 pluginId、审核状态） |
| `publishPluginProject` | 构建并上传产物，然后上架（提交审核）或发布新版本；**图标默认自动上传**（读清单里的 `knPluginStudio.icon`） |
| `upgradePluginVersion` | 把已安装插件升级到市场里的目标版本 |

所以你可以直接说：

> 「给我做一个插件：侧边栏显示当前页面的字数统计。」

agent 会：`createPluginProject({ name, template: 'panel' })` → `writePluginProjectFile` 写 `src/index.tsx` 和面板组件 →
`runPluginProject` 热更 → 你立刻能看到效果 → 不满意就继续说，agent 改完重新 `runPluginProject` / `buildPluginProject` 热更
（开发台面板打开时，保存文件会自动重建并热更）→
`buildPluginProject({ writeToDisk: true })` 出 `dist/index.js`，可直接上传插件市场。
试错用的工程用 `deletePluginProject` 清掉，不会在磁盘上留垃圾。

### 工程约定

```jsonc
// package.json
{
  "name": "my-kn-plugin",
  "knPluginStudio": {
    "pluginKey": "my-kn-plugin",   // 宿主注册表的键
    "entry": "src/index.tsx",      // 可选，默认按 src/index.ts / index.tsx 查找
    "displayName": "My Plugin",    // 可选
    "template": "panel"            // 可选，仅记录脚手架用的模板
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
需要额外的**宿主全局**时用 `externals` 声明（见下）。

## 宿主全局与 `externals`

`externals` 声明「这个 import 名不打进产物，运行时去宿主全局里取」：

- 查找顺序：`window.__KN__[名字]` → `window[名字]`；名字取**包名去掉 scope**（`@scope/pkg` → `pkg`，`@kn/chart` → `chart`）。
- 先调 `listHostGlobals` 看宿主到底暴露了什么。`react`、`react-dom`、`@kn/*` 由宿主**始终注入**，不需要声明。
- 声明了宿主机上没有的模块，`runPluginProject` / `buildPluginProject` **会直接报错**（同一窗口内检测，结论可信），
  而不是产出一个运行时才静默变成 `{}` 的产物。构建器里的兜底路径也会 `console.warn` 出缺失的模块名。
- 第三方 npm 包**不是** `externals`：用 `installPluginDependencies` 装进工程，打包时会被打进产物。

```ts
// 例：宿主把 svelte 暴露成 window.__KN__.svelte
await runPluginProject({ root, externals: ['svelte'] })
```

> 注意：子进程的 externals 在 spawn 时固定，所以语义按「声明的生命周期」定：
> `runPluginProject` / `buildPluginProject` **省略** `externals` 表示沿用该工程上一次的声明（点「监听」也不会把 agent 之前的声明弄丢），
> 传 `[]` 才是清空；`buildPluginProject` 传一个与当前会话不同的列表会**重启该会话**（保持原有监听开关）后生效。

## 产物（artifact）适配

开发台接入了内核的产物体系（`@kn/common` 的 `AgentArtifact` + `agent.toolRenderers` /
`artifactRenderers` / 工具的 `artifactFromResult`），所以「agent 建的插件」在会话里是一件
**可打开、可聚焦的产物**，而不是一段 JSON：

```
工具返回 ──artifactFromResult──▶ AgentArtifact ──┬─▶ 产物架（ArtifactsShelf，按 kind:id 去重）
                                                ├─▶ 会话卡片（toolRenderers，带「预览」按钮）
                                                └─▶ 当前工作目标（agent-pane 侧栏预览）
```

| 产物 kind | 谁产生 | id | 侧栏预览 |
| --- | --- | --- | --- |
| `plugin-build` | `runPluginProject` / `buildPluginProject` / `publishPluginProject` | 工程根目录 | **实时渲染插件贡献的 UI** + 构建信息 |
| `plugin-project` | `createPluginProject` | 工程根目录 | 同上（插件还没热更时显示"尚未运行"） |
| `plugin-icon` | `generatePluginIcon` | 工程根目录 | 生成的图标本身 + 字形/配色/清单指向 + 栏位图标片段 |

### 预览：插件到底做了什么

侧栏的主内容不是构建元数据，而是**把这个插件真正贡献的组件渲染出来**——数据来自
`usePluginState().plugins`（宿主里活的插件实例），所以热更一次就刷新一次：

| 贡献点 | 预览方式 |
| --- | --- |
| `dockPanels[].component` | 放在固定高度的框里**真实挂载**（左右栏都会找） |
| `pageTypes[].renderer`（`type: 'component'`） | 用一份只读的 stub page 挂载；`editor-component` 只能列出来（需要真实页面数据） |
| `settings.component` | 用插件自己的 registry key 挂载 |
| `editorExtensions` | 列出斜杠命令 / 工具栏 / 气泡菜单 / 页脚 / 浮动窗口 |
| `tools` / `skills` / `menus` / `routes` / `desktopOnly` | 列出名字，回答"它到底做了啥" |

三个让它"真"而不是"像"的细节：

- **CSS 作用域对齐**：每个实时组件外面套 `<div data-kn-plugin="<pluginKey>">`，和宿主的 DockHost 用同一个属性——
  否则插件由 dev-server 注入的、按 pluginKey 限定作用域的样式表不会命中，预览会是一堆没样式的裸 DOM。
- **每个组件独立错误边界**：预览的对象**就是**开发中的代码；某个组件抛错只会变成一个红色的坏框，
  不会把会话/侧栏整棵树带崩（侧栏宿主本身并没有包 boundary）。
- **热更即刷新**：`usePluginState` 在每次插件变更时重渲染，所以 agent 改代码 → watcher 重建 →
  开发台热更 → 预览自动换成新组件（面板没打开时不会自动热更，用 `buildPluginProject` 触发）。

关键取舍：

- **id 是工程根目录，不是构建号**：同一个工程反复构建只占产物架里的一格并更新它——
  这才是「这次会话在做的那个插件」；构建号作为 `subtitle`（`#3`）与 payload 存在。
- **失败的构建不产生产物**（没有东西可打开），但会话卡片仍会把编译错误渲染出来。
- **只有"产出东西"的工具才有 mapper**：`list*` / `read*` / `search*` 是检索不是目标，
  映射它们只会把产物架塞满噪音。
- **预览是实时的**：侧栏按 artifact id 去 `dev.status` / `dev.logs` 拉当前会话，并订阅构建事件；
  所以即使模型只调了宿主的 `focusArtifact({ kind: 'plugin-build', id: <root> })`（这种路径**不带 payload**），
  预览照样有内容。预览区在上面（插件做了什么），构建信息在下面（怎么build出来的）。
- **构建成功会自动聚焦**：`runPluginProject` / `buildPluginProject` 成功后把该产物设为当前工作目标，
  右侧立刻能看到它（内核会把目标写进每轮的 `contextNote`）；传 `focus: false` 可以只构建不打扰。
  宿主没挂载侧栏时 `openAgentArtifact` 返回 false，是一次静默 no-op，绝不会让成功的构建变成失败的调用。
- **预览只读**：会拉起/停掉子进程的动作留在「插件开发台」面板里，会话卡片与预览都不会触发它们。

样式注意：卡片与预览渲染在内核会话里（**不在** `[data-kn-plugin="PluginStudio"]` 作用域内），
所以只用宿主已有的 Tailwind 工具类与 `@kn/ui` 组件，跟 `plugin-main` 的 `PageArtifactCard` 一致。

## 探知已安装插件的能力：service

插件之间、插件与宿主之间**唯一正式的互调通道是 service**。所以开发插件时要复用现成能力（文件、上传、页面、AI、桌面能力…），
第一步是知道**有哪些服务、分别由谁提供**——开发台把这件事做成了只读的发现能力：

```
ServiceRegistry（App.tsx 绑定） ──getBoundServiceRegistry()──┬─▶ listPluginServices（agent 工具）
                                                            ├─▶ 侧栏「可调用的服务」：名字 + 提供者（实时）
                                                            └─▶ 插件预览「提供的服务」：该插件对外注册了哪些名字
```

- **agent**：`listPluginServices({ owner?, query? })` 返回 `services`（名字 + 提供者 + 提供者类型）、
  `byPlugin`（插件名 → 它提供的服务名，直接回答「这个插件有什么 service」）、`coreServices`，
  外加 `callPattern` 与契约位置提示。
- **人**：侧栏预览下半部分「可调用的服务」按提供者分组列出全部服务名，插件热更/装卸时自动刷新；
  插件预览里则显示**这个插件对外提供了哪些服务**。
- **调用方式**：非 React 代码 `resolveOptionalService('name')`（可能为空，要判空）/ `resolveService('name')`（不存在即抛）；
  组件里用 `useOptionalService` / `useService`。
- **契约**：每个服务名的 TS 签名在 `@kn/common` 的 `src/core/types.ts` 的 `Services` 接口里——
  用 `searchHostApi({ query: 'Services' })` 定位后 `readHostApiFile` 读。服务名必须在该接口里声明才能带类型使用；
  运行时不校验名字，但 typecheck 与补全依赖它。
- **所有权**：插件不能覆盖宿主或别的插件已注册的服务（`ServiceRegistry` 会拒绝重名注册）。
  自己对外提供服务写在插件 config 的 `services` 字段里。

> 边界要说清：开发台现在**只读地**探知能力（服务名与提供者），**不做注册表管理**——
> 安装/卸载别的插件仍然只能通过插件管理器，`agent.tools` 里没有、也不会有卸载别人插件的工具。

## 图标：两种，别混

插件有两张图标，用途不同、形态不同，**不能互相替代**：

| 图标 | 落在哪 | 形态 | 谁负责 |
| --- | --- | --- | --- |
| 应用里的**栏位图标** | `dockPanels[].icon` / `menus[].icon` | 源码里的 ReactNode | `listPluginIcons` 给出真实存在的图标名 + 可直接粘的代码 |
| 清单/**市场图标** | `package.json` → `knPluginStudio.icon` | 工程内的**图片文件** | `generatePluginIcon` 生成 `assets/icon.svg` |

为什么必须分开：市场列表用 `<img src={resolvePath(icon)}>` 渲染，emoji 字符串会直接变成坏图；
而栏位图标是组件，磁盘上的图片文件在浏览器里拿不到（`assets/icon.svg` 不是可访问的 URL）。

### 生成规则（确定性、离线、可测）

- **字形**：显式 `glyph` → 用途关键词（`chart`→📊、`music`→🎵、`translate`→🌐…约 90 个）→ 插件名里包含的关键词 → 首字符兜底。
- **配色**：显式 `color` → 插件名的稳定哈希 → 9 组调色板。**同一个插件永远得到同一张图**（可 diff、可评审）。
- **产物**：512×512 圆角 + 渐变 + 居中字形的**自包含 SVG**——无外链、无字体文件、无 `<image>`，
  因为市场是通过 `<img>` 加载它的，文档外的东西一个都解析不了。
- **栏位同步**：生成时会顺手把源码里脚手架那个 emoji 栏位图标换成同一字形；
  如果作者已经自己写好了图标（匹配不到那个模式），**绝不改**，只返回片段让人自己粘。
- **零依赖**：不需要网络、不需要 API key、不需要图像编码器（仓库里唯一的 AI 出图在 plugin-ai 内部，
  不是 service，这里刻意不复制它）。

### 从生成到上架

```
generatePluginIcon({ root, keywords: ['chart'] })
  ├─ assets/icon.svg                  ← 自包含 SVG（可在预览里看到）
  ├─ package.json: knPluginStudio.icon = "assets/icon.svg"
  └─ src/index.tsx: 栏位 emoji → 同一字形（或返回片段）
publishPluginProject({ root, version })
  └─ 自动读清单里的 icon 文件 → uploadArtifact(image/svg+xml) → submit({ icon: resourcePath })
```

- 生成结果本身是一件产物（`plugin-icon`，id=工程根目录）：重新生成只更新产物架里的那一格，
  侧栏会直接把图画出来（不传 payload 时按清单回读文件）。
- 已经有设计好的图？把 `knPluginStudio.icon` 直接指向那个文件即可，发布时同样会自动上传；
  已经手工上传过的也可以用 `publishPluginProject({ icon: '<已上传路径>' })` 显式指定。

### 升版也能换图标

图标不是"上架时定死"的：**发布新版本可以换图标**，链路上四段都改了。

| 层 | 改动 |
| --- | --- |
| 后端 | `PluginVersionPublishDTO` 增加 `icon`（可选，≤512，走与上架相同的对象路径校验）；`createVersionInternal` 把**生效图标**记在候选版本上（省略 = 继承插件当前图标）；审批通过时把版本的图标提升到插件（`icon`/`iconMd`/`iconLg`/`iconXl` 四个槽位）——**版本审核通过前市场看到的仍是旧图标** |
| 契约 | `PluginVersionInput` 增加 `icon?`（`@kn/common`） |
| 宿主 UI | "发布新版本"对话框新增图标选择（PNG/JPEG、≤2 MB、正方形、≥120×120），显示"当前 vs 待替换"并可一键恢复；`openPublisher` 的 prefill 会把调用方已上传的图标带进去 |
| 开发台 | `publishPluginProject` 升版模式同样上传并下发图标（清单没有图标就**不带该字段**，绝不凭空造）；面板发布也会先把工程图标上传好再交给向导 |

顺带修掉一个错：`uploadArtifact` 以前把**所有**上传都强制标成 `text/javascript`，
图标（`image/svg+xml`）会被错误标记；现在沿用调用方 Blob 的类型。

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
| `bundler.test.mjs` | 50 | 清单解析、esbuild 打包、宿主模块 shim、注册代码、构建错误上报、**五个模板逐个构建并注册**、**externals 解析（命名空间 / window 兜底 / 缺失告警）** |
| `dev-server.test.mjs` | 10 | NDJSON 协议、文件监听重建、stdin 手动构建、错误隔离、干净退出 |
| `manager.test.mjs` | 30 | **失败重建**立即释放等待、错误上报、会话存活、恢复；防回归「卡 30s」；**删除工程（拒绝非工程 / 拒绝标准目录 / 停止会话并删文件）**；**externals 的沿用与清空语义**；**删单个文件（越界 / manifest / 入口 / 目录 / 不存在全部拒绝，并回显正文）** |
| `host-api.test.mjs` | 14 | 标准包枚举/搜索/读取、越界与未知包拒绝 |
| `project-files.test.mjs` | 10 | 工程文件枚举/搜索/过滤、跳过 node_modules、截断上报 |
| `package-install.test.mjs` | 20 | 包名/版本校验、管理器探测、argv 构造、假 spawn 安装 |
| `tailwind.test.mjs` | 12 | 用宿主配置编译插件工具类、去除 @keyframes、空工程 |
| `studio-tools.test.mjs` | 179 | **agent 工具面**：名称/描述/schema、create→write→run→build→list→stop 的每次能力调用、**模板与 externals 透传和校验**、**删除工程与自卸载**、**删单个文件与「未读不许删」**、**service 发现（提供者归属/过滤/无注册表兜底）**、**产物聚焦（含 focus:false 与坏预览不拖垮构建）**、失败装订、缺能力提示、失败不装旧产物、**只读发现可以、注册表管理不在** |
| `surface.test.mjs` | 31 | **产物声明**：mapper 与工具面一致、kind 与预览一致、构建/发布/工程/图标的 payload、失败不产生产物、id 稳定（同工程重建/重生成只占一格）、`focusArtifact` 无 payload 路径、垃圾输入不抛 |
| `icon-art.test.mjs` | 30 | **图标**：同插件同图、关键词/显式字形/首字母兜底、配色哈希与显式色、SVG 自包含与转义、栏位片段、只改该改的文件（不动手写图标、兼容 legacy `knPlugin` 块）、清单读取与 mime/可上传判断 |
| `studio.smoke.mjs` | 50 | 真实 `PluginManager.installPluginFromSource` + Blob URL + 真实 loader；热更替换、单实例、坏代码不中断、恢复；**内置目录建工程、五个模板都能构建、删除工程、工程内删文件**；**产物管线（mapper 按工具名注册、卡片/预览贡献、产物架从 transcript 派生）**、**把活的插件面板真的渲染成 markup**、**真实 ServiceRegistry 把服务归属到插件** |
| `electron.smoke.mjs` | 36 | 真实 preload 能力白名单、`dev.*` IPC（含 `dev.remove` / `dev.deleteFile`）、`ELECTRON_RUN_AS_NODE` 子进程、`desktop:event:dev` 推送、**无对话框 scaffold + 模板 + list + 读写/删除文件**、越界路径拒绝 |

`pnpm test:plugin-dev` 合计 436 项检查
后端（`backend/knowledgecloud`）：`mvn -o -pl knowledge-service/knowledge-wiki -am -Dtest=PluginApplicationTest test` —— 20 项，覆盖「升版带新图标记在版本上 / 不带则继承 / 审批通过后提升到插件」。
；`pnpm test:plugin-dev:electron` 另有 36 项（需要先构建出 `out/preload/index.js`）。

## 能力清单（`desktop.dev.*`）

| 能力 | 作用 |
| --- | --- |
| `dev.start` | 启动/重启工程会话（子进程 + 监听），返回首个构建 |
| `dev.build` | 一次性构建，等到新构建落地再返回；`externals` 变化会重启会话 |
| `dev.stop` | 停止监听、回收子进程 |
| `dev.status` | 单个或全部会话状态 |
| `dev.logs` | 会话日志尾部 |
| `dev.scaffold` | 按 `template` 写模板工程；**省略 `parentDir` 即用内置目录**，返回 `managed: true` |
| `dev.list` | 枚举工程目录 |
| `dev.readFile` / `dev.writeFile` | 读写工程文件（agent 改源码用） |
| `dev.hostApi` | 只读标准宿主包源码：列出包（无参）/ 搜索（`query`）/ 读文件（`package`+`path`） |
| `dev.files` | 枚举/搜索一个工程的源码文件：列出（无 `query`）/ 搜索（`query`，返回文件+行号） |
| `dev.installDependencies` | 在工程目录里安装第三方 npm 包（自动识别 npm/pnpm/yarn，校验包名） |
| `dev.remove` | 停止会话并**删除工程目录**；拒绝没有可读 `package.json` 的目录与用户标准目录（Documents/Downloads/Desktop/temp/userData） |
| `dev.deleteFile` | **删除工程内的单个文件**（`root` + `path`）：`realpath` 限定在工程内，拒绝 `package.json`、入口文件、目录与不存在的文件；返回被删正文（≤200 KB）供撤销 |

配套宿主服务：`pluginHost.installFromSource()` / `uninstall()` / `subscribe()`
（`packages/core/src/App.tsx` 注册，插件通过 `useOptionalService('pluginHost')` 使用）。
热更与「卸载自己刚热更进去的那个开发版本」是开发台唯一会**改动**注册表的操作：
能力**发现**是只读的（`listPluginServices` + 侧栏服务目录），但
**开发台不安装/卸载别人的插件**——那是插件管理器的职责，
agent 工具面因此没有 `listInstalledPlugins` / `uninstallInstalledPlugin` 这类管理工具。
删除工程仍走同一个路径白名单（内置工程目录位于 `userData`，已添加目录经文件夹对话框授权），
但会**拒绝**不是插件工程的目录，避免「删工程」变成「删用户目录」。

删单个文件（`dev.deleteFile`）比通用的 `fs.remove` **刻意更窄**：`realpath` 之后必须落在工程目录内，
并且拒绝 `package.json`、入口文件和目录。通用删除能力（能删白名单内任意路径，含 `~/Documents`）
**不**通过开发台暴露给 agent——需要它时应该由调用方自己去 `desktop.invoke('fs.remove')`，
而不是让模型拿着它删磁盘。

## 第三方依赖、宿主全局与 Tailwind

- **第三方 npm 包**：用 `installPluginDependencies({ root, packages })`（或设置面板外的手动 `npm install`）装到工程目录。
  打包时第三方包会被打进产物；`react`、`react-dom`、`@kn/*` 仍由宿主注入。插件运行在浏览器环境，
  不能用 Node 内置模块；带原生二进制的包不支持。安装需要网络，并会执行包管理器（可信开发机使用）。
  想让某个库**共享宿主那一份**而不是打进产物，用 `externals`（见「宿主全局与 `externals`」）。
- **Tailwind**：直接在源码里写工具类即可。构建时 dev-server 会用宿主的 `@kn/ui/tailwind.config` 把你的类
  编译成 CSS，并用一个按 pluginKey 命名的 `<style>` 注入到宿主窗口（热更时替换，不会堆叠）。
  无需自己写 `@tailwind` 指令；宿主已注入的 `react`/`@kn/*` 依赖不要重复安装。
- **样式隔离**：插件用的是宿主的 Tailwind 配置，类名与宿主一致；如果把这些全局类规则直接注入，就会在加载时
  覆盖宿主自己的样式。因此编译产物会被限定在 `[data-kn-plugin="<pluginKey>"]` 作用域内，宿主渲染插件的
  侧边面板时会打上对应属性，插件样式只影响自己的 DOM，不会改到宿主。
  （注意：通过 `createPortal` 渲染到 `document.body` 的内容在作用域之外，只能用宿主已有的工具类。）
## 已知边界

1. **主进程代码不能热更**：热更只覆盖窗口内的插件模块；改了 `apps/desktop/src/main/**` 仍需重启。
2. **打包后的 app 需要带上 esbuild**：开发台在 `ELECTRON_RUN_AS_NODE` 子进程里用 esbuild 编译。
   `pnpm desktop:dev` 与本地构建都能解析到它；若要让**已打包**的 app 在终端用户机器上也能编译插件，
   需要在 `electron-builder` 的 `files` / `asarUnpack` 里带上 `esbuild` 及其平台二进制
   （当前 `files` 只含 `out/**`）。开发台在缺少该能力时会给出提示，不会崩。
3. **插件是可信代码**：本地构建产物在宿主窗口内执行，拥有与宿主相同的权限。只在开发机上使用。
4. **文件路径白名单**：`dev.*` 的每个路径都经过与 `fs.*` 相同的 allowlist（标准用户目录 +
   对话框授予的目录）。内置工程目录位于 `userData`，本来就在白名单内。
5. **只读发现 ≠ 注册表管理**：开发台会**读**已安装插件的能力（服务名与提供者、贡献点），
   但只**改**自己构建的产物——热更，以及卸载「自己刚热更进去的那个开发版本」（删除工程时顺带清掉）。
   安装/卸载其他已安装插件属于插件管理器的能力，不通过开发台的工具暴露给 agent。
6. **托管外的东西不猜**：`externals` 只能声明宿主已暴露的全局模块（先 `listHostGlobals`），
   声明错的模块会**在构建前报错**；`@tiptap/core` 不在宿主注入清单里，
   所以没有「自带 Tiptap 节点」的模板——插件自带一份会注册到另一个 ProseMirror schema 实例上。
