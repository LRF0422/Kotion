# 宿主能力：net / shell / storage.secret / notification / background

本文档说明桌面宿主（Electron）新增的**通用**能力组，以及它们为什么长这样。

一句话前提：宿主只提供**通用原语**——搬运字节、打开浏览器、装密钥、发通知、管时钟。
宿主**不提供任何协议客户端**，也**不会新增 `mail.*` 之类的高层能力**：邮件（IMAP/SMTP）、
MQTT、自定义行协议等一律由插件自己用 JS 实现，宿主只保证"下面那条连接是通的、字节是准的"。

```
插件 / 页面
   useOptionalService('desktop')            ← @kn/core 注册的核心服务
        │
        ├── desktop.net            → net.socket*        （原始 TCP / TLS 字节流，事件走 desktop:event:net）
        ├── desktop.browser        → shell.*            （系统浏览器 + 127.0.0.1 回环回调）
        ├── desktop.secrets        → storage.secret*    （safeStorage 加密、按 namespace 隔离的 KV）
        ├── desktop.notifications  → notification.*     （系统通知 + 角标）
        └── desktop.background     → background.*       （主进程持有的定时器，事件走 desktop:event:background）
                 │
                 └── preload 白名单 → desktop:<capability> → apps/desktop/src/main/ipc.ts
                          ├── 网络策略（net.policy.*，与 http.request / ssh.* 同一把闸）
                          ├── 用户授权弹窗（每个新目标 / 新来源一次，本次运行内记住）
                          └── apps/desktop/src/main/capabilities/*
```

| 层 | 位置 | 职责 |
|----|------|------|
| 契约 | `packages/common/src/core/desktop-bridge.ts` | 能力名、参数/结果类型、桥接接口 |
| 插件类型入口 | `packages/plugin-api/src/index.ts` | 转发契约类型，插件作者只依赖这个包 |
| 渲染端桥接 | `packages/core/src/desktop/bridge.ts` | 能力探测（按 `capabilities` 判定）→ `desktop.net` 等 |
| 能力白名单 | `apps/desktop/src/preload/index.ts` | 固定通道列表，没有通用 IPC 逃生口 |
| 实现 | `apps/desktop/src/main/capabilities/` | 参数校验（纯 JS，可直测）+ Electron 接线 |
| 门禁 | `apps/desktop/src/main/ipc.ts` | 网络策略 / DNS 判定 / fs 允许清单 |
| 自测 | `apps/desktop/src/main/capabilities/electron.smoke.cjs` | 真 preload → 真 IPC → 真 socket/TLS/HTTP，55 项 |

## 0. 信任模型（先读这个）

插件都是**受信任的 bundle**，宿主里没有"插件 vs 插件"的沙箱或权限边界。因此：

- 上面所有门禁保护的是**用户**和**机器**，不是插件之间：网络策略挡住 LAN / 元数据地址，
  授权弹窗让用户看到"哪个目标要被连接"，`storage.secret` 让密钥**不以明文落盘**。
- `storage.secret` 的 namespace（`plugin.<key>`）是**命名约定 + 输入校验**，不是访问控制：
  任何在宿主里运行的代码都能调 `storage.secretGet`。它换来的是"静态不落明文 + 不会被顺手读走"，
  不是"别的插件读不到"。**不要**把它说成后者。
- 能力刻意做成**通用**的：一个"能连任意 TCP/TLS 主机"的能力天然会被滥用，所以它必须
  有策略闸 + 用户确认；反过来，宿主也不该为每个协议各开一个能力（那才是权限碎片化）。

## 1. `net.socket*`：原始 TCP / TLS 字节流

> 对应 `net.socketOpen` / `net.socketWrite` / `net.socketClose` / `net.socketSessions`。

宿主是**传输层**：连上、双向搬字节、报 open/data/close/error。分帧、keep-alive、
重连、认证、协议状态机全在插件里。

