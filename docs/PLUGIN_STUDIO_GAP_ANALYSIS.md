# Plugin Studio 全面审查 &「完整插件开发能力」差距分析

> 审查对象：`packages/plugin-plugin-studio`（开发台本体）、`apps/desktop/src/main/plugin-dev`（桌面能力层）、
> 宿主运行时（`packages/common/src/core/PluginManager.ts`、`plugin-dev-host.ts`、`packages/core/src/App.tsx`）、
> 市场契约与后端（`packages/common/src/core/plugin-marketplace.ts`、`backend/knowledgecloud`）。
> 设计意图与已声明边界以 [PLUGIN_STUDIO.md](./PLUGIN_STUDIO.md) 为准；本文只报**它没说的**或**说的与代码不符**的。
>
> 结论先行：这套「开发台本身就是一个插件」的架构是成立的，纵深一条链（脚手架→写码→构建→热更→预览→发布）
> 是真的打通了、也真的有回归测试。但它现在覆盖的是**最窄的一条路径**：
> 「agent 主导 · TS/React 面板级 UI 插件 · 桌面 Electron · 在线市场分发」。
> 要称得上「完整的插件开发能力」，缺的不是更多工具，而是四类**平台能力**：反馈闭环、契约广度、安全治理、平台覆盖。

---

## 1. 验证方法与结果（可复现）

| 命令 | 结果 |
| --- | --- |
| `pnpm test:plugin-dev` | **通过**（12 个 suite；本轮修复后 bundler 由 50 → **54** 项，合计 511） |
| `node packages/plugin-plugin-studio/src/icons/icon-ai.test.mjs` | 14/14 通过 —— **但没有被 root 的 `test:plugin-dev` 聚合**（见 §5.1） |
| `pnpm --filter @kn/common check:plugin-hot-swap` | 145 → **148** 项通过（新增 JSX 运行时的接线断言，见 A0） |
| `pnpm --filter @kn/plugin-plugin-studio typecheck` | 干净通过（`tsc --noEmit`） |
| `pnpm --filter @kn/core build` | 通过（`rollup-plugin-typescript2` + `declaration: true`，即 App.tsx 的改动是类型正确的） |
| 代码卫生 | `plugin-studio/src` 与 `plugin-dev/*.mjs` 内 **0 个 TODO/FIXME** |
| `pnpm test:plugin-dev:electron` | 未执行（需先构建 `out/preload/index.js`；本轮为静态审查 + Node 层验证） |

> 文档漂移：PLUGIN_STUDIO.md 第 597 行写「合计 486 项」、第 591 行写 `studio-tools.test.mjs` 182 项，
> 实际更多（studio-tools 203）；测试表里也漏了 `icon-ai.test.mjs`（14 项）。数字本身不影响结论，但说明文档没有跟着代码走。
>
> **本轮已修 A0**（`react/jsx-runtime`，见 §5.2）：改动 4 个文件 + 2 处回归测试，全部验证通过。
> 其余缺口尚未改动代码。

**做法**：除自己逐行读的关键路径外，另开了 4 路互不重叠的只读深挖
（studio 运行时与工具面 / 人类 UI 与产物·图标·技能 / 桌面能力层 / 宿主运行时与市场后端），
每条结论都要求给出 `file:line`；§5.2 的第一条（`react/jsx-runtime`）是**在本机用真实 bundler 实测复现**的（含最小复现），
其余是逐行读出的代码缺陷。未能验证的点（真实打包应用、Linux 行为、`import.meta.env` 在 iife 下的表现）都标了「未实测」；
四路深挖之间出现的矛盾结论（例如「dock 面板没有错误边界」）已回到代码逐条核实并更正（见 B15）。

---

## 2. 现状能力矩阵

### 2.1 Agent 工具面（24 个，`studio-tools.ts`）

与文档第 88–115 行**逐个核对一致**，数量与名字都对得上：

| 分组 | 工具（行号） |
| --- | --- |
| 工程 CRUD | `listPluginProjects`:803 · `createPluginProject`:829 · `deletePluginProject`:1584 · `deletePluginProjectFile`:1632 |
| 源码读写 | `writePluginProjectFile`:893 · `readPluginProjectFile`:913 · `editPluginProjectFile`:947 · `listPluginProjectFiles`:1001 · `searchPluginProject`:1027 |
| 构建/运行 | `runPluginProject`:1330 · `buildPluginProject`:1455 · `stopPluginProject`:1667 · `pluginProjectLogs`:1696 |
| 依赖 | `installPluginDependencies`:1058 |
| 能力发现 | `listHostGlobals`:1720 · `listPluginServices`:1751 · `listPluginIcons`:1830 · `generatePluginIcon`:1877 · `listHostApiPackages`:1960 · `searchHostApi`:1981 · `readHostApiFile`:2006 |
| 市场 | `listMyPlugins`:1122 · `publishPluginProject`:1133 · `upgradePluginVersion`:1314 |

设计上确有两个值得肯定的硬约束：**读后写**（`observedFiles` 守卫，`studio-tools.ts:648-651`，没读过不能 `edit`/`delete`）
与**失败即零副作用**（拒绝发生在 commit 前，工具返回 `reloadRejected` + 原文）。

但工具面还有三处**文档与语义不符 / 结构性缺失**（逐行核对结论）：

- **参数不做 schema 校验**：24 个工具**没有一个**在运行时用 `inputSchema` 校验入参，检查全靠 `execute` 里的临时判断或下沉给宿主。
  模型传错形状的入参时，得到的不是「参数非法」而是一句宿主侧的偶发错误。
- `listPluginProjects` 的 `active` 是「有会话」而非「正在监听」（`manager.mjs:771`、`studio-tools.ts:721`）：
  一次 `watch:false` 的构建会让工程显示为 active；文档第 92 行写的是「是否在监听」。
- 文档第 92 行承诺返回「入口」，但 `entry` 只有在清单**显式声明** `knPluginStudio.entry` 时才有值（`manager.mjs:761-762`），
  默认 `src/index.tsx` 的工程拿到的 `entry` 是 `null`（对比 `bundler.mjs:279-303` 的 `findEntry` 是会推断的）。

### 2.2 人类 UI（`StudioPage.tsx`）

能做的：新建（5 个模板）/添加已有目录/移除/删除工程、开始-停止监听、构建一次、热更到窗口、卸载窗口内开发版、
生成图标（确定性 + AI 流式两套）、浏览工程文件（**只读**）、发布/升版向导（打开宿主的发布向导）。

三个结构性事实：

1. **文件是只读查看器**：`StudioPage.tsx:1288-1291` 走 `renderFileLines()`（另有 `MAX_VIEW_LINES=2000` 的硬上限，`StudioPage.tsx:125`），
   没有任何编辑器 —— 人类开发者必须离开应用去外部 IDE，应用内的「人在环」只到**监工**为止。
2. **GUI 完全没有 `externals` / 依赖安装**：`grep installPluginDependencies|externals StudioPage.tsx` 为空。
   也就是说「声明宿主全局」和「装第三方包」这两个把插件从玩具做成产品的动作**只有 agent 能做**。
3. 人类看不到插件**运行期**的任何输出，只有 `dev.logs`（构建/监听日志）。

另外，人类 UI 的能力面整体比 agent 工具面**窄一截**（不是缺口设计，而是没实现）：

| 只有 agent 能做 | 证据 |
| --- | --- |
| 产出 `dist/index.js`（`writeToDisk`） | 渲染层从不传 `writeToDisk`（`StudioPage.tsx:551-564`、`StudioMarketplacePanel.tsx:28`），只有工具面暴露（`studio-tools.ts:1465,1512`） |
| 在工程内搜索 | GUI 调 `dev.files` 时不带 `query`（`StudioPage.tsx:369`）尽管能力支持搜索（`project-files.mjs:63`）；`searchPluginProject` 只在工具面（`studio-tools.ts:1027`） |
| 删单个文件 | `deletePluginProjectFile` 只在工具面（`studio-tools.ts:1632`），UI 无入口 |
| 配置 secrets / env | 宿主已有 `usePluginConfig({ secretFields })`（`packages/common/src/hooks/use-plugin-config.ts:54`、`docs/PLUGIN_CONFIG_SECRETS.md`），但开发台**无论 UI 还是 skill 都没提过它** |
| 声明 externals 的具体取值 | 只在工具入参里（`studio-tools.ts:1465` 等） |

### 2.3 桌面能力层（`desktop.dev.*`，14 个）

`preload/index.ts:71-89` 白名单 + `plugin-dev/index.ts:96-214` 处理函数，与文档 §能力清单一致：
`start/stop/build/status/logs/scaffold/list/readFile/writeFile/hostApi/files/installDependencies/remove/deleteFile`。

