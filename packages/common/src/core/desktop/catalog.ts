/**
 * Desktop capability catalogue — the machine-readable "what can a plugin use"
 * layer for this host.
 *
 * The contract modules (`./capabilities.ts`, `./contract.ts`, the per-domain
 * files) are authoritative for names and payload types. This catalogue adds the
 * part a type cannot convey: what a capability is *for*, which guard rails it
 * passes through, how it is reached (a typed bridge group or a bare `invoke`),
 * and a copy-pasteable example.
 *
 * It exists because of the agent development loop: a plugin author (usually an
 * agent) should be able to ask "how do I read a file from a plugin?" and get one
 * small, correct answer instead of reading a 2000-line contract file. The studio
 * tools (`listDesktopCapabilities` / `getDesktopCapability`) are the UI over it.
 *
 * Invariants (enforced by `./catalog.check.ts`):
 *   - exactly one entry per `DesktopCapability`, no unknown names;
 *   - bridge methods exist on the typed bridge interface (compile-time, through
 *     `DesktopCapabilityAccess`);
 *   - the preload whitelist and the main-process handlers cover every name.
 *
 * Adding a capability: add it to `./capabilities.ts` + `./contract.ts` + the
 * per-domain types, then add the entry here. The check fails until you do.
 */
import type { DesktopCapability } from './capabilities'
import type { NetBridge } from './net'
import type { BrowserBridge } from './browser'
import type { SecretBridge } from './secrets'
import type { NotificationBridge } from './notifications'
import type { BackgroundBridge } from './background'
import type { TaskBridge } from './tasks'
import type { SshBridge, SshCredentialBridge } from './ssh'
import type { DevBridge } from './dev'
import type { StorageService } from '../../storage/types'

/* ------------------------------------------------------------------ *
 * Groups
 * ------------------------------------------------------------------ */

/** Capability families. One group per domain module under `./`. */
export type DesktopCapabilityGroup =
    | 'app'
    | 'system'
    | 'window'
    | 'dialog'
    | 'fs'
    | 'capture'
    | 'http'
    | 'net'
    | 'shell'
    | 'secrets'
    | 'storage'
    | 'notification'
    | 'background'
    | 'task'
    | 'credentials'
    | 'ssh'
    | 'dev'

/**
 * Guard rails a capability passes through. These are not permission checks
 * between plugins (all plugins are trusted code in this shell); they protect
 * the user and the machine, and they are the things an author must design for.
 */
export type DesktopCapabilityGuard =
    /** Outbound access goes through the network policy (SSRF switch). */
    | 'net-policy'
    /** First use of this target/origin in an app run asks the user. */
    | 'user-confirm'
    /** Paths must sit inside the fs allowlist (user dirs + dialog-granted). */
    | 'fs-allowlist'
    /** Needs the OS keychain (Electron safeStorage); may be unavailable. */
    | 'keychain'
    /** Sessions/tasks belong to the calling window only. */
    | 'window-scope'
    /** Shows native UI / needs the user; can be cancelled or refused. */
    | 'user-interaction'
    /** Returns a secret value; do not read it opportunistically. */
    | 'sensitive'
    /** Irreversible (delete/remove). */
    | 'destructive'
    /** Only studio-type tool plugins need it; not part of a normal plugin. */
    | 'developer'

/** What each guard means, for prompts and docs (Chinese: the authoring target). */
export const DESKTOP_CAPABILITY_GUARDS: Record<DesktopCapabilityGuard, string> = {
    'net-policy':
        '出网必须过网络策略（私网/LAN/回环/云元数据地址默认拒绝，受 net.policy.* 开关控制）；被拒绝时调用直接失败。',
    'user-confirm':
        '本次运行内首次连接该主机 / 打开该来源会弹宿主确认窗，用户可能拒绝；拒绝后不要重试到死，要给出可读提示。',
    'fs-allowlist':
        '路径必须落在 fs 白名单（标准用户目录 + 用户用原生对话框授权过的目录），越界会被拒绝。',
    keychain:
        '依赖系统钥匙串（Electron safeStorage）。Linux 无钥匙串守护进程等情况下不可用：先 available() 判断，失败要提示而不是假装成功。',
    'window-scope':
        '会话/定时任务归打开它的窗口所有：另一个窗口既看不到也用不了；窗口关闭时宿主会清理。',
    'user-interaction':
        '会弹原生 UI 或需要用户操作（对话框、截屏遮罩、系统浏览器），可能被取消，返回可以是“没有结果”。',
    sensitive:
        '返回敏感明文（如 storage.secretGet / credentials.load）。只在你确实需要时读，不要顺手读、不要落日志。',
    destructive: '不可逆操作（删除文件/远端文件/整个工程）。执行前先向用户确认。',
    developer: '面向开发台的工具能力（dev.*），只有插件开发台这类工具插件需要；普通插件不要调用。',
}

/** `desktop.<path>` for each typed bridge group, used to render call shapes. */
export const DESKTOP_CAPABILITY_BRIDGE_PATHS = {
    net: 'desktop.net',
    browser: 'desktop.browser',
    secrets: 'desktop.secrets',
    notifications: 'desktop.notifications',
    background: 'desktop.background',
    task: 'desktop.tasks',
    storage: 'desktop.storage',
    ssh: 'desktop.ssh',
    sshCredentials: 'desktop.ssh.credentials',
    dev: 'desktop.dev',
} as const

/* ------------------------------------------------------------------ *
 * Access shape
 * ------------------------------------------------------------------ */

/**
 * How a capability is reached. `invoke` means `desktop.invoke('<name>', params)`;
 * a bridge entry names the typed method that wraps it. Every bridge method name
 * is checked against the real interface, so this table cannot drift.
 */
export type DesktopCapabilityAccess =
    | { readonly via: 'invoke' }
    | { readonly via: 'bridge'; readonly bridge: 'net'; readonly method: keyof NetBridge }
    | { readonly via: 'bridge'; readonly bridge: 'browser'; readonly method: keyof BrowserBridge }
    | { readonly via: 'bridge'; readonly bridge: 'secrets'; readonly method: keyof SecretBridge }
    | { readonly via: 'bridge'; readonly bridge: 'notifications'; readonly method: keyof NotificationBridge }
    | { readonly via: 'bridge'; readonly bridge: 'background'; readonly method: keyof BackgroundBridge }
    | { readonly via: 'bridge'; readonly bridge: 'task'; readonly method: keyof TaskBridge }
    | { readonly via: 'bridge'; readonly bridge: 'storage'; readonly method: keyof StorageService }
    | { readonly via: 'bridge'; readonly bridge: 'ssh'; readonly method: keyof SshBridge }
    | {
          readonly via: 'bridge'
          readonly bridge: 'sshCredentials'
          readonly method: keyof SshCredentialBridge
      }
    | { readonly via: 'bridge'; readonly bridge: 'dev'; readonly method: keyof DevBridge }

