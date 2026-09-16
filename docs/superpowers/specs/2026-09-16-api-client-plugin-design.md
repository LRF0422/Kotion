# 类 Postman 的接口调试插件设计规范

> 状态：设计稿（待评审）
> 日期：2026-09-16
> 目标包：packages/plugin-api-client（@kn/plugin-api-client）
> 关联文档：CLAUDE.md、docs/PACKAGE_BOUNDARIES.md、docs/RESPONSIVE.md、docs/api/plugin-config-api.md

---

## 1. 概述

### 1.1 背景

当前知识库插件体系已经提供了完整的贡献点（路由、菜单、设置、编辑器扩展、页面类型、Dock 面板、AI 工具/技能），但没有原生的 HTTP 接口调试能力。用户要在产品外部用 Postman 或 curl 调试接口，再把结论手工搬回知识库，链路割裂。

本插件在知识库内提供一个 Postman 风格的工作台：构建请求 -> 发送 -> 查看响应 -> 断言 -> 沉淀为文档 -> 交给 AI 分析。

### 1.2 命名

工作区中已存在 @kn/plugin-api，但它是宿主与插件的契约包（版本握手 + 类型再导出），不是接口调试工具。为避免歧义：

- 包名：@kn/plugin-api-client
- 运行时插件 name：API Client
- 中文展示名：接口调试
- 插件配置与持久化 key：@kn/plugin-api-client

### 1.3 目标与非目标

目标：

- 覆盖 Postman 日常使用约 80% 的高频能力（集合、请求构建、环境变量、历史、响应查看、导入导出、代码生成）。
- 与知识库深度集成：请求与响应可沉淀为页面，AI Agent 可直接读写集合。
- Web 与桌面（Electron）都能正常发起跨域请求。
- 遵循仓库既有的插件边界、响应式与持久化规范。

非目标（本插件不做）：

- 不做 Mock Server 或 API 网关（后续可独立成服务）。
- 不做团队协作实时编辑（一期复用知识库分享能力即可）。
- 不替代专业 CI 压测工具（集合运行器仅做顺序执行 + 断言）。

---

## 2. 功能范围与优先级

能力 | Postman 对应 | P0（MVP） | P1 | P2
---|---|---|---|---
集合 / 文件夹 / 请求 树 | Collections | 是 | |
请求构建（Method/URL/Params/Headers/Body） | Request Builder | 是 | |
发送与响应查看（状态/耗时/大小/Body/Headers） | Response | 是 | |
环境与全局变量、{{var}} 替换 | Environments | 是 | |
本地持久化（localStorage） | - | 是 | |
历史记录 | History | | 是 |
认证：Bearer / Basic / API Key | Authorization | | 是 |
Cookie 管理 | Cookies | | 是 |
cURL 导入导出 | Import/Code | | 是 |
代码片段生成（cURL/fetch/axios/Python） | Code Snippet | | 是 |
集合运行器（顺序执行 + 断言） | Collection Runner | | 是 |
后端代理传输（Web 生产环境跨域） | - | | 是 |
桌面 IPC 传输（Electron 免跨域） | - | | 是 |
前置脚本 / 测试断言沙箱 | Scripts / Tests | | | 是
Postman Collection v2.1 导入导出 | Import/Export | | | 是
OpenAPI 3 导入 + 自动补全 | Import | | | 是
响应沉淀为知识库页面 | - | | | 是
AI 工具与技能集成 | - | | | 是
GraphQL 支持 | GraphQL | | | 是
云端集合同步 | Cloud Sync | | | 是

> 一期（本文档主要落地范围）= P0 + P1。

---

## 3. 架构与依赖边界

### 3.1 依赖方向（严格遵守 docs/PACKAGE_BOUNDARIES.md）

~~~text
apps/vite    ------+
apps/desktop ------+--> @kn/plugin-api-client --> @kn/common
                                          --> @kn/ui / @kn/icon / @kn/editor
~~~

- 插件可以依赖 @kn/common、@kn/ui、@kn/icon、@kn/editor。
- 插件不得依赖 @kn/core。
- 不新增 @kn/common 公共 API；插件自身的类型与逻辑全部收敛在包内。

### 3.2 使用的宿主贡献点

