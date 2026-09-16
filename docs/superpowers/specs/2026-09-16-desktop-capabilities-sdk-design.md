# 桌面端能力开放给插件的 SDK 设计规范

> 状态：设计稿（待评审）
> 日期：2026-09-16
> 目标：为插件提供稳定、类型化、可授权、Web 可降级的桌面（Electron）能力 SDK
> 关联：docs/PACKAGE_BOUNDARIES.md、packages/plugin-api、packages/common/src/core/types.ts、docs/superpowers/specs/2026-09-16-api-client-plugin-design.md

---

## 1. 背景

Electron 桌面端已经跑通（见 apps/desktop）。宿主具备插件在 Web 端拿不到的原生能力：

- 主进程网络请求（不受 CORS 限制）
- 文件系统读写、原生文件/目录选择对话框
- 打开外部程序、系统通知、剪贴板、窗口控制（全屏/交通灯）
- 系统信息与应用路径

这些能力正是「混合开发」的基础。典型例子是之前规划的 Postman 类接口调试插件（@kn/plugin-api-client）：它需要主进程发 HTTP 才能调试任意第三方接口。

但目前**桌面能力没有以 SDK 的形式开放给插件**。

## 2. 现状（已核实）

### 2.1 插件的宿主接入方式

- packages/common/src/core/ServiceRegistry.ts：带归属（core / plugin）的服务注册表，对外只读（ServiceRegistryView）。
- packages/common/src/hooks/use-service.ts：插件用 useService / useOptionalService 取服务。
- packages/common/src/services/service-resolver.ts：非 React 代码用 resolveService / resolveOptionalService。
- packages/core/src/App.tsx：
  ~~~ts
  coreServices: { spacePageService, uploadTaskService }
  ~~~
  宿主注册 core service 的地方。插件侧示例：plugin-file-manager 注册 fileService。
- packages/plugin-api/src/index.ts：契约包，PLUGIN_API_VERSION + 类型再导出（依赖方向 plugin-api -> common，仅类型）。
- packages/common/src/core/global-namespace.ts：window.__KN__ 冻结命名空间（React/ui/common/core/icon/editor + env + definePlugin/getPlugin）。

### 2.2 桌面 preload 实际暴露了什么

apps/desktop/src/preload/index.ts 目前暴露两个全局：

~~~ts
contextBridge.exposeInMainWorld('electron', electronAPI)   // @electron-toolkit/preload，含 ipcRenderer
contextBridge.exposeInMainWorld('api', {
  ping: () => ipcRenderer.send('ping'),
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  send: (channel, ...args) => ipcRenderer.send(channel, ...args),
  on: (channel, cb) => ipcRenderer.on(channel, ...),
})
~~~

也就是说，**任何同上下文脚本（包括每个插件 UMD bundle）都能调用任意 IPC channel**。主进程当前已注册的 handler 包括：

系统 system:getAppInfo / system:getPaths
对话框 dialog:openFile / dialog:openFolder / dialog:saveFile / dialog:showMessage
文件 fs:readFile / fs:writeFile / fs:exists / fs:mkdir / fs:remove / fs:readdir / fs:stat / fs:copy / fs:move

这构成一个**未受控的裸 IPC 面**：插件可以不受限地写任意路径文件，也没有能力声明与授权。

### 2.3 边界检查现状

scripts/check-package-boundaries.mjs 目前只禁止：

- packages/common/src 导入 @kn/core
- packages/plugin-* 导入 @kn/core

**没有**禁止插件导入 electron，也没有禁止使用 window.api / window.electron。

## 3. 差距总结

| 差距 | 影响 |
|---|---|
| 无类型化桌面 SDK | 插件只能各自摸 window.api，契约漂移、无文档 |
| 无能力声明/授权 | 插件能做任意 IPC，越权不可控 |
| 裸 ipcRenderer 暴露 | 远程插件包（同上下文）可读写文件、弹窗、发任意请求 |
| 无 Web 降级约定 | 同一份插件代码在 Web 端行为不可预期 |
| 桌面契约无版本号 | 与 PLUGIN_API_VERSION 脱钩，无法演进 |
| 边界检查缺失 | 约定无法自动约束，靠人盯 |

## 4. 设计原则