实现质量上，打包链路是这套代码里最扎实的部分：`prepare-studio-deps.cjs` 按目标平台（darwin/win32/linux × x64/arm64/ia32/universal，
`ESBUILD_PLATFORM_PACKAGES` :54-67）物化 esbuild 二进制与 tailwind，并用 `packaged-studio-deps.test.mjs`（23 项）
在「没有源码树」的前提下验证子进程真能编译。这不是本文的缺口重点。

### 2.4 宿主运行时

贡献点共 **16** 个（`PluginManager.ts:83-142`）：
`name/status/routes/globalRoutes/menus/editorExtension/locales/services/settings/tours/dockPanels/pageTypes/tools/skills/agent/desktopOnly`。
身份只有 `pluginKey`、只有 `_commit()` 改注册表、`KPlugin.mapComponents()` 一次认领组件身份、
热更用 `HotComponentBoundary` 保状态 —— 这几条在 `plugin-hot-swap.check.ts`（145 项）里逐条断言，是真能力，不是文档话术。

但「贡献点清单」与「实际被渲染/被强制的东西」并不一一对应，逐点核对后有 **4 处是声明了但没接上的**：
`globalRoutes`（无 getter、`resolveRoutes` 只读 `routes`）、`agent.actions`（只有类型与 resolver，无渲染方）、
`agent.context`（deny-all 且 App 明确 `setAgentContextWhitelist([])`，恒不生效）、`status`（**必填**却从不被读取）；
`desktopOnly` 则只被展示、不做门禁（见 B13）。
另外宿主**没有任何生命周期钩子**（无 `activate`/`deactivate`/`dispose`，`uninstallPlugin` 不回调插件实例），
以及**一个插件的初始化失败会让应用启动直接失败**（`Layout.tsx:242-244`，且只报名字不报原因，见 B14/B15）。
（贡献点组件自身的错误隔离是有的：`HotComponentBoundary` 随组件走，见 B15 更正。）

宿主侧 dev 绑定 `plugin-dev-host.ts`（302 行）：订阅 `desktop:event:dev`，按 `buildCount@updatedAt` 去重，
每工程一条串行队列，**与页面是否打开无关**。这是「关掉开发台也继续热更」的实现，也是把开发循环从 UI 里搬进宿主的关键一步。

### 2.5 市场/后端

`PluginMarketplaceService`（`plugin-marketplace.ts`）已覆盖 `listMine/listInstalled/uploadArtifact/submit/resubmit/publishVersion/upgrade`，
含 `integrity`（SRI）、`permissions`、`icon`。后端按 `PLUGIN_REVIEW_ROADMAP.md` 已落地 P0/P1：
批量审核、结构化驳回原因、审核通知（站内信）、SLA 认领、能力声明、启发式安全扫描、沙箱预览、下架/召回、举报与评分。

---

## 3. 要做到「完整插件开发能力」还缺什么

按「谁来做」分四组。**P0 = 不做就写不出/查不出真插件；P1 = 规模化必需；P2 = 生态成熟度**。

### A. 开发台自身（Studio）——缺的是「反馈闭环」

| # | 缺口 | 现状证据 | 影响 | 优先级 |
| --- | --- | --- | --- | --- |
| A0 | ~~**`react/jsx-runtime` 外部化错误 → 第三方 React 库必炸**~~ **✅ 已修** | 原：`bundler.mjs:46-47` 把 `react/jsx-runtime` 映射到 `React` 全局，而 React 18 的 `React.jsx` 是 `undefined`。现：宿主把真实的 `react/jsx-runtime` / `react/jsx-dev-runtime` 发布到 `__KN__.jsxRuntime` / `__KN__.jsxDevRuntime`（`global-namespace.ts`、`App.tsx`），bundler 映射到它们（`bundler.mjs:51-52`） | 已解除；回归用例见 `bundler.test.mjs`（54 项）与 `plugin-hot-swap.check.ts`（148 项） | 已修 |
| A1 | **没有静态校验（tsc / lint）** | `plugin-dev/*.mjs`、`plugin-plugin-studio/src` 里 grep `tsc/typescript/eslint` 无任何调用；esbuild 只转译不做类型检查（`bundler.mjs:687-751`） | agent 写错 API 名、传错 props、漏字段，**只有运行到那行才炸**；作者拿不到「你的代码不合法」这句话。这是当前最大的一块空白 | **P0** |
| A2 | **没有 source map** | `bundler.mjs:748` `sourcemap: false`；只有 `:803` 的 `//# sourceURL=kn-plugin://…` 让 DevTools 里能认出这个 bundle | 运行期报错的栈指向 bundle 行号；插件越大越没法定位。**注意不是「打开开关」就行**：构建后还会做一次文本改写（`__require*` → `__knRequire`、解开 `__toESM`，`bundler.mjs:776-786`），会作废 map —— 必须把这一步挪进 esbuild 插件（`onEnd`）或同步重写 map | **P0** |
| A3 | **没有运行期日志/错误采集** | `dev.logs` 全部来自 dev-server 的 NDJSON 构建事件；宿主只对**路由**包了 `PluginErrorBoundary`（`App.tsx:54-57`、`LivePluginRoutes.tsx`），其余贡献点靠 `HotComponentBoundary`（`plugin-hot-component.tsx:191-212`）兜渲染异常 | 「热更成功但面板是空的 / 点了按钮报错」这类问题：**人**可以靠应用菜单的「打开开发者工具」（`AppMenuButton.tsx:176` → `window.toggleDevTools`）自己看 console，**agent 完全看不到**，只能猜。开发台应把插件的 console.error/未捕获异常收成一条时间线，喂给 `pluginProjectLogs` | **P0** |
| A4 | **没有插件工程的测试能力** | 14 个 `dev.*` 里没有任何「在工程里执行脚本」的原语（`plugin-dev/index.ts:96-227` 唯一能 spawn 的只有 dev-server）；无 test runner、无脚手架测试模板 | 插件是可信代码但没有任何让作者自证的方式；回归只能靠人肉点。**A1/A2…里凡是「跑个工具」的需求都卡在同一个原语上**：补一个受限的 `dev.runScript`（固定白名单：`tsc` / `vitest` / `eslint`，无 shell）可以一次解锁类型检查、测试、lint 三件事 | P1 |
| A5 | **人类不能写代码** | `StudioPage.tsx:1288` 只读；写入只存在于 agent 工具的 `writePluginProjectFile` | 人类真实工作流被切成「应用里看 + IDE 里改 + 应用里看」；`writePluginProjectFile` 已经存在，缺的只是一个编辑器 UI + 保存即重建（watcher 已支持） | P1 |
| A6 | **GUI 无法声明 `externals` / 装依赖** | §2.2 证据 | 共享宿主已有库（体积/单例）与引入第三方库，人只能绕道 agent | P1 |
| A7 | **没有插件级调试入口**（宿主本身有 DevTools） | 宿主有 `window.toggleDevTools`（`main/ipc.ts:602-607`，应用菜单入口 `AppMenuButton.tsx:176`），所以 console 不是完全没有；缺的是**面向正在开发的这个插件**的入口（按 pluginKey 过滤/归集）与 source map 支撑 | 配合 A2 做即可；单独做价值不大 | P2 |
| A8 | **没有 undo / 版本历史 / git** | 唯一回滚手段是 `deletePluginProjectFile` 返回被删正文、`edit` 返回旧串（`studio-tools.ts`）；无 git 集成 | agent 一次大改后无法回退到「刚才那个能跑的版本」；建议至少每次成功构建打一份 `dist/.dev-history` 或 git stash 式快照 | P2 |
| A9 | **模板只覆盖 5 个贡献点** | `SCAFFOLD_TEMPLATES = ['panel','page','settings','command','blank']`（`bundler.mjs:257`） | 缺 editor 节点、dock 面板之外的 tours/locales/services/agent-tools/artifact-renderer 模板；且没有「模板目录可扩展」的机制（模板硬编码在 `bundler.mjs` 里的字符串） | P2 |
| A10 | **无离线分发** | 发布只有「上传到市场」一条路（`publishPluginProject`） | 内网/私有分发缺 `打包成 .knp/.zip` + 本地导入安装；企业场景常是第一需求 | P2 |
| A11 | **脚手架产物不是一个能独立开发的 TS 工程** | `renderScaffold` 只写 `package.json`（`bundler.mjs:419-430`：无 `scripts`、无 `devDependencies`、无 `tsconfig.json`、无 `.gitignore`）+ `src/*` + `README.md`；`@kn/*` 只写成 `peerDependencies`，磁盘上从未真正安装 | 把工程拿回 IDE：`import { KPlugin } from '@kn/common'` **解析不到**，全程飘红、没有补全；工程内也无法跑 `tsc` / 任何脚本。这既是 A1 的根因之一，也让「离开开发台就用不了」 | **P0** |
| A12 | **打包版里 `dev.hostApi`（`searchHostApi` / `readHostApiFile`）是死的**（已定位，见 §5.2） | `prepare-studio-deps.cjs:328` 把标准包源码物化到 `Resources/kn-studio-runtime/host-api/packages/…`，但 `workspaceRootCandidates()`（`plugin-dev/index.ts:63-75`）从不包含 `process.resourcesPath`；打包应用里 cwd 为 `/` ⇒ `resolveWorkspaceRoot` 返回 undefined ⇒ `dev.hostApi` 抛「not available in this build」 | 「让 agent 查真实接口」这条能力在**正式安装的客户端里整条失效**（而 ~1MB 源码照旧随包发出）；`packaged-studio-deps.test.mjs:159-161` 只断言文件存在、从不解析 root，所以没被发现 | **P0** |
| A13 | **无构建期 env / secrets / define** | 子进程继承整个宿主环境（`manager.mjs:342-348`），但 esbuild 配置没有 `define`、没有 `.env` 支持、没有 per-project env（`bundler.mjs:730-753`） | 插件既**拿不到**自己的配置（API key、baseURL），又**白白继承**宿主所有环境变量；「插件要连第三方服务」目前只能写死在源码里再人工改 | P1 |
| A14 | **没有增量构建、没有资源上限** | 每次改动都是完整 `esbuild.build()`（无 `context()`/incremental，`bundler.mjs:35-39,730-753`）；每次构建都整体重编 Tailwind（重新遍历整个工程，`tailwind.mjs:77-85`、`bundler.mjs:763`）；无会话数/包体/`readFile`/`writeFile` 上限 | 大工程热更延迟随规模线性增长；一次超大构建还会把整份 bundle 广播给**所有窗口**（`plugin-dev/index.ts:85-89`） | P2 |
| A15 | **没有静态资源管线**（图片/字体）；而工程文件浏览器也看不到它们 | bundler 只配了 `loader: { '.jsx': 'jsx' }`（`bundler.mjs:746`），且假定单产物（`outputFiles[0]`，:755）；我实测 `import logo from './logo.svg'` 直接构建失败：`No loader is configured for ".svg" files`；`import './theme.css'` 也失败：`Cannot import "src/theme.css" into a JavaScript file without an output path configured`（CSS 只走「扫源码类名生成 Tailwind 工具类」这一条路，`tailwind.mjs`）。同时 `project-files.mjs:14` 的扩展名白名单不含 `.svg/.png/.woff` | 插件**不能带自己的图片/字体/自写 CSS/第三方 CSS**；连开发台自己生成的 `assets/icon.svg` 在「文件」页签里都看不见。发布也只能上传「一个 JS + 一个图标」（`studio-tools.ts:1208-1211,1281-1287`） | P1 |
| A16 | **一个工程只能一个入口、一个插件** | `bundler.mjs:666-700` 单 entry；`listProjects` 只扫一层目录（`manager.mjs:740-748`） | 「一个仓库多个插件」「插件 + 共享包」这类真实工程结构无法表达；只能一个插件一个目录 | P2 |
| A17 | **模板的真相散在 6+ 处** | `SCAFFOLD_TEMPLATES`（`bundler.mjs:257`）、`studio-tools.ts:540`、`StudioPage.tsx:86`、`TEMPLATE_NOTES`、两处 locales（`index.tsx:243-256,465-478`）、skill 文案（`plugin-authoring.ts:50`） | 加一个模板要改 6 个地方，漏一处就是「工具说支持、UI 不显示」这类不一致；模板不可由插件作者扩展 | P2 |
| A18 | **日志保真度不足** | 子进程 stderr 一律被标成 `error` 级别（`manager.mjs:388`），warnings 从不进入工具结果；`pluginProjectLogs` 抹掉时间戳、且对 400 条环形缓冲的截断不做任何提示（`studio-tools.ts:1709-1712`、`manager.mjs:133,207`） | 排查时看不到「这是警告还是错误」「这是什么时候发生的」「日志是不是被截了」 | P2 |
| A19 | **预览的保真度与自愈能力有限** | 只挂载 `dockPanels` / `pageTypes(component)` / `settings`；`editor-component`、`editorExtensions`、`tools`、`skills`、`services`、`menus`、`routes` 只列名字（`PluginUiPreview.tsx:192-291`）。**崩溃边界不会重置**：`PreviewBoundary` 只置 `failed=true`，key 又是贡献点 id（`:49-70,176-248`），所以**修好代码重建后红框还在**，除非重开侧栏。预览组件拿不到 `editor`/真实 `spaceId`/`pageId`（`:184,225-232`），需要真实页面数据的插件会抛错或退化。`globalRoutes`/`tours`/`locales`/agent 渲染器**既不挂载也不计数**（`:142-166` vs `PluginManager.ts:83-142`） | 开发者看到「它没渲染 / 它崩了」时无法区分是插件的问题还是预览的问题；且预览与真实运行环境的 props 不同，属于「看起来能跑」的假阳性来源 | P1 |