插件入口沿用 KPlugin 模式（参考 packages/plugin-github/src/index.tsx、packages/plugin-speech-to-text/src/index.tsx）：

贡献点 | 用途
---|---
routes | /api-client、/api-client/:collectionId/:requestId 工作台页面
menus | 侧边栏「接口调试」入口（SiderMenu 通过 resolveMenus() 渲染）
settings | 全局设置面板（默认超时、代理策略、SSL 校验、遥测开关等）
locales | zh / en 双语资源（resolveLocales() 合并进 i18n）
editorExtension | 工具（tools）与技能（skills），供 AI Agent 调用；可选 slash 命令
pageTypes | @kn/plugin-api-client:api-doc，把接口文档渲染为一等公民页面
dockPanels | （P2）右侧快捷调试面板，在编辑页内直接发请求
services | 注册 apiClientService，供其他插件复用发送能力（P2）

### 3.3 注册位置

1. apps/vite/src/bundled-plugins.ts：加入 apiClient（开发态与公开分享的完整插件集）。
2. apps/desktop/src/renderer/src/main.tsx：加入 plugins 数组。
3. 生产环境可作为远端市场插件加载（PluginManager.installPlugin），无需改宿主。

### 3.4 构建

- packages/plugin-api-client/rollup.config.js 使用 @kn/rollup-config 的 baseConfig。
- 产物：UMD dist/index.js，通过 window.__KN__.definePlugin 注册，携带 @kn/plugin-api 的 apiVersion。
- 外部化：react、react-dom、@kn/common、@kn/ui、@kn/icon、@kn/editor、@kn/core。
- 契约版本：与 packages/plugin-api/package.json 的 MAJOR 保持一致，破坏性变更时同步 bump。

---

## 4. 目录结构

~~~text
packages/plugin-api-client/
├── package.json
├── rollup.config.js
├── tsconfig.json
└── src/
    ├── index.tsx                        # KPlugin 入口：routes/menus/settings/locales/pageTypes/editorExtension
    ├── pages/
    │   ├── ApiClientPage.tsx            # 工作台壳层（三栏 / 响应式降级）
    │   └── ApiDocPage.tsx               # pageType: 接口文档页渲染器
    ├── components/
    │   ├── collections/
    │   │   ├── CollectionTree.tsx        # 集合树 + 拖拽排序 + 右键菜单
    │   │   ├── CollectionToolbar.tsx
    │   │   └── SaveRequestDialog.tsx
    │   ├── request/
    │   │   ├── RequestBar.tsx            # Method + URL + Send
    │   │   ├── RequestTabs.tsx
    │   │   ├── ParamsTable.tsx
    │   │   ├── HeadersTable.tsx
    │   │   ├── AuthEditor.tsx
    │   │   ├── BodyEditor.tsx            # none/form-data/urlencoded/raw/graphql/binary
    │   │   └── GraphQLBodyEditor.tsx
    │   ├── response/
    │   │   ├── ResponseViewer.tsx
    │   │   ├── ResponseBody.tsx          # pretty / raw / preview / 二进制下载
    │   │   ├── ResponseHeaders.tsx
    │   │   ├── ResponseCookies.tsx
    │   │   ├── ResponseTimeline.tsx
    │   │   └── TestResults.tsx
    │   ├── environment/
    │   │   ├── EnvironmentManager.tsx
    │   │   ├── EnvironmentSelector.tsx
    │   │   └── VariableHighlightInput.tsx  # 识别 {{var}} 并高亮/补全
    │   ├── history/
    │   │   └── HistoryPanel.tsx
    │   ├── runner/
    │   │   ├── CollectionRunner.tsx
    │   │   └── RunReport.tsx
    │   ├── import/
    │   │   ├── ImportDialog.tsx
    │   │   └── ExportMenu.tsx
    │   ├── settings/
    │   │   └── ApiClientSettings.tsx      # settings.component
    │   └── shared/
    │       ├── KeyValueTable.tsx
    │       ├── CodeEditor.tsx             # 统一的代码编辑封装（见 6.10）
    │       ├── JsonViewer.tsx
    │       ├── EmptyState.tsx
    │       └── CopyButton.tsx
    ├── core/
    │   ├── types.ts                       # 全部领域类型
    │   ├── defaults.ts
    │   ├── http/
    │   │   ├── transport.ts               # HttpTransport 接口 + 选择策略
    │   │   ├── browser-transport.ts
    │   │   ├── proxy-transport.ts         # Web -> 知识库后端代理
    │   │   ├── desktop-transport.ts       # Electron IPC
    │   │   └── response-normalizer.ts     # 耗时/大小/编码/重定向链
    │   ├── variables.ts                   # {{var}} 解析与优先级合并
    │   ├── auth.ts                        # 认证头生成
    │   ├── cookies.ts                     # Cookie Jar（domain/path/secure 匹配）
    │   ├── scripts/
    │   │   ├── sandbox.ts                 # Web Worker 沙箱宿主
    │   │   ├── sandbox.worker.ts          # 沙箱内 pm.* 运行时
    │   │   ├── pm-api.ts                  # pm 兼容子集类型
    │   │   └── assertions.ts              # 轻量断言
    │   ├── import/
    │   │   ├── curl.ts
    │   │   ├── postman.ts
    │   │   └── openapi.ts
    │   ├── export/
    │   │   ├── curl.ts
    │   │   └── postman.ts
    │   ├── codegen/
    │   │   └── generators.ts              # curl / fetch / axios / python-requests
    │   └── url/
    │       ├── parse.ts                   # query 参数 与 URL 双向转换
    │       └── highlight.ts
    ├── storage/
    │   ├── storage.ts                     # ApiClientStorage 接口
    │   ├── local-storage.ts               # MVP：localStorage（分 key 存储）
    │   ├── plugin-config-storage.ts       # PluginConfigStore / usePluginConfig 适配
    │   └── remote-storage.ts              # P2：后端 kn_api_client_collection
    ├── hooks/
    │   ├── use-collections.ts
    │   ├── use-active-request.ts
    │   ├── use-environments.ts
    │   ├── use-history.ts
    │   ├── use-cookies.ts
    │   └── use-api-client-config.ts
    ├── extension/
    │   ├── index.tsx                      # ExtensionWrapper（tools + skills）
    │   ├── tools/
    │   │   ├── request-tools.ts
    │   │   └── collection-tools.ts
    │   └── skills/
    │       ├── api-debugger-skill.ts
    │       └── api-doc-writer-skill.ts
    └── locales/
        ├── zh.ts
        └── en.ts