/** One catalogue row. */
export interface DesktopCapabilityMeta {
    readonly name: DesktopCapability
    readonly group: DesktopCapabilityGroup
    /** One sentence: what a plugin can do with it. */
    readonly summary: string
    readonly access: DesktopCapabilityAccess
    /** Extra guards on top of the group's (the union is reported). */
    readonly guards?: readonly DesktopCapabilityGuard[]
    /** Copy-pasteable usage, when the call shape is not obvious. */
    readonly example?: string
    /** Boundary or trap worth knowing before writing the call. */
    readonly notes?: string
    /** Non-default availability. `dev.*` only exists on studio-capable builds. */
    readonly availability?: 'desktop' | 'desktop-studio'
}

/** One capability family. */
export interface DesktopCapabilityGroupMeta {
    readonly id: DesktopCapabilityGroup
    readonly title: string
    readonly summary: string
    /** Guards shared by every capability in the group. */
    readonly guards?: readonly DesktopCapabilityGuard[]
    /** Domain module holding this group's params/result declarations. */
    readonly typesAt: string
}

/* ------------------------------------------------------------------ *
 * Group metadata
 * ------------------------------------------------------------------ */

const DESKTOP = 'packages/common/src/core/desktop'

export const DESKTOP_CAPABILITY_GROUPS: readonly DesktopCapabilityGroupMeta[] = [
    {
        id: 'system',
        title: '系统信息',
        summary: '应用名称/版本/平台与标准用户目录；纯只读，不需要授权。',
        typesAt: `${DESKTOP}/system.ts`,
    },
    {
        id: 'app',
        title: '应用生命周期',
        summary: '应用级动作（目前只有退出）。',
        typesAt: `${DESKTOP}/bridge.ts`,
    },
    {
        id: 'window',
        title: '窗口',
        summary: '全屏、macOS 交通灯位置、DevTools 开关。',
        typesAt: `${DESKTOP}/window.ts`,
    },
    {
        id: 'dialog',
        title: '原生对话框',
        summary: '打开/保存文件、消息框。对话框授权过的路径会进入 fs 白名单。',
        guards: ['user-interaction'],
        typesAt: `${DESKTOP}/dialog.ts`,
    },
    {
        id: 'fs',
        title: '本地文件系统',
        summary: '文件与目录的读写、枚举、复制、移动、删除；全部受 fs 白名单限制。',
        guards: ['fs-allowlist'],
        typesAt: `${DESKTOP}/fs.ts`,
    },
    {
        id: 'capture',
        title: '屏幕捕获（截屏 / 屏幕截图）',
        summary: '截屏能力：枚举屏幕/窗口源、让用户框选区域并截图；需要用户参与（会拉遮罩/系统权限）。',
        guards: ['user-interaction'],
        typesAt: `${DESKTOP}/capture.ts`,
    },
    {
        id: 'http',
        title: 'HTTP 请求',
        summary: '宿主代发 HTTP（免 CORS），支持文本与二进制响应；受网络策略保护。',
        guards: ['net-policy'],
        typesAt: `${DESKTOP}/http.ts`,
    },
    {
        id: 'net',
        title: '原始 TCP / TLS',
        summary: '原始字节流：宿主只搬字节，协议由插件实现；过网络策略 + 首次连接确认，会话按窗口隔离。',
        typesAt: `${DESKTOP}/net.ts`,
    },
    {
        id: 'shell',
        title: '系统浏览器与 OAuth 回调',
        summary: '打开系统浏览器，并在 127.0.0.1 回环端口接收 OAuth 授权码。',
        typesAt: `${DESKTOP}/browser.ts`,
    },
    {
        id: 'secrets',
        title: '加密 KV（storage.secret）',
        summary: '插件级加密 KV：落盘只有密文（safeStorage），用于 refresh token 这类凭据。',
        guards: ['keychain'],
        typesAt: `${DESKTOP}/secrets.ts`,
    },
    {
        id: 'storage',
        title: '持久化 KV',
        summary: '透明持久化（桌面 SQLite / Web localStorage）。必须留在自己的 plugin.<pluginKey> 命名空间。',
        typesAt: 'packages/common/src/storage/types.ts',
    },
    {
        id: 'notification',
        title: '系统通知',
        summary: '系统通知与 dock/taskbar 角标，面板关着也能提醒用户。',
        typesAt: `${DESKTOP}/notifications.ts`,
    },
    {
        id: 'background',
        title: '宿主定时器',
        summary: '主进程持有的定时器，插件面板关着也能被唤醒；任务按窗口隔离。',
        guards: ['window-scope'],
        typesAt: `${DESKTOP}/background.ts`,
    },
    {
        id: 'task',
        title: '长任务',
        summary:
            '插件长任务的通用状态：进度、增量日志（seq 游标）、取消与跨刷新保留；宿主不解释任务内容。',
        typesAt: `${DESKTOP}/tasks.ts`,
    },
    {
        id: 'credentials',
        title: '记住登录凭证',
        summary: '宿主自己“记住登录”的凭证（safeStorage 加密）。宿主登录态专用，插件不应读取。',
        guards: ['keychain'],
        typesAt: `${DESKTOP}/credentials.ts`,
    },
    {
        id: 'ssh',
        title: 'SSH',
        summary: '远程执行、文件传输、SFTP、交互终端、端口转发；过网络策略 + 每个主机首次使用用户确认。',
        typesAt: `${DESKTOP}/ssh.ts`,
    },
    {
        id: 'dev',
        title: '插件开发台',
        summary: '构建/热更/工程文件/依赖安装；只有带 studio runtime 的桌面构建暴露，普通插件不要依赖。',
        guards: ['developer'],
        typesAt: `${DESKTOP}/dev.ts`,
    },
]

/* ------------------------------------------------------------------ *
 * The catalogue
 * ------------------------------------------------------------------ */

const DEV = { via: 'invoke' } as const