### B. 宿主（common / core / desktop）——缺的是「契约广度」

| # | 缺口 | 现状证据 | 影响 | 优先级 |
| --- | --- | --- | --- | --- |
| B1 | **`@tiptap/core` 不是宿主模块，编辑器节点类插件只能拿到第二份 ProseMirror** | `bundler.mjs:42-53` `DEFAULT_HOST_MODULES` 无 tiptap；`:252` 注释明确「deliberately no editor node template」；skill 第 145 行也只提 `editorExtension` 的菜单位。**但宿主其实已经发布了这一份**：`window.__KN__.editor` 就是 `@kn/editor` 命名空间（`global-namespace.ts:105`、`App.tsx:16`），而 `packages/editor/src/editor/index.tsx:10` 正是 `export * from "@tiptap/core"` —— 仓库内 **39 个文件 import `@kn/editor`、0 个 import `@tiptap/core`** | 编辑器扩展是这个知识库应用**最核心**的插件类型（块、节点、mark、装饰），却被挡在开发台之外。修法极便宜：给 `DEFAULT_HOST_MODULES` 加 `'@tiptap/core': '__KN__.editor'`（顺带 `@tiptap/pm/*`、`@tiptap/react`、`@tiptap/suggestion`），shim 机制已支持命名导出解构，宿主侧无需其他改动。<br>**同时要修正文档的一处未经证实的说法**：「编辑器会拒绝注册到别的 schema 实例的节点」在宿主里**找不到任何拒绝路径**（`kit.tsx:24-35` 直接展开 `extendsion`；tiptap 的 schema 构建是鸭子类型，不做 `instanceof`/schema 身份校验）。真实故障模式是**两份 ProseMirror 模块副本**（跨副本的 `Node`/`PluginKey`/`ReactNodeViewRenderer` 类不相等），不是一句明确的拒绝 | **P0** |
| B2 | **可复用的 service 只有 10 个** | `types.ts:302-343`：`fileService/uploadTaskService/aiFoundation/spacePageService/desktop/pluginHost/pluginDevHost/pluginManagement/pluginMarketplace/storage` | 插件要弹通知、跳路由、读写当前页面、拿当前用户/主题、发 HTTP，都得自己造。文档说「service 是唯一正式互调通道」——那么通道的**供给面**就是这个平台的能力上限 | **P0** |
| B3 | **service 名字运行时不校验、无契约版本** | 插件 skill 第 112/1819 行自述「运行时不校验名字，typecheck 与补全依赖它」 | 插件升级/宿主升级导致 service 语义漂移时没有检测点；也没有「插件声明我依赖 service X」的机制，装上去才发现取不到 | P1 |
| B4 | **没有 activation events / 懒加载** | `PluginManager` 只有 eager `_activate`（`:1429`、`:1536`、`:1557`）；无 `onCommand`/`onView` 式激活 | 每个插件在启动时全部求值；重插件拖慢启动，且无法做「装了但先不跑」 | P1 |
| B5 | **没有插件间依赖声明与加载顺序** | `PluginConfig`（`PluginManager.ts:83-142`）无 `dependencies`；grep `dependencies` 在 PluginManager 中无命中 | 「A 插件依赖 B 插件提供的 service」只能靠运行时判空，装错顺序就静默降级 | P1 |
| B6 | **apiVersion 只比 major，且缺失即放行** | `PluginManager.ts:963-988`：`pluginMajor !== hostMajor` 才拒绝；`!apiVersion` 只 warn 后**照常加载** | 老 bundle 可绕过兼容闸门；minor 级破坏性变更无法拦截。缺「最低宿主版本 / 兼容矩阵」（后端 roadmap 也把这条列为 P2 未做） | P1 |
| B7 | **权限声明不落到运行时** | `permissions` 只存在于市场 DTO（`plugin-marketplace.ts:63,91`，白名单见 PLUGIN_REVIEW_ROADMAP §2.2a）；`PluginConfig` 里没有该字段，宿主也不校验 | 审核页展示了「这个插件要 NETWORK/DOM」，装上后它和没声明的一样能读 DOM、发网络、调 `desktop.*`。声明与执行脱节，审核结论就没有约束力 | **P0**（安全） |
| B8 | **插件存储无版本/迁移/配额** | `storage` 走 `plugin.<key>` 命名空间（`types.ts:342`、STORAGE.md） | 插件改数据结构后老用户数据没有迁移位；也无「这个插件占了多少空间」的可见性 | P2 |
| B9 | **已安装插件无错误上报/遥测** | 宿主只在本机 logger/console 留痕；`PluginErrorBoundary` 不向上汇报 | 第三方插件在用户机器上崩了，作者和平台都不知道；市场评分之外没有质量信号 | P2 |
| B10 | **无签名/作者身份校验** | 只有脚本标签级 SRI（`PluginManager.ts:2480` → `import-util.ts:121`），无签名、无发布者验证 | 供应链风险在「可信代码」模型下被吞掉；私有/企业市场会卡在这里 | P2 |
| B11 | **`globalRoutes` 是死贡献点**（已核实） | `PluginConfig.globalRoutes` 声明在 `PluginManager.ts:87`、存在 `_globalRoutes`（`:149,166`）、也被 `mapComponents` 认领（`:325`），但 `KPlugin` **没有对应 getter**（getter 列表 `:182-235` 只有 `routes`），而 `resolveRoutes()` 只 `collect(plugin.routes, …)`（`:1829-1831`） | 声明了却永远不进路由器，插件作者（和 agent）会以为它生效。要么接上（供「外壳级/全局路由」用），要么从 `PluginConfig` 与 skill 里删掉，别留着 | P1 |
| B12 | **配置只能写组件，没有声明式 schema** | `PluginSettingsConfig` 必填 `component`（`PluginManager.ts:41-71`），没有字段/类型/默认值/是否密钥的描述；密钥还要在四处手工登记（`usePluginConfig({secretFields})`、`PluginSecretFields.DECLARED`、settings UI、`isSecretMask` 判断，见 PLUGIN_CONFIG_SECRETS.md「新增一个带密钥的插件」） | 每个插件都要手搓设置面板与「已配置」状态，宿主也没法统一渲染/自动加密/迁移/校验。一个声明式 `configSchema`（fields + secret 标记）能同时消化开发台的 A13 缺口与密钥登记的重复劳动 | P1 |
| B13 | **`desktopOnly` 端到端不生效**（HIGH，与文档矛盾） | `PluginConfig.desktopOnly` 运行时只被存储与展示（`PluginManager.ts:1271,1737,1970`），无任何门禁。市场侧的拦截条件依赖 `plugin.desktopOnly` **或** `currentVersion.permissions`（`Shop/plugin-model.ts:240-259`、`Marketplace/index.tsx:548-549`），而后端**列表接口不投影 `permissions`、也不设 `currentVersion`**（`PluginApplication.searchPlugin:496-504`），`PluginVO` 里根本没有这两个字段（`PluginVO.java:14-56`）；已安装列表同样不选 `permissions`（`PluginServiceImpl.java:48-62`），服务端安装也不校验平台（`PluginController.install:114-118`） | Web 端可以安装并在启动时加载一个 `desktopOnly` 插件，然后在运行期因为 `desktop` service 不存在而失败。「桌面专用」这个承诺目前只在 UI 文案里 | **P0** |
| B14 | **没有生命周期钩子（activate/deactivate/dispose）** | `KPlugin` 无任何生命周期方法；`uninstallPlugin`（`PluginManager.ts:1302-1326`）只删条目、释放热更槽位（`:802`）、移除 CSS（`:1323`），**从不回调插件实例** | 插件在构造期创建的定时器/全局监听在卸载时（以及每次热更时）泄漏；authoring skill 也没教「怎么清理」，因为它不存在 | P1 |
| B15 | **一个坏插件会挡住整个应用启动；失败只报名字不报原因** | `init` 阶段**任意一个插件失败**都会让 `Layout` 直接 throw（`packages/core/src/Layout.tsx:242-244`「Failed to load required plugins: …」），把应用卡在错误页直到用户重试；而 `failedPlugins` 里只有**名字没有原因**（`PluginManager.ts:1139-1147,1231-1234`；原因只有 `installBundle` 会返回）。<br>（更正一个容易误判的点：**贡献点组件本身是有错误边界的** —— `mapComponents`（`PluginManager.ts:254-364`）把 `HotComponentBoundary` 装到 dockPanel / pageType(component) / settings / toolRenderer / artifactRenderer / editor 各组件位上（`plugin-hot-component.tsx:191-212`，其注释明确写了「app shell 不会自己包边界，所以边界随组件走」），所以「面板一抛就把外壳带走」不成立。真正**没被包**的是 ReactNode 形式的贡献（如 `menus[].icon`）与非 React 的执行面（`agent.include` 实现、`pageType` 的 `editor-component` 工厂） | 一个第三方插件的 bug 就能让用户打不开应用，且用户/作者都拿不到原因；这是当前最影响「敢不敢装第三方插件」的一条 | **P0** |
| B16 | **两个「pluginKey」概念混在一个 prop 名里** | 设置组件收到的是**设置项的 key**，prop 名却叫 `pluginKey`（`SeetingDlg.tsx:106,190-193` 传 `plugin.key`，例如 `github-settings`）；而 storage/service 用的是**注册键**（`github`） | 插件作者按 prop 名理解去拼存储命名空间/服务名就会错位；密钥配置与插件数据落在两个不同的命名空间下，且没有任何地方说明这件事 | P1 |
| B17 | **插件文案与宿主共用 `translation` 命名空间，后者覆盖前者** | `resolveLocales()` 用 lodash `merge`（`PluginManager.ts:2154-2168`），App 侧按 `(lng, ns)` 以 `overwrite: true` 注册（`App.tsx:434-447`） | 两个插件（或插件与宿主）用了同一个 key 就互相覆盖，且没有任何告警；应给每个插件一个 `plugin.<key>` 命名空间 | P1 |
| B18 | **三个「声明了但没用」的字段/贡献点** | `PluginConfig.status` 是**必填**却从不被读取（ctor `PluginManager.ts:163-179` 不读，全仓 grep 无消费）；`agent.actions` 只有类型、re-export 与 resolver，**无渲染方**；`agent.context` 是 deny-all 且 `App.tsx:306` 明确 `setAgentContextWhitelist([])`，等于恒不生效；`DESKTOP_BRIDGE_VERSION`（`plugin-api/src/index.ts:27`）被导出成 `desktop.version` 但**全仓无任何比较** | 契约面看起来比实际能力大；作者按类型写出来的东西不会生效，也不会报错 | P1 |
| B19 | **发布端不复刻服务端校验规则** | 提交/升版的名字、pluginKey、tag、description（≥10 字）、integrity、permissions 校验全在服务端 `PluginSubmissionValidator`；开发台的发布工具不做前置校验，`description` 默认取插件名（`studio-tools.ts:1280`），于是**必然**触发服务端的 10 字下限，用户只看到一句笼统错误 | 发布失败时作者不知道要改哪个字段、改到多长 | P2 |