~~~

---

## 5. 数据模型

~~~typescript
// ---- 基础 ----
export type HttpMethod =
  | 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'

export interface KeyValue {
  id: string
  key: string
  value: string
  enabled: boolean
  description?: string
  isVariable?: boolean        // 值来自变量引用，UI 只读展示
}

// ---- 认证 ----
export type AuthConfig =
  | { type: 'none' }
  | { type: 'inherit' }                              // 继承集合/文件夹
  | { type: 'bearer'; token: string }
  | { type: 'basic'; username: string; password: string }
  | { type: 'apiKey'; key: string; value: string; in: 'header' | 'query' }
  | { type: 'oauth2'; accessToken: string; tokenType?: string }

// ---- 请求体 ----
export type BodyConfig =
  | { type: 'none' }
  | { type: 'raw'; language: 'json' | 'xml' | 'html' | 'text' | 'javascript'; content: string }
  | { type: 'form-data'; fields: (KeyValue & { kind: 'text' | 'file' })[] }
  | { type: 'urlencoded'; fields: KeyValue[] }
  | { type: 'graphql'; query: string; variables: string }
  | { type: 'binary'; fileRef?: string }

// ---- 请求 ----
export interface ApiRequest {
  id: string
  name: string
  method: HttpMethod
  url: string
  params: KeyValue[]
  headers: KeyValue[]
  auth: AuthConfig
  body: BodyConfig
  preRequestScript?: string        // P2
  testScript?: string              // P2
  settings?: RequestRuntimeSettings
  createdAt: number
  updatedAt: number
}

export interface RequestRuntimeSettings {
  timeoutMs?: number
  followRedirects?: boolean
  verifyTls?: boolean
  transport?: 'auto' | 'direct' | 'proxy' | 'desktop'
  maxResponseBytes?: number
}

// ---- 集合 ----
export type CollectionItem = CollectionFolder | ApiRequest

export interface CollectionFolder {
  kind: 'folder'
  id: string
  name: string
  items: CollectionItem[]
  auth?: AuthConfig
  variables?: Variable[]
}