export const DESKTOP_CAPABILITY_CATALOG = [
    /* ---- system -------------------------------------------------- */
    {
        name: 'system.info',
        group: 'system',
        summary: '应用版本、名称、平台、架构、userData 路径与语言。',
        access: DEV,
        example: "const info = await desktop.invoke('system.info')\n// { version, name, platform, arch, userDataPath, locale }",
    },
    {
        name: 'system.paths',
        group: 'system',
        summary: '标准用户目录（userData/downloads/documents/desktop/temp）的绝对路径。',
        access: DEV,
        example: "const paths = await desktop.invoke('system.paths')\n// 用 paths.userData 作为插件自己的数据根目录",
    },

    /* ---- app ----------------------------------------------------- */
    { name: 'app.quit', group: 'app', summary: '退出整个桌面应用（等同菜单里的退出）。', access: DEV },

    /* ---- window -------------------------------------------------- */
    {
        name: 'window.setFullScreen',
        group: 'window',
        summary: '设置当前窗口全屏状态。',
        access: DEV,
        notes: '全屏变化通过 desktop.onFullScreenChange 订阅，不要自己轮询。',
    },
    { name: 'window.isFullScreen', group: 'window', summary: '读取当前窗口是否全屏。', access: DEV },
    {
        name: 'window.setTrafficLights',
        group: 'window',
        summary: '设置 macOS 红绿灯按钮位置（{ x, y }），用于无边框标题栏。',
        access: DEV,
        notes: '仅 macOS 生效；其它平台是 no-op。',
    },
    { name: 'window.toggleDevTools', group: 'window', summary: '打开/关闭当前窗口的 DevTools。', access: DEV },

    /* ---- dialog -------------------------------------------------- */
    {
        name: 'dialog.openFile',
        group: 'dialog',
        summary: '弹原生“打开文件”对话框；可多选、可带扩展名过滤器。',
        access: DEV,
        notes: '用户选中的路径会被追加进 fs 白名单，之后的 fs.* 才能读写它们。',
        example: "const picked = await desktop.invoke('dialog.openFile', { title: '选择图片', filters: [{ name: 'Images', extensions: ['png', 'jpg'] }], multiSelections: true })\nif (!picked.canceled) { const paths = picked.filePaths }",
    },
    {
        name: 'dialog.openFolder',
        group: 'dialog',
        summary: '弹原生“选择目录”对话框，返回 folderPath（取消时为 null）。',
        access: DEV,
        notes: '选中目录同样进入 fs 白名单。',
    },
    {
        name: 'dialog.saveFile',
        group: 'dialog',
        summary: '弹原生“另存为”对话框，返回用户选定的目标路径。',
        access: DEV,
    },
    {
        name: 'dialog.message',
        group: 'dialog',
        summary: '弹原生消息框（info/error/question/warning），返回被点按钮下标。',
        access: DEV,
        example: "const { response } = await desktop.invoke('dialog.message', { type: 'question', message: '覆盖现有文件？', buttons: ['取消', '覆盖'] })\nif (response === 1) overwrite()",
    },

    /* ---- fs ------------------------------------------------------ */
    {
        name: 'fs.readFile',
        group: 'fs',
        summary: '读文件内容（默认 utf8 文本；二进制传 encoding: "base64"）。',
        access: DEV,
        notes: '结果用 { data } / { error } 内联返回，不抛异常；路径必须在白名单内。',
        example: "const res = await desktop.invoke('fs.readFile', { path, encoding: 'utf8' })\nif (res.error) return showError(res.error)\nconst text = res.data ?? ''",
    },
    {
        name: 'fs.writeFile',
        group: 'fs',
        summary: '写文件（默认 utf8；二进制传 encoding: "base64"）。',
        access: DEV,
        example: "await desktop.invoke('fs.writeFile', { path, data: JSON.stringify(state) })",
    },
    {
        name: 'fs.exists',
        group: 'fs',
        summary: '判断路径是否存在（返回 boolean）。',
        access: DEV,
        notes: '与其它 fs.* 不同：路径越界/非法时直接抛错（不是 { data, error } 信封），需要 try/catch。',
    },
    { name: 'fs.mkdir', group: 'fs', summary: '创建目录（递归）。', access: DEV },
    {
        name: 'fs.remove',
        group: 'fs',
        summary: '删除文件或目录。',
        access: DEV,
        guards: ['destructive'],
        notes: '不可逆；执行前向用户确认。',
    },
    {
        name: 'fs.readdir',
        group: 'fs',
        summary: '列目录项（名称 + isDirectory/isFile），用于自己实现文件浏览。',
        access: DEV,
        example: "const res = await desktop.invoke('fs.readdir', { path })\nconst entries = res.data ?? []",
    },
    {
        name: 'fs.stat',
        group: 'fs',
        summary: '读文件/目录元信息（大小、是否目录、创建/修改时间）。',
        access: DEV,
    },
    { name: 'fs.copy', group: 'fs', summary: '复制文件或目录。', access: DEV },
    { name: 'fs.move', group: 'fs', summary: '移动/重命名文件或目录。', access: DEV },

    /* ---- capture ------------------------------------------------- */
    {
        name: 'capture.sources',
        group: 'capture',
        summary: '枚举可截取的屏幕/窗口源（含缩略图 data URL），供插件选择。',
        access: DEV,
    },
    {
        name: 'capture.selectRegion',
        group: 'capture',
        summary: '拉起宿主全屏遮罩让用户框选区域，返回截图（用户取消时为 null）。',
        access: DEV,
        notes: '遮罩 UI 由宿主绘制，插件只拿到裁剪结果；这是异步的用户交互，别假设一定会回来。',
    },
    {
        name: 'capture.region.context',
        group: 'capture',
        summary: '读取当前区域选择会话的上下文（整屏图 + 尺寸 + 语言），供热区选择 UI 用。',
        access: DEV,
    },
    {
        name: 'capture.region.submit',
        group: 'capture',
        summary: '把用户框选的矩形提交给宿主，由宿主完成裁剪。',
        access: DEV,
    },

    /* ---- http ---------------------------------------------------- */
    {
        name: 'http.request',
        group: 'http',
        summary: '宿主代发 HTTP 请求（免 CORS），支持请求头/文本/二进制 body、重定向与二进制响应。',
        access: DEV,
        notes: '私网/回环/链路本地/云元数据地址默认被拒；响应体只在 bodyText / bodyBase64 之一，按 bodyEncoding 取。',
        example: "const res = await desktop.invoke('http.request', { url, method: 'GET', headers: { Accept: 'application/json' }, timeoutMs: 15000 })\nif (res.status >= 400) throw new Error('HTTP ' + res.status)\nconst json = JSON.parse(res.bodyText)",
    },

    /* ---- net ----------------------------------------------------- */
    {
        name: 'net.policy.get',
        group: 'net',
        summary: '读取当前网络策略（例如 allowPrivateNetwork），判断某类目标是否会被拒。',
        access: DEV,
        notes: '这是宿主的开关，不是插件自己的权限；只读它来给出准确的错误提示。',
        example: "const policy = await desktop.invoke('net.policy.get')\nif (!policy.allowPrivateNetwork) hint('内网地址需要先在设置里放开')",
    },
    {
        name: 'net.policy.set',
        group: 'net',
        summary: '修改网络策略（设置页的开关），会放宽 http/socket/ssh 的可达范围。',
        access: DEV,
        notes: '这是用户可见的安全设置；插件不要擅自替用户打开。',
    },
    {
        name: 'net.socketOpen',
        group: 'net',
        summary: '开一条原始 TCP/TLS 连接，之后双向收发字节（插件自己实现协议）。',
        access: { via: 'bridge', bridge: 'net', method: 'open' },
        guards: ['net-policy', 'user-confirm', 'window-scope'],
        notes: '数据一律 base64；事件走 desktop.net.onEvent，按 sessionId 过滤；同一窗口最多 16 条会话。',
        example: "const session = await desktop.net!.open({ host: 'imap.example.com', port: 993, protocol: 'tls', label: 'imap.example.com:993' })\nconst off = desktop.net!.onEvent((event) => {\n  if (event.sessionId !== session.sessionId) return\n  if (event.type === 'socket-data') handleBytes(base64ToBytes(event.dataBase64))\n})\nawait desktop.net!.write({ sessionId: session.sessionId, dataBase64: bytesToBase64(frame) })",
    },
    {
        name: 'net.socketWrite',
        group: 'net',
        summary: '向一条 socket 会话写入 base64 字节（单次 ≤1 MiB）。',
        access: { via: 'bridge', bridge: 'net', method: 'write' },
        guards: ['window-scope'],
        notes: '不做整流控：主进程按到达顺序转发，协议层要自己限速。',
    },
    {
        name: 'net.socketClose',
        group: 'net',
        summary: '关闭一条 socket 会话，可带最后一段数据（graceful）。',
        access: { via: 'bridge', bridge: 'net', method: 'close' },
        guards: ['window-scope'],
    },
    {
        name: 'net.socketSessions',
        group: 'net',
        summary: '列出当前窗口打开的 socket 会话（其它窗口的看不到）。',
        access: { via: 'bridge', bridge: 'net', method: 'sessions' },
        guards: ['window-scope'],
    },

    /* ---- shell --------------------------------------------------- */
    {
        name: 'shell.browserOpen',
        group: 'shell',
        summary: '在系统默认浏览器里打开一个 http(s) URL。',
        access: { via: 'bridge', bridge: 'browser', method: 'open' },
        guards: ['user-interaction', 'user-confirm'],
        notes: '只允许 http/https（file: 与自定义 scheme 一律拒绝）；每个 origin 本次运行首次打开会确认。',
    },
    {
        name: 'shell.oauthStart',
        group: 'shell',
        summary: '在 127.0.0.1 起一个临时回环监听，返回 redirect_uri 供拼授权 URL。',
        access: { via: 'bridge', bridge: 'browser', method: 'startOAuth' },
        notes: '只监听回环、只服务一个 callbackPath；并发上限 4 个。',
    },
    {
        name: 'shell.oauthWait',
        group: 'shell',
        summary: '等这次 OAuth 回环回调，拿到 path+query（code/state 等）。',
        access: { via: 'bridge', bridge: 'browser', method: 'waitForOAuth' },
        notes: '宿主只交给插件 path + query（没有 body）；state/PKCE 校验是插件的责任。超时/取消会带 timedOut/cancelled 返回，不悬挂。',
    },
    {
        name: 'shell.oauthSessions',
        group: 'shell',
        summary: '列出本窗口还活着的 OAuth 监听会话。',
        access: { via: 'bridge', bridge: 'browser', method: 'oauthSessions' },
    },
    {
        name: 'shell.oauthCancel',
        group: 'shell',
        summary: '取消一个 OAuth 监听会话（另一端的 waitForOAuth 会拿到 cancelled）。',
        access: { via: 'bridge', bridge: 'browser', method: 'cancelOAuth' },
        notes: '一步到位的封装是 desktop.browser.oauth({ callbackPath, authorizeUrl, timeoutMs })。',
        example: "const result = await desktop.browser!.oauth({ callbackPath: '/oauth/callback', authorizeUrl })\nif (!result.ok) return report(result.errorDescription ?? result.error)\nconst code = result.query.code",
    },

    /* ---- secrets ------------------------------------------------- */
    {
        name: 'storage.secretAvailable',
        group: 'secrets',
        summary: '本机是否有可用的系统钥匙串（false 时不要假装能存密钥）。',
        access: { via: 'bridge', bridge: 'secrets', method: 'available' },
    },
    {
        name: 'storage.secretSet',
        group: 'secrets',
        summary: '写入一条加密密钥（按 namespace + key）。',
        access: { via: 'bridge', bridge: 'secrets', method: 'set' },
        notes: '返回 { ok, code } 信封；无钥匙串时 code = SECRET_NO_KEYCHAIN，不会明文落盘。namespace 用 plugin.<pluginKey>。',
        example: "const namespace = 'plugin.' + pluginKey\nconst saved = await desktop.secrets!.set({ namespace, key: 'refreshToken', value: token })\nif (!saved.ok) showHint(saved.code)",
    },
    {
        name: 'storage.secretGet',
        group: 'secrets',
        summary: '读取一条密钥的明文（唯一会返回明文的接口）。',
        access: { via: 'bridge', bridge: 'secrets', method: 'get' },
        guards: ['sensitive'],
        notes: '解不开（换机器/钥匙串重置）时返回 decrypted: false + value: ""，要提示用户重新填写。',
    },
    {
        name: 'storage.secretHas',
        group: 'secrets',
        summary: '判断某条密钥是否存在（不返回明文）。',
        access: { via: 'bridge', bridge: 'secrets', method: 'has' },
    },
    {
        name: 'storage.secretList',
        group: 'secrets',
        summary: '列出一个 namespace 下的密钥元信息（key/长度/时间戳，不含明文）。',
        access: { via: 'bridge', bridge: 'secrets', method: 'list' },
    },
    {
        name: 'storage.secretRemove',
        group: 'secrets',
        summary: '删除一条密钥。',
        access: { via: 'bridge', bridge: 'secrets', method: 'remove' },
    },
    {
        name: 'storage.secretClear',
        group: 'secrets',
        summary: '清空一个 namespace 下的全部密钥。',
        access: { via: 'bridge', bridge: 'secrets', method: 'clear' },
        guards: ['destructive'],
    },
    {
        name: 'storage.secretNamespaces',
        group: 'secrets',
        summary: '列出当前存有密钥的 namespace（仅元信息）。',
        access: { via: 'bridge', bridge: 'secrets', method: 'namespaces' },
    },

    /* ---- storage ------------------------------------------------- */
    {
        name: 'storage.info',
        group: 'storage',
        summary: '存储后端诊断信息（引擎、是否持久化、路径等）。',
        access: { via: 'bridge', bridge: 'storage', method: 'info' },
        notes: '插件里优先用 @kn/common 的 useStorage()/resolveStorage()，不要直接调 desktop.storage；命名空间用 pluginStorageNamespace(pluginKey)。',
    },
    {
        name: 'storage.get',
        group: 'storage',
        summary: '按 namespace + key 读一个 JSON 值；不存在/过期返回 null。',
        access: { via: 'bridge', bridge: 'storage', method: 'get' },
        notes: 'invoke 形态返回 { ok, value } | { ok: false, code } 信封；桥形态 desktop.storage.get(ns, key) 失败会抛 StorageError。',
        example: "const res = await desktop.invoke('storage.get', { namespace: 'plugin.' + pluginKey, key: 'settings' })\nconst entry = res.ok ? res.value : null",
    },
    {
        name: 'storage.getMany',
        group: 'storage',
        summary: '一次读多个 key（缺失/过期的直接省略）。',
        access: { via: 'bridge', bridge: 'storage', method: 'getMany' },
    },
    {
        name: 'storage.set',
        group: 'storage',
        summary: '写入一个 JSON 值（可带 TTL），返回带新 rev 的条目。',
        access: { via: 'bridge', bridge: 'storage', method: 'set' },
        notes: '值必须可 JSON 序列化；大对象自己拆。',
        example: "await desktop.invoke('storage.set', { namespace: 'plugin.' + pluginKey, key: 'settings', value: { theme: 'dark' } })",
    },
    {
        name: 'storage.delete',
        group: 'storage',
        summary: '删除一个 key，返回是否真的删掉了。',
        access: { via: 'bridge', bridge: 'storage', method: 'delete' },
    },
    {
        name: 'storage.keys',
        group: 'storage',
        summary: '按前缀列 key（升序）。',
        access: { via: 'bridge', bridge: 'storage', method: 'keys' },
    },
    {
        name: 'storage.list',
        group: 'storage',
        summary: '按顺序分页列出条目（分页游标/数量由 StorageListOptions 控制）。',
        access: { via: 'bridge', bridge: 'storage', method: 'list' },
    },
    {
        name: 'storage.count',
        group: 'storage',
        summary: '统计前缀匹配的存活条目数。',
        access: { via: 'bridge', bridge: 'storage', method: 'count' },
    },
    {
        name: 'storage.clear',
        group: 'storage',
        summary: '按前缀清空条目，返回删除数量。',
        access: { via: 'bridge', bridge: 'storage', method: 'clear' },
        guards: ['destructive'],
    },
    {
        name: 'storage.batch',
        group: 'storage',
        summary: '一次提交多条写/删操作（后端支持时是原子的）。',
        access: { via: 'bridge', bridge: 'storage', method: 'batch' },
    },
    {
        name: 'storage.namespaces',
        group: 'storage',
        summary: '列出所有有条目的 namespace（排查“数据写到哪了”时用）。',
        access: { via: 'bridge', bridge: 'storage', method: 'namespaces' },
    },

    /* ---- notification -------------------------------------------- */
    {
        name: 'notification.available',
        group: 'notification',
        summary: '当前平台/环境是否支持系统通知。',
        access: { via: 'bridge', bridge: 'notifications', method: 'available' },
    },
    {
        name: 'notification.show',
        group: 'notification',
        summary: '发一条系统通知；点击或关闭时 resolve，用 clicked/dismissed 区分。',
        access: { via: 'bridge', bridge: 'notifications', method: 'show' },
        notes: '同 id 会替换旧通知；iconPath 必须在 fs 白名单内可读；标题必填。',
        example: "const result = await desktop.notifications!.show({ title: '3 封新邮件', body: '来自 张三', group: 'plugin.mail', id: 'msg-42' })\nif (result.clicked) openMessage('42')",
    },
    {
        name: 'notification.setBadge',
        group: 'notification',
        summary: '设置 dock/taskbar 角标（count>0 显示数字，0 清除；text 可覆盖成短标签）。',
        access: { via: 'bridge', bridge: 'notifications', method: 'setBadge' },
    },
    {
        name: 'notification.clear',
        group: 'notification',
        summary: '关掉本应用展示过的全部通知。',
        access: { via: 'bridge', bridge: 'notifications', method: 'clear' },
    },

    /* ---- background ---------------------------------------------- */
    {
        name: 'background.schedule',
        group: 'background',
        summary: '在主进程注册一个周期任务；面板关着也会 tick（事件 desktop:event:background）。',
        access: { via: 'bridge', bridge: 'background', method: 'schedule' },
        notes: 'intervalMs 夹在 1s–24h；同一 taskId 覆盖注册；迟到不补发，用 tick.missed 判断漏了几次。',
        example: "const off = desktop.background!.onTick(async (tick) => {\n  if (tick.taskId !== 'mail.poll') return\n  await pollInbox({ since: tick.scheduledAt })\n})\nawait desktop.background!.schedule({ taskId: 'mail.poll', name: '收信轮询', intervalMs: 60_000 })",
    },
    {
        name: 'background.list',
        group: 'background',
        summary: '列出本窗口注册的定时任务（含 run/missed 计数）。',
        access: { via: 'bridge', bridge: 'background', method: 'list' },
    },
    {
        name: 'background.cancel',
        group: 'background',
        summary: '取消一个定时任务。',
        access: { via: 'bridge', bridge: 'background', method: 'cancel' },
    },
    {
        name: 'background.cancelAll',
        group: 'background',
        summary: '取消本窗口的全部定时任务。',
        access: { via: 'bridge', bridge: 'background', method: 'cancelAll' },
    },

    /* ---- task: generic long tasks -------------------------------- */
    {
        name: 'task.start',
        group: 'task',
        summary: '注册一个长任务（标题/类型/可选 root），返回带 sessionId 的快照；状态由主进程保存，刷新后仍在。',
        access: { via: 'bridge', bridge: 'task', method: 'start' },
        notes:
            'id 可选且应带插件前缀（如 my-plugin:sync:space42）；同 id 的已完成任务会开启新一次 run（sessionId 变化），运行中同 id 会被拒绝。优先用 @kn/common 的 runLongTask 助手。',
        example:
            "const task = await desktop.tasks!.start({ id: 'my-plugin:sync:space42', kind: 'sync', title: '同步空间' })\nawait desktop.tasks!.report({ taskId: task.id, progress: { percent: 10, message: '拉取列表' }, logs: ['connected'] })",
    },
    {
        name: 'task.report',
        group: 'task',
        summary: '上报长任务进度与日志行（一次最多 200 行），返回最新快照；连续重复行 1s 内自动去重。',
        access: { via: 'bridge', bridge: 'task', method: 'report' },
        notes: 'progress 是合并语义（只更新传入字段）；日志行由宿主打时间戳；任务已结束会报错。',
    },
    {
        name: 'task.logsSince',
        group: 'task',
        summary: '按单调 seq 增量读长任务日志，返回 nextSeq / dropped / total（与 dev.logsSince 同形）。',
        access: { via: 'bridge', bridge: 'task', method: 'logsSince' },
        notes:
            '每任务保留 1000 行；dropped = ring 淘汰 + limit 截断之和，>0 时界面应如实提示「已丢弃 N 行」。轮询请传上次的 nextSeq，不要反复读全量。',
        example:
            "let cursor = 0\nconst page = await desktop.tasks!.logsSince({ taskId, sinceSeq: cursor, limit: 200 })\ncursor = page.nextSeq\nfor (const line of page.entries) console.log(line.level, line.message)",
    },
    {
        name: 'task.list',
        group: 'task',
        summary: '列长任务（可按 state/kind/root 过滤），按 updatedAt 从新到旧，含进度、状态与最后 seq。',
        access: { via: 'bridge', bridge: 'task', method: 'list' },
        notes: '最多保留 200 个任务；已结束任务留在列表里供回看，容量满时先淘汰最旧的已结束任务。',
    },
    {
        name: 'task.get',
        group: 'task',
        summary: '按 id 读一个长任务快照；未知或已被淘汰返回 null（轮询语义，不抛错）。',
        access: { via: 'bridge', bridge: 'task', method: 'get' },
        notes:
            '刷新页面后想恢复某个任务的进度时用它；已结束任务的快照里带 result（若有）。task.list 只给列表，取单条用 get。',
        example:
            "const task = await desktop.tasks!.get({ taskId: 'my-plugin:sync:space42' })\nif (!task) return // 未知或已淘汰\nif (task.state === 'succeeded') console.log(task.result)",
    },
    {
        name: 'task.touch',
        group: 'task',
        summary: '刷新任务的 lastHeartbeatAt / updatedAt：心跳型任务用它证明自己还活着，避免被宿主判为失联。',
        access: { via: 'bridge', bridge: 'task', method: 'touch' },
        notes:
            '只有 start 时声明了 heartbeatMs 的任务才会被失联清扫（3 个周期没动静置 failed）；report 也算心跳。终态任务直接返回快照，未知任务报 TASK_NOT_FOUND。',
        example:
            "const task = await desktop.tasks!.start({ title: '同步空间', heartbeatMs: 30_000 })\nsetInterval(() => void desktop.tasks!.touch({ taskId: task.id }), 30_000)",
    },
    {
        name: 'task.remove',
        group: 'task',
        summary: '忘掉一个已结束的长任务（返回 removed）；运行中/取消中的任务会被拒绝。',
        access: { via: 'bridge', bridge: 'task', method: 'remove' },
        guards: ['destructive'],
        notes:
            '未知 id 返回 removed:false（幂等）。只影响宿主持有的任务记录，不动插件自己落盘的数据；运行中的任务先 finish / cancel。',
        example:
            "const finished = await desktop.tasks!.list({ state: 'succeeded' })\nfor (const task of finished) await desktop.tasks!.remove({ taskId: task.id })",
    },
    {
        name: 'task.finish',
        group: 'task',
        summary:
            '把长任务置为 succeeded / failed / cancelled（终态幂等），可带结束消息、错误或结构化 result。',
        access: { via: 'bridge', bridge: 'task', method: 'finish' },
        notes:
            'result 必须是可 JSON 序列化的值，序列化后 ≤16KB（超了 TASK_RESULT_TOO_LARGE，不可序列化 TASK_RESULT_INVALID）；存的是 JSON 克隆，所以 Date/Map 会退化。重复 finish 不覆盖已存 result。',
        example:
            "await desktop.tasks!.finish({ taskId, state: 'succeeded', result: { created: 3 } })",
    },
    {
        name: 'task.cancel',
        group: 'task',
        summary: '请求取消长任务：状态转 cancelling 并广播 cancel-request，插件协作停止后再 finish(cancelled)。',
        access: { via: 'bridge', bridge: 'task', method: 'cancel' },
        notes:
            '取消是协作式的：宿主不会杀渲染进程里的工作。runLongTask 会把 cancel-request 映射成 AbortSignal。',
    },

    /* ---- credentials --------------------------------------------- */
    {
        name: 'credentials.available',
        group: 'credentials',
        summary: '本机是否能加密保存登录凭证（宿主登录页用它决定是否显示“记住密码”）。',
        access: DEV,
        notes: '宿主登录态专用。插件要存凭据请用 storage.secret*，不要读这里。',
    },
    {
        name: 'credentials.load',
        group: 'credentials',
        summary: '读取宿主“记住登录”的账号/密码（明文）。',
        access: DEV,
        guards: ['sensitive'],
        notes: '这是宿主自己的登录凭证，插件不应顺手读取（可信代码模型下没有强制隔离，靠自觉）。',
    },
    {
        name: 'credentials.save',
        group: 'credentials',
        summary: '保存宿主“记住登录”的凭证（safeStorage 加密落盘）。',
        access: DEV,
        guards: ['sensitive'],
    },
    {
        name: 'credentials.clear',
        group: 'credentials',
        summary: '清除宿主保存的登录凭证。',
        access: DEV,
    },

    /* ---- ssh ----------------------------------------------------- */
    {
        name: 'ssh.exec',
        group: 'ssh',
        summary: '在远端主机执行一条命令，返回 exit code / stdout / stderr。',
        access: { via: 'bridge', bridge: 'ssh', method: 'exec' },
        guards: ['net-policy', 'user-confirm'],
        notes: '连接/认证/主机密钥失败会抛错；命令失败是 ok:false（要按结果处理，不要只看有没有抛）。',
        example: "const result = await desktop.ssh!.exec({ host: 'build.internal', user: 'ci', command: 'git rev-parse HEAD' })\nif (!result.ok) throw new Error(result.stderr || 'exit ' + result.code)\nconst sha = result.stdout.trim()",
    },
    {
        name: 'ssh.put',
        group: 'ssh',
        summary: '把本地文件上传到远端主机。',
        access: { via: 'bridge', bridge: 'ssh', method: 'put' },
        guards: ['net-policy', 'user-confirm', 'fs-allowlist'],
    },
    {
        name: 'ssh.get',
        group: 'ssh',
        summary: '从远端主机下载文件到本地。',
        access: { via: 'bridge', bridge: 'ssh', method: 'get' },
        guards: ['net-policy', 'user-confirm', 'fs-allowlist'],
    },
    {
        name: 'ssh.hosts',
        group: 'ssh',
        summary: '列出本次运行内用户已授权过的主机（凭据绝不包含）。',
        access: { via: 'bridge', bridge: 'ssh', method: 'hosts' },
        notes: '不需要连接，也不会再弹确认。',
    },
    {
        name: 'ssh.forget',
        group: 'ssh',
        summary: '撤销一个主机的授权（按 grant key 或重新给出目标）。',
        access: { via: 'bridge', bridge: 'ssh', method: 'forget' },
    },
    {
        name: 'ssh.sftpList',
        group: 'ssh',
        summary: '列远端目录（SFTP），返回条目 + truncated。',
        access: { via: 'bridge', bridge: 'ssh', method: 'list' },
        guards: ['net-policy', 'user-confirm'],
        example: "const listing = await desktop.ssh!.list({ host: 'nas.local', path: '/volume1/docs' })\nfor (const entry of listing.entries) { /* entry.name / entry.isDirectory / entry.size */ }",
    },
    {
        name: 'ssh.sftpStat',
        group: 'ssh',
        summary: '读远端路径的元信息（类型/大小/权限/时间）。',
        access: { via: 'bridge', bridge: 'ssh', method: 'stat' },
        guards: ['net-policy', 'user-confirm'],
    },
    {
        name: 'ssh.sftpMkdir',
        group: 'ssh',
        summary: '在远端创建目录（递归）。',
        access: { via: 'bridge', bridge: 'ssh', method: 'mkdir' },
        guards: ['net-policy', 'user-confirm'],
    },
    {
        name: 'ssh.sftpRename',
        group: 'ssh',
        summary: '重命名/移动远端路径。',
        access: { via: 'bridge', bridge: 'ssh', method: 'rename' },
        guards: ['net-policy', 'user-confirm'],
    },
    {
        name: 'ssh.sftpRemove',
        group: 'ssh',
        summary: '删除远端文件或目录。',
        access: { via: 'bridge', bridge: 'ssh', method: 'remove' },
        guards: ['net-policy', 'user-confirm', 'destructive'],
    },
    {
        name: 'ssh.shellOpen',
        group: 'ssh',
        summary: '开一个远端交互式 pty（终端），输出以 base64 事件流回来。',
        access: { via: 'bridge', bridge: 'ssh', method: 'shell' },
        guards: ['net-policy', 'user-confirm'],
        notes:
            '输出是 base64 字节（不要当字符串）；用 desktop.ssh.onShell 订阅，按 sessionId 过滤。' +
            '注意：当前实现没有按窗口归属校验（审计 P0：事件会发给所有窗口、写/关只按 sessionId），' +
            '同一次运行里不要假设别的窗口看不到这个终端。',
    },
    {
        name: 'ssh.shellWrite',
        group: 'ssh',
        summary: '向远端终端写入按键/命令（按 sessionId 定位）。',
        access: { via: 'bridge', bridge: 'ssh', method: 'shellWrite' },
        notes: '当前实现只按 sessionId 校验，没有窗口归属检查（审计 P0）。',
    },
    {
        name: 'ssh.shellResize',
        group: 'ssh',
        summary: '把远端 pty 调整到新的行列数（布局变化时必须调）。',
        access: { via: 'bridge', bridge: 'ssh', method: 'shellResize' },
    },
    {
        name: 'ssh.shellClose',
        group: 'ssh',
        summary: '关闭一个远端终端会话。',
        access: { via: 'bridge', bridge: 'ssh', method: 'shellClose' },
    },
    {
        name: 'ssh.shells',
        group: 'ssh',
        summary: '列出当前打开的远端终端会话（全局，不按窗口隔离）。',
        access: { via: 'bridge', bridge: 'ssh', method: 'shellSessions' },
        notes: '主进程当前返回全部会话；不要假设只能看到自己窗口打开的。',
    },
    {
        name: 'ssh.tunnelOpen',
        group: 'ssh',
        summary: '开本地端口转发：固定目标（ssh -L）或无认证 SOCKS5 动态代理（ssh -D）。',
        access: { via: 'bridge', bridge: 'ssh', method: 'tunnel' },
        guards: ['net-policy', 'user-confirm'],
        notes: '只监听 127.0.0.1；隧道是独立授权类别（-L 按主机+目标地址、-D 按主机）；独占一条 SSH 连接，全局最多 8 条。',
    },
    {
        name: 'ssh.tunnelClose',
        group: 'ssh',
        summary: '关闭一条 SSH 隧道（其独占连接一并释放）。',
        access: { via: 'bridge', bridge: 'ssh', method: 'closeTunnel' },
    },
    {
        name: 'ssh.tunnels',
        group: 'ssh',
        summary: '列出当前打开着的隧道（全局，不按窗口隔离）。',
        access: { via: 'bridge', bridge: 'ssh', method: 'tunnels' },
    },
    {
        name: 'ssh.credentialsAvailable',
        group: 'ssh',
        summary: '本机是否能加密保存 SSH 凭据（safeStorage）。',
        access: { via: 'bridge', bridge: 'sshCredentials', method: 'available' },
        guards: ['keychain'],
    },
    {
        name: 'ssh.credentialsList',
        group: 'ssh',
        summary: '列出宿主里已保存的 SSH 凭据元信息（不含密码/私钥）。',
        access: { via: 'bridge', bridge: 'sshCredentials', method: 'list' },
        guards: ['keychain', 'sensitive'],
    },
    {
        name: 'ssh.credentialsSet',
        group: 'ssh',
        summary: '保存一条 SSH 凭据（密码或私钥，明文只进不出，落盘加密）。',
        access: { via: 'bridge', bridge: 'sshCredentials', method: 'set' },
        guards: ['keychain'],
        notes: '宿主只提供接口，凭据界面由插件实现；不要把明文写进自己的 storage。',
    },
    {
        name: 'ssh.credentialsRemove',
        group: 'ssh',
        summary: '删除一条已保存的 SSH 凭据。',
        access: { via: 'bridge', bridge: 'sshCredentials', method: 'remove' },
        guards: ['keychain', 'destructive'],
    },

    /* ---- dev ----------------------------------------------------- */
    {
        name: 'dev.start',
        group: 'dev',
        summary: '开始监听一个插件工程：构建并把产物热更进当前窗口。',
        access: { via: 'bridge', bridge: 'dev', method: 'start' },
        availability: 'desktop-studio',
    },
    {
        name: 'dev.stop',
        group: 'dev',
        summary: '停止监听、回收构建子进程。',
        access: { via: 'bridge', bridge: 'dev', method: 'stop' },
        availability: 'desktop-studio',
    },
    {
        name: 'dev.build',
        group: 'dev',
        summary: '一次性构建（可热更到窗口 / 写 dist/index.js）。',
        access: { via: 'bridge', bridge: 'dev', method: 'build' },
        availability: 'desktop-studio',
    },
    {
        name: 'dev.status',
        group: 'dev',
        summary: '读一个工程的开发会话状态（构建号、错误、是否监听）。',
        access: { via: 'bridge', bridge: 'dev', method: 'status' },
        availability: 'desktop-studio',
    },
    {
        name: 'dev.logs',
        group: 'dev',
        summary: '读构建日志尾部（排查编译错误）。',
        access: { via: 'bridge', bridge: 'dev', method: 'logs' },
        availability: 'desktop-studio',
    },
    {
        name: 'dev.logsSince',
        group: 'dev',
        summary: '增量读构建日志：按单调 seq 只取新增条目，带 sessionId / nextSeq / dropped 游标信息。',
        access: { via: 'bridge', bridge: 'dev', method: 'logsSince' },
        availability: 'desktop-studio',
        notes:
            '轮询日志请用它而不是反复读 dev.logs 尾巴：sessionId 变化说明宿主重启（seq 归零，要重置游标），dropped > 0 说明有行被丢掉（ring 淘汰或 limit 截断）。dev.logs 行为不变。',
        example:
            "// 第一次 sinceSeq 省略；之后把 nextSeq 传回去\nlet cursor = 0\nfor (;;) {\n  const page = await desktop.dev!.logsSince({ root, sinceSeq: cursor })\n  if (page.sessionId !== sessionId) { sessionId = page.sessionId; cursor = 0; continue }\n  cursor = page.nextSeq\n  for (const line of page.entries) console.log(line.level, line.message)\n  await new Promise((resolve) => setTimeout(resolve, 500))\n}",
    },
    {
        name: 'dev.scaffold',
        group: 'dev',
        summary: '按模板生成一个插件工程（package.json + src + README）。',
        access: { via: 'bridge', bridge: 'dev', method: 'scaffold' },
        availability: 'desktop-studio',
    },
    {
        name: 'dev.list',
        group: 'dev',
        summary: '列出内置目录里的插件工程。',
        access: { via: 'bridge', bridge: 'dev', method: 'list' },
        availability: 'desktop-studio',
    },
    {
        name: 'dev.readFile',
        group: 'dev',
        summary: '读插件工程内的一个文件。',
        access: { via: 'bridge', bridge: 'dev', method: 'readFile' },
        availability: 'desktop-studio',
    },
    {
        name: 'dev.writeFile',
        group: 'dev',
        summary: '写插件工程内的一个文件（自动建父目录）。',
        access: { via: 'bridge', bridge: 'dev', method: 'writeFile' },
        availability: 'desktop-studio',
    },
    {
        name: 'dev.hostApi',
        group: 'dev',
        summary: '只读查询标准宿主包源码：列包 / 搜索 / 读文件 / 按 symbol 取声明 / 按 member 取契约条目。',
        access: { via: 'bridge', bridge: 'dev', method: 'hostApi' },
        availability: 'desktop-studio',
        notes: '这是插件开发台“查真实接口”的底层通道；普通插件不需要它。',
        example: "// 只取一个声明，而不是整个文件\nconst decl = await desktop.dev!.hostApi({ package: '@kn/common', path: 'src/core/desktop/fs.ts', symbol: 'DesktopFileStat' })",
    },
    {
        name: 'dev.files',
        group: 'dev',
        summary: '列出 / 搜索 / grep 一个插件工程的文件。',
        access: { via: 'bridge', bridge: 'dev', method: 'files' },
        availability: 'desktop-studio',
    },
    {
        name: 'dev.installDependencies',
        group: 'dev',
        summary: '在插件工程里安装 npm 依赖（调用包管理器，需要网络）。',
        access: { via: 'bridge', bridge: 'dev', method: 'installDependencies' },
        availability: 'desktop-studio',
        notes:
            '由宿主调用工程所用的包管理器，需要网络，并且会执行包的安装脚本；只在开发台这类可信工具里用。',
    },
    {
        name: 'dev.remove',
        group: 'dev',
        summary: '停止会话并删除整个插件工程目录。',
        access: { via: 'bridge', bridge: 'dev', method: 'removeProject' },
        availability: 'desktop-studio',
        guards: ['destructive'],
    },
    {
        name: 'dev.deleteFile',
        group: 'dev',
        summary: '删除插件工程里的一个文件（拒绝 package.json 与入口）。',
        access: { via: 'bridge', bridge: 'dev', method: 'deleteFile' },
        availability: 'desktop-studio',
        guards: ['destructive'],
    },
] as const satisfies readonly DesktopCapabilityMeta[]