### C. 后端/治理

| # | 缺口 | 证据 | 影响 | 优先级 |
| --- | --- | --- | --- | --- |
| C1 | 权限声明**只审不用**（与 B7 同一件事的服务端一半）：白名单（含 `DESKTOP`）只用于审核展示，装机/装载时零强制 | `PluginSubmissionDTO.java:60-62`、`PluginSubmissionValidator.PERMISSION_CATALOG:109-118`、`V24__plugin_safety_and_reports.sql:15-18`、`PluginVersionVO.java:53`；客户端唯一的功能性使用是**派生 `desktopOnly`**（`Shop/plugin-model.ts:240-259`），后端安装只查 entitlement（`PluginApplication.java:473-489,541-553`） | 审核页展示的能力清单对运行时没有约束力，审核结论形同建议 | P0（与 B7 一起做） |
| C2 | 无「要求修改」中间态、开发者撤回、下架后客户端主动失效 | PLUGIN_REVIEW_ROADMAP §1.3、§2.1 备注；下架通知与 `suspend/restore` 已实现，缺的是客户端运行时生效路径（见 C8） | 审核只有「通过/驳回」二元，作者被驳回后只能重开提交；紧急召回也不落到客户端 | P1 |
| C3 | 兼容性矩阵/依赖插件/多端支持声明未做（客户端与服务端都没有 `minHostVersion`/`platforms` 字段；grep 全仓为 0） | PLUGIN_REVIEW_ROADMAP §2.3、§3.1/3.2 | 宿主升级与插件兼容性只能靠「装上去试」，没有声明与预检 | P1 |
| C4 | 无灰度发布、无开发者信任等级（roadmap P2 全部未做：SLA 阈值仍是常量、无审计导出、无规则引擎） | PLUGIN_REVIEW_ROADMAP §2.3, §2.1e 备注 | 无法小范围验证新版本，也无法区分可信开发者 | P2 |
| C5 | **「提交之后发生了什么」在开发台里看不到** | `StudioMarketplacePanel.tsx:64-67` 拿到 `listMine()` 的 `status` / `reviewComment` 后**丢弃**，只用来解析 `pluginId`；服务面也没有「查询我某个提交的审核状态」的封装（`plugin-marketplace.ts:105-124`），开发台**没有**升级/更新列表 UI（`upgradePluginVersion` 只在工具面，`studio-tools.ts:1314`） | 人提交审核后，驳回原因、审核进度、是否需要改都要去插件中心/站内信才知道；开发台的字面承诺（「上架/发布」）与实际闭环之间缺最后一格 | P1 |
| C6 | **发布新版本会把能力声明清空**（与 roadmap 的承诺相矛盾） | `permissions` 只在**提交上架**时发送：`PluginVersionInput` 根本没有该字段（`plugin-marketplace.ts:68-80`），开发台发布不带（`studio-tools.ts:1252-1261`），宿主对话框也不带（`PluginVersionPublisher.tsx:253-260`），而后端把 `null` 归一化成 `[]` 并写入（`PluginApplication.java:653,666,673`） | 发布 v1.1.0 之后，该版本的能力清单一栏变成空 —— 审核员看到的是一份「无声明」的新版本。PLUGIN_REVIEW_ROADMAP 第 92 行声称「版本更新与重新提交均会刷新声明」，实现没有覆盖升版路径 | **P0**（合规/审核） |
| C7 | 开发者看不到自己插件的**版本列表** | 只有管理端 `GET /admin/plugin/{id}/versions`；客户端 `listMyPlugins` 只给一个 `version` 字符串 | 「把 v1.2.0 发到正确的 pluginId 上」只能靠模型/用户自己记住；发布错插件没有任何界面能发现 | P2 |
| C8 | 下架/召回没有客户端侧生效路径 | 后端 `suspend/restore` + 通知已落地（`AdminPluginController:38-140`、PLUGIN_REVIEW_ROADMAP §2.2d），客户端只有列表过滤，没有「已安装的插件被下架 → 强制卸载/禁用」的运行时路径 | 被紧急召回的插件仍留在用户已安装列表里继续跑 | P1 |
| C9 | 安全扫描跑在审核员的**浏览器**里，不是服务端 | `apps/admin/src/pages/plugins/PluginList.tsx:139,564-570` 在浏览器内拉取产物做启发式扫描；服务端只存结论（`scan_status/scan_report`） | 换一台机器/换个人就要重跑；也无法作为「装机前自动扫描」的闸门。roadmap 自己也把「服务端异步扫描」列为后续增强 | P2 |