export interface Collection {
  kind: 'collection'
  id: string
  name: string
  description?: string
  items: CollectionItem[]
  auth?: AuthConfig
  variables?: Variable[]
  createdAt: number
  updatedAt: number
}

// ---- 变量与环境 ----
export interface Variable {
  id: string
  key: string
  value: string
  enabled: boolean
  secret?: boolean           // secret 变量在 UI 掩码、导出/日志脱敏
  description?: string
}

export interface Environment {
  id: string
  name: string
  variables: Variable[]
  local?: boolean            // 仅本地，不随导出分享
}

// ---- 响应 ----
export interface ApiResponse {
  status: number
  statusText: string
  headers: Record<string, string>
  bodyText: string                 // 原始文本；二进制时为空
  bodyKind: 'text' | 'json' | 'xml' | 'html' | 'binary'
  bodyBytes: number
  durationMs: number
  transport: 'direct' | 'proxy' | 'desktop'   // 实际使用的通道，便于排障
  redirects: { status: number; location: string }[]
  cookies: StoredCookie[]
  blob?: Blob                      // 二进制响应，不持久化
  parseError?: string              // 如声称 JSON 但格式错误
  receivedAt: number
}

// ---- 历史 ----
export interface HistoryEntry {
  id: string
  requestSnapshot: ApiRequest
  status?: number
  durationMs?: number
  executedAt: number
  environmentName?: string
}

// ---- 持久化根 ----
export interface ApiClientData {
  version: 1
  collections: Collection[]
  environments: Environment[]
  activeEnvironmentId?: string
  globals: Variable[]
  history: HistoryEntry[]
  cookies: StoredCookie[]
  ui: {
    activeCollectionId?: string
    activeRequestId?: string
    sidebarWidth?: number
    responseHeight?: number
  }
}

export interface StoredCookie {
  name: string
  value: string
  domain: string
  path: string
  expiresAt?: number
  httpOnly?: boolean
  secure?: boolean
  sameSite?: 'Strict' | 'Lax' | 'None'
}

export interface ApiClientPluginConfig {
  timeoutMs: number
  followRedirects: boolean
  verifyTls: boolean
  transportPolicy: 'auto' | 'direct' | 'proxy' | 'desktop'
  proxyEndpoint: string        // Web 生产环境必须经后端代理
  historyLimit: number
  maxResponseBytes: number
  telemetryEnabled: boolean
}
~~~

---

## 6. 关键子系统设计

### 6.1 HTTP 传输层（本期最高风险：CORS）

浏览器 fetch 受同源策略约束，无法读取任意第三方接口的响应（除非对方返回 CORS 头）。这是接口调试类插件的核心可行性问题，必须在一期解决。方案是抽象出 HttpTransport，按运行环境选择实现：

~~~typescript
export interface NormalizedRequest {
  method: HttpMethod
  url: string
  headers: Record<string, string>
  body?: BodyInit | string
  timeoutMs: number
  followRedirects: boolean
  verifyTls: boolean
  signal?: AbortSignal
}

export interface HttpTransport {
  readonly id: 'direct' | 'proxy' | 'desktop'
  isAvailable(): boolean          // 该通道在当前运行时是否可用
  send(req: NormalizedRequest): Promise<ApiResponse>
}
~~~

实现一：DirectBrowserTransport

- 直接 fetch，mode 为 cors。
- 适用：同源、允许 CORS 的 API、localhost。
- 失败时返回结构化 CorsBlockedError，UI 明示「浏览器跨域限制」并给出一键改用代理或桌面通道的引导。
- 安全约束：绝不自动附带知识库 JWT（防止把会话令牌泄露给任意第三方域名）。仅当目标 URL 命中知识库 API 基址时才走 authorizedFetch。

实现二：ProxyTransport（Web 生产环境主通道）

- 将完整请求描述 POST 到后端：POST /knowledge-wiki/api-client/proxy。
- 后端执行请求并回传状态、头、Base64 文本体、耗时、重定向链。
- 依赖后端契约（见第 7 节）。
- 服务端需做 SSRF 防护（禁止私网、环回、云元数据地址，协议白名单，响应体与时长上限）。

实现三：DesktopTransport（Electron 主通道）