1. **暴露能力（capability），而不是 channel。** 插件申请「http.request」，而不是自己拼 IPC channel 名。
2. **服务化。** 桌面能力实现为宿主的 core service：desktop。插件通过 useService('desktop') 使用，与 fileService / uploadTaskService 完全同一机制。
3. **契约放 common，再导出到 plugin-api。** 类型按 PACKAGE_BOUNDARIES 由 @kn/common 拥有；@kn/plugin-api 只做类型再导出，保持 plugin-api -> common 单向依赖。
4. **Web 优雅降级。** Web 端不注册 desktop service；插件用 useOptionalService('desktop')，能力不可用时给出明确原因。
5. **最小暴露。** preload 不再暴露裸 ipcRenderer；只暴露固定方法名的窄桥，参数在 preload 与主进程双层校验。
6. **独立版本号。** 桌面桥契约有自己的版本，与 PLUGIN_API_VERSION 解耦，便于单独演进。

## 5. 分层架构

~~~text
插件 (只依赖 @kn/plugin-api / @kn/common 类型)
   |  useService('desktop') / resolveService('desktop')
   v
@kn/common  Services.desktop 契约 (types + desktop-bridge.ts)
   ^  core service 注册
@kn/core    DesktopBridge 渲染进程实现
   |  window.knDesktop.invoke(capability, params)    ← 窄桥，方法名枚举
apps/desktop/preload  contextBridge（方法白名单 + 参数校验）
   |  ipcRenderer.invoke('desktop:<capability>', params)
apps/desktop/main     ipcMain.handle('desktop:<方法>')（能力校验 + 路径/URL 校验 + 限额）
~~~

关键变化：把「任意 channel 的 invoke」替换为「能力枚举 + 白名单 handler」。

## 6. 契约设计

### 6.1 文件与依赖方向

- 新增 packages/common/src/core/desktop-bridge.ts：契约的唯一声明处。
- packages/common/src/core/types.ts：Services 增加 desktop?: DesktopBridge。
- packages/common/src/index.ts：export * from './core/desktop-bridge'。
- packages/plugin-api/src/index.ts：再导出 DesktopBridge 等类型 + DESKTOP_BRIDGE_VERSION。
- packages/core/src/desktop/bridge.ts：渲染进程实现。
- apps/desktop/src/preload/index.ts + index.d.ts：窄桥。
- apps/desktop/src/main/ipc.ts（或新文件 desktop-ipc.ts）：方法 handler。

### 6.2 能力枚举与类型映射

~~~ts
export const DESKTOP_BRIDGE_VERSION = '1.0.0'

export type DesktopPlatform = 'darwin' | 'win32' | 'linux'

export type DesktopCapability =
  | 'system.info' | 'system.paths'
  | 'http.request'
  | 'dialog.openFile' | 'dialog.openFolder' | 'dialog.saveFile' | 'dialog.message'
  | 'fs.readFile' | 'fs.writeFile' | 'fs.readdir' | 'fs.stat'
  | 'fs.mkdir' | 'fs.remove' | 'fs.copy' | 'fs.move'
  | 'shell.openExternal'
  | 'clipboard.readText' | 'clipboard.writeText'
  | 'notification.show'
  | 'window.setFullScreen' | 'window.isFullScreen'

export interface DesktopCapabilityContract {
  'system.info': { params: void; result: DesktopAppInfo }
  'system.paths': { params: void; result: DesktopPaths }
  'http.request': { params: DesktopHttpRequest; result: DesktopHttpResponse }
  'dialog.openFile': { params: DesktopOpenFileOptions; result: string[] }
  'dialog.saveFile': { params: DesktopSaveFileOptions; result: string | null }
  'dialog.message': { params: DesktopMessageOptions; result: { response: number } }
  'fs.readFile': { params: { path: string; encoding?: 'utf8' | 'base64' }; result: string }
  'fs.writeFile': { params: { path: string; data: string; encoding?: 'utf8' | 'base64' }; result: void }
  // ...其余同理
  'shell.openExternal': { params: { url: string }; result: void }
  'clipboard.readText': { params: void; result: string }
  'clipboard.writeText': { params: { text: string }; result: void }
  'notification.show': { params: { title: string; body?: string }; result: void }
  'window.setFullScreen': { params: { value: boolean }; result: void }
  'window.isFullScreen': { params: void; result: boolean }
}