### D. 平台/架构

| # | 缺口 | 证据 | 影响 | 优先级 |
| --- | --- | --- | --- | --- |
| D1 | **只有 Electron 能开发**（`desktopOnly: true`，web 上整页只显示一段说明） | `index.tsx:127`、locale `pluginStudio.desktopOnly/missingDev`；`apps/vite` 无任何构建能力 | 对「人」可以接受（本地构建需要 Node），但对「agent/在线协作」是硬墙。可行路线：宿主侧加一个 esbuild-wasm 的浏览器构建后端（Sucrase/esbuild-wasm），把纯 TS/React 插件的开发闭环搬到 Web | P1 |
| D2 | **主进程不可热更** | 文档 §已知边界 1（`apps/desktop/src/main/**` 改了要重启） | 开发「桌面能力型插件」（用到新 `dev.*`/`fs.*`）时反馈循环断裂 | 已声明，P2 |
| D3 | **dev 会话是内存态，不跨应用重启** | 文档 §已知边界 3；`plugin-dev-host.ts` 每工程绑定在内存 | 重启客户端要重新「开始监听」；对 agent 长期任务是可用性缺口 | 已声明，P2 |
| D4 | **dev 会话与多窗口/多工程的边界未定义** | `DevSessionManager` 按 root 管会话；`pluginDevHost` 单例绑定；构建事件广播给所有窗口，每个渲染层各自安装 | 多窗口同时开发同一工程、或同一插件在两个窗口热更，行为没有契约；也没有「哪个窗口在跑这个插件」的模型 | P2 |
| D5 | **`fs.watch` 递归不可用时会退化成「只监听 package.json」，改源码不再重建** | `dev-server.mjs:161-170` 捕获异常后降级；它发出的 `recursive:false` 标记被 manager 忽略（只置 `watching=true`，`manager.mjs:274-276`） | 在部分平台/Node 版本上「保存即热更」静默失效，而 UI 仍显示「监听中」。**已有 lint 级修法**：把降级状态一路传到 `dev.status` 并在页面上明示 | P1 |
| D6 | **开发预览与远程安装的条件不同，本地通过 ≠ 上架通过** | 开发路径走同源 Blob（`PluginManager.ts:1408-1416`），SRI 结构上不适用；PoC（`poc/plugin-dev-harness/`）当初是**另起源**的 HTTP dev-server，正好覆盖跨源脚本/缓存/可校验这三件事，正式实现把它换掉了 | 发布后可能遇到本地从未出现的加载差异；建议至少提供一次「按远程条件加载」的预演（本地 HTTP 源或 mock 远程清单） | P2 |

---

## 4. 建议路线图（按投入产出排序）

**第一批（把「写错了自己能知道」补齐，并修掉已经确定会坏的路径）**
0. ~~**修 `react/jsx-runtime` 外部化**~~ **✅ 已完成**：宿主发布真实运行时到 `__KN__.jsxRuntime` / `__KN__.jsxDevRuntime`，
   bundler 映射过去；`bundler.test.mjs` +4 项、`plugin-hot-swap.check.ts` +3 项回归。
   （未走「打进产物」那条路，原因见 §5.2。）
0b. **修打包版 `dev.hostApi`**（§5.2）：把 `Resources/kn-studio-runtime/host-api` 加进 `workspaceRootCandidates()`（A12），
   并把 `packaged-studio-deps.test.mjs` 从「断言文件存在」升级为「在没有源码树时真的能列包/搜符号」。
0c. **修两处 CSS 契约**（§5.2）：预览的无 payload 路径统一用 `pluginKey` 作作用域键；`StudioBuild` 补 `css` 字段并在回退路径透传。
0d. **补上 `realpath` 与更严的目录判定**（§5.3 第 1/3 条）：`assertAllowedPath` 加 realpath/lstat，
   `dev.remove` 删除前 realpath，并把「是不是插件工程」从「有 package.json」收紧为「有 `knPluginStudio`/入口」；
   `dev.installDependencies` 默认加 `--ignore-scripts`、钳位 `timeoutMs`。
0e. **把 `desktopOnly` 的门禁补上**（B13）：后端 `PluginVO`/列表与已安装接口返回 `permissions`、`desktopOnly`（或 `platforms`），
   安装接口按平台拒绝；否则 Web 端会装上一个注定运行时失败的插件。
0f. **升版带上能力声明**（C6）：`PluginVersionInput` 加 `permissions`，开发台与宿主对话框都传，
   后端在升版路径上也走 `normalizePermissions`；补一条「升版后能力清单不被清空」的回归断言。
0g. **让一个坏插件不再阻塞启动**（B15）：`Layout` 不因单个插件失败而 throw（降级为「跳过 + 提示 + 可重试」），
   `failedPlugins` 带上原因；顺带把 ReactNode 类贡献（`menus[].icon`）也纳入隔离。
1. `dev.typecheck`：在子进程里跑 esbuild + `tsc --noEmit`（宿主标准包 `dist/*.d.ts` 已在 `Resources/kn-studio-runtime`，可直接 group 进去）；
   把诊断按文件/行列结构化返回，工具面加 `typecheckPluginProject`，页面显示红点。
   前置动作很小但收益很大：**脚手架补 `tsconfig.json` + `.gitignore` + `scripts` + 把 `@kn/*` 的 `.d.ts` 以 `devDependencies`/路径映射方式落进工程**（A11），
   否则有 `tsc` 也没法解析宿主包，IDE 也依然是红的。
   实现形态建议一步到位：**一个受限的 `dev.runScript` 原语**（白名单 `tsc`/`vitest`/`eslint`、无 shell、不继承宿主 env），
   它同时解锁 A1/A4 和 lint。
2. 打开 `sourcemap: true`：注意必须把构建后的文本改写（`bundler.mjs:776-786`）挪进 esbuild 插件（`onEnd`）或同步重写 map，
   否则 map 一生成就作废；热更时通过 Blob + `//# sourceMappingURL` 让 DevTools 映射回源码。
3. `dev.runtimeLogs`：preload 侧在装载开发产物前 hook `console.*` 与 `window.onerror`/`unhandledrejection`，
   按 pluginKey 归集，合并进 `pluginProjectLogs` 与预览面板的时间线；同时把「预览崩溃边界」改成可重置（A19）。