/** Names present in the catalogue, as a union (for the exhaustiveness guard). */
export type DesktopCataloguedCapability = (typeof DESKTOP_CAPABILITY_CATALOG)[number]['name']

/**
 * Compile-time exhaustiveness guard: adding a capability to
 * `DesktopCapability` without a catalogue entry makes this assignment fail.
 */
export const DESKTOP_CAPABILITY_CATALOG_IS_EXHAUSTIVE: Exclude<
    DesktopCapability,
    DesktopCataloguedCapability
> extends never
    ? true
    : false = true

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

const GROUP_BY_ID = new Map<DesktopCapabilityGroup, DesktopCapabilityGroupMeta>(
    DESKTOP_CAPABILITY_GROUPS.map((group) => [group.id, group]),
)

const CATALOG_BY_NAME = new Map<string, DesktopCapabilityMeta>(
    DESKTOP_CAPABILITY_CATALOG.map((meta) => [meta.name, meta as DesktopCapabilityMeta]),
)

/** Group metadata for one capability. */
export const desktopCapabilityGroupMeta = (
    meta: DesktopCapabilityMeta,
): DesktopCapabilityGroupMeta | undefined => GROUP_BY_ID.get(meta.group)

/** Catalogue row for a capability name, or undefined for an unknown name. */
export const findDesktopCapabilityMeta = (name: string): DesktopCapabilityMeta | undefined =>
    CATALOG_BY_NAME.get(name)