- 渲染进程通过 preload 暴露的 window.knDesktop.httpRequest(normalizedReq) 调用主进程 IPC。
- 主进程 apps/desktop/src/main/ipc.ts 新增 api-client:request 处理器，用 Node 的 fetch/net 发起，天然不受 CORS 限制。
- 需在 apps/desktop/src/preload/index.ts 暴露接口，并在 preload/index.d.ts 补类型。
- 现有 setupCorsBypass 是针对云 API 的白名单式放行，不能用于任意第三方域名，不要复用其过滤器。

通道选择策略：

~~~text
用户显式指定 transport（请求级 settings）
  -> 优先使用
否则按运行环境：
  桌面端  -> desktop（若 IPC 可用）-> direct
  Web 端  -> direct（同源/CORS 已知可用）-> proxy（若后端代理可用）
自动模式下的降级：direct 命中 CorsBlockedError / 网络错误 -> 提示并自动改走 proxy/desktop
~~~

统一能力探测：启动时探测后端代理是否可用（轻量探针或配置标记），结果缓存在插件状态中。

其他传输细节：

- 超时与取消：AbortController；Web 端代理通道由后端强制超时。
- 重定向：跟随或手动，记录重定向链。
- 大响应：超过 maxResponseBytes 截断并标记；二进制以 Blob 下载，不写入持久化。
- 编码：按 Content-Type charset 解码，避免中文乱码。
- 代理通道对 form-data 文件字段：一期限制为纯文本字段，文件上传标记为 P2。

### 6.2 变量与环境

- 语法：双花括号变量，如 {{baseUrl}}。
- 解析优先级（后者覆盖前者）：global < collection < environment < local < request-level / 脚本注入。
- 未解析变量保留原文并以警告色标记，发送前可「一键生成缺失变量」。
- secret 变量：UI 掩码、导出时替换为变量占位、日志与 AI 上下文中脱敏。
- VariableHighlightInput 基于 url/highlight.ts 高亮变量并提供补全下拉。
- 环境切换仅替换变量层，不改变集合。

### 6.3 认证与 Cookie

- 认证继承：请求 inherit -> 文件夹 -> 集合 -> 无。
- 生成的认证头在发送前注入，不在 Headers 表中重复展示（只读合成行）。
- Cookie Jar 按 domain/path/secure/expires 匹配；Set-Cookie 解析后入库；请求时按匹配规则附加 Cookie 头。
- Electron 下可选复用 session cookies（P2）；一期用插件自管 jar，保证 Web 与桌面行为一致。

### 6.4 脚本与测试沙箱（P2，但架构预留）

- 运行在 Web Worker：无 DOM、无宿主闭包、通过 postMessage 与宿主通信。
- 提供 pm 兼容子集：pm.request、pm.response、pm.environment、pm.globals、pm.variables、pm.test(name, fn)、pm.expect。
- 网络与存储访问全部禁用，只允许通过受控桥接读写变量。
- 强制超时（默认 5s），超时终止 Worker，死循环不阻塞宿主。
- 断言库为轻量自研，不引入 chai 全量包以控制体积。
- 不执行 eval；脚本经 new Function 在 Worker 作用域内构造，且不注入 window。

### 6.5 存储与持久化

~~~typescript
export interface ApiClientStorage {
  load(): Promise<ApiClientData | null>
  save(data: ApiClientData): Promise<void>
  loadCollection?(id: string): Promise<Collection | null>
  saveCollection?(collection: Collection): Promise<void>
  removeCollection?(id: string): Promise<void>
}
~~~

- P0 默认 LocalStorageAdapter。为避免单 key 过大，按分片 key 存储：api-client:meta、api-client:collection:<id>、api-client:history（滚动裁剪）、api-client:cookies。
- 可选 PluginConfigStoreAdapter，复用宿主 Hybrid（API + localStorage）持久化，使设置与环境变量跨设备同步（集合体积大，不建议整包放 plugin-config）。
  - 仅同步 ApiClientPluginConfig 与 environments/globals（体积可控），通过 usePluginConfig 获得脏检查、防抖自动保存、错误提示。
- P2 RemoteStorageAdapter，对接后端集合表（见 7.2），支持云端与协作。
- 历史默认上限 200 条（可配置），LRU 裁剪；仅存请求快照，不存响应体。
- 迁移：version 字段 + 顺序迁移函数，保证后续模型升级不丢数据。