**第二批（把契约面撑开）**
4. 宿主暴露 Tiptap：给 `DEFAULT_HOST_MODULES` 加 `'@tiptap/core': '__KN__.editor'`（+ `@tiptap/pm/*`、`@tiptap/react`、`@tiptap/suggestion`），
   加 `editor-node` 模板；这也是仓库内 39 个插件文件已经在用的那条路（`import ... from '@kn/editor'`）。
   同时**改掉文档里「编辑器会拒绝」这句未经证实的说法**，换成真实故障模式（两份 ProseMirror 副本）。
5. 补 service 供给面：`editor`、`navigation`、`notification`、`dialog`、`http`(带宿主鉴权)、`user`、`theme`、`commands`；
   每个新 service 进 `Services` 接口 + `listPluginServices` 自动可见（已经具备）。
6. 权限落地：`PluginConfig.permissions?: string[]` + 运行时能力门（`desktop.*`、网络、DOM 注入按声明放行），
   审核侧已有的白名单直接复用；未声明即拒绝而不是静默放行。同时把 `dev.*` 从「所有插件可用」收紧为「开发工具权限」。
7. 静态资源管线（A15）：给 bundler 配 `file`/`dataurl` loader + `outdir`，让插件能带图片/字体/自写 CSS；
   同时把 `.svg/.png/.woff` 加进 `project-files` 白名单，并让发布能带上资源目录（而不是「一个 JS + 一个图标」）。
8. 收尾一致性（都是小改）：`globalRoutes` 要么接上要么删（B11）；`agent.actions`/`agent.context`/`status` 同样处理（B18）；
   生命周期钩子 `dispose()` + 卸载时调用（B14）；插件文案给 `plugin.<key>` 命名空间（B17）；
   设置面板的 prop 名与密钥命名空间对齐注册键（B16）；skill 补 `tools`/`skills`/`agent` 与
   `usePluginConfig`/storage 命名空间（§5.1 第 3 条）；预览的菜单摘要用 ReactNode 渲染（§5.1 第 5 条）；
   模板清单收敛到一处（A17）；发布后能看审核状态（C5）。

**第三批（规模化）**
9. Studio 内嵌编辑器（CodeMirror/Monaco 轻量版）+ 保存即重建；GUI 增加 externals/依赖管理面板、工程内搜索、单文件删除。
10. 插件工程测试：注入 vitest + 一个只跑纯逻辑的 `dev.test` 通道（渲染层测试可后置）。
11. 插件间依赖声明 + 激活事件；apiVersion 从「比 major」升级为「声明支持的宿主区间」。
12. 增量构建 + 资源上限（A14）；`fs.watch` 降级状态要显式上报（D5）。
13. 离线分发：`exportPluginPackage` / `installPluginFromFile`。

---

## 5. 具体缺陷、不一致与风险

### 5.1 可复现的不一致

1. **`icon-ai.test.mjs`（14 项）游离在聚合测试之外**：root `package.json` 的 `test:plugin-dev` 只串了
   `surface / icon-art / studio-tools / studio.smoke`，漏了 `icons/icon-ai.test.mjs`（包内 `test` 脚本有它）。
   AI 图标是唯一**非确定性**的生成路径，校验器（XML/字体栈/外链/viewBox）恰恰最需要常跑。
2. **文档数字漂移**：见 §1 注（486 vs 507；182 vs 203；测试表漏 icon-ai）。
3. **authoring skill 的贡献点清单不完整**：`plugin-authoring.ts:139-149` 列了 11 个点，
   **漏了顶层的 `tools` / `skills` / `agent`** —— 也就是「插件自己给 agent 加工具/技能/渲染器」这条能力，
   只在第 67-78 行以「怎么产出产物」的语境出现过，没有作为 `PluginConfig` 字段教给模型。
   而开发台自己恰恰就是这么写的（`index.tsx:136-160`）。这会系统性地让 agent 少用一个能力。
   同一份 skill 还漏了两件作者一定会需要的事：**`usePluginConfig({ secretFields })` 的密钥/配置通道**
   （`packages/common/src/hooks/use-plugin-config.ts:54`、`docs/PLUGIN_CONFIG_SECRETS.md`）与
   **宿主存储命名空间**（`packages/common/src/storage/types.ts:300`）——作者要么自己发明一套，
   要么把 API key 写进源码。（skill 里 `pluginProjectLogs` 只承诺编译错误、不承诺运行期日志，这点是准确的。）
4. **两份「宿主模块」清单需要保持同步**：bundler 的外部化清单是 11 条（`bundler.mjs:51-62`），
   studio 用于 `externals` 校验的 `BUILTIN_HOST_MODULES` 原是 9 条、缺 `react-dom/client` 与 `react/jsx-dev-runtime`。
   （**更正**：初版审查说它「6 条、连 jsx-runtime 都没有」是错的 —— 它一直有 `react/jsx-runtime`，缺的只是另外两条。）
   现已补齐并加了「与本清单保持同步」的注释；但两份清单仍是两个真相来源，下一步加 `@tiptap/core` 时应当合并成一处。
5. **预览的菜单摘要把 ReactNode `String()` 成了 `[object Object]`**：`menu.name` 是 ReactNode（`core/menu.ts:9`），
   而 `PluginUiPreview.tsx:283` 直接 `join('、')` —— 开发台**自己的**菜单（`index.tsx:171-179` 传的是 `<StudioMenuLabel/>`）
   就是这种形状，所以预览里必然出现 `[object Object]`。
6. **无 payload 的焦点路径把工程模板一律写成 `panel`**：`pane.tsx:271-273` 在 `data` 缺失时默认 `template: 'panel'`，
   于是 page/settings/command 工程在被 `focusArtifact` 打开时显示成「侧边停靠面板」。
7. **图标状态机有死值**：`'unreadable'` 在 `icon-art.ts:294` 的类型里声明、`:412-434` 从不产出；
   读取失败被记成 `'no-entry'`（`:423-425`），对应的两条 locale key 永远不显示（`index.tsx:286,505`）。
8. **文档数字与实现漂移**：PLUGIN_STUDIO.md 第 522 行写「约 90 个」用途关键词，`icon-art.ts:44-68` 实际是 **133** 个键
   → 62 个字形、9 组调色板（`:74-84`）。
9. **一批 locale key 是孤儿**（`publishTitle`/`tabPublish`/`versionDesc*`/`upgradeTitle|Action|Empty`/`marketplaceUnavailable`/
   `publishSubmitDone`…，`index.tsx:243-330`）在包内**零消费者**，是已删除的 `StudioSettings.tsx` 的残留；
   人侧发布后看不到审核状态也是同一处历史遗留的后果（见 §3C 的 C5）。

### 5.2 已复现 / 已定位的正确性缺陷（P0）

> 第一条（`react/jsx-runtime`）已修复，保留完整成因与修法记录，因为它是「构建成功、运行时才炸」这类缺陷的样本。
> 其余三条是逐行读出的代码缺陷（未在真实打包应用 / 旧宿主上跑）。

**`react/jsx-runtime` 被映射到宿主 `React` 全局，运行时必然 `jsx is not a function`。** — ✅ **已修（本次）**

- 代码：`bundler.mjs:46-47` 曾把 `react/jsx-runtime` / `react/jsx-dev-runtime` 声明成宿主模块、表达式是 `'React'`；
  生成的运行时 shim 于是产出 `__knExact["react/jsx-runtime"] = window.__KN__.React`
  （`bundler.mjs:139-205`，实测产物第 58/70 行）。
- 事实：本仓库是 **React 18.3.1**，`require('react').jsx === undefined`（`jsxs` 同）——自动 JSX 运行时
  是 `react/jsx-runtime` 这个子入口，不在 `react` 主入口上（对比：`@kn/rollup-config/index.js:35-43` 的选择正相反，
  它**把 jsx-runtime 打进产物**，注释写明「只外部化 react/react-dom 本体，子路径打包，保住单例 React」）。
- 最小复现（我在本机跑过）：工程只写

  ```tsx
  import { jsx, Fragment } from 'react/jsx-runtime'
  export const el = jsx(Fragment, { children: ['hi'] })
  ```

  `buildPlugin` **返回 ok**；用 `window.__KN__ = { React }` 求值产物即抛
  `TypeError: (0 , import_jsx_runtime.jsx) is not a function`。
- 影响面：插件**自己的** JSX 走 `jsxFactory: 'React.createElement'`（`bundler.mjs:743-746`）不受影响，
  模板因此是好的；但**任何经 `installPluginDependencies` 装进来、用自动运行时编译过的第三方 React 库**
  （大量现代组件库）在渲染时会炸。也就是说文档主推的「装第三方包」这条路上埋了一颗必然会踩的雷，
  而报错信息（`jsx is not a function`）指向的是库内部的符号，作者几乎不可能自己定位。