```ts
const desktop = useOptionalService('desktop')
const net = desktop?.net
if (!net) return // Web 端 / 旧宿主：退化，不要抛

const session = await net.open({
  host: 'imap.example.com',
  port: 993,
  protocol: 'tls',
  label: 'imap.example.com:993', // 授权弹窗与本次运行授权的键
})
for await (const event of onEvents(net)) {  // 实际用法见下
  if (event.type === 'socket-data') {
    const bytes = base64ToBytes(event.dataBase64)   // 必须按字节解码，不能当字符串
    // ...解析 IMAP 响应
  }
  if (event.type === 'socket-close') break
}
await net.write({ sessionId: session.sessionId, dataBase64: bytesToBase64(frame) })
await net.close({ sessionId: session.sessionId, dataBase64: bytesToBase64('A1 LOGOUT\r\n'), graceful: true })
```

要点：

- **数据一律 base64**（`dataBase64` / `event.dataBase64`）。一个 TCP 分片可能在多字节字符
  中间切开，JSON 字符串往返会把它变成永远修不回来的乱码。
- **事件通道是 `desktop:event:net`**，一条通道承载所有会话；按 `sessionId` 自己过滤。
  订阅用 `net.onEvent(listener)`（`desktop.on('net', …)` 是等价底层）。
- **TLS 默认校验**：`tlsMode: 'strict'`（默认）走系统根证书 + 主机名校验；
  `'relaxed'` 只放开证书校验（仍加密），只为自签名开发服务器准备，必须显式传。
  `serverName` 用于 SNI 与校验名，`host` 是 IP 时通常要显式给。
- **超时/上限**：`connectTimeoutMs` 默认 15s（上限 2min），`timeoutMs` 是**空闲**超时
  默认 60s（上限 10min，`0` 关闭）；单条 `write` ≤ 1 MiB，每个窗口最多 16 条会话。
- **门禁顺序**：网络策略（`net.policy.*`，与 `http.request` 完全相同）→ 用户授权
  （本次运行内每个 `label` 一次）→ 连接。拒绝或没有窗口可问 = 直接失败（fail closed）。
- **会话属于打开的窗口**：`socketWrite` / `socketClose` / `socketSessions` 只对本窗口
  打开的会话生效，事件也只发给那个窗口——另一个窗口即使猜到 `sessionId` 也用不了。
  上限按窗口算（16 条），不是全应用共享。
- **不做缓冲**：主进程不排队、不重放；插件不读就是插件自己的背压问题。

## 2. `shell.*`：系统浏览器 + 本机回环 OAuth 回调

> 对应 `shell.browserOpen` / `shell.oauthStart` / `shell.oauthWait` / `shell.oauthSessions` / `shell.oauthCancel`。

桌面端没法用自定义 URL scheme（要注册，而且任何 App 都能抢），也不该把授权码绕经云端
origin。`127.0.0.1` + 临时端口是唯一"只属于本机、不用注册、主流 OAuth 都支持"的回落地址。

```ts
// 一次调用完成整轮往返（内部先 startOAuth，再 browserOpen，再等回调）
const result = await desktop.browser.oauth({
  callbackPath: '/oauth/callback',
  timeoutMs: 5 * 60_000,
  authorizeUrl,           // 省略则自己用 redirectUri 拼好再 browserOpen
})
if (!result.ok) {
  if (result.timedOut || result.cancelled) return
  throw new Error(result.errorDescription || result.error)
}
// result.query.code / result.query.state —— state 与 PKCE 校验是插件的责任
```

需要先拿到 `redirect_uri` 再拼授权 URL 时，用两步式：

```ts
const session = await desktop.browser.startOAuth({ callbackPath: '/oauth/callback' })
const authorizeUrl = `${AUTH_ENDPOINT}?client_id=…&redirect_uri=${encodeURIComponent(session.redirectUri)}&state=${state}&code_challenge=…`
const waiting = desktop.browser.waitForOAuth({ sessionId: session.sessionId })
await desktop.browser.open({ url: authorizeUrl })
const result = await waiting
```

要点：