### 6.6 导入 / 导出 / 代码生成

能力 | 方向 | 说明
---|---|---
cURL | 双向 | P1 导入；代码生成导出
Postman Collection v2.1 | 双向 | P2，包含环境导出
OpenAPI 3 (JSON/YAML) | 导入 | P2，生成集合 + 路径/参数补全
HAR | 导入 | P2（可选）
fetch / axios / Python requests | 导出 | P1 代码片段

- 导入在 Web Worker 或纯函数中执行，大文件解析不阻塞 UI。
- 导入前展示差异预览（新增/覆盖），支持「导入到新集合 / 合并到现有集合」。

### 6.7 集合运行器（P1）

- 顺序执行集合内所有启用请求，支持环境选择、迭代次数、请求间隔。
- 每个请求可附带断言（P1 内置断言：状态码、响应时间、JSONPath 存在性；P2 支持测试脚本）。
- 生成运行报告：通过/失败/跳过计数、耗时分布、失败详情，可导出 Markdown 并沉淀为知识库页面。
- 支持取消与进度事件。

### 6.8 AI 集成（editorExtension）

工具遵循 ExtensionWrapper.tools 契约（execute(editor) => (params) => any）：

工具名 | 说明
---|---
api_client_list_collections | 列出集合与请求（脱敏 secret）
api_client_get_request | 读取某请求定义
api_client_create_request | 在指定集合创建请求
api_client_send_request | 发送请求并返回摘要（状态/耗时/截断后的体）
api_client_import_curl | 从 cURL 命令创建请求
api_client_generate_tests | 依据响应生成测试脚本草稿

技能（skills）：

- api-client-debugger：结合响应状态与错误信息给出排查建议。
- api-doc-writer：把集合与响应整理为接口文档并写入知识库页面。

安全约束：secret 变量、Authorization 头、Cookie 值在传给模型前一律脱敏；api_client_send_request 默认走同一传输层与 SSRF 策略，不允许模型指定内网地址。

### 6.9 编辑器与知识库集成

- pageType @kn/plugin-api-client:api-doc（P2）：renderer.type 为 component，用 ApiDocPage 渲染一份导入或保存的接口文档（集合快照 + 示例响应），publicShare 便于分享。
- slash 命令（P2）：在编辑器输入 /api-response 插入当前响应摘要卡片（Tiptap 自定义节点）。
- Dock 面板（P2）：右侧「接口调试」快捷面板，在编辑页内发请求并把响应插入当前文档。
- 沉淀动作：响应查看器提供「保存为页面」，走 spacePageService 创建页面（无 space 上下文时降级为下载 Markdown）。

### 6.10 代码编辑器依赖决策

仓库当前没有任何 CodeMirror / Monaco / JSON Editor 依赖（已核查所有 package.json）。这是本插件必须决策的依赖项：

- 方案 A（推荐）：引入 @uiw/react-codemirror + 语言包（json/xml/graphql/javascript）。体积可控、按需动态 import()、与 Tailwind 主题易融合。
- 方案 B：自研基于 textarea + 高亮的轻量编辑器。零依赖、可维护性高，但格式化/折叠/大文件体验弱。
- 方案 C：Monaco。能力最强，但体积与 Worker 配置成本高，不推荐。

一期先用 CodeEditor 封装层隔离实现（textarea 高亮 + JSON 格式化），P2 切换方案 A 不改业务代码。CodeEditor 必须动态加载，避免拖慢插件冷启动。格式化基于内置 JSON.parse/stringify，XML 格式化自研轻量实现。

---

## 7. 后端契约（新增依赖）

### 7.1 代理端点（P1，Web 跨域必需）

~~~http
POST /knowledge-wiki/api-client/proxy
Content-Type: application/json
Authorization: Bearer <kotion-jwt>

{
  "method": "GET",
  "url": "https://api.example.com/v1/users?page=1",
  "headers": { "Accept": "application/json" },
  "body": { "kind": "raw", "content": "{\"a\":1}" },
  "timeoutMs": 30000,
  "followRedirects": true,
  "verifyTls": true
}
~~~

响应：