- **修法（已采用「暴露真运行时」而非「打进产物」）**：宿主把真实的 `react/jsx-runtime` /
  `react/jsx-dev-runtime` 命名空间发布到 `__KN__.jsxRuntime` / `__KN__.jsxDevRuntime`
  （`packages/common/src/core/global-namespace.ts` 的接口与赋值 + `packages/core/src/App.tsx` 的 import 与传参），
  bundler 把这两条映射到对应表达式（`bundler.mjs:51-52`）。
  选它而不是「不外部化」的理由：jsx-runtime 文件在 `react` 包的子路径里，而插件工程的 `react` 是 peerDependency、
  磁盘上未必存在（脚手架不装依赖），解除外部化会让 esbuild 解析不到模块而直接构建失败；
  映射到宿主模块则与 `@kn/common`/`@kn/ui` 完全同一套机制，且保住单例 React。
- **回归测试（已加）**：
  - `bundler.test.mjs`：断言映射值不是 `React` 而是 `__KN__.jsxRuntime`；用假运行时证明产物**确实调到宿主运行时对象**；
    再用**真实的** `react/jsx-runtime` 求值产物，断言拿到 `$$typeof === Symbol.for('react.element')` 的合法元素
    （即原先抛错的那条路径）。50 → **54** 项。
  - `plugin-hot-swap.check.ts`：结构化断言 `App.tsx` 把两个运行时传进 `setupGlobalNamespace`，
    并运行时断言 `window.__KN__.jsxRuntime` 就是传入的那个对象。145 → **148** 项。
- 顺带：把 `studio-tools.ts` 的 `BUILTIN_HOST_MODULES` 补齐为与 bundler 一致（补 `react-dom/client`、`react/jsx-dev-runtime`），
  并注明两份清单需同步。

**打包版里 `dev.hostApi` 通向一棵不存在的目录树 ⇒ 「让 agent 查真实接口」整条能力在正式客户端里失效。**

- `prepare-studio-deps.cjs:328` 把 6 个标准包源码物化到 `Resources/kn-studio-runtime/host-api/packages/…`；
- 但 `workspaceRootCandidates()`（`apps/desktop/src/main/plugin-dev/index.ts:63-75`）里的候选**从不包含 `process.resourcesPath`**
  （唯一与 asar 相关的候选是 `Resources/app.asar.unpacked/out/main/plugin-dev/host-api`，:71）；
- 打包应用里 cwd 是 `/`、没有源码树 ⇒ `resolveWorkspaceRoot`（`host-api.mjs:28-37`）返回 `undefined`
  ⇒ `dev.hostApi` 抛「host package source is not available in this build」（`host-api.mjs:162`），
  于是 `searchHostApi` / `readHostApiFile`（`studio-tools.ts:451-459`）在**安装版**上是死的，而 ~1MB 源码照旧随每个安装包发出。
- 为什么没被发现：`packaged-studio-deps.test.mjs:159-161` 只断言那些文件**存在**，从不解析 root。
  这正是「文档 §打包后的运行时依赖 表格里的一行」在真实打包路径上没跑通——属于**已声称、未验证**的功能。
- 修法：把 `path.join(process.resourcesPath, 'kn-studio-runtime', 'host-api')` 加进 `workspaceRootCandidates()`，
  并让回归测试改为「在没有源码树的前提下 `dev.hostApi` 能列出包 / 搜到符号」。

**CSS 作用域在两条「无 payload」路径上对错了键 ⇒ 预览丢样式。**

- 预览给组件套的 `data-kn-plugin` 优先取 `status.plugin.pluginKey`，取不到时**回退到运行时显示名**
  （`PluginUiPreview.tsx:155`），而注进窗口的样式表是按**清单 pluginKey** 作用域的（`bundler.mjs:380`、宿主 DockHost 同键）。
- 两条路径会走到回退：`focusArtifact({kind,id})`（不带 data），以及 `background: true` 构建**运行期间**的产物（`surface.ts:303-310` 的占位 payload 没有 pluginKey）。
- 这不是理论问题：dev-server 用 `name = displayName || name`（`dev-server.mjs:64-70`），
  而开发台脚手架默认 `displayName "My Plugin"` / `pluginKey "my-kn-plugin"`（`StudioPage.tsx:189-190`、`bundler.mjs:414,424`），
  两者不等。于是「焦点打开预览」时宿主全局工具类生效、**插件自己的 CSS 不生效**，看上去像样式没写对。
- 一行修法：预览侧一律优先 `pluginKey`（`surface.ts` 的占位 payload 也补上 `pluginKey`/`name`）。

**agent 工具在「旧宿主回退路径」上热更会丢掉 CSS。**

- `StudioBuild` 类型里没有 `css` 字段（`studio-tools.ts:33-39`），而宿主实际会返回它
  （`desktop-bridge.ts:327-333`），开发台自己的页面路径也会传（`studio-service.ts:100`）。
- 后果：走回退安装（没有 `pluginDevHost` 的宿主）时，`runPluginProject` / `buildPluginProject` 的返回里没有 `css`
  （`studio-tools.ts:1406-1414,1548-1556`），热更进去的插件**没有样式**。
- 这是投入产出比最高的一处修复：改类型 + 透传两个字段。



### 5.3 安全 / 信任边界（重要）

1. **路径白名单只做字面比较，没有 `realpath`，符号链接可直接逃逸（High）**。
   `assertAllowedPath` = `path.resolve()` + 字符串前缀比较（`main/ipc.ts:27-40,55-67`），`fs.*` 与所有 `dev.*` 共用它。
   于是 `/Documents/link/x`（`link → /etc`）能通过检查，随后 `readFile` / `writeFile` 会跟着链接走：
   **可读、并且可写到白名单之外的任意路径**（例如覆盖 `~/.zshrc`）。
   `dev.remove` 更是**完全没做 realpath**（`manager.mjs:604-629`），`rm(root,{recursive:true})` 会穿过符号链接的中间层删掉真实目录。
   唯一做对的是 `dev.deleteFile`（两边都 realpath，`manager.mjs:673-687`）——模式已经存在，只是没铺开。
2. **`dev.readFile` / `dev.writeFile` 并不限于工程目录**（与文档第 620 行「读写工程文件」不符）：
   接受**任意**白名单内路径，无大小上限，且对话框授权在整个进程生命周期内有效（`ipc.ts:41`）。
3. **`dev.remove` 的「是不是插件工程」判定只是「有没有 package.json」**（`manager.mjs:612-619`）：
   没有任何 `knPluginStudio` / 入口校验，于是 `~/Documents/my-app` 这类普通 npm 工程也在可删范围内。
   文档表格（:624）是准确的，正文（:639「会拒绝不是插件工程的目录」）说过头了。
   同一个守卫用在 `deleteFile`（:659-671）上；另外当清单声明的入口解析不到时 `manifest.entry` 为 `null`（`bundler.mjs:282-295`），
   **入口保护会静默失效**（`manager.mjs:693`），真正的源码文件变成可删。
4. **`desktop.dev.*` 对渲染层所有代码开放，且在生产构建里不做开关**。
   `preload/index.ts:71-89` 把 14 个 `dev.*` 放进固定白名单，`main/ipc.ts:114-119` 无条件注册
   （没有任何 `app.isPackaged` / 环境判断）。结论：**任何一个从市场装上的插件**都能
   `knDesktop.invoke('dev.start'|'dev.remove'|'dev.installDependencies'|…)`。
   这与文档「已知边界 5：插件是可信代码」并不矛盾，但「开发工具能力默认对所有插件开放」这件事没有被写下来，
   也超出了「开发机专用」的预期。附带：preload 的 `invoke` 有白名单，`on(event)` 没有（`:103-110`），任意 `desktop:event:*` 都能订阅；
   今天只发 `dev`/`fullscreen`，但 `dev` 事件的载荷是**整份 bundle 代码**，而它是广播给所有窗口的（`plugin-dev/index.ts:85-89`）。
5. **`dev.installDependencies` 没有 `--ignore-scripts`**（`package-install.mjs:76-88`），且子进程继承**整个宿主环境**
   （`{...process.env}`，:126）。结合第 4 条：任意已安装插件都能在用户机器上执行任意 npm 包的 postinstall 脚本。
   另外四条未文档化的边界：
   - 超时用 `SIGKILL` 只杀直接子进程（:149-155），**npm 派生的 postinstall 子进程在超时后继续跑**；
   - `timeoutMs` 从 IPC 一路未校验未钳位（`plugin-dev/index.ts:222`）：负数 ⇒ 立刻 SIGKILL，`>2³¹−1` ⇒ 定时器溢出 ⇒ 也是立刻 SIGKILL；
   - Windows 上 `shell: true`（:134）且版本号字符集允许 `<` `>`（:15），Node 在 shell 模式下不引号化 argv，
     `date-fns@>x` 会被 cmd.exe 当重定向、在工程目录里创建/截断 `x`（无法命令拼接，Low）；
   - 应用级网络策略（`net-policy.ts`，只作用于 `http.request`）**不覆盖安装**：用户关掉网络策略，npm 照样能访问内网/元数据地址。