- **只监听 `127.0.0.1`**，只服务一个路径，其它路径 404、非 GET/HEAD 405，
  请求头有 32 KiB 上限（防本机进程灌数据）；**只把 path + query 交给插件**，不带 body。
- 落地面是宿主生成的静态页（无脚本、`cache-control: no-store`、`no-referrer`），
  用户看到"授权完成"后自己关掉标签页；标签页标题可用 `title` 指定。
- 并发上限 4 个监听；完成后结果在宿主里保留 60s（给迟到一点的 `waitForOAuth` 取），
  超时/取消都会让等待方拿到 `timedOut` / `cancelled`，不会永远挂着。
- `browserOpen` **只允许 http/https**（`file:` / 自定义 scheme 一律拒绝），并且每个
  origin 在本次运行内第一次打开时会弹窗确认。
- 授权码是敏感值：宿主不落盘、不打日志，只经 IPC 交给调用方。

## 3. `storage.secret*`：插件级加密 KV

> 对应 `storage.secretAvailable` / `secretSet` / `secretGet` / `secretHas` / `secretList` / `secretRemove` / `secretClear` / `secretNamespaces`。

`storage.*` 是透明持久化：任何插件列一下目录就能读到别人的 refresh token。需要跨启动
保存凭据的插件，应该把密钥放这里。

```ts
const secrets = desktop.secrets
if (!(await secrets.available())) return showHint('本机没有可用的系统钥匙串')

await secrets.set({ namespace: `plugin.${pluginKey}`, key: 'refreshToken', value: token })
const entry = await secrets.get({ namespace: `plugin.${pluginKey}`, key: 'refreshToken' })
const rows = await secrets.list({ namespace: `plugin.${pluginKey}` })  // 只有元数据
```

要点：

- **落盘只有密文**：值先经 Electron `safeStorage` 加密（macOS Keychain / Windows DPAPI /
  Linux libsecret），密文写入 `<userData>/plugin-secrets.json`（0600，临时文件 + rename 原子替换）。
- **没有钥匙串就拒绝写**：Linux 上 `getSelectedStorageBackend() === 'basic_text'` 或
  `isEncryptionAvailable() === false` 时 `set` 返回 `{ ok: false, code: 'SECRET_NO_KEYCHAIN' }`——
  绝不"假装加密"后明文落盘。`available()` 就是给 UI 判断这一点的。
- **namespace 规则**：`plugin.<key>` 或 `app.<area>`（点分段，字母数字/点/横线/下划线，
  ≤96 字符，不许空段或尾部分隔符）；key ≤128 字符；值 ≤64 KiB；每个 namespace ≤256 条。
- **`get` 是唯一会返回明文的接口**；`list` / `namespaces` 只给元数据（key、长度、时间戳）。
  密文解不开（换机器 / 钥匙串被重置）时返回 `decrypted: false` + `value: ''`，
  让 UI 提示"重新填写"，而不是假装不存在。
- 写失败返回 `{ ok, code, error }` 而不是抛（与 `storage.*` 的信封风格一致）：
  `SECRET_NO_KEYCHAIN` / `SECRET_INVALID_NAMESPACE` / `SECRET_INVALID_KEY` / `SECRET_TOO_LARGE`。

## 4. `notification.*`：系统通知与角标

> 对应 `notification.available` / `notification.show` / `notification.setBadge` / `notification.clear`。

面板关掉后插件渲染不了自己的 toast，Web `Notification` 在窗口隐藏时也不可靠，所以用主进程
的真实系统通知。

```ts
const result = await desktop.notifications.show({
  title: '3 封新邮件',
  body: '来自 张三',
  group: 'plugin.mail',
  id: `msg-${uid}`,
  silent: false,
  timeoutMs: 8000,
})
if (result.clicked) openMessage(uid)   // 点击时宿主已把窗口前置
```

要点：

- `show()` 在**用户点击或被系统关闭**时 resolve，用 `clicked` / `dismissed` 区分；
  点击会同时 restore + show + focus 宿主窗口。