/**
 * Every guard a capability passes, group guards first, de-duplicated. This is
 * what an author must design for (a network call always asks the user; a file
 * path is always allowlisted).
 */
export const desktopCapabilityGuards = (
    meta: DesktopCapabilityMeta,
): DesktopCapabilityGuard[] => {
    const guards: DesktopCapabilityGuard[] = []
    for (const guard of [...(GROUP_BY_ID.get(meta.group)?.guards ?? []), ...(meta.guards ?? [])]) {
        if (!guards.includes(guard)) guards.push(guard)
    }
    return guards
}

/** How to reach a capability, as a prompt-ready call shape. */
export const desktopCapabilityCall = (meta: DesktopCapabilityMeta): string => {
    if (meta.access.via === 'invoke') return `desktop.invoke('${meta.name}', params)`
    const path = DESKTOP_CAPABILITY_BRIDGE_PATHS[meta.access.bridge]
    return `${path}.${meta.access.method}(…)`
}

/** Guard id → meaning, for the guards a capability actually carries. */
export const desktopCapabilityGuardNotes = (
    meta: DesktopCapabilityMeta,
): Array<{ id: DesktopCapabilityGuard; note: string }> =>
    desktopCapabilityGuards(meta).map((id) => ({ id, note: DESKTOP_CAPABILITY_GUARDS[id] }))