6. **权限声明与执行脱节**（B7/C1）：审核页展示的能力清单，运行时没有任何强制点。
7. **apiVersion 缺失即放行**（B6）：手工/老工具链产出的 bundle 可绕过兼容闸门，这条路径没有测试覆盖断言「无 apiVersion 必须拒绝」
   （现有断言的是「放行 + warn」，见 `PluginManager.ts:969-972`）。
8. **人类 UI 的删除回退到通用 `fs.remove`**：文档第 642-644 行说的「不把通用删除能力交给 agent」只对 agent 工具成立；
   开发台页面的兜底路径走 `studio-service.ts:167-175` 的 `fs.remove`，权限比 `dev.deleteFile` 宽得多。

### 5.4 桌面能力层的运行性缺陷（逐行核查补充）

| 类别 | 结论 | 证据 |
| --- | --- | --- |
| 协议 | NDJSON 无版本、无消息 id、无心跳：**卡住的构建与慢构建无法区分**；`buildCount` 是唯一关联键，两次并发 `dev.build` 可能被同一次构建满足 | `manager.mjs:231-245,353-370` |
| 超时 | 30s 等待到期后 promise **直接 resolve**（不是 reject），于是 `dev.start` / `dev.build` 可能返回陈旧/空状态而调用方以为成功 | `manager.mjs:136,211-225,231-245` |
| 取消 | 构建中无法取消；`cancelBackgroundTask` 不中断构建（与文档一致）；`dev.stop` 只能整会话杀 | `AGENT_BACKGROUND_TASKS.md:103-121` |
| 退出 | stop 的两级都是 SIGTERM（无 SIGKILL），子进程没有 stdin EOF 处理，`will-quit` 只排了个 1.5s 定时器 ⇒ **无视 stop 的子进程可能变成退出后仍存活的孤儿 watcher**（未实测） | `manager.mjs:448-456,778-782`；`dev-server.mjs:185-204` |
| 构建模型 | 每次改动都全量 `esbuild.build()`（无 incremental），Tailwind 每次全工程重扫重编；无会话数/bundle 大小/读写大小上限 | `bundler.mjs:730-753,763`；`tailwind.mjs:77-85` |
| 同根竞态 | 重建时先插入新会话再等旧子进程退出 ⇒ 短暂双 watcher 双构建；大小写不敏感卷上 `C:\P` 与 `c:\p` 是两个会话 | `manager.mjs:466,498-503` |
| 广播 | 每次构建把整份 bundle 广播给**所有**窗口，每个渲染层各自安装；无「哪个窗口在跑这个插件」的模型 | `plugin-dev/index.ts:85-89`；`plugin-dev-host.ts:149-199` |

### 5.5 其余零散问题（代码层面）

- `StudioPage.tsx` 1467 行、`studio-tools.ts` 2030 行，都是单文件大模块；前者已按 UI 段落组织，后者按工具切片，
  目前可读，但加上 A1/A4/A5 会需要拆分（建议按 `tools/project.ts`、`tools/build.ts`、`tools/catalog.ts`、`tools/market.ts` 分文件）。
- 工具层「依赖注入、运行时不依赖 `@kn/common`」这个取舍很值（`studio-tools.ts:16-24` 注释、203 项纯 Node 测试是它的红利），
  新增能力时应延续，不要把 React/宿主 API 直接 import 进来。
- **侧栏/预览的边界要说准确**：贡献点**组件**是随组件自带 `HotComponentBoundary` 的（`mapComponents`，见 B15 更正），
  所以「开发台自己的 pane 抛错带走侧栏」并不成立；真正没有边界的是 `menus[].icon` 这类 **ReactNode** 贡献与非 React 执行面。
- **「预览只读」的说法容易误导**：预览渲染的是插件**真身**，它照样能读存储、调 service、产生副作用
  （文档第 297 行的「只读」指的是开发台不替它点 `dev.*` 的写操作）。
- **服务目录按显示名分组**（`pane.tsx:128-143` 用 `owner.pluginName`），两个显示名相同的插件会被合并成一组。
- **人类动作不产生产物**：产物架是从工具调用派生的（`agent-artifact-collect.ts:41-52`），
  所以人在页面上生成的图标/发布不进入产物架（`StudioPage.tsx:589-604,652-660`、`StudioMarketplacePanel.tsx:22-77`）——
  同一件事「agent 做有产物、人做没有」，产品上是个不一致。
- **AI 图标校验器是启发式而非 XML 解析**（`icon-ai.ts:103-157`）：只查首尾标签、`xmlns`、根元素 viewBox/宽高、
  一条黑名单正则、裸 `&`、嵌套引号、长度与「至少一个绘图元素」。`on*= ` 处理器、`<style>`、`<animate>`、`url(data:…)`
  都能通过，所以「脚本与外链已被阻断」（`:17-22`）与文档第 67 行的「XML 合法」都只是近似说法。
  （实际渲染走 `<img src={svgDataUrl}>`（`IconPane.tsx:66-67`）、市场也是 `<img>`，所以**不构成 XSS**，
  但「校验通过」并不等于「一定是合法 SVG」；`writePluginIconSvg` 自己的兜底只有 `<svg`…`</svg>`（`icon-art.ts:483-484`）。）
- **`DevCapability.isDesktop` 是恒 `true` 的死字段**（`studio-service.ts:42-47,60`，无读取方）；
  `bytes` 字段报的是**字符串长度**而非字节数（`studio-tools.ts:909,938`）；
  还有一条路径会返回 `reloadRejected` 但 `reason` 为空串（`studio-tools.ts:1403-1404,1417,1424-1426`）。
- **`observedFiles`（读后写守卫）是模块级、只增不减的 Set**（`studio-tools.ts:648-656`），
  且跨工程共享：读过一次就永久授权编辑，`deletePluginProject` 也不会清理。
  进程内长期运行的会话里，这条安全网会随使用逐步失效。

---

## 6. 一句话回答「还要提供啥」

- **Plugin Studio 还要提供**：类型检查与静态诊断、source map、插件运行期日志/错误时间线、工程测试运行、
  人类可用的编辑器与依赖/externals 面板、静态资源管线（图片/字体/自写 CSS）、以及把 `tiptap` 类扩展写出来之后能验证它。
- **宿主还要提供**：把 `@tiptap/core` 映射到已有的 `__KN__.editor`（一行）；把可复用 service 从 10 个扩到覆盖「通知/路由/编辑器/用户/HTTP/主题/命令」；
  权限声明的**运行时**强制点 + `desktopOnly` 的市场/安装门禁；生命周期钩子（让插件能清理）；
  渲染隔离铺到 dock/设置/引导/侧栏并让「一个坏插件不阻塞启动」；activation events 与插件间依赖；
  apiVersion 从 major 比对升级为兼容区间；一个把「开发中」变成正式注册表状态、可跨重启恢复的 dev 会话模型；
  以及把 `globalRoutes`/`agent.actions`/`status` 这类「声明了但没接上」的契约补齐或删掉。
- **后端/治理还要提供**：权限与执行的闭环、**升版也要带上能力声明**（C6，现在是清空）、「要求修改」中间态、
  兼容性矩阵、下架后的客户端失效路径、开发者可见的版本列表与审核状态，以及插件运行质量信号。
- **桌面能力层还要提供**：在工程内**受限地执行脚本**的原语（一次解锁 typecheck/test/lint）；
  打包版 `dev.hostApi` 真的能解析到随包的宿主源码；以及路径校验从「字面比较」升级为 `realpath` 级别。

### 已经确定会坏、且成本极低的三处（建议立即修）

1. ~~`react/jsx-runtime` 外部化 → 第三方自动运行时库必然 `jsx is not a function`~~ **✅ 已修（本次，见 §5.2）**。
2. 打包版 `dev.hostApi` 解析不到 `Resources/kn-studio-runtime/host-api` → agent 查宿主接口的能力在安装版上整条失效（§5.2）。
3. 预览的无 payload 路径 + agent 回退安装路径都会**丢 CSS**（§5.2）；`globalRoutes` 声明了永远不生效（§3B/B11）。

### 另外三处「功能承诺已经落空」的（成本同样很低）

4. `desktopOnly` 在 Web 上拦不住任何东西（B13）——后端列表/已安装接口不返回 `permissions`/`desktopOnly`。
5. 发布新版本会**清空**该版本的能力声明（C6）——`PluginVersionInput` 没有 `permissions` 字段。
6. 任意一个已安装插件的加载失败会**阻塞应用启动**，且只给出插件名、没有原因（B15）。

> 现有链路的成熟度值得肯定：身份/提交/回滚/CSS 事务这几条硬骨头是用真实断言钉住的。
> 上面这些缺口的共同点是——**它们大多不是「再多写几个工具」能解决的，而是宿主必须先开出对应的能力面**。