- `id` 相同会替换旧通知（不会堆叠）；宿主最多同时保留 32 条。
- `iconPath` 必须是**允许清单内可读的普通文件**（与 `fs.*` 同一套根目录校验），
  否则 `{ shown: false, error }`——不把任意路径交给系统去读。
- 标题必填，标题/正文会去掉控制字符并截断（标题 200、正文 2000 字符）。
- `setBadge({ count })` 在 macOS 走 dock 徽标、Windows 走 overlay 图标、Linux 走
  Unity launcher API；`clear()` 关掉本应用展示过的全部通知。

## 5. `background.*`：主进程持有的定时器

> 对应 `background.schedule` / `background.list` / `background.cancel` / `background.cancelAll`。

渲染进程里 `setInterval` 不可靠：页面一切走，interval 就没了。宿主接管**时钟**，
插件面板关着也能被唤醒。

```ts
const stop = desktop.background.onTick(async (tick) => {
  if (tick.taskId !== 'mail.poll') return
  // tick.scheduledAt 是"本该发生的时间"，tick.missed 是错过的次数
  await pollInbox({ since: tick.scheduledAt })
})
await desktop.background.schedule({
  taskId: 'mail.poll',
  name: '收信轮询',
  intervalMs: 60_000,
  initialDelayMs: 5_000,
})
// 卸载时：stop(); await desktop.background.cancel({ taskId: 'mail.poll' })
```

要点：

- **事件通道 `desktop:event:background`**，`onTick` 已按 `taskId` 过滤（每 tick 带
  `scheduledAt` / `firedAt` / `missed` / `run`）。
- **迟到不补发**：机器睡了 3 个周期，只发 1 次 tick，`missed: 3`。需要"每次都不落"的插件
  应该自己存游标，用 `scheduledAt` 去补齐。
- 约束：`intervalMs` 夹在 1s–24h，`initialDelayMs` 默认等于 `intervalMs` 且不超过它；
  每个窗口最多 32 个任务；`taskId` 相同 = 覆盖注册（保留 run/missed 计数，方便 UI 显示）。
- `keepAwake: true` 会申请 `powerSaveBlocker`（防止系统休眠导致完全停摆）；**系统可能拒绝**，
  所以返回的 `task.keepAwake` 是生效值，不是请求值。
- 任务随窗口销毁清理，`app.on('will-quit')` 会统一停表、关 socket、取消 OAuth 监听。
- 任务表按窗口隔离：每个窗口只有自己的 `background.list()` 结果，`cancelAll()` 也只清自己的。

## 6. `http.request`：二进制响应

同一个能力，补上了"响应体可能是字节"这一半：

```ts
const res = await desktop.invoke('http.request', {
  url: attachmentUrl,
  responseType: 'auto', // 默认：按 content-type 判断，判不了就按 UTF-8 嗅探
})
const bytes = res.bodyEncoding === 'base64' ? base64ToBytes(res.bodyBase64) : null
```

| 字段 | 含义 |
|------|------|
| `bodyText` / `bodyBase64` | **只有一个非空**：文本走前者、字节走后者 |
| `bodyEncoding` | `'text'` 或 `'base64'`，与上面一致 |
| `isText` | 是否按文本解码（`auto` 的判定结果） |
| `charset` | 文本解码用的字符集（默认 `utf-8`，支持 `gbk`/`big5`/`shift-jis` 等别名） |

- `responseType: 'auto' | 'text' | 'base64'`；`text`/`base64` 由调用方强制（网关把 PNG
  标成 `text/plain` 时用得上）。
- 判不了的类型（`application/octet-stream`、没有 content-type）用"严格 UTF-8 解码 +
  无 NUL/控制字符"嗅探，JPEG 会被判成字节、日志文件会被判成文本。
- 上传方向早就有 `bodyBase64`；现在下载方向补齐，附件/内联图片不必再依赖服务端中转。
- 大小/超时口径不变：`maxResponseBytes` 1 KiB–20 MiB（默认 5 MiB），`timeoutMs` 1s–120s。