export interface DesktopBridge {
  /** 桌面桥契约版本（MAJOR 变更 = 不兼容）。 */
  readonly version: string
  readonly platform: DesktopPlatform
  readonly capabilities: readonly DesktopCapability[]
  has(capability: DesktopCapability): boolean
  invoke<C extends DesktopCapability>(
    capability: C,
    params: DesktopCapabilityContract[C]['params'],
  ): Promise<DesktopCapabilityContract[C]['result']>
  /** 全屏状态订阅（返回取消订阅函数）。 */
  onFullScreenChange(listener: (isFullScreen: boolean) => void): () => void
}
~~~

### 6.3 Services 扩展

~~~ts
// packages/common/src/core/types.ts
export interface Services {
  fileService?: FileService
  uploadTaskService?: UploadTaskService
  aiFoundation?: AIFoundation
  spacePageService?: SpacePageService
  /** 桌面（Electron）能力桥；Web 端不存在。 */
  desktop?: DesktopBridge
}
~~~

### 6.4 便捷 hook（@kn/common）

~~~ts
export const useDesktop = (): DesktopBridge | undefined => useOptionalService('desktop')
~~~

插件写法：

~~~tsx
const desktop = useDesktop()
if (!desktop?.has('http.request')) {
  return <Notice>当前环境不支持主进程请求</Notice>
}
const res = await desktop.invoke('http.request', { method: 'GET', url, headers: {} })
~~~

## 7. 传输层与安全

### 7.1 preload：从裸 IPC 到窄桥

新增暴露（保留 process/platform 等无能力信息）：

~~~ts
contextBridge.exposeInMainWorld('knDesktop', {
  version: DESKTOP_BRIDGE_VERSION,
  platform: process.platform,
  capabilities: ALLOWED_CAPABILITIES,
  invoke: (capability: string, params: unknown) => {
    if (!ALLOWED_CAPABILITIES.includes(capability)) {
      return Promise.reject(new Error('Unknown or unauthorized desktop capability: ' + capability))
    }
    return ipcRenderer.invoke('desktop:' + capability, params)
  },
})
~~~

同时：

- **不再暴露** @electron-toolkit/preload 的 electronAPI（它含 ipcRenderer）。
- **直接移除** window.api 的通用 invoke/send/on 与 window.electron（已决策：不留 deprecated 过渡期）。
- 宿主内部通道改走同一窄桥的专用能力：全屏事件为 desktop:event:fullscreen；交通灯为 window.setTrafficLights。

### 7.2 主进程：方法 handler + 校验

每个能力一个 handler，统一包装：

~~~ts
ipcMain.handle('desktop:fs.readFile', withCapability('fs.readFile', async (_e, params) => {
  const filePath = assertPathWithinRoots(params?.path)   // 规范化 + 防目录穿越
  return fs.readFile(filePath, params?.encoding === 'base64' ? undefined : 'utf8')
}))
~~~

校验要点：

- **能力白名单**：非枚举方法直接拒绝。
- **参数 schema 校验**：类型/长度/必填。
- **路径安全**（fs.*、dialog 返回值）：解析真实路径，限制在授权根目录内，拒绝 .. 穿越。
- **URL 安全**：shell.openExternal 只允许 http/https；http.request 禁私网/环回/云元数据（SSRF）。
- **限额**：请求/响应体大小、超时、并发。
- **凭据隔离**：http.request 绝不自动附带知识库 JWT（避免泄露到任意第三方）。

### 7.3 能力授权模型

**已定决策：平台只允许可信插件。** 因此不引入沙箱隔离，也不做按插件的能力授权——能力是**窗口级**的，插件可信，SDK 的价值在于「契约 + 类型 + 主进程边界校验」，而不是权限隔离。

据此：

- 能力清单由宿主维护，能力存在性用于**环境探测**（桌面 vs Web），不是权限门。
- 安全边界由主进程 handler 承担：参数校验、fs 根目录白名单、URL/SSRF 校验、限额。
- 若将来开放第三方插件市场，再评估沙箱隔离（见后续 D4，本阶段不做）。

插件 manifest 扩展（后端 DTO 需要同步）：

~~~ts
export interface RemotePluginDescriptor {
  // ...现有字段
  capabilities?: DesktopCapability[]
}
~~~

### 7.4 边界检查加规则

scripts/check-package-boundaries.mjs 增加：