/**
 * Intent search over the catalogue. Every whitespace-separated term must match
 * the capability name, its summary/notes, or its group's title/summary — so a
 * Chinese intent ("读文件", "截屏") works without the caller knowing a name.
 */
export const searchDesktopCapabilities = (options: {
    query?: string
    group?: string
} = {}): DesktopCapabilityMeta[] => {
    const rawQuery = typeof options.query === 'string' ? options.query.trim().toLowerCase() : ''
    const terms = rawQuery ? rawQuery.split(/\s+/).filter(Boolean) : []
    const group = typeof options.group === 'string' ? options.group.trim().replace(/\.$/, '') : ''
    const catalog = DESKTOP_CAPABILITY_CATALOG as readonly DesktopCapabilityMeta[]
    return catalog.filter((meta) => {
        if (group && meta.group !== group) return false
        if (terms.length === 0) return true
        const groupMeta = GROUP_BY_ID.get(meta.group)
        const haystack = [
            meta.name,
            meta.summary,
            meta.notes ?? '',
            groupMeta?.title ?? '',
            groupMeta?.summary ?? '',
            ...desktopCapabilityGuards(meta),
        ]
            .join(' ')
            .toLowerCase()
        return terms.every((term) => haystack.includes(term))
    })
}

/** Every catalogue entry in one group (catalogue order). */
export const desktopCapabilitiesInGroup = (
    group: DesktopCapabilityGroup,
): DesktopCapabilityMeta[] =>
    (DESKTOP_CAPABILITY_CATALOG as readonly DesktopCapabilityMeta[]).filter(
        (meta) => meta.group === group,
    )