~~~json
{
  "code": 200,
  "message": "success",
  "data": {
    "status": 200,
    "statusText": "OK",
    "headers": { "content-type": "application/json" },
    "bodyBase64": "eyJvayI6dHJ1ZX0=",
    "bodyBytes": 12,
    "durationMs": 143,
    "redirects": []
  }
}
~~~

安全要求（评审必查）：

1. 协议白名单：仅 http/https。
2. SSRF 防护：解析目标 IP，拒绝环回、私网（RFC1918/4193）、链路本地、云元数据（169.254.169.254）等；DNS 重绑定需在连接时二次校验。
3. 限额：请求体、响应体、总时长、并发数上限；禁止 chunked 无限流。
4. 不落盘请求/响应体，不写入访问日志的敏感头（Authorization、Cookie、Set-Cookie）。
5. 鉴权：必须登录用户；按用户限流。
6. 明确禁止通过代理访问网关自身内部接口。

### 7.2 集合同步表（P2，可选）

~~~sql
CREATE TABLE kn_api_client_collection (
  id BIGINT NOT NULL AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  collection_id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  content JSON NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_user_collection (user_id, collection_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='API 调试集合';
~~~

对应 APIS 常量：GET/POST /knowledge-wiki/api-client/collections、DELETE .../:id。在 packages/common/src/api/index.ts 的 APIS 中登记（该文件属于宿主兼容面，新增端点需评审）。

### 7.3 Electron IPC 契约（P1）

通道 | 说明
---|---
api-client:request | 主进程执行 HTTP，返回与代理端点同构的结果
api-client:cancel | 取消进行中的请求（按 requestId）

---

## 8. UI / UX 与响应式

### 8.1 布局（桌面）

~~~text
+-----------+-----------------------------------------------+
| 集合树     |  RequestBar: [Method] [URL........] [Send]    |
| + 环境选择 |  Tabs: Params | Headers | Auth | Body | ...   |
| + 历史     +-----------------------------------------------+
|           |  Response: 200 OK - 143ms - 12KB               |
|           |  Tabs: Body | Headers | Cookies | Timeline     |
+-----------+-----------------------------------------------+
~~~

### 8.2 响应式（遵循 docs/RESPONSIVE.md 三层体系）

设备 | 布局
---|---
desktop >=1024 | 三栏（集合树 / 请求 / 响应纵向分区）
tablet 768-1023 | 集合树可折叠；请求与响应上下分区
mobile <768 | 单栏 + 分段控件切换「集合 / 请求 / 响应」；集合树用抽屉

- 结构性差异使用 useResponsive() 或 DeviceSwitch，不做散写媒体查询。
- 触摸目标 >=44px；固定贴边元素使用 pb-safe / pt-safe。

### 8.3 交互细节

- 快捷键：Cmd/Ctrl+Enter 发送、Cmd/Ctrl+S 保存到集合、Cmd/Ctrl+K 命令面板。
- URL 输入实时解析 query 并同步 Params 表（双向）。
- 未保存请求显示 dirty 标记；关闭前确认。
- 空状态提供「导入 cURL」「新建请求」「加载示例集合」入口。
- 错误分级：跨域（可切换通道）、超时、DNS、TLS、HTTP 业务错误，分别给出可操作建议。

---

## 9. 里程碑与任务拆分

### M0 - 骨架（0.5 周）

- [ ] packages/plugin-api-client 包初始化（package.json、rollup.config.js、tsconfig.json）。
- [ ] KPlugin 入口，注册 routes/menus/locales/settings。
- [ ] 注册进 apps/vite/src/bundled-plugins.ts 与桌面 main.tsx。
- [ ] 空工作台页面 + 三栏布局 + 响应式降级。
- 验收：菜单出现、路由可访问、中英切换生效、构建通过。

### M1 - 核心收发（1.5 周）

- [ ] 数据模型 + LocalStorageAdapter + use-collections / use-active-request。
- [ ] 集合树 CRUD、请求 CRUD、拖拽排序。
- [ ] RequestBar + Params/Headers/Body 表。
- [ ] DirectBrowserTransport + 响应查看器（状态/耗时/大小/Body/Headers）。
- [ ] 环境管理 + 变量解析 + 高亮输入。
- 验收：对允许 CORS 的 API 完成「建集合 -> 建请求 -> 发送 -> 查看 -> 保存」，刷新后数据仍在。

### M2 - 跨域与桌面（1 周）

- [ ] 后端代理端点 + SSRF 防护 + 限额。
- [ ] ProxyTransport 与通道选择策略。
- [ ] Electron IPC api-client:request + preload 暴露 + DesktopTransport。
- [ ] 跨域错误引导 UI。
- 验收：Web 与桌面都能调试不允许 CORS 的第三方接口；私网地址被代理拒绝。

### M3 - 效率能力（1.5 周）

- [ ] 历史记录 + 搜索 + 重放。
- [ ] 认证（Bearer/Basic/API Key）+ Cookie Jar。
- [ ] cURL 导入、代码片段生成。
- [ ] 集合运行器（内置断言）+ 运行报告。
- [ ] ApiClientSettings 设置面板。
- 验收：从一段 cURL 导入即可发送；运行器输出通过/失败报告。

### M4 - 深度集成（2 周，P2）

- [ ] 脚本/测试沙箱（Web Worker）。
- [ ] Postman v2.1 导入导出、OpenAPI 3 导入。
- [ ] pageType 接口文档页、slash 响应卡片、Dock 面板。
- [ ] AI 工具与技能。
- [ ] GraphQL 支持。
- 验收：AI 能用自然语言创建并发送请求；集合可导出为 Postman 格式并在原工具中打开。

---

## 10. 风险与权衡

风险 | 影响 | 缓解
---|---|---
浏览器 CORS 导致无法调试任意接口 | 核心功能不可用 | 双通道（后端代理 + Electron IPC），Direct 仅作同源/CORS 可用场景；一期必须完成后端代理
后端代理 SSRF | 安全漏洞 | 协议白名单 + 私网/元数据阻断 + 连接时二次校验 + 限额 + 不落盘
大响应 / 二进制打爆内存 | 页面崩溃 | maxResponseBytes 截断、二进制走 Blob 下载、不持久化响应体
脚本沙箱逃逸 | XSS/越权 | Web Worker + 无 DOM + 禁网 + 超时终止 + 不执行 eval
secret 泄露（AI/日志/导出） | 凭据泄露 | 全链路脱敏；secret 标记；导出用变量占位
仓库无代码编辑器依赖 | 体验/体积取舍 | CodeEditor 抽象 + 动态加载；一期轻实现，二期按需引入 CodeMirror
集合体积增长 | localStorage 超限 | 分片 key + 历史裁剪 + 预留 RemoteStorageAdapter
插件包体积过大 | 冷启动变慢 | 路由级 React.lazy 分包、代码编辑器/导入解析器动态 import()
新增后端依赖排期 | 阻塞 M2 | 桌面端 IPC 可先行，Web 端 M1 对 CORS 友好接口先可用

---

## 11. 测试策略

- 纯逻辑单测（沿用仓库 .check.ts 约定，Node 直接跑）：
  - variables.ts 优先级与变量替换边界。
  - url/parse.ts query 与表双向转换。
  - cookies.ts domain/path/secure 匹配。
  - cURL / Postman / OpenAPI 导入解析器（含异常输入）。
  - 代码生成快照。
- 传输层测试：以 mock fetch 验证 Direct/Proxy/Desktop 的请求归一化与响应归一化；CORS 错误识别。
- 沙箱测试：超时终止、无网络访问、断言结果收集。
- 组件测试：集合树 CRUD、KeyValueTable 增删改、响应查看器渲染分支。
- 端到端手测清单：见各里程碑验收。
- 安全专项：代理 SSRF 用例集（私网/环回/元数据/重定向到内网）、secret 不进入日志与 AI 上下文。

---

## 12. 开放问题（需评审确认）

1. 后端代理是否在本期排期？若否，Web 端一期只能支持 CORS 友好接口（能力受限）。
2. 集合存储归属：一期只用 localStorage，还是直接上 PluginConfigStore？后者有跨设备同步但单 JSON 体积受限。
3. 是否允许引入 CodeMirror（新增依赖需走仓库依赖评审）？
4. 是否复用宿主 Cookie / Electron Session，还是完全自管 jar？
5. 接口文档页面的命名空间与权限：@kn/plugin-api-client:api-doc 是否开放 publicShare？
6. AI 发送请求的边界：是否允许模型自动向外部 URL 发请求（默认应需用户确认）。