- packages/plugin-* 不得导入 electron / electron/*
- packages/plugin-* 源码不得出现 window.electron / ipcRenderer / window.api
- 只允许通过 @kn/common 的服务接口访问桌面能力

## 8. 能力清单（Phase 1 建议范围）

| 能力 | 方法 | Web 端 | 备注 |
|---|---|---|---|
| 系统信息 | system.info / system.paths | 不支持 | 只读 |
| 主进程 HTTP | http.request | 不支持 | Postman 插件核心依赖；SSRF/限额/JWT 隔离 |
| 文件对话框 | dialog.openFile/openFolder/saveFile/message | 用 input 元素降级或禁用 | 返回路径需授权 |
| 文件读写 | fs.* | 用 File System Access API 降级 | 受授权根目录限制 |
| 打开外链 | shell.openExternal | window.open | 仅 http/https |
| 剪贴板 | clipboard.readText/writeText | navigator.clipboard | 权限提示 |
| 系统通知 | notification.show | Notification API | |
| 窗口控制 | window.setFullScreen/isFullScreen | 不支持 | 交通灯/全屏已有实现 |

## 9. 版本与兼容

- DESKTOP_BRIDGE_VERSION 放在 @kn/plugin-api，宿主实现通过 desktop.version 上报。
- 插件启动时校验 MAJOR 一致，否则禁用桌面能力并提示升级（与 PLUGIN_API_VERSION 的握手机制一致）。
- 迁移期：保留 window.api / window.electron，打 deprecation 警告；下一个 MAJOR 移除。
- window.__KN__ 可增加 desktopBridgeVersion 字段，方便 UMD 插件自检。

## 10. Web 降级约定

- Web 端不注册 desktop（useOptionalService 返回 undefined）。
- 插件模板：

~~~tsx
const desktop = useOptionalService('desktop')
const canUseDesktop = desktop?.has('http.request') ?? false
~~~

- 同一份插件代码在 Web 端应能编译、能降级，而不是崩溃。

## 11. 里程碑

### D0 — 契约与骨架（0.5 周）
- [ ] desktop-bridge.ts 契约 + Services.desktop + plugin-api 再导出
- [ ] @kn/core 实现 createDesktopBridge()，仅支持 system.info / system.paths
- [ ] App.tsx coreServices 注册 desktop（仅桌面）
- [ ] useDesktop() 便捷 hook

### D1 — 收口裸 IPC（0.5 周）
- [ ] preload 暴露 knDesktop 窄桥，移除 electronAPI/通用 invoke
- [ ] 主进程迁移 system/dialog/window 到 desktop:* handler
- [ ] 边界检查新增 electron / window.api 规则
- 验收：插件无法直接 ipcRenderer；宿主功能不回退

### D2 — 核心能力（1 周）
- [ ] fs.*（授权根目录 + 路径校验）
- [ ] http.request（SSRF + 限额 + 不注入 JWT）
- [ ] shell / clipboard / notification
- [ ] 文档 + 一个示例插件

### D3 — 授权与审计（0.5 周）
- [ ] RemotePluginDescriptor.capabilities + 安装时授权提示
- [ ] 能力调用审计日志（脱敏）

### D4 — 隔离（本阶段不做）
- 决策：平台只允许可信插件，不做沙箱隔离与按插件授权。
- 若未来开放第三方不可信插件市场，再启动：插件 bundle 沙箱化（独立 preload/上下文）+ 按 manifest 注入能力子集。

## 12. 风险与开放问题

1. ~~同上下文无法真正隔离~~：已决策只允许可信插件，接受「契约 + 主进程校验」模型，不做沙箱。
2. **能力粒度**：已决策为窗口级。
3. **fs 授权模型**：已决策为「绝对路径 + 根目录白名单」，以保证 macOS / Windows / Linux / 鸿蒙一致；不使用 macOS security-scoped bookmark。白名单默认取 app.getPath 的标准目录，并由原生对话框返回值动态授予。
4. **http.request 的滥用**：SSRF、内网探测、带宽；需要明确限额与可关闭开关。
5. **跨平台**：Windows/Linux 的路径与对话框差异；能力探测要按平台返回。
6. **版本协调**：桌面桥 MAJOR 变更需要与插件市场发布流程配合。

## 13. 验收标准

- 插件在不导入 electron、不触碰 window.api 的前提下，可通过 useService('desktop') 完成：读取系统信息、选择文件、主进程发 HTTP。
- Web 端加载同一插件不报错，能力不可用时有明确降级路径。
- 边界检查在 CI 中拦截违规用法。
- Postman 类插件可基于 http.request + fs + dialog 完成一期功能。