## 7. 自测与验证

```bash
# 宿主能力端到端（真 preload 白名单 → 真 IPC → 真 TCP/TLS/HTTP 服务器）
ELECTRON_RUN_AS_NODE= apps/desktop/node_modules/.bin/electron \
  apps/desktop/src/main/capabilities/electron.smoke.cjs --no-sandbox
# 等价于
pnpm --filter @kn/desktop test:capabilities:electron

# 类型（主进程 + preload，含能力模块的 .d.mts 签名）
cd apps/desktop && ./node_modules/.bin/tsc -p tsconfig.node.json --noEmit --composite false

# 打包链路（确认 .mjs 被 esbuild 打进 out/main/index.js）
pnpm --filter @kn/desktop build
```

覆盖内容（55 项，全部通过）：能力白名单（含"没有 `mail.*`"）、TCP 收发/回显/关闭事件、
TLS `strict` 拒绝自签证书 + `relaxed` 连通、网络策略拒绝、授权拒绝（且同目标第二次不再询问）、
会话归属（另一个窗口不能写/关/看见别人的会话）、
非 http(s) scheme 拒绝、浏览器打开 + 回环重定向收到 `code`/`state`、OAuth 取消、
`storage.secret` 落盘密文 / 无钥匙串拒写 / namespace 校验、通知展示与拒绝非法 icon、
定时器 tick / 取消 / 下限夹取、`http.request` 文本 vs 字节判定。

## 8. 加一个新能力时的检查清单

1. 契约：`packages/common/src/core/desktop-bridge.ts` 加进 `DesktopCapability` +
   `DesktopCapabilityContract` + 桥接接口；`packages/plugin-api/src/index.ts` 转发类型。
2. 白名单：`apps/desktop/src/preload/index.ts`（不加就在这里被静默拒绝）。
3. 实现：`apps/desktop/src/main/capabilities/`——纯逻辑放 `.mjs` + `.d.mts`，Electron 接线放 `.ts`。
4. 门禁：能出网的一律走网络策略；能触发用户可见副作用（开浏览器、连新主机）的一律先弹窗。
5. 桥接：`packages/core/src/desktop/bridge.ts` 按 `capabilities` 探测，缺失时保持 `undefined`
   让插件退化（**不要**抛异常）。
6. 自测：`electron.smoke.cjs` 里加"允许 + 拒绝"两条路径。
7. 文档：本节新增一条，并在 `CLAUDE.md` 的能力清单里指过来。

## 9. 已知边界

- **不是权限系统**：插件都是受信任代码，门禁挡住的是"误用/滥用"和网络侧风险，
  不是恶意插件。要真正的隔离需要给插件做进程/权限沙箱，那是另一件事。
- **`http.request` 的响应体现在只有一个非空字段**：以前二进制响应会被塞进 `bodyText`
  （UTF-8 乱码）。这是**行为变化**；想拿回旧行为（例如把非 UTF-8 文本硬当字符串处理），
  传 `responseType: 'text'`。文本型接口（JSON/HTML）行为完全不变。
- **socket 没有整流控**：主进程按到达顺序把字节转发给渲染进程，不排队也不丢帧；
  渲染进程处理不过来时内存压力会落在宿主上。协议层要自己限速（多数邮件协议天然是
  一问一答，不存在这个问题）。
- **`storage.secret` 不随插件卸载清理**：插件被卸载后密钥仍在
  `<userData>/plugin-secrets.json` 里（用户可在设置里手动清）。需要的话用
  `secretClear({ namespace: 'plugin.<key>' })`。
- **OAuth 只做回落搬运**：`state`/PKCE 校验、token 交换、刷新全在插件里；宿主不认也不存 token。
- **`keepAwake` 是尽力而为**：macOS/Windows 上 `powerSaveBlocker` 可能被系统策略拒绝，
  返回的 `task.keepAwake` 才是生效值。
